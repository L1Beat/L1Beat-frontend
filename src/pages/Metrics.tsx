import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Activity, ArrowDownRight, ArrowUpRight, GitCompareArrows, Info, TrendingUp, Users, Zap } from 'lucide-react';
import { SEO } from '../components/SEO';
import { SectionErrorBoundary } from '../components/SectionErrorBoundary';
import { AvalancheNetworkMetrics } from '../components/AvalancheNetworkMetrics';
import { ChainSpecificMetrics } from '../components/ChainSpecificMetrics';
import { ComparisonView } from '../components/comparison';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/branding/ui/tooltip';
import {
  getChains,
  getL1BeatActiveValidatorCounts,
  getNetworkMaxTPSHistory,
  getNetworkTxCountHistory,
  getNetworkValidatorTotal,
  getTPSHistory,
} from '../api';

type Range = '24H' | '7D' | '30D' | 'ALL';
const RANGES: Range[] = ['24H', '7D', '30D', 'ALL'];
const RANGE_DAYS: Record<Range, number> = { '24H': 2, '7D': 7, '30D': 30, ALL: 90 };
const FETCH_DAYS = 180;

interface Kpi {
  label: string;
  value: string;
  delta: number | null;
  deltaSuffix?: string;
  icon: typeof Activity;
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
  if (range === '24H') return '24h';
  if (range === '7D') return '7d';
  if (range === '30D') return '30d';
  return 'all';
}

function priorLabel(range: Range): string {
  if (range === '24H') return 'prior 24h';
  if (range === '7D') return 'prior 7d';
  if (range === '30D') return 'prior 30d';
  return 'prior 90d';
}

function pickRange(value: string | null): Range {
  return (RANGES as readonly string[]).includes(value ?? '') ? (value as Range) : '30D';
}


const SECTIONS = [
  { id: 'kpis', label: 'KPIs' },
  { id: 'network', label: 'Network charts' },
  { id: 'chains', label: 'Chain-specific' },
  { id: 'compare', label: 'Compare' },
] as const;

const NAV_SCROLL_OFFSET = 56 + 48 + 12;

function scrollToSection(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const rect = el.getBoundingClientRect();
  window.scrollTo({ top: window.scrollY + rect.top - NAV_SCROLL_OFFSET, behavior: 'smooth' });
}

