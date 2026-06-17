import { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import {
  ArrowDownUp,
  ChevronDown,
  ChevronUp,
  Coins,
  Copy,
  DollarSign,
  ExternalLink,
  Info,
  Search,
  TrendingDown,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import { useToast } from '../components/Toaster';
import { SEO } from '../components/SEO';
import { SectionErrorBoundary } from '../components/SectionErrorBoundary';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ChartWatermark } from '../components/ChartWatermark';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../components/branding/ui/tooltip';
import {
  getStablecoins,
  getFxRates,
  getTokenLogos,
  getStablecoinsTimeseries,
  type FxRates,
} from '../api';
import type {
  Stablecoin,
  StablecoinSeries,
  StablecoinSeriesPoint,
  StablecoinMetric,
  StablecoinGranularity,
} from '../types';

type SortKey =
  | 'supplyUsd'
  | 'holders'
  | 'avgHolder'
  | 'volumeUsd'
  | 'velocity'
  | 'transfers'
  | 'symbol';

interface SupplyTrend {
  spark: number[];   // recent daily USD supply points (oldest→newest) for a sparkline
  change24h: number; // fractional change over the last day
  change7d: number;  // fractional change over the last 7 days
  prev24h: number;   // absolute USD supply 1 day ago (for aggregate totals)
  prev7d: number;    // absolute USD supply 7 days ago
}

interface EnrichedCoin extends Stablecoin {
  supplyUnits: number;     // supply in token units (already divided by 10^decimals)
  supplyUsd: number;       // supply * fx-to-USD
  volumeUnits: number;
  volumeUsd: number;
  velocity: number;        // 24h volume / supply — turnover ratio
  avgHolder: number;       // supplyUsd / holders — average position size
  share: number;           // 0..1 share of total USD supply
  trend?: SupplyTrend;     // per-token supply history; absent until timeseries loads
}

function fmtUsd(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtCount(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

const EMPTY = '—';

// Faint placeholder so rows with no volume/activity recede instead of reading as
// a wall of hard dashes. Renders the value as-is when it isn't the empty marker.
function Num({ value, className = '' }: { value: string; className?: string }) {
  if (value === EMPTY) {
    return <span className={`text-muted-foreground/30 ${className}`}>{EMPTY}</span>;
  }
  return <span className={className}>{value}</span>;
}

// Convert raw bigint-string + decimals to a JS number. Stablecoin supplies are well below
// 2^53 once scaled, but we still go via BigInt to avoid string-parse precision loss.
function toUnits(raw: string | undefined, decimals: number): number {
  if (!raw) return 0;
  try {
    const big = BigInt(raw);
    if (big === 0n) return 0;
    const divisor = 10n ** BigInt(decimals);
    const whole = Number(big / divisor);
    const frac = Number(big % divisor) / Number(divisor);
    return whole + frac;
  } catch {
    return 0;
  }
}

function pegToUsd(value: number, peg: string, fx: FxRates): number {
  const code = peg?.toUpperCase();
  if (!code || code === 'USD') return value;
  const rate = fx[code];
  return rate ? value * rate : value;
}

// Derive a supply trend (sparkline + 24h/7d change) from a token's daily supply
// series. Values are raw base units → scaled to USD via decimals + peg. Returns
// null when there aren't enough points to say anything meaningful.
function computeTrend(
  data: StablecoinSeriesPoint[] | undefined,
  decimals: number,
  peg: string,
  fx: FxRates,
): SupplyTrend | null {
  if (!data || data.length < 2) return null;
  const pts = data
    .map((p) => ({ t: Date.parse(p.period), v: pegToUsd(toUnits(p.value, decimals), peg, fx) }))
    .filter((p) => !Number.isNaN(p.t))
    .sort((a, b) => a.t - b.t);
  if (pts.length < 2) return null;
  const vals = pts.map((p) => p.v);
  const last = vals[vals.length - 1];
  const prev24h = vals[vals.length - 2];
  // 7 daily buckets back, clamped to the oldest point we have.
  const prev7d = vals[Math.max(0, vals.length - 8)];
  return {
    spark: vals.slice(-30),
    change24h: prev24h > 0 ? (last - prev24h) / prev24h : 0,
    change7d: prev7d > 0 ? (last - prev7d) / prev7d : 0,
    prev24h,
    prev7d,
  };
}


// Peg filter options are derived from the data at runtime (see `pegFilters`),
// so any newly-indexed currency (CHF, TRY, BRL, GBP, …) shows up automatically.
const ORIGIN_FILTERS = ['All', 'Native', 'Bridged'] as const;
type OriginFilter = (typeof ORIGIN_FILTERS)[number];

export function Stablecoins() {
  const [coins, setCoins] = useState<Stablecoin[]>([]);
  const [fx, setFx] = useState<FxRates>({
    EUR: 1.08, SGD: 0.74, JPY: 0.0064, CHF: 1.25, GBP: 1.34, BRL: 0.2, TRY: 0.022,
  });
  const [logoMap, setLogoMap] = useState<Record<string, string>>({});
  // Per-token daily supply history → powers per-row sparklines, change %, and
  // top movers. Loads independently of the main list; the page renders without
  // it and trends fill in once it arrives.
  const [supplyHist, setSupplyHist] = useState<Map<string, StablecoinSeriesPoint[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [peg, setPeg] = useState<string>('All');
  const [origin, setOrigin] = useState<OriginFilter>('All');
  const [issuerFilter, setIssuerFilter] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('supplyUsd');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([getStablecoins(43114), getFxRates()])
      .then(async ([list, rates]) => {
        if (!alive) return;
        setCoins(list);
        setFx(rates);
        // Logos resolve on a separate, slower call — render the page first,
        // then swap in real logos when GeckoTerminal answers.
        if (list.length) {
          const logos = await getTokenLogos(
            list.map((c) => c.token),
            43114,
          );
          if (alive) setLogoMap(logos);
        }
      })
      .catch((e) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : 'Failed to load stablecoins');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    // 90 daily points is plenty for a 30-pt sparkline plus 7d/24h deltas.
    getStablecoinsTimeseries({ evmChainId: 43114, metric: 'supply', granularity: 'day', limit: 90 })
      .then((series) => {
        if (!alive) return;
        const m = new Map<string, StablecoinSeriesPoint[]>();
        for (const s of series) m.set(s.token.toLowerCase(), s.data);
        setSupplyHist(m);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const enriched = useMemo<EnrichedCoin[]>(() => {
    if (!coins.length) return [];
    const withRates = coins.map((c) => {
      const supplyUnits = toUnits(c.supply, c.decimals);
      const volumeUnits = toUnits(c.volume_24h, c.decimals);
      const supplyUsd = pegToUsd(supplyUnits, c.peg, fx);
      const volumeUsd = pegToUsd(volumeUnits, c.peg, fx);
      return {
        ...c,
        supplyUnits,
        volumeUnits,
        supplyUsd,
        volumeUsd,
        velocity: supplyUsd > 0 ? volumeUsd / supplyUsd : 0,
        avgHolder: c.holders > 0 ? supplyUsd / c.holders : 0,
        share: 0,
        trend: computeTrend(supplyHist.get(c.token.toLowerCase()), c.decimals, c.peg, fx) ?? undefined,
      };
    });
    const total = withRates.reduce((s, c) => s + c.supplyUsd, 0);
    return withRates.map((c) => ({
      ...c,
      share: total > 0 ? c.supplyUsd / total : 0,
    }));
  }, [coins, fx, supplyHist]);

  const totals = useMemo(() => {
    if (!enriched.length) {
      return {
        supply: 0, volume: 0, holders: 0, count: 0, nativeUsd: 0, bridgedUsd: 0,
        change7d: 0, hasTrend: false,
      };
    }
    let supply = 0;
    let volume = 0;
    let holders = 0;
    let nativeUsd = 0;
    let bridgedUsd = 0;
    let prev7d = 0;
    let hasTrend = false;
    for (const c of enriched) {
      supply += c.supplyUsd;
      volume += c.volumeUsd;
      holders += c.holders || 0;
      if (c.bridged) bridgedUsd += c.supplyUsd;
      else nativeUsd += c.supplyUsd;
      // Sum a coherent "7d ago" total: history where we have it, current
      // supply otherwise (a coin with no history contributes no change).
      if (c.trend) hasTrend = true;
      prev7d += c.trend ? c.trend.prev7d : c.supplyUsd;
    }
    const change7d = prev7d > 0 ? (supply - prev7d) / prev7d : 0;
    return {
      supply, volume, holders, count: enriched.length, nativeUsd, bridgedUsd,
      change7d, hasTrend,
    };
  }, [enriched]);

  const issuerSlices = useMemo(() => {
    if (!enriched.length) return [];
    const map = new Map<string, number>();
    for (const c of enriched) {
      const key = c.issuer || c.symbol;
      map.set(key, (map.get(key) || 0) + c.supplyUsd);
    }
    const slices = [...map.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
    const TOP_N = 5;
    if (slices.length <= TOP_N) return slices;
    const top = slices.slice(0, TOP_N);
    const rest = slices.slice(TOP_N).reduce((s, x) => s + x.value, 0);
    if (rest > 0) top.push({ name: 'Others', value: rest });
    return top;
  }, [enriched]);

  // Biggest 7d supply gainers/losers. Floor at $1M supply so dust coins with
  // jumpy percentages don't dominate the highlight strip.
  const movers = useMemo(() => {
    const eligible = enriched.filter(
      (c) => c.trend && c.supplyUsd >= 1_000_000 && Number.isFinite(c.trend.change7d),
    );
    const gainers = [...eligible]
      .filter((c) => c.trend!.change7d > 0.0005)
      .sort((a, b) => b.trend!.change7d - a.trend!.change7d)
      .slice(0, 3);
    const losers = [...eligible]
      .filter((c) => c.trend!.change7d < -0.0005)
      .sort((a, b) => a.trend!.change7d - b.trend!.change7d)
      .slice(0, 3);
    return { gainers, losers };
  }, [enriched]);

  const filtered = useMemo(() => {
    let rows = enriched;
    if (peg !== 'All') {
      rows = rows.filter((r) => r.peg?.toUpperCase() === peg);
    }
    if (origin !== 'All') {
      rows = rows.filter((r) => (origin === 'Bridged' ? r.bridged : !r.bridged));
    }
    if (issuerFilter) {
      const target = issuerFilter.toLowerCase();
      rows = rows.filter((r) => (r.issuer || r.symbol).toLowerCase() === target);
    }
    const q = query.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (r) =>
          r.symbol.toLowerCase().includes(q) ||
          r.name.toLowerCase().includes(q) ||
          (r.issuer || '').toLowerCase().includes(q),
      );
    }
    const dir = sortDir === 'asc' ? 1 : -1;
    rows = [...rows].sort((a, b) => {
      if (sortKey === 'symbol') return a.symbol.localeCompare(b.symbol) * dir;
      if (sortKey === 'holders') return ((a.holders || 0) - (b.holders || 0)) * dir;
      if (sortKey === 'transfers') return ((a.transfers_24h || 0) - (b.transfers_24h || 0)) * dir;
      if (sortKey === 'volumeUsd') return (a.volumeUsd - b.volumeUsd) * dir;
      if (sortKey === 'velocity') return (a.velocity - b.velocity) * dir;
      if (sortKey === 'avgHolder') return (a.avgHolder - b.avgHolder) * dir;
      return (a.supplyUsd - b.supplyUsd) * dir;
    });
    return rows;
  }, [enriched, peg, origin, issuerFilter, query, sortKey, sortDir]);

  // Available peg filters, ordered by aggregate supply (USD first, then the
  // larger currencies). 'All' always leads.
  const pegFilters = useMemo(() => {
    const sums = new Map<string, number>();
    for (const c of enriched) {
      const code = c.peg?.toUpperCase();
      if (code) sums.set(code, (sums.get(code) || 0) + c.supplyUsd);
    }
    const codes = [...sums.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
    return ['All', ...codes];
  }, [enriched]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'symbol' ? 'asc' : 'desc');
    }
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="max-w-7xl 2xl:max-w-screen-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        <SEO
          title="Stablecoins on Avalanche"
          description="Live supply, holders, and 24h activity for every major stablecoin on Avalanche C-Chain: USDC, USDT, AUSD, BUIDL, EURC and more."
          url="/stablecoins"
        />

        <header>
          <div className="text-[11px] font-bold tracking-[0.15em] text-[#ef4444] mb-1.5">
            STABLECOINS
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
            Avalanche stablecoin supply
          </h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
            Every tracked stablecoin on Avalanche C-Chain. Non-USD pegs (EUR, SGD, JPY) are
            converted at ECB reference rates for the totals. Issuer-side reserves may differ.
          </p>
        </header>

        <SectionErrorBoundary label="the stablecoin KPIs">
          <KpiStrip totals={totals} />
        </SectionErrorBoundary>

        <SectionErrorBoundary label="the supply history chart">
          <SupplyHistoryCard coins={coins} fx={fx} />
        </SectionErrorBoundary>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          <SectionErrorBoundary label="issuer breakdown">
            <IssuerCard
              slices={issuerSlices}
              coins={enriched}
              total={totals.supply}
              selected={issuerFilter}
              onSelect={(name) =>
                setIssuerFilter((current) => (current === name ? null : name))
              }
            />
          </SectionErrorBoundary>
          <SectionErrorBoundary label="native vs bridged">
            <OriginCard nativeUsd={totals.nativeUsd} bridgedUsd={totals.bridgedUsd} />
          </SectionErrorBoundary>
        </div>

        {(movers.gainers.length > 0 || movers.losers.length > 0) && (
          <SectionErrorBoundary label="supply flows">
            <TopMovers gainers={movers.gainers} losers={movers.losers} logoMap={logoMap} />
          </SectionErrorBoundary>
        )}

        <SectionErrorBoundary label="the stablecoin table">
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 px-4 py-3.5 border-b border-border">
              <div className="flex items-center gap-2 flex-wrap">
                {pegFilters.map((p) => (
                  <button
                    key={p}
                    onClick={() => setPeg(p)}
                    className={`h-7 px-2.5 rounded-full text-[11px] font-semibold tracking-wide transition-colors ${
                      peg === p
                        ? 'bg-[#ef4444]/15 text-[#ef4444]'
                        : 'bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted/70'
                    }`}
                  >
                    {p}
                  </button>
                ))}
                <span className="w-px h-4 bg-border mx-1" />
                {ORIGIN_FILTERS.map((o) => (
                  <button
                    key={o}
                    onClick={() => setOrigin(o)}
                    className={`h-7 px-2.5 rounded-full text-[11px] font-semibold tracking-wide transition-colors ${
                      origin === o
                        ? 'bg-foreground/10 text-foreground'
                        : 'bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted/70'
                    }`}
                  >
                    {o}
                  </button>
                ))}
                {issuerFilter && (
                  <>
                    <span className="w-px h-4 bg-border mx-1" />
                    <button
                      onClick={() => setIssuerFilter(null)}
                      className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-semibold tracking-wide bg-[#ef4444]/15 text-[#ef4444] hover:bg-[#ef4444]/25 transition-colors"
                      title="Clear issuer filter"
                    >
                      <span>Issuer: {issuerFilter}</span>
                      <X className="w-3 h-3" />
                    </button>
                  </>
                )}
              </div>

              <div className="relative md:w-64">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search symbol or issuer"
                  className="w-full h-8 pl-8 pr-2 rounded-lg border border-border bg-background text-[12px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[#ef4444]/40"
                />
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-20">
                <LoadingSpinner size="md" />
              </div>
            ) : error ? (
              <div className="px-6 py-12 text-center text-sm text-muted-foreground">
                {error}
              </div>
            ) : filtered.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-muted-foreground">
                No stablecoins match these filters.
              </div>
            ) : (
              <>
                {/* Mobile sort selector — table headers aren't visible below md */}
                <div className="md:hidden flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border">
                  <span className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground">
                    {filtered.length} stablecoin{filtered.length === 1 ? '' : 's'}
                  </span>
                  <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="font-medium">Sort</span>
                    <select
                      value={`${sortKey}:${sortDir}`}
                      onChange={(e) => {
                        const [k, d] = e.target.value.split(':') as [SortKey, 'asc' | 'desc'];
                        setSortKey(k);
                        setSortDir(d);
                      }}
                      className="h-7 px-2 rounded-md border border-border bg-background text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-[#ef4444]/40"
                    >
                      <option value="supplyUsd:desc">Supply ↓</option>
                      <option value="supplyUsd:asc">Supply ↑</option>
                      <option value="holders:desc">Holders ↓</option>
                      <option value="avgHolder:desc">Avg/holder ↓</option>
                      <option value="volumeUsd:desc">24h Vol ↓</option>
                      <option value="velocity:desc">Velocity ↓</option>
                      <option value="transfers:desc">24h Tx ↓</option>
                      <option value="symbol:asc">Symbol A–Z</option>
                    </select>
                  </label>
                </div>

                {/* Mobile card stack */}
                <ul className="md:hidden divide-y divide-border/60">
                  {filtered.map((c, idx) => (
                    <MobileCoinCard
                      key={c.token}
                      coin={c}
                      rank={idx + 1}
                      logoUrl={logoMap[c.token.toLowerCase()]}
                    />
                  ))}
                </ul>

                {/* Desktop table — own scroll context so the header can stick */}
                <div className="hidden md:block overflow-auto max-h-[70vh]">
                  <table className="w-full text-[13px]">
                    <thead className="sticky top-0 z-10 bg-card">
                      <tr className="border-b border-border bg-card text-[10px] font-bold tracking-wider uppercase text-muted-foreground">
                        <th className="text-left font-bold px-4 py-2.5 w-10">#</th>
                        <SortableTh
                          label="Stablecoin"
                          active={sortKey === 'symbol'}
                          dir={sortDir}
                          onClick={() => handleSort('symbol')}
                          align="left"
                          className="min-w-[180px]"
                        />
                        <th className="text-left font-bold px-3 py-2.5 hidden md:table-cell">Peg</th>
                        <SortableTh
                          label="Supply"
                          active={sortKey === 'supplyUsd'}
                          dir={sortDir}
                          onClick={() => handleSort('supplyUsd')}
                          align="right"
                        />
                        <SortableTh
                          label="Holders"
                          active={sortKey === 'holders'}
                          dir={sortDir}
                          onClick={() => handleSort('holders')}
                          align="right"
                          className="hidden sm:table-cell"
                        />
                        <SortableTh
                          label="Avg/holder"
                          active={sortKey === 'avgHolder'}
                          dir={sortDir}
                          onClick={() => handleSort('avgHolder')}
                          align="right"
                          className="hidden lg:table-cell"
                          tooltip="Average position size: total USD supply divided by number of holders. High values suggest institutional concentration; low values suggest broad retail distribution."
                        />
                        <SortableTh
                          label="24h Vol"
                          active={sortKey === 'volumeUsd'}
                          dir={sortDir}
                          onClick={() => handleSort('volumeUsd')}
                          align="right"
                          className="hidden md:table-cell"
                        />
                        <SortableTh
                          label="Velocity"
                          active={sortKey === 'velocity'}
                          dir={sortDir}
                          onClick={() => handleSort('velocity')}
                          align="right"
                          className="hidden md:table-cell"
                          tooltip="Daily turnover: 24h transfer volume divided by total supply. A velocity of 1.0× means the entire supply changes hands once per day."
                        />
                        <SortableTh
                          label="24h Tx"
                          active={sortKey === 'transfers'}
                          dir={sortDir}
                          onClick={() => handleSort('transfers')}
                          align="right"
                          className="hidden lg:table-cell"
                        />
                        <th className="px-3 py-2.5 w-16" aria-hidden />
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((c, idx) => (
                        <CoinRow
                          key={c.token}
                          coin={c}
                          rank={idx + 1}
                          logoUrl={logoMap[c.token.toLowerCase()]}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>

                <footer className="flex items-center justify-between gap-2 px-4 py-2.5 border-t border-border">
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {filtered.length} stablecoin{filtered.length === 1 ? '' : 's'}
                  </span>
                </footer>
              </>
            )}
          </div>
        </SectionErrorBoundary>
      </div>
    </TooltipProvider>
  );
}

// ── Supply history ───────────────────────────────────────────────────────────

// Holders is intentionally omitted — total holders barely moves (~0.02% over a
// quarter), so a time-series line carries no signal; it lives in the KPI strip
// instead. The auto-zoom in the chart still guards any other narrow-band series.
const METRIC_OPTIONS: { key: StablecoinMetric; label: string; monetary: boolean }[] = [
  { key: 'supply', label: 'Supply', monetary: true },
  { key: 'volume', label: 'Volume', monetary: true },
  { key: 'transfers', label: 'Transfers', monetary: false },
];

// One request returns every token as a separate series; we aggregate them into
// a single total line. `limit` is per-token data points — request generously so
// every token has coverage, then clip the *displayed* range to `windowDays` so
// the chart isn't skewed by tokens whose history reaches further back.
const GRANULARITY_OPTIONS: {
  key: StablecoinGranularity;
  label: string;
  limit: number;
  windowDays: number;
}[] = [
  // All three show full available history (back to ~2021). limit is high enough
  // to capture every coin's complete series (longest is ~1,800 daily points),
  // and the window is effectively unbounded so nothing is clipped.
  { key: 'day', label: 'Daily', limit: 5000, windowDays: 365 * 20 },
  { key: 'week', label: 'Weekly', limit: 500, windowDays: 365 * 20 },
  { key: 'month', label: 'Monthly', limit: 120, windowDays: 365 * 20 },
];

const DAY_MS = 24 * 60 * 60 * 1000;

interface SeriesPoint {
  t: number; // epoch ms (bucket start, UTC)
  v: number; // aggregated value (USD for monetary metrics, else a raw count)
}

// Chart viewBox geometry. Module-level so the useMemo deps stay stable.
const CHART_W = 820;
const CHART_H = 280;
const CHART_M = { top: 16, right: 20, bottom: 28, left: 60 };

// Collapse the per-token series into a single total-per-period line.
//   • supply/holders are *snapshots* → forward-fill each token's last known
//     value across the union of periods (a token contributes 0 before its
//     first data point — it didn't exist yet).
//   • volume/transfers are *flows* → each bucket stands alone; a missing
//     bucket means no activity, i.e. 0.
// Monetary metrics (supply, volume) are scaled by 10^decimals and converted to
// USD via the token's peg; counts are taken as plain integers.
function aggregateSeries(
  series: StablecoinSeries[],
  meta: Map<string, { decimals: number; peg: string }>,
  metric: StablecoinMetric,
  fx: FxRates,
): SeriesPoint[] {
  if (!series.length) return [];
  const monetary = metric === 'supply' || metric === 'volume';
  const snapshot = metric === 'supply' || metric === 'holders';

  const periodSet = new Set<number>();
  for (const s of series) {
    for (const p of s.data) {
      const t = Date.parse(p.period);
      if (!Number.isNaN(t)) periodSet.add(t);
    }
  }
  const periods = [...periodSet].sort((a, b) => a - b);
  if (!periods.length) return [];

  const totals = new Map<number, number>(periods.map((t) => [t, 0]));

  for (const s of series) {
    const info = meta.get(s.token.toLowerCase());
    // Without decimals/peg we can't safely scale a monetary value — skip until
    // the companion list endpoint has loaded.
    if (monetary && !info) continue;
    const decimals = info?.decimals ?? 0;
    const peg = info?.peg ?? 'USD';

    const scale = (raw: string): number => {
      if (monetary) return pegToUsd(toUnits(raw, decimals), peg, fx);
      try {
        return Number(BigInt(raw));
      } catch {
        return 0;
      }
    };

    const pts = s.data
      .map((p) => ({ t: Date.parse(p.period), raw: p.value }))
      .filter((p) => !Number.isNaN(p.t))
      .sort((a, b) => a.t - b.t);
    if (!pts.length) continue;

    if (snapshot) {
      let pi = 0;
      let last = 0;
      let started = false;
      for (const t of periods) {
        while (pi < pts.length && pts[pi].t <= t) {
          last = scale(pts[pi].raw);
          started = true;
          pi++;
        }
        if (started) totals.set(t, (totals.get(t) || 0) + last);
      }
    } else {
      for (const p of pts) {
        totals.set(p.t, (totals.get(p.t) || 0) + scale(p.raw));
      }
    }
  }

  return periods.map((t) => ({ t, v: totals.get(t) || 0 }));
}

function SupplyHistoryCard({ coins, fx }: { coins: Stablecoin[]; fx: FxRates }) {
  const [metric, setMetric] = useState<StablecoinMetric>('supply');
  const [granularity, setGranularity] = useState<StablecoinGranularity>('day');
  const [series, setSeries] = useState<StablecoinSeries[]>([]);
  const [loading, setLoading] = useState(true);
  const [hover, setHover] = useState<number | null>(null);
  // Stacked-by-issuer composition view. Only meaningful for the supply metric;
  // the toggle is hidden otherwise.
  const [stacked, setStacked] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  const monetary = metric === 'supply' || metric === 'volume';
  const stackedView = stacked && metric === 'supply';

  const meta = useMemo(() => {
    const m = new Map<string, { decimals: number; peg: string; issuer: string }>();
    for (const c of coins) {
      m.set(c.token.toLowerCase(), {
        decimals: c.decimals,
        peg: c.peg,
        issuer: c.issuer || c.symbol,
      });
    }
    return m;
  }, [coins]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const g = GRANULARITY_OPTIONS.find((x) => x.key === granularity)!;
    getStablecoinsTimeseries({ evmChainId: 43114, metric, granularity, limit: g.limit })
      .then((s) => {
        if (alive) setSeries(s);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [metric, granularity]);

  const points = useMemo(() => {
    const all = aggregateSeries(series, meta, metric, fx);
    if (all.length < 2) return all;
    // Clip to the recent window so a single deep-history token doesn't stretch
    // the axis across years where most coins report nothing.
    const g = GRANULARITY_OPTIONS.find((x) => x.key === granularity)!;
    const start = all[all.length - 1].t - g.windowDays * DAY_MS;
    const clipped = all.filter((p) => p.t >= start);
    return clipped.length >= 2 ? clipped : all;
  }, [series, meta, metric, fx, granularity]);

  const geom = useMemo(() => {
    if (points.length < 2) return null;
    const vals = points.map((p) => p.v);
    const maxV = Math.max(...vals, 0);
    const minV = Math.min(...vals);
    const span = maxV - minV;
    // Some series (notably holder counts) barely move — a few hundred out of
    // millions. Against a 0-based axis they look dead flat, so when the data
    // sits in a narrow band well above zero we zoom in on that band instead.
    const zoom = minV > 0 && maxV > 0 && span / maxV < 0.1;
    let domainMin = 0;
    let domainMax = maxV > 0 ? maxV * 1.12 : 1;
    if (zoom) {
      const pad = span > 0 ? span * 0.4 : Math.max(1, maxV * 0.0005);
      domainMin = Math.max(0, minV - pad);
      domainMax = maxV + pad;
    }
    const x = d3
      .scaleUtc()
      .domain([points[0].t, points[points.length - 1].t])
      .range([CHART_M.left, CHART_W - CHART_M.right]);
    const y = d3
      .scaleLinear()
      .domain([domainMin, domainMax])
      .range([CHART_H - CHART_M.bottom, CHART_M.top]);
    const baselineY = CHART_H - CHART_M.bottom; // fill from the axis floor
    const area = d3
      .area<SeriesPoint>()
      .x((d) => x(d.t))
      .y0(baselineY)
      .y1((d) => y(d.v))
      .curve(d3.curveMonotoneX);
    const line = d3
      .line<SeriesPoint>()
      .x((d) => x(d.t))
      .y((d) => y(d.v))
      .curve(d3.curveMonotoneX);
    // Adaptive x-axis labels: years for multi-year spans (otherwise every tick
    // reads "Jan 01"), month+year for medium spans, month+day for short ones.
    const spanDays = (points[points.length - 1].t - points[0].t) / DAY_MS;
    const fmtTick =
      spanDays > 730
        ? d3.utcFormat('%Y')
        : spanDays > 90
          ? d3.utcFormat("%b '%y")
          : d3.utcFormat('%b %d');
    return {
      x,
      y,
      zoom,
      areaPath: area(points) || '',
      linePath: line(points) || '',
      yTicks: y.ticks(4),
      xTicks: x.ticks(6),
      fmtTick,
    };
  }, [points]);

  // Per-issuer stacked bands aligned to the same periods as `points`. Each
  // token's supply is forward-filled (snapshot) and summed into its issuer; the
  // running cumulative top equals the total line, so it reuses geom's 0-based
  // y-scale. Top issuers keep their own band; the long tail folds into "Others".
  const stack = useMemo(() => {
    if (!stackedView || !geom || points.length < 2) return null;
    const periods = points.map((p) => p.t);
    const byIssuer = new Map<string, number[]>();
    for (const s of series) {
      const info = meta.get(s.token.toLowerCase());
      if (!info) continue;
      const pts = s.data
        .map((p) => ({ t: Date.parse(p.period), v: pegToUsd(toUnits(p.value, info.decimals), info.peg, fx) }))
        .filter((p) => !Number.isNaN(p.t))
        .sort((a, b) => a.t - b.t);
      if (!pts.length) continue;
      const arr = byIssuer.get(info.issuer) ?? new Array(periods.length).fill(0);
      let pi = 0;
      let last = 0;
      let started = false;
      for (let i = 0; i < periods.length; i++) {
        while (pi < pts.length && pts[pi].t <= periods[i]) {
          last = pts[pi].v;
          started = true;
          pi++;
        }
        if (started) arr[i] += last;
      }
      byIssuer.set(info.issuer, arr);
    }
    if (byIssuer.size === 0) return null;
    const lastIdx = periods.length - 1;
    const ranked = [...byIssuer.entries()].sort((a, b) => b[1][lastIdx] - a[1][lastIdx]);
    const TOP = 5;
    const keys = ranked.slice(0, TOP).map(([name, values], i) => ({
      name,
      color: ISSUER_PALETTE[i] || ISSUER_PALETTE[ISSUER_PALETTE.length - 1],
      values,
    }));
    const rest = ranked.slice(TOP);
    if (rest.length) {
      const others = new Array(periods.length).fill(0);
      for (const [, v] of rest) for (let i = 0; i < periods.length; i++) others[i] += v[i];
      keys.push({ name: 'Others', color: ISSUER_PALETTE[ISSUER_PALETTE.length - 1], values: others });
    }
    const baseline = new Array(periods.length).fill(0);
    const idxArr = periods.map((_, i) => ({ i }));
    const bands = keys.map((k) => {
      const lower = baseline.slice();
      const upper = baseline.map((b, i) => b + k.values[i]);
      for (let i = 0; i < periods.length; i++) baseline[i] = upper[i];
      const gen = d3
        .area<{ i: number }>()
        .x((d) => geom.x(periods[d.i]))
        .y0((d) => geom.y(lower[d.i]))
        .y1((d) => geom.y(upper[d.i]))
        .curve(d3.curveMonotoneX);
      return { name: k.name, color: k.color, path: gen(idxArr) || '' };
    });
    return { bands };
  }, [stackedView, geom, points, series, meta, fx]);

  // Axis labels: compact when the axis spans from zero, full-precision when
  // zoomed (compact "3.18M" can't tell 3,176,235 from 3,176,824 apart).
  const fmtY = (n: number): string => {
    if (n <= 0) return monetary ? '$0' : '0';
    if (geom?.zoom) return (monetary ? '$' : '') + Math.round(n).toLocaleString();
    return monetary ? fmtUsd(n) : fmtCount(n);
  };
  // Tooltip always shows the exact value.
  const fmtValue = (n: number): string =>
    monetary ? fmtUsd(n) : Math.round(n).toLocaleString();

  const fmtDate = useMemo(
    () =>
      granularity === 'month'
        ? d3.utcFormat('%B %Y')
        : granularity === 'hour'
          ? d3.utcFormat('%b %d, %H:%M UTC')
          : d3.utcFormat('%b %d, %Y'),
    [granularity],
  );

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!geom || !svgRef.current || points.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const vx = ((e.clientX - rect.left) / rect.width) * CHART_W;
    const t = geom.x.invert(vx).getTime();
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < points.length; i++) {
      const d = Math.abs(points[i].t - t);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    setHover(best);
  };

  const active = hover != null && points[hover] ? points[hover] : null;

  // Headline readout: the hovered point when hovering, otherwise the latest.
  const latest = points.length ? points[points.length - 1] : null;
  const shown = active ?? latest;
  const peak = points.length
    ? points.reduce((a, b) => (b.v > a.v ? b : a), points[0])
    : null;

  const COPY: Record<StablecoinMetric, { title: string; subtitle: string }> = {
    supply: {
      title: 'Supply history',
      subtitle: 'USD-equivalent supply across all tracked stablecoins.',
    },
    volume: {
      title: 'Volume history',
      subtitle: 'USD-equivalent transfer volume per period, all stablecoins.',
    },
    holders: {
      title: 'Holders history',
      subtitle: 'Total holders across all stablecoins (a wallet may be counted per coin).',
    },
    transfers: {
      title: 'Transfers history',
      subtitle: 'Transfer count per period across all stablecoins.',
    },
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <h2 className="text-[14px] font-semibold text-foreground">{COPY[metric].title}</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">{COPY[metric].subtitle}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {metric === 'supply' && (
            <div className="flex items-center gap-1 p-0.5 rounded-lg bg-muted/40">
              {([['total', 'Total'], ['stacked', 'By issuer']] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setStacked(key === 'stacked')}
                  className={`h-6 px-2 rounded-md text-[10px] font-bold tracking-wider uppercase transition-colors ${
                    (key === 'stacked') === stacked
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-1 p-0.5 rounded-lg bg-muted/40">
            {METRIC_OPTIONS.map((m) => (
              <button
                key={m.key}
                onClick={() => setMetric(m.key)}
                className={`h-6 px-2 rounded-md text-[10px] font-bold tracking-wider uppercase transition-colors ${
                  metric === m.key
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 p-0.5 rounded-lg bg-muted/40">
            {GRANULARITY_OPTIONS.map((g) => (
              <button
                key={g.key}
                onClick={() => setGranularity(g.key)}
                className={`h-6 px-2 rounded-md text-[10px] font-bold tracking-wider uppercase transition-colors ${
                  granularity === g.key
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {shown && (
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 mb-4">
          <div>
            <div className="text-[28px] leading-none font-bold text-foreground tabular-nums tracking-tight">
              {fmtValue(shown.v)}
            </div>
            <div className="text-[11px] text-muted-foreground mt-1.5">
              {active
                ? fmtDate(new Date(active.t))
                : latest
                  ? `Latest · ${fmtDate(new Date(latest.t))}`
                  : null}
            </div>
          </div>
          {peak && peak !== latest && (
            <div className="text-right">
              <div className="text-[10px] font-medium tracking-wider uppercase text-muted-foreground">
                Peak
              </div>
              <div className="text-[14px] font-bold text-foreground tabular-nums">
                {fmtValue(peak.v)}
              </div>
              <div className="text-[10px] text-muted-foreground tabular-nums">
                {fmtDate(new Date(peak.t))}
              </div>
            </div>
          )}
        </div>
      )}

      {loading && points.length === 0 ? (
        <div className="flex items-center justify-center h-[280px]">
          <LoadingSpinner size="md" />
        </div>
      ) : !geom ? (
        <div className="flex items-center justify-center h-[280px] text-sm text-muted-foreground">
          No history available for this view.
        </div>
      ) : (
        <div className="relative">
          <div className="relative">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${CHART_W} ${CHART_H}`}
            className="w-full h-auto block"
            onMouseMove={handleMove}
            onMouseLeave={() => setHover(null)}
            role="img"
            aria-label={`Stablecoin ${metric} over time`}
          >
            <defs>
              <linearGradient id="sc-supply-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ef4444" stopOpacity={0.28} />
                <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
              </linearGradient>
            </defs>

            {geom.yTicks.map((tick) => (
              <g key={tick}>
                <line
                  x1={CHART_M.left}
                  x2={CHART_W - CHART_M.right}
                  y1={geom.y(tick)}
                  y2={geom.y(tick)}
                  stroke="currentColor"
                  strokeOpacity={0.08}
                />
                <text
                  x={CHART_M.left - 8}
                  y={geom.y(tick)}
                  textAnchor="end"
                  dominantBaseline="middle"
                  className="fill-muted-foreground"
                  fontSize={10}
                >
                  {fmtY(tick)}
                </text>
              </g>
            ))}

            {geom.xTicks.map((tick) => (
              <text
                key={+tick}
                x={geom.x(tick)}
                y={CHART_H - 8}
                textAnchor="middle"
                className="fill-muted-foreground"
                fontSize={10}
              >
                {geom.fmtTick(tick)}
              </text>
            ))}

            {stack ? (
              stack.bands.map((b) => (
                <path key={b.name} d={b.path} fill={b.color} fillOpacity={0.78} stroke={b.color} strokeOpacity={0.9} strokeWidth={0.5} />
              ))
            ) : (
              <>
                <path d={geom.areaPath} fill="url(#sc-supply-fill)" />
                <path
                  d={geom.linePath}
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth={1.75}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              </>
            )}

            {/* Persistent marker at the latest point */}
            {!stack && latest && !active && (
              <circle cx={geom.x(latest.t)} cy={geom.y(latest.v)} r={3} fill="#ef4444" />
            )}

            {active && (
              <g>
                <line
                  x1={geom.x(active.t)}
                  x2={geom.x(active.t)}
                  y1={CHART_M.top}
                  y2={CHART_H - CHART_M.bottom}
                  stroke="#ef4444"
                  strokeOpacity={0.4}
                  strokeDasharray="6 4"
                  vectorEffect="non-scaling-stroke"
                />
                <circle
                  cx={geom.x(active.t)}
                  cy={geom.y(active.v)}
                  r={4}
                  fill="#ef4444"
                  stroke="var(--card, #fff)"
                  strokeWidth={2}
                />
              </g>
            )}
          </svg>
          <ChartWatermark />
          </div>
          {stack && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-2 px-1">
              {stack.bands.map((b) => (
                <div key={b.name} className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: b.color }} />
                  <span className="text-[11px] text-muted-foreground">{b.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function KpiStrip({
  totals,
}: {
  totals: {
    supply: number;
    volume: number;
    holders: number;
    count: number;
    change7d: number;
    hasTrend: boolean;
  };
}) {
  const cards = [
    {
      label: 'Total supply',
      value: fmtUsd(totals.supply),
      icon: DollarSign,
      tip: 'Sum of every tracked stablecoin supply, converted to USD using ECB reference rates for non-USD pegs.',
      // Only annotate once history has loaded and there's a real total.
      change: totals.hasTrend && totals.supply > 0 ? totals.change7d : undefined,
      changeLabel: '7d',
    },
    {
      label: 'Stablecoins',
      value: totals.count > 0 ? totals.count.toLocaleString() : '—',
      icon: Coins,
      tip: 'Distinct stablecoin contracts indexed on Avalanche C-Chain.',
    },
    {
      label: 'Total holders',
      value: fmtCount(totals.holders),
      icon: Users,
      tip: 'Sum of unique holders across every stablecoin. A wallet holding two stablecoins is counted twice.',
    },
    {
      label: '24h volume',
      value: fmtUsd(totals.volume),
      icon: TrendingUp,
      tip: 'On-chain transfer volume in the last 24 hours, USD-equivalent.',
    },
  ];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      {cards.map(({ label, value, icon: Icon, tip, change, changeLabel }) => (
        <div key={label} className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-medium tracking-wide text-muted-foreground">
                {label}
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="text-muted-foreground/70 hover:text-foreground"
                  >
                    <Info className="w-3 h-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[240px]">
                  {tip}
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="w-7 h-7 rounded-lg bg-[#ef4444]/10 flex items-center justify-center">
              <Icon className="w-3.5 h-3.5 text-[#ef4444]" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <div className="text-2xl font-bold text-foreground tracking-tight">{value}</div>
            {change !== undefined && (
              <span className="flex items-baseline gap-1">
                <ChangeBadge value={change} className="text-[12px]" />
                <span className="text-[10px] text-muted-foreground/70">{changeLabel}</span>
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function TopMovers({
  gainers,
  losers,
  logoMap,
}: {
  gainers: EnrichedCoin[];
  losers: EnrichedCoin[];
  logoMap: Record<string, string>;
}) {
  const columns: { title: string; tone: string; Icon: typeof TrendingUp; coins: EnrichedCoin[] }[] = [
    { title: 'Inflows', tone: 'text-green-600 dark:text-green-400', Icon: TrendingUp, coins: gainers },
    { title: 'Outflows', tone: 'text-[#ef4444]', Icon: TrendingDown, coins: losers },
  ];
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <header className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <h2 className="text-[14px] font-semibold text-foreground">Supply flows</h2>
        <span className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground">
          7d
        </span>
      </header>
      <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-border">
        {columns.map(({ title, tone, Icon, coins }) => (
          <div key={title} className="p-3 sm:p-4">
            <div className={`flex items-center gap-1.5 mb-2 text-[11px] font-bold tracking-wider uppercase ${tone}`}>
              <Icon className="w-3.5 h-3.5" />
              {title}
            </div>
            {coins.length === 0 ? (
              <div className="py-4 text-center text-[12px] text-muted-foreground">No {title.toLowerCase()} this week.</div>
            ) : (
              <ul className="space-y-0.5">
                {coins.map((c) => (
                  <li
                    key={c.token}
                    className="flex items-center gap-2.5 px-1.5 py-1.5 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <CoinLogo coin={c} logoUrl={logoMap[c.token.toLowerCase()]} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] font-bold text-foreground truncate">{c.symbol}</div>
                      <div className="text-[10px] text-muted-foreground tabular-nums">{fmtUsd(c.supplyUsd)}</div>
                    </div>
                    {c.trend && <Sparkline data={c.trend.spark} width={56} height={18} />}
                    <ChangeBadge value={c.trend?.change7d} className="text-[12px] w-14 text-right" />
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const ISSUER_PALETTE = [
  '#ef4444', // brand red
  '#3b82f6', // blue
  '#22c55e', // green
  '#a855f7', // purple
  '#f97316', // orange
  '#64748b', // slate (Others)
];

function IssuerCard({
  slices,
  coins,
  total,
  selected,
  onSelect,
}: {
  slices: { name: string; value: number }[];
  coins: EnrichedCoin[];
  total: number;
  selected: string | null;
  onSelect: (name: string) => void;
}) {
  const [viewMode, setViewMode] = useState<'issuers' | 'coins'>('issuers');

  // SVG donut params
  const size = 140;
  const radius = 60;
  const stroke = 18;
  const circumference = 2 * Math.PI * radius;
  let cursor = 0;

  // Top-3 concentration. slices are pre-sorted desc and "Others" lives at the
  // end, so the first three entries are always the top three individual issuers.
  const top3 = slices.filter((s) => s.name !== 'Others').slice(0, 3);
  const top3Sum = top3.reduce((s, x) => s + x.value, 0);
  const top3Pct = total > 0 ? (top3Sum / total) * 100 : 0;

  // Map issuer name → color, derived from the donut's slice order so both views
  // stay visually consistent. Issuers outside the top-5 use the "Others" color.
  const issuerColor = useMemo(() => {
    const map = new Map<string, string>();
    slices.forEach((s, i) => {
      map.set(
        s.name,
        ISSUER_PALETTE[i] || ISSUER_PALETTE[ISSUER_PALETTE.length - 1],
      );
    });
    return (name: string | undefined) => {
      if (!name) return ISSUER_PALETTE[ISSUER_PALETTE.length - 1];
      return map.get(name) || ISSUER_PALETTE[ISSUER_PALETTE.length - 1];
    };
  }, [slices]);

  return (
    <div className="lg:col-span-2 rounded-xl border border-border bg-card p-4 sm:p-5">
      <header className="flex items-center justify-between mb-4 gap-3">
        <h2 className="text-[14px] font-semibold text-foreground">Supply breakdown</h2>
        <div className="flex items-center gap-1 p-0.5 rounded-lg bg-muted/40">
          {(['issuers', 'coins'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`h-6 px-2 rounded-md text-[10px] font-bold tracking-wider uppercase transition-colors ${
                viewMode === mode
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {mode === 'issuers' ? 'By issuer' : 'Per coin'}
            </button>
          ))}
        </div>
      </header>

      {slices.length === 0 || total === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground">No data.</div>
      ) : (<>
        <ConcentrationBanner
          pct={top3Pct}
          dollarAmount={top3Sum}
          totalDollar={total}
          topNames={top3.map((s) => s.name)}
        />
        {viewMode === 'coins' ? (
          <SupplyTreemap
            coins={coins}
            total={total}
            issuerColor={issuerColor}
            selected={selected}
            onSelect={onSelect}
          />
        ) : (
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
          <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            className="shrink-0 -rotate-90"
            aria-hidden
          >
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeOpacity={0.08}
              strokeWidth={stroke}
            />
            {slices.map((s, i) => {
              const frac = s.value / total;
              const len = frac * circumference;
              const dashoffset = -cursor;
              cursor += len;
              const isOthers = s.name === 'Others';
              const isSelected = selected === s.name;
              const isDimmed = selected !== null && !isSelected;
              const color = ISSUER_PALETTE[i] || ISSUER_PALETTE[ISSUER_PALETTE.length - 1];
              return (
                <circle
                  key={s.name}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={color}
                  strokeWidth={stroke}
                  strokeDasharray={`${len} ${circumference}`}
                  strokeDashoffset={dashoffset}
                  strokeLinecap="butt"
                  opacity={isDimmed ? 0.3 : 1}
                  className={`transition-opacity ${
                    isOthers ? '' : 'cursor-pointer hover:opacity-80'
                  }`}
                  onClick={isOthers ? undefined : () => onSelect(s.name)}
                >
                  <title>
                    {s.name}: {((s.value / total) * 100).toFixed(1)}%
                  </title>
                </circle>
              );
            })}
          </svg>

          <ul className="flex-1 w-full space-y-0.5">
            {slices.map((s, i) => {
              const pct = total > 0 ? (s.value / total) * 100 : 0;
              const isOthers = s.name === 'Others';
              const isSelected = selected === s.name;
              const isDimmed = selected !== null && !isSelected;
              const color =
                ISSUER_PALETTE[i] || ISSUER_PALETTE[ISSUER_PALETTE.length - 1];
              const content = (
                <>
                  <span
                    className="w-2.5 h-2.5 rounded-sm shrink-0"
                    style={{ background: color }}
                  />
                  <span className="text-[12px] font-medium text-foreground truncate flex-1 text-left">
                    {s.name}
                  </span>
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {fmtUsd(s.value)}
                  </span>
                  <span className="text-[11px] tabular-nums font-semibold text-foreground w-12 text-right">
                    {pct >= 0.1 ? `${pct.toFixed(1)}%` : '<0.1%'}
                  </span>
                </>
              );
              return (
                <li key={s.name}>
                  {isOthers ? (
                    <div
                      className={`flex items-center gap-3 px-1.5 py-1 ${
                        isDimmed ? 'opacity-50' : ''
                      }`}
                    >
                      {content}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onSelect(s.name)}
                      className={`flex w-full items-center gap-3 px-1.5 py-1 rounded transition-colors ${
                        isSelected
                          ? 'bg-[#ef4444]/10'
                          : 'hover:bg-muted/60'
                      } ${isDimmed ? 'opacity-50' : ''}`}
                    >
                      {content}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
        )}
      </>)}
    </div>
  );
}

function SupplyTreemap({
  coins,
  total,
  issuerColor,
  selected,
  onSelect,
}: {
  coins: EnrichedCoin[];
  total: number;
  issuerColor: (name: string | undefined) => string;
  selected: string | null;
  onSelect: (name: string) => void;
}) {
  const W = 600;
  const H = 320;

  const rects = useMemo(() => {
    const filtered = coins.filter((c) => c.supplyUsd > 0);
    if (filtered.length === 0) return [];
    const root = d3
      .hierarchy<{ children?: EnrichedCoin[]; coin?: EnrichedCoin }>({
        children: filtered.map((c) => ({ coin: c })),
      })
      .sum((d) => (d.coin ? d.coin.supplyUsd : 0))
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

    d3
      .treemap<{ children?: EnrichedCoin[]; coin?: EnrichedCoin }>()
      .size([W, H])
      .padding(2)
      .round(true)
      .tile(d3.treemapSquarify)(root);

    return root.leaves().map((leaf) => {
      const coin = leaf.data.coin!;
      const x = leaf.x0;
      const y = leaf.y0;
      const w = leaf.x1 - leaf.x0;
      const h = leaf.y1 - leaf.y0;
      const issuer = coin.issuer || coin.symbol;
      const pct = total > 0 ? (coin.supplyUsd / total) * 100 : 0;
      return { coin, x, y, w, h, issuer, pct };
    });
  }, [coins, total]);

  if (!rects.length) {
    return <div className="py-10 text-center text-sm text-muted-foreground">No data.</div>;
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-auto block"
      aria-label="Stablecoin supply treemap"
    >
      {rects.map(({ coin, x, y, w, h, issuer, pct }) => {
        const color = issuerColor(coin.issuer);
        const isSelected = selected === issuer;
        const isDimmed = selected !== null && !isSelected;
        const showLabel = w >= 56 && h >= 30;
        const showValue = w >= 70 && h >= 46;
        return (
          <g
            key={coin.token}
            transform={`translate(${x},${y})`}
            className="cursor-pointer transition-opacity"
            opacity={isDimmed ? 0.35 : 1}
            onClick={() => onSelect(issuer)}
          >
            <title>
              {coin.symbol} ({issuer}) · {fmtUsd(coin.supplyUsd)} · {pct.toFixed(2)}%
            </title>
            <rect
              width={w}
              height={h}
              fill={color}
              fillOpacity={0.85}
              stroke={isSelected ? '#ffffff' : color}
              strokeOpacity={isSelected ? 0.9 : 0.4}
              strokeWidth={isSelected ? 2 : 1}
              rx={3}
            />
            {showLabel && (
              <text
                x={8}
                y={18}
                fill="#ffffff"
                fontSize={12}
                fontWeight={700}
                style={{ pointerEvents: 'none' }}
              >
                {coin.symbol}
              </text>
            )}
            {showValue && (
              <text
                x={8}
                y={34}
                fill="#ffffff"
                fillOpacity={0.85}
                fontSize={10}
                style={{ pointerEvents: 'none' }}
              >
                {fmtUsd(coin.supplyUsd)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function ConcentrationBanner({
  pct,
  dollarAmount,
  totalDollar,
  topNames,
}: {
  pct: number;
  dollarAmount: number;
  totalDollar: number;
  topNames: string[];
}) {
  return (
    <div className="mb-5 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <div className="min-w-0 flex items-baseline gap-2">
          <span className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground shrink-0">
            Top 3 issuers
          </span>
          <span className="text-[11px] text-muted-foreground truncate hidden sm:inline">
            {topNames.join(' · ')}
          </span>
        </div>
        <div className="text-right shrink-0">
          <span className="text-[18px] font-bold text-foreground tabular-nums">
            {pct.toFixed(1)}%
          </span>
          <span className="text-[10px] tabular-nums text-muted-foreground ml-1.5">
            {fmtUsd(dollarAmount)} / {fmtUsd(totalDollar)}
          </span>
        </div>
      </div>
      <div className="h-1.5 rounded-full bg-muted/60 overflow-hidden">
        <div
          className="h-full rounded-full bg-[#ef4444]"
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  );
}

function OriginCard({ nativeUsd, bridgedUsd }: { nativeUsd: number; bridgedUsd: number }) {
  const total = nativeUsd + bridgedUsd;
  const nativePct = total > 0 ? (nativeUsd / total) * 100 : 0;
  const bridgedPct = total > 0 ? (bridgedUsd / total) * 100 : 0;

  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <header className="flex items-center justify-between mb-4">
        <h2 className="text-[14px] font-semibold text-foreground">Native vs bridged</h2>
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" className="text-muted-foreground/70 hover:text-foreground">
              <Info className="w-3 h-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[240px]">
            Native = canonical on-Avalanche issuance. Bridged = supply originally issued
            elsewhere and brought over via a bridge (e.g. USDC.e, USDT.e, DAI.e).
          </TooltipContent>
        </Tooltip>
      </header>

      {total === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground">No data.</div>
      ) : (
        <>
          <div className="h-3 rounded-full bg-muted/40 overflow-hidden flex mb-4">
            <div
              className="h-full bg-[#ef4444]"
              style={{ width: `${nativePct}%` }}
              title={`Native ${nativePct.toFixed(1)}%`}
            />
            <div
              className="h-full bg-[#3b82f6]"
              style={{ width: `${bridgedPct}%` }}
              title={`Bridged ${bridgedPct.toFixed(1)}%`}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <OriginStat
              label="Native"
              dotColor="#ef4444"
              value={fmtUsd(nativeUsd)}
              pct={nativePct}
            />
            <OriginStat
              label="Bridged"
              dotColor="#3b82f6"
              value={fmtUsd(bridgedUsd)}
              pct={bridgedPct}
            />
          </div>
        </>
      )}
    </div>
  );
}

function OriginStat({
  label,
  dotColor,
  value,
  pct,
}: {
  label: string;
  dotColor: string;
  value: string;
  pct: number;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <span className="w-2 h-2 rounded-sm" style={{ background: dotColor }} />
        <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      </div>
      <div className="text-lg font-bold text-foreground tabular-nums">{value}</div>
      <div className="text-[11px] tabular-nums text-muted-foreground">
        {pct.toFixed(1)}%
      </div>
    </div>
  );
}

function SortableTh({
  label,
  active,
  dir,
  onClick,
  align = 'left',
  className = '',
  tooltip,
}: {
  label: string;
  active: boolean;
  dir: 'asc' | 'desc';
  onClick: () => void;
  align?: 'left' | 'right';
  className?: string;
  tooltip?: string;
}) {
  const button = (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 font-bold tracking-wider text-[10px] transition-colors ${
        active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      <span>{label}</span>
      {active ? (
        dir === 'asc' ? (
          <ChevronUp className="w-3 h-3" />
        ) : (
          <ChevronDown className="w-3 h-3" />
        )
      ) : (
        <ArrowDownUp className="w-3 h-3 opacity-40" />
      )}
    </button>
  );
  return (
    <th className={`px-3 py-2.5 ${align === 'right' ? 'text-right' : 'text-left'} ${className}`}>
      {tooltip ? (
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent side="top" className="max-w-[240px]">
            {tooltip}
          </TooltipContent>
        </Tooltip>
      ) : (
        button
      )}
    </th>
  );
}

// Every tracked peg gets its own tint so the Peg column reads as a quick colour
// key (currency at a glance) rather than a wall of identical gray badges.
const PEG_TINT: Record<string, string> = {
  USD: 'bg-[#22c55e]/10 text-green-600 dark:text-green-400',
  EUR: 'bg-[#3b82f6]/10 text-blue-600 dark:text-blue-400',
  SGD: 'bg-[#a855f7]/10 text-purple-600 dark:text-purple-400',
  JPY: 'bg-[#f97316]/10 text-orange-600 dark:text-orange-400',
  BRL: 'bg-[#14b8a6]/10 text-teal-600 dark:text-teal-400',
  CHF: 'bg-[#ec4899]/10 text-pink-600 dark:text-pink-400',
  GBP: 'bg-[#6366f1]/10 text-indigo-600 dark:text-indigo-400',
  TRY: 'bg-[#06b6d4]/10 text-cyan-600 dark:text-cyan-400',
};

function CoinRow({
  coin,
  rank,
  logoUrl,
}: {
  coin: EnrichedCoin;
  rank: number;
  logoUrl?: string;
}) {
  const peg = coin.peg?.toUpperCase() || '—';
  const tint = PEG_TINT[peg] || 'bg-muted/40 text-muted-foreground';
  const shareBarWidth = Math.max(0.5, coin.share * 100);

  return (
    <tr className="group border-b border-border/60 even:bg-muted/[0.035] hover:bg-[#ef4444]/[0.05] transition-colors">
      <td className="px-4 py-3 text-[11px] tabular-nums text-muted-foreground align-middle">
        {rank}
      </td>
      <td className="px-3 py-3 align-middle">
        <div className="flex items-center gap-2.5 min-w-0">
          <CoinLogo coin={coin} logoUrl={logoUrl} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-bold text-foreground">{coin.symbol}</span>
              {coin.bridged && (
                <span className="text-[9px] font-bold tracking-wider uppercase px-1.5 h-4 rounded-full bg-[#3b82f6]/10 text-blue-600 dark:text-blue-400 inline-flex items-center">
                  Bridged
                </span>
              )}
            </div>
            <div className="text-[11px] text-muted-foreground truncate max-w-[180px]">
              {coin.name}
              {coin.issuer ? ` · ${coin.issuer}` : ''}
            </div>
          </div>
        </div>
      </td>
      <td className="px-3 py-3 hidden md:table-cell align-middle">
        <span
          className={`inline-flex items-center h-5 px-2 rounded-full text-[10px] font-bold tracking-wider ${tint}`}
        >
          {peg}
        </span>
      </td>
      <td className="px-3 py-3 text-right tabular-nums align-middle">
        <div className="flex items-baseline justify-end gap-2">
          <span className="text-[13px] font-semibold text-foreground">{fmtUsd(coin.supplyUsd)}</span>
          {coin.trend && <ChangeBadge value={coin.trend.change7d} className="text-[10px]" />}
        </div>
        <div className="mt-1 flex items-center justify-end gap-2">
          {coin.trend ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Sparkline data={coin.trend.spark} width={72} height={18} />
                </span>
              </TooltipTrigger>
              <TooltipContent side="left">
                30-day supply · {fmtChange(coin.trend.change7d)} (7d)
              </TooltipContent>
            </Tooltip>
          ) : (
            <div className="h-1 w-24 rounded-full bg-muted/40 overflow-hidden">
              <div
                className="h-full rounded-full bg-[#ef4444]"
                style={{ width: `${shareBarWidth}%` }}
                title={`${(coin.share * 100).toFixed(2)}% of supply`}
              />
            </div>
          )}
        </div>
      </td>
      <td className="px-3 py-3 text-right tabular-nums text-foreground hidden sm:table-cell align-middle">
        {fmtCount(coin.holders)}
      </td>
      <td className="px-3 py-3 text-right tabular-nums hidden lg:table-cell align-middle">
        <AvgHolderCell value={coin.avgHolder} />
      </td>
      <td className="px-3 py-3 text-right tabular-nums text-foreground hidden md:table-cell align-middle">
        <Num value={fmtUsd(coin.volumeUsd)} />
      </td>
      <td className="px-3 py-3 text-right tabular-nums hidden md:table-cell align-middle">
        <VelocityCell value={coin.velocity} />
      </td>
      <td className="px-3 py-3 text-right tabular-nums text-muted-foreground hidden lg:table-cell align-middle">
        <Num value={fmtCount(coin.transfers_24h)} />
      </td>
      <td className="px-3 py-3 align-middle">
        <RowActions address={coin.token} symbol={coin.symbol} />
      </td>
    </tr>
  );
}

function MobileCoinCard({
  coin,
  rank,
  logoUrl,
}: {
  coin: EnrichedCoin;
  rank: number;
  logoUrl?: string;
}) {
  const peg = coin.peg?.toUpperCase() || '—';
  const tint = PEG_TINT[peg] || 'bg-muted/40 text-muted-foreground';
  return (
    <li className="px-4 py-3.5">
      <div className="flex items-start gap-3">
        <span className="text-[11px] tabular-nums text-muted-foreground w-5 mt-1.5 shrink-0">
          {rank}
        </span>
        <CoinLogo coin={coin} logoUrl={logoUrl} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[14px] font-bold text-foreground">{coin.symbol}</span>
              {coin.bridged && (
                <span className="text-[9px] font-bold tracking-wider uppercase px-1.5 h-4 rounded-full bg-[#3b82f6]/10 text-blue-600 dark:text-blue-400 inline-flex items-center">
                  Bridged
                </span>
              )}
            </div>
            <span
              className={`inline-flex items-center h-5 px-2 rounded-full text-[10px] font-bold tracking-wider shrink-0 ${tint}`}
            >
              {peg}
            </span>
          </div>
          <div className="text-[11px] text-muted-foreground truncate">
            {coin.name}
            {coin.issuer ? ` · ${coin.issuer}` : ''}
          </div>
          {coin.trend && (
            <div className="flex items-center gap-2 mt-1.5">
              <Sparkline data={coin.trend.spark} width={64} height={16} />
              <ChangeBadge value={coin.trend.change7d} className="text-[10px]" />
              <span className="text-[9px] text-muted-foreground/70">7d</span>
            </div>
          )}
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
        <Stat label="Supply" value={fmtUsd(coin.supplyUsd)} accent />
        <Stat label="24h Vol" value={coin.volumeUsd > 0 ? fmtUsd(coin.volumeUsd) : '—'} />
        <Stat
          label="Velocity"
          value={
            coin.velocity > 0
              ? `${coin.velocity >= 100 ? coin.velocity.toFixed(0) : coin.velocity.toFixed(2)}×`
              : '—'
          }
        />
        <Stat label="Holders" value={fmtCount(coin.holders)} />
        <Stat
          label="Avg/holder"
          value={coin.avgHolder > 0 ? fmtUsd(coin.avgHolder) : '—'}
        />
        <Stat label="24h Tx" value={fmtCount(coin.transfers_24h)} />
      </dl>

      <div className="mt-3 flex items-center gap-2">
        <MobileCardActions address={coin.token} symbol={coin.symbol} />
      </div>
    </li>
  );
}

function Stat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 min-w-0">
      <dt className="text-[10px] font-medium tracking-wider uppercase text-muted-foreground shrink-0">
        {label}
      </dt>
      <dd
        className={`tabular-nums truncate text-right ${
          value === EMPTY
            ? 'text-muted-foreground/30'
            : accent
              ? 'font-bold text-foreground'
              : 'font-semibold text-foreground'
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function MobileCardActions({ address, symbol }: { address: string; symbol: string }) {
  const { toast } = useToast();
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      toast(`${symbol} address copied`, 'success');
    } catch {
      toast('Could not copy address', 'error');
    }
  };
  return (
    <>
      <button
        type="button"
        onClick={handleCopy}
        className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border bg-card text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
      >
        <Copy className="w-3 h-3" />
        Copy address
      </button>
      <a
        href={`https://snowtrace.io/token/${address}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border bg-card text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
      >
        <ExternalLink className="w-3 h-3" />
        Snowtrace
      </a>
    </>
  );
}

function RowActions({ address, symbol }: { address: string; symbol: string }) {
  const { toast } = useToast();
  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(address);
      toast(`${symbol} address copied`, 'success');
    } catch {
      toast('Could not copy address', 'error');
    }
  };
  return (
    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
      <button
        type="button"
        onClick={handleCopy}
        title={`Copy ${symbol} contract`}
        className="inline-flex items-center justify-center w-7 h-7 rounded border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
      >
        <Copy className="w-3.5 h-3.5" />
      </button>
      <a
        href={`https://snowtrace.io/token/${address}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        title={`Open ${symbol} on Snowtrace`}
        className="inline-flex items-center justify-center w-7 h-7 rounded border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
      >
        <ExternalLink className="w-3.5 h-3.5" />
      </a>
    </div>
  );
}

// Format a fractional change (0.012 → "+1.2%") with sign and sensible precision.
function fmtChange(value: number): string {
  const pct = Math.abs(value) * 100;
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  if (pct > 0 && pct < 0.1) return `${sign}<0.1%`;
  return `${sign}${pct.toFixed(pct < 10 ? 1 : 0)}%`;
}

// Colored change indicator. `flat` (≈0) renders muted so a wall of unchanged
// coins stays quiet rather than screaming green/red.
function ChangeBadge({
  value,
  className = '',
}: {
  value: number | undefined;
  className?: string;
}) {
  if (value == null || !Number.isFinite(value)) {
    return <span className={`text-muted-foreground/40 ${className}`}>—</span>;
  }
  const flat = Math.abs(value) < 0.0005;
  const tone = flat
    ? 'text-muted-foreground'
    : value > 0
      ? 'text-green-600 dark:text-green-400'
      : 'text-[#ef4444]';
  return (
    <span className={`tabular-nums font-semibold ${tone} ${className}`}>
      {flat ? '0%' : fmtChange(value)}
    </span>
  );
}

// Minimal inline sparkline. Trend color keys off first-vs-last of the window so
// it agrees with the longer-range change rather than the last wiggle.
function Sparkline({
  data,
  width = 88,
  height = 22,
  className = '',
}: {
  data: number[];
  width?: number;
  height?: number;
  className?: string;
}) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);
  const pts = data
    .map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / range) * (height - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const up = data[data.length - 1] >= data[0];
  const color = up ? '#22c55e' : '#ef4444';
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={className}
      aria-hidden
    >
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth={1.25}
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity={0.85}
      />
    </svg>
  );
}

function AvgHolderCell({ value }: { value: number }) {
  if (!Number.isFinite(value) || value <= 0) {
    return <Num value={EMPTY} />;
  }
  // >= $100k avg = clearly whale/institutional concentration
  const tone =
    value >= 100_000
      ? 'text-[#ef4444]'
      : value >= 1_000
        ? 'text-foreground'
        : 'text-muted-foreground';
  return <span className={`font-semibold ${tone}`}>{fmtUsd(value)}</span>;
}

function VelocityCell({ value }: { value: number }) {
  if (!Number.isFinite(value) || value <= 0) {
    return <Num value={EMPTY} />;
  }
  // 1.0× = whole supply turns over once daily — a meaningful threshold for "active"
  const tone =
    value >= 1
      ? 'text-green-600 dark:text-green-400'
      : value >= 0.2
        ? 'text-foreground'
        : 'text-muted-foreground';
  const display = value >= 100 ? `${value.toFixed(0)}×` : `${value.toFixed(2)}×`;
  return <span className={`font-semibold ${tone}`}>{display}</span>;
}

// Hand-curated logos for permissioned/low-liquidity tokens that the automatic
// providers (GeckoTerminal, DexScreener, DefiLlama-by-Avax-address) don't index
// on Avalanche — e.g. RWA tokens, or coins whose only listed icon lives under a
// different chain's canonical address. Keyed by lowercase Avalanche token
// address; tried first so the logo is deterministic rather than dependent on
// third-party indexing timing. The DefiLlama URLs point at the token's icon on
// the chain where it IS indexed (mainnet/polygon) — they resolve the same image.
const LOGO_OVERRIDES: Record<string, string> = {
  // BUIDL (BlackRock USD Institutional Digital Liquidity) — new contract
  '0x53fc82f14f009009b440a706e31c9021e1196a2f':
    'https://coin-images.coingecko.com/coins/images/36291/large/blackrock.png',
  // BENJI (Franklin OnChain U.S. Government Money Fund)
  '0xe08b4c1005603427420e64252a8b120cace4d122':
    'https://token-icons.llamao.fi/icons/tokens/43114/0xe08b4c1005603427420e64252a8b120cace4d122?h=48&w=48',
  // PYUSD (PayPal USD) — icon via Ethereum canonical address
  '0x09056fc62d9e1cff4bb5ceac4d7be6f420450647':
    'https://token-icons.llamao.fi/icons/tokens/1/0x6c3ea9036406852006290770bedfcaba0e23a0e8?h=48&w=48',
  // DOLA (Inverse Finance)
  '0x221743dc9e954be4f86844649bf19b43d6f8366d':
    'https://token-icons.llamao.fi/icons/tokens/1/0x865377367054516e17014ccded1e7d814edc9ce4?h=48&w=48',
  // LUSD (Liquity USD)
  '0xda0019e7e50ee4990440b1aa5dffcac6e27ee27b':
    'https://token-icons.llamao.fi/icons/tokens/1/0x5f98805a4e8be255a32880fdec7f6728c6568ba0?h=48&w=48',
  // BOLD (Liquity v2)
  '0x03569cc076654f82679c4ba2124d64774781b01d':
    'https://token-icons.llamao.fi/icons/tokens/1/0x6440f144b7e50d6a8439336510312d2f54beb01d?h=48&w=48',
  // USX (dForce USD)
  '0x853ea32391aaa14c112c645fd20ba389ab25c5e0':
    'https://token-icons.llamao.fi/icons/tokens/1/0x0a5e677a6a24b2f1a2bf4f3bffc443231d2fdec8?h=48&w=48',
  // BRZ (Brazilian Digital · Transfero)
  '0x05539f021b66fd01d1fb1ff8e167cdd09bf7c2d0':
    'https://token-icons.llamao.fi/icons/tokens/1/0x420412e765bfa6d85aaac94b4f7b708c89be2e2b?h=48&w=48',
  // USDA (Angle) — icon via Polygon canonical address
  '0x0000206329b97db379d5e1bf586bbdb969c63274':
    'https://token-icons.llamao.fi/icons/tokens/137/0x0000206329b97db379d5e1bf586bbdb969c63274?h=48&w=48',
  // FUSD (FinChain Dollar, Fosun Wealth) — issuer-hosted logo
  '0x9f6714c302ffe3c3bafaf2ccb44201ff64f6371c':
    'https://fusd.finchain.global/images/tokens/FUSD.svg',
  // aUSD (Stable Jack) — Trader Joe token list logo
  '0xabe7a9dfda35230ff60d1590a929ae0644c47dc1':
    'https://raw.githubusercontent.com/traderjoe-xyz/joe-tokenlists/main/logos/0xaBe7a9dFDA35230ff60D1590a929aE0644c47DC1/logo.png',
  // NUSD (Synapse nUSD) — Synapse interface asset
  '0xcfc37a6ab183dd4aed08c204d1c2773c0b1bdf46':
    'https://raw.githubusercontent.com/synapsecns/sanguine/master/packages/synapse-interface/assets/icons/nusd.svg',
  // BNUSD (Balanced Dollars) — Trader Joe token list logo
  '0xdbdd50997361522495ecfe57ebb6850da0e4c699':
    'https://raw.githubusercontent.com/traderjoe-xyz/joe-tokenlists/main/logos/0xdBDd50997361522495EcFE57EBb6850dA0E4C699/logo.png',
};

function CoinLogo({ coin, logoUrl }: { coin: EnrichedCoin; logoUrl?: string }) {
  const sources = useMemo(() => {
    const addr = coin.token.toLowerCase();
    const list: string[] = [];
    const override = LOGO_OVERRIDES[addr];
    if (override) list.push(override);
    if (logoUrl && logoUrl !== override) list.push(logoUrl);
    // DefiLlama indexes many tokens by chain+address — cheap automatic coverage
    // for coins GeckoTerminal misses, with no per-coin maintenance.
    list.push(`https://token-icons.llamao.fi/icons/tokens/43114/${addr}?h=48&w=48`);
    // DexScreener as a final backstop for tokens nothing else indexes yet
    // (e.g. restricted/permissioned issues).
    list.push(`https://dd.dexscreener.com/ds-data/tokens/avalanche/${addr}.png`);
    return list;
  }, [coin.token, logoUrl]);
  const [idx, setIdx] = useState(0);

  if (idx >= sources.length) {
    return (
      <div className="w-8 h-8 rounded-full bg-[#ef4444]/10 text-[#ef4444] flex items-center justify-center text-[11px] font-bold shrink-0">
        {coin.symbol.charAt(0)}
      </div>
    );
  }
  return (
    <img
      key={sources[idx]}
      src={sources[idx]}
      alt=""
      title={coin.symbol}
      loading="lazy"
      onError={() => setIdx((i) => i + 1)}
      className="w-8 h-8 rounded-full bg-muted object-cover shrink-0"
    />
  );
}

export default Stablecoins;
