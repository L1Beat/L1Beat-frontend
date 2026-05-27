import { useEffect, useMemo, useState } from 'react';
import * as d3 from 'd3';
import {
  ArrowDownUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Coins,
  Copy,
  DollarSign,
  ExternalLink,
  Info,
  Search,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import { useToast } from '../components/Toaster';
import { SEO } from '../components/SEO';
import { SectionErrorBoundary } from '../components/SectionErrorBoundary';
import { LoadingSpinner } from '../components/LoadingSpinner';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../components/branding/ui/tooltip';
import { getStablecoins, getFxRates, getTokenLogos, type FxRates } from '../api';
import type { Stablecoin } from '../types';

type SortKey =
  | 'supplyUsd'
  | 'holders'
  | 'avgHolder'
  | 'volumeUsd'
  | 'velocity'
  | 'transfers'
  | 'symbol';

interface EnrichedCoin extends Stablecoin {
  supplyUnits: number;     // supply in token units (already divided by 10^decimals)
  supplyUsd: number;       // supply * fx-to-USD
  volumeUnits: number;
  volumeUsd: number;
  velocity: number;        // 24h volume / supply — turnover ratio
  avgHolder: number;       // supplyUsd / holders — average position size
  share: number;           // 0..1 share of total USD supply
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


const PEGS = ['All', 'USD', 'EUR', 'SGD', 'JPY'] as const;
type PegFilter = (typeof PEGS)[number];

const ORIGIN_FILTERS = ['All', 'Native', 'Bridged'] as const;
type OriginFilter = (typeof ORIGIN_FILTERS)[number];

export function Stablecoins() {
  const [coins, setCoins] = useState<Stablecoin[]>([]);
  const [fx, setFx] = useState<FxRates>({ EUR: 1.08, SGD: 0.74, JPY: 0.0064 });
  const [logoMap, setLogoMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [peg, setPeg] = useState<PegFilter>('All');
  const [origin, setOrigin] = useState<OriginFilter>('All');
  const [issuerFilter, setIssuerFilter] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('supplyUsd');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(0);

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
      };
    });
    const total = withRates.reduce((s, c) => s + c.supplyUsd, 0);
    return withRates.map((c) => ({
      ...c,
      share: total > 0 ? c.supplyUsd / total : 0,
    }));
  }, [coins, fx]);

  const totals = useMemo(() => {
    if (!enriched.length) {
      return { supply: 0, volume: 0, holders: 0, count: 0, nativeUsd: 0, bridgedUsd: 0 };
    }
    let supply = 0;
    let volume = 0;
    let holders = 0;
    let nativeUsd = 0;
    let bridgedUsd = 0;
    for (const c of enriched) {
      supply += c.supplyUsd;
      volume += c.volumeUsd;
      holders += c.holders || 0;
      if (c.bridged) bridgedUsd += c.supplyUsd;
      else nativeUsd += c.supplyUsd;
    }
    return { supply, volume, holders, count: enriched.length, nativeUsd, bridgedUsd };
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

  useEffect(() => {
    setPage(0);
  }, [peg, origin, issuerFilter, query, sortKey, sortDir]);

  const PAGE_SIZE = 15;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const visible = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

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
          description="Live supply, holders, and 24h activity for every major stablecoin on Avalanche C-Chain — USDC, USDT, AUSD, BUIDL, EURC and more."
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

        <SectionErrorBoundary label="the stablecoin table">
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 px-4 py-3.5 border-b border-border">
              <div className="flex items-center gap-2 flex-wrap">
                {PEGS.map((p) => (
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
                  {visible.map((c, idx) => (
                    <MobileCoinCard
                      key={c.token}
                      coin={c}
                      rank={safePage * PAGE_SIZE + idx + 1}
                      logoUrl={logoMap[c.token.toLowerCase()]}
                    />
                  ))}
                </ul>

                {/* Desktop table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="border-b border-border text-[10px] font-bold tracking-wider uppercase text-muted-foreground">
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
                      {visible.map((c, idx) => (
                        <CoinRow
                          key={c.token}
                          coin={c}
                          rank={safePage * PAGE_SIZE + idx + 1}
                          logoUrl={logoMap[c.token.toLowerCase()]}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>

                {totalPages > 1 && (
                  <footer className="flex items-center justify-between gap-2 px-4 py-2.5 border-t border-border">
                    <span className="text-[11px] tabular-nums text-muted-foreground">
                      {safePage * PAGE_SIZE + 1}–
                      {Math.min((safePage + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setPage((p) => Math.max(0, p - 1))}
                        disabled={safePage === 0}
                        className="inline-flex items-center justify-center w-7 h-7 rounded border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        title="Previous"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-[11px] font-semibold tabular-nums text-foreground px-2">
                        {safePage + 1}/{totalPages}
                      </span>
                      <button
                        onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                        disabled={safePage === totalPages - 1}
                        className="inline-flex items-center justify-center w-7 h-7 rounded border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        title="Next"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </footer>
                )}
              </>
            )}
          </div>
        </SectionErrorBoundary>
      </div>
    </TooltipProvider>
  );
}

function KpiStrip({
  totals,
}: {
  totals: { supply: number; volume: number; holders: number; count: number };
}) {
  const cards = [
    {
      label: 'Total supply',
      value: fmtUsd(totals.supply),
      icon: DollarSign,
      tip: 'Sum of every tracked stablecoin supply, converted to USD using ECB reference rates for non-USD pegs.',
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
      {cards.map(({ label, value, icon: Icon, tip }) => (
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
          <div className="text-2xl font-bold text-foreground tracking-tight">{value}</div>
        </div>
      ))}
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
              {coin.symbol} ({issuer}) — {fmtUsd(coin.supplyUsd)} · {pct.toFixed(2)}%
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

const PEG_TINT: Record<string, string> = {
  USD: 'bg-[#22c55e]/10 text-green-600 dark:text-green-400',
  EUR: 'bg-[#3b82f6]/10 text-blue-600 dark:text-blue-400',
  SGD: 'bg-[#a855f7]/10 text-purple-600 dark:text-purple-400',
  JPY: 'bg-[#f97316]/10 text-orange-600 dark:text-orange-400',
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
    <tr className="group border-b border-border/60 hover:bg-[#ef4444]/[0.04] transition-colors">
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
        <div className="text-[13px] font-semibold text-foreground">{fmtUsd(coin.supplyUsd)}</div>
        <div className="mt-1 h-1 w-24 ml-auto rounded-full bg-muted/40 overflow-hidden">
          <div
            className="h-full rounded-full bg-[#ef4444]"
            style={{ width: `${shareBarWidth}%` }}
            title={`${(coin.share * 100).toFixed(2)}% of supply`}
          />
        </div>
      </td>
      <td className="px-3 py-3 text-right tabular-nums text-foreground hidden sm:table-cell align-middle">
        {fmtCount(coin.holders)}
      </td>
      <td className="px-3 py-3 text-right tabular-nums hidden lg:table-cell align-middle">
        <AvgHolderCell value={coin.avgHolder} />
      </td>
      <td className="px-3 py-3 text-right tabular-nums text-foreground hidden md:table-cell align-middle">
        {coin.volumeUsd > 0 ? fmtUsd(coin.volumeUsd) : '—'}
      </td>
      <td className="px-3 py-3 text-right tabular-nums hidden md:table-cell align-middle">
        <VelocityCell value={coin.velocity} />
      </td>
      <td className="px-3 py-3 text-right tabular-nums text-muted-foreground hidden lg:table-cell align-middle">
        {fmtCount(coin.transfers_24h)}
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
          accent ? 'font-bold text-foreground' : 'font-semibold text-foreground'
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

function AvgHolderCell({ value }: { value: number }) {
  if (!Number.isFinite(value) || value <= 0) {
    return <span className="text-muted-foreground">—</span>;
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
    return <span className="text-muted-foreground">—</span>;
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

function CoinLogo({ coin, logoUrl }: { coin: EnrichedCoin; logoUrl?: string }) {
  const sources = useMemo(() => {
    const list: string[] = [];
    if (logoUrl) list.push(logoUrl);
    // DexScreener as a backstop for tokens CoinGecko doesn't index yet
    // (e.g. BUIDL, restricted/permissioned issues).
    list.push(`https://dd.dexscreener.com/ds-data/tokens/avalanche/${coin.token.toLowerCase()}.png`);
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
