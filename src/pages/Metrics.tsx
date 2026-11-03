import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { GitCompareArrows } from 'lucide-react';
import { SEO } from '../components/SEO';
import { PAGE_SEO } from '../utils/pageSeo';
import { StatStrip } from '../components/instrument';
import type { StatItem } from '../components/instrument';
import { SectionErrorBoundary } from '../components/SectionErrorBoundary';
import { AvalancheNetworkMetrics } from '../components/AvalancheNetworkMetrics';
import { ChainSpecificMetrics } from '../components/ChainSpecificMetrics';
import { IcmByChain } from '../components/IcmByChain';
import { ComparisonView } from '../components/comparison';
import {
  getChains,
  getNetworkMaxTPSHistory,
  getNetworkTxCountHistory,
  getNetworkValidatorTotal,
  getTPSHistory,
} from '../api';
import { coverageChanged } from '../utils/activityCoverage';

// Mirrors the chart's range buttons (30D, 90D, 1Y).
type Range = '30D' | '90D' | '1Y';
const RANGE_DAYS: Record<Range, number> = { '30D': 30, '90D': 90, '1Y': 360 };
// Two windows' worth, so the longest range still has a prior period to compare against.
const FETCH_DAYS = 720;

interface Kpi {
  label: string;
  value: string;
  delta: number | null;
  deltaSuffix?: string;
  tooltip?: string;
}

interface HistoryStore {
  tps: { timestamp: number; totalTps?: number; chainCount?: number }[];
  tx: { timestamp: number; value?: number; chainCount?: number }[];
  maxTps: { timestamp: number; value?: number; chainCount?: number }[];
  validatorTotal: number | null;
  /** Chains counted in the latest network TPS total. */
  chainCount: number | null;
}

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}

function pctDelta(curr: number, prev: number): number | null {
  if (!prev || Number.isNaN(prev)) return null;
  return ((curr - prev) / prev) * 100;
}