function SectionNav({ active }: { active: string }) {
  return (
    <nav className="sticky top-14 z-30 -mx-4 sm:-mx-6 px-4 sm:px-6 py-2 bg-background/95 supports-[backdrop-filter]:bg-background/70 supports-[backdrop-filter]:backdrop-blur-md border-b border-border">
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
        {SECTIONS.map((s) => {
          const isActive = active === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => scrollToSection(s.id)}
              className={`shrink-0 inline-flex items-center h-8 px-3 rounded-lg text-[12px] font-semibold tracking-wide transition-colors ${
                isActive
                  ? 'bg-[#ef4444]/12 text-[#ef4444]'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              }`}
            >
              {s.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export function Metrics() {
  const [validatorCountBySubnet, setValidatorCountBySubnet] = useState<Record<string, number>>({});
  const [searchParams, setSearchParams] = useSearchParams();
  const comparisonRef = useRef<HTMLDivElement>(null);
  const hasScrolled = useRef(false);
  const [history, setHistory] = useState<HistoryStore | null>(null);
  const [activeSection, setActiveSection] = useState<string>('kpis');

  const range = pickRange(searchParams.get('range'));

  const setRange = (next: Range) => {
    const params = new URLSearchParams(searchParams);
    if (next === '30D') params.delete('range');
    else params.set('range', next);
    setSearchParams(params, { replace: true });
  };

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

        setHistory({
          tps: sortDesc(tps),
          tx: sortDesc(tx),
          maxTps: sortDesc(maxTps),
          validatorTotal: valTotal?.totalValidators ?? null,
        });
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

    const tpsCurr = avg(history.tps.slice(0, days).map((d) => d.totalTps ?? 0));
    const tpsPrev = avg(history.tps.slice(days, days * 2).map((d) => d.totalTps ?? 0));
    const txCurr = history.tx.slice(0, days).reduce((s, d) => s + (d.value ?? 0), 0);
    const txPrev = history.tx.slice(days, days * 2).reduce((s, d) => s + (d.value ?? 0), 0);
    const peakCurr = Math.max(0, ...history.maxTps.slice(0, days).map((d) => d.value ?? 0));
    const peakPrev = Math.max(0, ...history.maxTps.slice(days, days * 2).map((d) => d.value ?? 0));

    return [
      {
        label: `Avg Network TPS · ${label}`,
        value: tpsCurr ? Math.round(tpsCurr).toLocaleString() : '—',
        delta: pctDelta(tpsCurr, tpsPrev),
        icon: Activity,
        tooltip: `Average daily transactions per second summed across all Avalanche L1s, taken over the last ${label}.`,
      },
      {
        label: `Total Tx · ${label}`,
        value: txCurr ? formatCount(txCurr) : '—',
        delta: pctDelta(txCurr, txPrev),
        icon: TrendingUp,
        tooltip: `Sum of daily transaction counts across all L1s over the last ${label}. Excludes today’s in-progress data.`,
      },
      {
        label: `Peak TPS · ${label}`,
        value: peakCurr ? Math.round(peakCurr).toLocaleString() : '—',
        delta: pctDelta(peakCurr, peakPrev),
        icon: Zap,
        tooltip: `The highest single-day network TPS observed during the last ${label}.`,
      },
      {
        label: 'Total Validators',
        value: history.validatorTotal != null ? history.validatorTotal.toLocaleString() : '—',
        delta: null,
        deltaSuffix: 'current',
        icon: Users,
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
        const threshold = NAV_SCROLL_OFFSET + 8;
        let next: string = SECTIONS[0].id;
        for (const s of SECTIONS) {
          const el = document.getElementById(s.id);
          if (!el) continue;
          if (el.getBoundingClientRect().top <= threshold) next = s.id;
        }
        setActiveSection((prev) => (prev === next ? prev : next));

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

  return (
    <div className="max-w-7xl 2xl:max-w-screen-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      <SEO
        title="Network Metrics"
        description="Aggregate Avalanche L1 metrics: cross-chain TPS, transactions, validators, gas, fees, and a side-by-side compare tool."
        url="/metrics"
      />
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-[11px] font-bold tracking-[0.15em] text-[#ef4444] mb-1.5">
            AGGREGATE NETWORK
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
            Network Metrics
          </h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
            Cross-chain performance, supply, and economic indicators across all Avalanche L1s.
          </p>
        </div>
        <button
          onClick={scrollToCompare}
          className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-[#ef4444] text-white text-sm font-semibold shadow-sm shadow-[#ef4444]/20 hover:bg-[#dc2626] transition-colors self-start sm:self-auto"
        >
          <GitCompareArrows className="w-4 h-4" />
          Compare Chains
        </button>
      </header>

      <SectionNav active={activeSection} />

      <section id="kpis" className="space-y-4 scroll-mt-28">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            Network KPIs
          </div>
          <div className="inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-card border border-border">
            {RANGES.map((r) => {
              const active = r === range;
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRange(r)}
                  className={`px-2.5 h-7 rounded-md text-[11px] font-semibold tracking-wide transition-colors ${
                    active
                      ? 'bg-[#ef4444] text-white shadow-sm shadow-[#ef4444]/20'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {r}
                </button>
              );
            })}
          </div>
        </div>

        <KpiStrip kpis={kpis} range={range} />
      </section>

      <section id="network" className="scroll-mt-28">
        <SectionErrorBoundary label="Network charts">
          <AvalancheNetworkMetrics />
        </SectionErrorBoundary>
      </section>
      <section id="chains" className="scroll-mt-28">
        <SectionErrorBoundary label="chain metrics">
          <ChainSpecificMetrics />
        </SectionErrorBoundary>
      </section>
      <section id="compare" ref={comparisonRef} className="scroll-mt-28">
        <SectionErrorBoundary label="chain comparison">
          <ComparisonView validatorCountBySubnet={validatorCountBySubnet} />
        </SectionErrorBoundary>
      </section>

      <button
        type="button"
        onClick={scrollToCompare}
        aria-label="Compare chains"
        className={`fixed right-4 sm:right-6 bottom-20 md:bottom-6 z-40 inline-flex items-center gap-2 h-11 px-4 rounded-full bg-[#ef4444] text-white text-sm font-semibold shadow-lg shadow-[#ef4444]/30 hover:bg-[#dc2626] transition-all duration-200 ${
          showFloating
            ? 'opacity-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 translate-y-2 pointer-events-none'
        }`}
      >
        <GitCompareArrows className="w-4 h-4" />
        <span className="hidden sm:inline">Compare Chains</span>
      </button>
    </div>
  );
}

function KpiStrip({ kpis, range }: { kpis: Kpi[] | null; range: Range }) {
  const label = rangeLabel(range);
  const placeholders: Kpi[] = [
    { label: `Avg Network TPS · ${label}`, value: '—', delta: null, icon: Activity },
    { label: `Total Tx · ${label}`, value: '—', delta: null, icon: TrendingUp },
    { label: `Peak TPS · ${label}`, value: '—', delta: null, icon: Zap },
    { label: 'Total Validators', value: '—', delta: null, icon: Users },
  ];
  const cards = kpis ?? placeholders;
  const prior = priorLabel(range);
  return (
    <TooltipProvider delayDuration={150}>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      {cards.map(({ label, value, delta, deltaSuffix, icon: Icon, tooltip }) => {
        const positive = delta != null && delta >= 0;
        return (
          <div key={label} className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3 gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[11px] font-medium tracking-wide text-muted-foreground truncate">
                  {label}
                </span>
                {tooltip && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label={`About ${label}`}
                        className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Info className="w-3 h-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent
                      side="top"
                      align="start"
                      className="max-w-[240px] bg-popover border border-border text-foreground text-[11px] leading-relaxed px-3 py-2 shadow-xl [&>span]:hidden"
                    >
                      {tooltip}
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
              <div className="w-7 h-7 rounded-lg bg-[#ef4444]/10 flex items-center justify-center shrink-0">
                <Icon className="w-3.5 h-3.5 text-[#ef4444]" />
              </div>
            </div>
            <div className="text-2xl font-bold text-foreground tracking-tight">{value}</div>
            <div className="text-[11px] font-medium mt-1 flex items-center gap-1">
              {delta != null ? (
                <>
                  {positive ? (
                    <ArrowUpRight className="w-3 h-3 text-green-500" />
                  ) : (
                    <ArrowDownRight className="w-3 h-3 text-[#ef4444]" />
                  )}
                  <span className={positive ? 'text-green-500' : 'text-[#ef4444]'}>
                    {positive ? '+' : ''}
                    {delta.toFixed(1)}%
                  </span>
                  <span className="text-muted-foreground"> vs {prior}</span>
                </>
              ) : (
                <span className="text-muted-foreground">{deltaSuffix ?? '—'}</span>
              )}
            </div>
          </div>
        );
      })}
      </div>
    </TooltipProvider>
  );
}

