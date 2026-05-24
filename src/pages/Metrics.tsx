import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Activity, ArrowDownRight, ArrowUpRight, GitCompareArrows, TrendingUp, Users, Zap } from 'lucide-react';
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

interface Kpi {
  label: string;
  value: string;
  delta: number | null;
  deltaSuffix?: string;
  icon: typeof Activity;
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

export function Metrics() {
  const [validatorCountBySubnet, setValidatorCountBySubnet] = useState<Record<string, number>>({});
  const [searchParams] = useSearchParams();
  const comparisonRef = useRef<HTMLDivElement>(null);
  const hasScrolled = useRef(false);
  const [kpis, setKpis] = useState<Kpi[] | null>(null);

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
    async function fetchKpis() {
      try {
        const [tps60, tx60, maxTps60, valTotal] = await Promise.all([
          getTPSHistory(60),
          getNetworkTxCountHistory(60),
          getNetworkMaxTPSHistory(60),
          getNetworkValidatorTotal(),
        ]);

        const sortDesc = <T extends { timestamp: number }>(xs: T[]) =>
          [...xs].sort((a, b) => b.timestamp - a.timestamp);

        const tpsDesc = sortDesc(tps60);
        const txDesc = sortDesc(tx60);
        const maxDesc = sortDesc(maxTps60);

        const tpsCurr = avg(tpsDesc.slice(0, 30).map((d) => d.totalTps ?? 0));
        const tpsPrev = avg(tpsDesc.slice(30, 60).map((d) => d.totalTps ?? 0));
        const txCurr = txDesc.slice(0, 30).reduce((s, d) => s + (d.value ?? 0), 0);
        const txPrev = txDesc.slice(30, 60).reduce((s, d) => s + (d.value ?? 0), 0);
        const peakCurr = Math.max(0, ...maxDesc.slice(0, 30).map((d) => d.value ?? 0));
        const peakPrev = Math.max(0, ...maxDesc.slice(30, 60).map((d) => d.value ?? 0));

        setKpis([
          {
            label: 'Avg Network TPS (30d)',
            value: tpsCurr ? Math.round(tpsCurr).toLocaleString() : '—',
            delta: pctDelta(tpsCurr, tpsPrev),
            icon: Activity,
          },
          {
            label: 'Total Tx (30d)',
            value: txCurr ? formatCount(txCurr) : '—',
            delta: pctDelta(txCurr, txPrev),
            icon: TrendingUp,
          },
          {
            label: 'Peak TPS (30d)',
            value: peakCurr ? Math.round(peakCurr).toLocaleString() : '—',
            delta: pctDelta(peakCurr, peakPrev),
            icon: Zap,
          },
          {
            label: 'Total Validators',
            value: valTotal?.totalValidators?.toLocaleString() ?? '—',
            delta: null,
            deltaSuffix: 'current',
            icon: Users,
          },
        ]);
      } catch {
        // KPIs are decorative
      }
    }
    fetchKpis();
    const interval = setInterval(fetchKpis, 60_000);
    return () => clearInterval(interval);
  }, []);

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

  const scrollToCompare = () =>
    comparisonRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="max-w-7xl 2xl:max-w-screen-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
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

      <KpiStrip kpis={kpis} />

      <AvalancheNetworkMetrics />
      <ChainSpecificMetrics />
      <section ref={comparisonRef}>
        <ComparisonView validatorCountBySubnet={validatorCountBySubnet} />
      </section>
    </div>
  );
}

function KpiStrip({ kpis }: { kpis: Kpi[] | null }) {
  const placeholders: Kpi[] = [
    { label: 'Avg Network TPS (30d)', value: '—', delta: null, icon: Activity },
    { label: 'Total Tx (30d)', value: '—', delta: null, icon: TrendingUp },
    { label: 'Peak TPS (30d)', value: '—', delta: null, icon: Zap },
    { label: 'Total Validators', value: '—', delta: null, icon: Users },
  ];
  const cards = kpis ?? placeholders;
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      {cards.map(({ label, value, delta, deltaSuffix, icon: Icon }) => {
        const positive = delta != null && delta >= 0;
        return (
          <div key={label} className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-medium tracking-wide text-muted-foreground">
                {label}
              </span>
              <div className="w-7 h-7 rounded-lg bg-[#ef4444]/10 flex items-center justify-center">
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
                  <span className="text-muted-foreground"> vs prior 30d</span>
                </>
              ) : (
                <span className="text-muted-foreground">{deltaSuffix ?? '—'}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