function formatCount(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function rangeLabel(range: Range): string {
  return range === '1Y' ? '1y' : range.toLowerCase();
}

function priorLabel(range: Range): string {
  return `prior ${rangeLabel(range)}`;
}

function chartTimeframeToRange(value: string | null): Range {
  if (value === '90') return '90D';
  if (value === '360') return '1Y';
  return '30D';
}


const NAV_SCROLL_OFFSET = 48 + 12;

function scrollToSection(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const rect = el.getBoundingClientRect();
  window.scrollTo({ top: window.scrollY + rect.top - NAV_SCROLL_OFFSET, behavior: 'smooth' });
}

export function Metrics() {
  const [activeChains, setActiveChains] = useState<number | null>(null);
  const [searchParams] = useSearchParams();
  const comparisonRef = useRef<HTMLDivElement>(null);
  const hasScrolled = useRef(false);
  const [history, setHistory] = useState<HistoryStore | null>(null);

  // The headline numbers follow the chart's window so there is one range
  // control on the page, not two.
  const range = chartTimeframeToRange(searchParams.get('networkTimeframe'));

  useEffect(() => {
    async function fetchData() {
      try {
        const chains = await getChains();
        setActiveChains(chains.filter((c) => c.isActive).length);
      } catch {
        // decorative
      }
    }
    fetchData();
  }, []);

  useEffect(() => {
    async function fetchHistory() {
      try {
        const [tps, tx, maxTps, valTotal] = await Promise.all([
          getTPSHistory(FETCH_DAYS),
          getNetworkTxCountHistory(FETCH_DAYS),
          getNetworkMaxTPSHistory(FETCH_DAYS),
          getNetworkValidatorTotal(),
        ]);

        const sortDesc = <T extends { timestamp: number }>(xs: T[]) =>
          [...xs].sort((a, b) => b.timestamp - a.timestamp);

        const next: HistoryStore = {
          tps: sortDesc(tps),
          tx: sortDesc(tx),
          maxTps: sortDesc(maxTps),
          validatorTotal: valTotal?.totalValidators ?? null,
          chainCount: sortDesc(tps)[0]?.chainCount ?? null,
        };

        // Skip the state update (and the Chart.js re-render it triggers) when an
        // unchanged poll returns the same data — compare length + latest point.
        // The latest day's value can change while chains are backfilled, so
        // compare its whole row, not just its date.
        const sameSeries = (a: { timestamp: number }[], b: { timestamp: number }[]) =>
          a.length === b.length && (a.length === 0 || JSON.stringify(a[0]) === JSON.stringify(b[0]));
        setHistory((prev) =>
          prev &&
          prev.validatorTotal === next.validatorTotal &&
          prev.chainCount === next.chainCount &&
          sameSeries(prev.tps, next.tps) &&
          sameSeries(prev.tx, next.tx) &&
          sameSeries(prev.maxTps, next.maxTps)
            ? prev
            : next,
        );
      } catch {
        // KPIs are decorative
      }
    }
    fetchHistory();
    const interval = setInterval(fetchHistory, 60_000);
    return () => clearInterval(interval);
  }, []);

  const kpis = useMemo<Kpi[] | null>(() => {
    if (!history) return null;
    const days = RANGE_DAYS[range];
    const label = rangeLabel(range);

    // Only compare against a prior window the API actually covered in full.
    const prior = <T,>(xs: T[]) => (xs.length >= days * 2 ? xs.slice(days, days * 2) : []);
    const tpsCurr = avg(history.tps.slice(0, days).map((d) => d.totalTps ?? 0));
    const tpsPrev = avg(prior(history.tps).map((d) => d.totalTps ?? 0));
    const txCurr = history.tx.slice(0, days).reduce((s, d) => s + (d.value ?? 0), 0);
    const txPrev = prior(history.tx).reduce((s, d) => s + (d.value ?? 0), 0);
    const peakCurr = Math.max(0, ...history.maxTps.slice(0, days).map((d) => d.value ?? 0));
    const peakPrev = Math.max(0, ...prior(history.maxTps).map((d) => d.value ?? 0));
    // Each series reports how many chains its latest day adds up.
    const coverage = (n: number | null | undefined) =>
      n ? ` Covers the ${n} chains with data for it; chains with no public RPC or metrics source aren't counted.` : '';
    // A change is only shown between windows that count the same chains.
    const gap = <T extends { chainCount?: number }>(xs: T[]) => coverageChanged(xs.slice(0, days), prior(xs));
    const tpsGap = gap(history.tps);
    const txGap = gap(history.tx);
    const peakGap = gap(history.maxTps);
    const withGap = (text: string, g: string | null) => (g ? `${text} ${g}` : text);

    return [
      {
        label: `Avg network TPS, ${label}`,
        value: tpsCurr ? Math.round(tpsCurr).toLocaleString() : '—',
        delta: tpsGap ? null : pctDelta(tpsCurr, tpsPrev),
        deltaSuffix: tpsGap ? 'Not compared: coverage changed' : undefined,
        tooltip: withGap(`Average daily transactions per second summed across all Avalanche L1s, taken over the last ${label}.${coverage(history.chainCount)}`, tpsGap),
      },
      {
        label: `Transactions, ${label}`,
        value: txCurr ? formatCount(txCurr) : '—',
        delta: txGap ? null : pctDelta(txCurr, txPrev),
        deltaSuffix: txGap ? 'Not compared: coverage changed' : undefined,
        tooltip: withGap(`Sum of daily transaction counts across all L1s over the last ${label}. Excludes today’s in-progress data.${coverage(history.tx[0]?.chainCount ?? history.chainCount)}`, txGap),
      },
      {
        label: `Peak TPS, ${label}`,
        value: peakCurr ? Math.round(peakCurr).toLocaleString() : '—',
        delta: peakGap ? null : pctDelta(peakCurr, peakPrev),
        deltaSuffix: peakGap ? 'Not compared: coverage changed' : undefined,
        tooltip: withGap(`The highest single-day network TPS observed during the last ${label}.${coverage(history.maxTps[0]?.chainCount)}`, peakGap),
      },
      {
        label: 'Validators',
        value: history.validatorTotal != null ? history.validatorTotal.toLocaleString() : '—',
        delta: null,
        deltaSuffix: 'current',
        tooltip:
          'Total active validators across all Avalanche L1s, including the Primary Network. Range-independent; always shows the current count.',
      },
    ];
  }, [history, range]);

  useEffect(() => {
    if (hasScrolled.current || !searchParams.has('compare')) return;
    hasScrolled.current = true;
    let attempts = 0;
    const tryScroll = () => {
      if (comparisonRef.current && attempts < 10) {
        comparisonRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        attempts++;
        setTimeout(tryScroll, 500);
      }
    };
    setTimeout(tryScroll, 500);
  }, [searchParams]);

  const [showFloating, setShowFloating] = useState(false);

  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const scrolledPast = window.scrollY > 400;
        const compareEl = document.getElementById('compare');
        const compareInView =
          !!compareEl && compareEl.getBoundingClientRect().top < window.innerHeight - 120;
        setShowFloating(scrolledPast && !compareInView);

        ticking = false;
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const coveredChains = history?.chainCount ?? null;
  // The headline sentence follows the chart's range, like the KPIs under it.
  const headline = useMemo(() => {
    if (!history) return null;
    const days = RANGE_DAYS[range];
    const tx = history.tx.slice(0, days).reduce((s, d) => s + (d.value ?? 0), 0);
    const tps = avg(history.tps.slice(0, days).map((d) => d.totalTps ?? 0));
    if (!tx) return null;
    return {
      tx: tx >= 1e6 ? `${(tx / 1e6).toFixed(1)}M` : formatCount(tx),
      tps: tps >= 10 ? Math.round(tps).toLocaleString() : tps.toFixed(1),
      window: range === '1Y' ? 'in the last year' : `in the last ${days} days`,
      chains: history.tx[0]?.chainCount ?? history.chainCount ?? null,
      validators: history.validatorTotal != null ? history.validatorTotal.toLocaleString() : null,
    };
  }, [history, range]);
  const peakChains = history?.maxTps[0]?.chainCount ?? null;

  const scrollToCompare = () => scrollToSection('compare');

  const compareButton = (
    <button
      onClick={scrollToCompare}
      className="hidden sm:inline-flex items-center gap-1.5 h-7 px-2.5 rounded border border-border bg-background text-[12px] font-medium text-foreground hover:bg-accent transition-colors"
    >
      <GitCompareArrows className="w-3.5 h-3.5" />
      Compare chains
    </button>
  );

  return (
    <div>
      <SEO {...PAGE_SEO.metrics} />

      {/* Hero in the shared page frame: a headline sentence, then the network
          chart fills the stage and the KPIs float over its foot from md up. */}
      <section
        id="network"
        className="relative border-b border-border bg-stage md:h-[min(calc(100vh-48px),1200px)] md:min-h-[600px]"
        aria-label="Network charts"
      >
        <div className="md:absolute md:inset-0 flex flex-col">
          <div className="max-w-7xl 2xl:max-w-screen-2xl w-full mx-auto px-4 sm:px-6 pt-5">
            <h1 className="text-[18px] leading-6 font-semibold text-foreground">Network metrics</h1>
            {headline ? (
              <>
                <p className="mt-2 text-[26px] sm:text-[34px] leading-tight font-medium text-foreground max-w-4xl">
                  Avalanche L1s processed <span className="tabular-nums">{headline.tx}</span> transactions {headline.window}.
                </p>
                <p className="mt-1.5 text-[15px] sm:text-[17px] leading-snug text-foreground/80 max-w-3xl">
                  That is <span className="num">{headline.tps}</span> per second on average
                  {headline.chains != null && (
                    <>
                      {' '}across the <span className="num">{headline.chains}</span> L1s with data
                    </>
                  )}
                  {headline.validators != null && (
                    <>
                      , secured by <span className="num">{headline.validators}</span> validators
                    </>
                  )}
                  .
                </p>
              </>
            ) : (
              <div className="mt-3 h-9 w-[min(560px,80vw)] rounded bg-muted animate-pulse" />
            )}
          </div>
          <div className="relative h-[520px] md:h-auto md:flex-1 md:min-h-0 mt-3">
            <SectionErrorBoundary label="Network charts">
              <AvalancheNetworkMetrics hero actions={compareButton} />
            </SectionErrorBoundary>
          </div>
        </div>
        <div className="hidden md:block absolute bottom-4 left-1/2 -translate-x-1/2 z-30 w-[min(960px,calc(100%-3rem))]">
          <KpiStrip kpis={kpis} range={range} floating />
        </div>
      </section>

      <div className="max-w-7xl 2xl:max-w-screen-2xl mx-auto px-4 sm:px-6 py-4 space-y-6">
        <div className="md:hidden">
          <KpiStrip kpis={kpis} range={range} />
        </div>
        {coveredChains != null && activeChains != null && coveredChains < activeChains && (
          <p className="text-[11px] text-muted-foreground">
            Network figures add up the {coveredChains} of {activeChains} active L1s with activity data. The rest have no
            public RPC and aren't in Avalanche's metrics API, so they aren't counted.
            {peakChains != null && peakChains !== coveredChains && ` Peak TPS covers ${peakChains} of them.`}
          </p>
        )}

        <section id="chains" className="scroll-mt-16">
          <SectionErrorBoundary label="chain metrics">
            <ChainSpecificMetrics />
          </SectionErrorBoundary>
        </section>
        <section id="icm" className="scroll-mt-16">
          <SectionErrorBoundary label="interchain messages">
            <IcmByChain />
          </SectionErrorBoundary>
        </section>
        <section id="compare" ref={comparisonRef} className="scroll-mt-16">
          <SectionErrorBoundary label="chain comparison">
            <ComparisonView />
          </SectionErrorBoundary>
        </section>
      </div>

      <button
        type="button"
        onClick={scrollToCompare}
        aria-label="Compare chains"
        className={`fixed right-4 sm:right-6 bottom-20 md:bottom-6 z-40 inline-flex items-center gap-2 h-8 px-3 rounded border border-border bg-popover text-foreground text-[12px] font-medium shadow-lg hover:bg-accent transition-all duration-200 ${
          showFloating
            ? 'opacity-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 translate-y-2 pointer-events-none'
        }`}
      >
        <GitCompareArrows className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Compare chains</span>
      </button>
    </div>
  );
}

function KpiStrip({ kpis, range, floating = false }: { kpis: Kpi[] | null; range: Range; floating?: boolean }) {
  const label = rangeLabel(range);
  const pending = 'Not available right now';
  const placeholders: Kpi[] = [
    { label: `Avg network TPS, ${label}`, value: '—', delta: null, deltaSuffix: pending },
    { label: `Transactions, ${label}`, value: '—', delta: null, deltaSuffix: pending },
    { label: `Peak TPS, ${label}`, value: '—', delta: null, deltaSuffix: pending },
    { label: 'Validators', value: '—', delta: null, deltaSuffix: pending },
  ];
  const prior = priorLabel(range);
  const items: StatItem[] = (kpis ?? placeholders).map((k) => ({
    label: k.label,
    value: k.value,
    delta: k.delta,
    deltaLabel: k.delta != null ? `vs ${prior}` : undefined,
    sub: k.delta == null ? (k.value === '—' ? pending : k.deltaSuffix) : undefined,
    tooltip: k.tooltip,
  }));
  return <StatStrip items={items} floating={floating} />;
}

