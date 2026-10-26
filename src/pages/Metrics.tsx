import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { GitCompareArrows } from 'lucide-react';
import { SEO } from '../components/SEO';
import { StatStrip } from '../components/instrument';
import type { StatItem } from '../components/instrument';
import { SectionErrorBoundary } from '../components/SectionErrorBoundary';
import { AvalancheNetworkMetrics } from '../components/AvalancheNetworkMetrics';
import { ChainSpecificMetrics } from '../components/ChainSpecificMetrics';
import { ComparisonView } from '../components/comparison';
import {
  getChains,
  getL1BeatActiveValidatorCounts,
  getNetworkMaxTPSHistory,
  getNetworkTxCountHistory,
  getNetworkValidatorTotal,
  getTPSHistory,
} from '../api';

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
  tps: { timestamp: number; totalTps?: number }[];
  tx: { timestamp: number; value?: number }[];
  maxTps: { timestamp: number; value?: number }[];
  validatorTotal: number | null;
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
  const [validatorCountBySubnet, setValidatorCountBySubnet] = useState<Record<string, number>>({});
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
        const subnetIds = chains.map((c) => c.subnetId).filter(Boolean) as string[];
        const counts = await getL1BeatActiveValidatorCounts(subnetIds);
        setValidatorCountBySubnet(counts);
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
        };

        // Skip the state update (and the Chart.js re-render it triggers) when an
        // unchanged poll returns the same data — compare length + latest point.
        const sameSeries = (a: { timestamp: number }[], b: { timestamp: number }[]) =>
          a.length === b.length && (a.length === 0 || a[0].timestamp === b[0].timestamp);
        setHistory((prev) =>
          prev &&
          prev.validatorTotal === next.validatorTotal &&
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

    return [
      {
        label: `Avg network TPS, ${label}`,
        value: tpsCurr ? Math.round(tpsCurr).toLocaleString() : '—',
        delta: pctDelta(tpsCurr, tpsPrev),
        tooltip: `Average daily transactions per second summed across all Avalanche L1s, taken over the last ${label}.`,
      },
      {
        label: `Transactions, ${label}`,
        value: txCurr ? formatCount(txCurr) : '—',
        delta: pctDelta(txCurr, txPrev),
        tooltip: `Sum of daily transaction counts across all L1s over the last ${label}. Excludes today’s in-progress data.`,
      },
      {
        label: `Peak TPS, ${label}`,
        value: peakCurr ? Math.round(peakCurr).toLocaleString() : '—',
        delta: pctDelta(peakCurr, peakPrev),
        tooltip: `The highest single-day network TPS observed during the last ${label}.`,
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
      <SEO
        title="Network Metrics"
        description="Aggregate Avalanche L1 metrics: cross-chain TPS, transactions, validators, gas, fees, and a side-by-side compare tool."
        url="/metrics"
      />

      {/* Hero: the network chart fills the first screen, headline numbers float along the bottom. */}
      <section
        id="network"
        className="relative border-b border-border bg-stage h-[520px] md:h-[min(calc(100vh-48px),900px)] md:min-h-[600px]"
        aria-label="Network charts"
      >
        <SectionErrorBoundary label="Network charts">
          <AvalancheNetworkMetrics hero actions={compareButton} />
        </SectionErrorBoundary>
        <div className="hidden md:block absolute bottom-4 left-1/2 -translate-x-1/2 z-30 w-[min(960px,calc(100%-3rem))]">
          <KpiStrip kpis={kpis} range={range} floating />
        </div>
      </section>

      <div className="max-w-7xl 2xl:max-w-screen-2xl mx-auto px-4 sm:px-6 py-4 space-y-6">
        <div className="md:hidden">
          <KpiStrip kpis={kpis} range={range} />
        </div>

        <section id="chains" className="scroll-mt-16">
          <SectionErrorBoundary label="chain metrics">
            <ChainSpecificMetrics />
          </SectionErrorBoundary>
        </section>
        <section id="compare" ref={comparisonRef} className="scroll-mt-16">
          <SectionErrorBoundary label="chain comparison">
            <ComparisonView validatorCountBySubnet={validatorCountBySubnet} />
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
  const pending = 'Indexer is still backfilling';
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

