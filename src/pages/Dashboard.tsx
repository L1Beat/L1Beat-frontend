import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { SEO } from '../components/SEO';
import {
  Activity,
  ChevronRight,
  GitCompareArrows,
  LayoutGrid,
  Search,
  Star,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import {
  getAllChainsTPSLatest,
  getCategories,
  getChains,
  getNetworkTxCountHistory,
  getNetworkValidatorTotal,
  getTPSHistory,
} from '../api';
import type { Chain } from '../types';
import { FilterModal } from '../components/FilterModal';
import { LoadingSpinner } from '../components/LoadingSpinner';

type Range = '24H' | '7D' | '30D' | 'ALL';
type ScreenerTab = 'active' | 'all' | 'inactive' | 'watchlist';
type SortKey = 'name' | 'tps' | 'validators';
type SortDir = 'asc' | 'desc';

const RANGES: Range[] = ['24H', '7D', '30D', 'ALL'];
const TREND_FETCH_DAYS = 30;
const RANGE_DAYS: Record<Range, number> = {
  '24H': 2,
  '7D': 7,
  '30D': 30,
  ALL: 30,
};
const VALID_RANGES: Range[] = ['24H', '7D', '30D', 'ALL'];
const CHAINS_PER_PAGE = 25;
const WATCHLIST_STORAGE_KEY = 'dashboardWatchlist';

const VALID_TABS: ScreenerTab[] = ['active', 'all', 'watchlist', 'inactive'];
const VALID_SORTS: SortKey[] = ['name', 'tps', 'validators'];
const VALID_DIRS: SortDir[] = ['asc', 'desc'];

function pickEnum<T extends string>(value: string | null, allowed: T[], fallback: T): T {
  if (!value) return fallback;
  return (allowed as string[]).includes(value) ? (value as T) : fallback;
}

function loadWatchlist(): Set<string> {
  try {
    const stored = localStorage.getItem(WATCHLIST_STORAGE_KEY);
    if (!stored) return new Set();
    const arr = JSON.parse(stored);
    return Array.isArray(arr) ? new Set(arr) : new Set();
  } catch {
    return new Set();
  }
}

function saveWatchlist(set: Set<string>) {
  try {
    localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    /* ignore */
  }
}

const CATEGORY_STYLE: Record<string, string> = {
  gaming: 'bg-purple-500/15 text-purple-400',
  defi: 'bg-blue-500/15 text-blue-400',
  rwa: 'bg-green-500/15 text-green-400',
  ai: 'bg-cyan-500/15 text-cyan-400',
  depin: 'bg-orange-500/15 text-orange-400',
};

function categoryClass(name: string): string {
  return CATEGORY_STYLE[name.toLowerCase()] || 'bg-muted text-muted-foreground';
}

interface HistoryPoint {
  timestamp: number;
  value: number;
}

interface NetworkMetrics {
  tpsHistory: HistoryPoint[];
  txHistory: HistoryPoint[];
  validators: number | null;
}

function pctDelta(curr: number | null, prev: number | null): number | null {
  if (curr == null || prev == null || !Number.isFinite(prev) || prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}

function rangeWindow(history: HistoryPoint[], range: Range, mode: 'avg' | 'sum') {
  if (history.length === 0) return { current: null as number | null, prior: null as number | null };
  if (range === '24H') {
    return {
      current: history[history.length - 1]?.value ?? null,
      prior: history[history.length - 2]?.value ?? null,
    };
  }
  const w = range === 'ALL' ? history.length : RANGE_DAYS[range];
  const last = history.slice(-w);
  const prior = range === 'ALL' ? [] : history.slice(-(w * 2), -w);
  const aggregate = (arr: HistoryPoint[]) => {
    if (arr.length === 0) return null;
    const sum = arr.reduce((s, p) => s + p.value, 0);
    return mode === 'sum' ? sum : sum / arr.length;
  };
  return { current: aggregate(last), prior: aggregate(prior) };
}

function rangeWindowLabel(r: Range): string {
  if (r === '24H') return '24h';
  if (r === '7D') return '7d';
  if (r === '30D') return '30d';
  return 'all-time';
}

function formatCount(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatTps(value: number | undefined | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  if (value < 0.01) return '<0.01';
  if (value < 1) return value.toFixed(2);
  if (value < 10) return value.toFixed(1);
  return Math.round(value).toLocaleString();
}

function tpsColor(value: number | undefined | null): string {
  if (value == null || !Number.isFinite(value)) return 'text-muted-foreground';
  if (value < 0.1) return 'text-muted-foreground';
  if (value < 1) return 'text-foreground/70';
  return 'text-foreground';
}

export function Dashboard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [chains, setChains] = useState<Chain[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefetching, setIsRefetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  const [searchTerm, setSearchTerm] = useState(
    () => searchParams.get('q') || sessionStorage.getItem('dashboardSearch') || '',
  );
  const [currentPage, setCurrentPage] = useState(
    () => Number(searchParams.get('page')) || Number(sessionStorage.getItem('dashboardPage')) || 1,
  );
  const [selectedCategory, setSelectedCategory] = useState<string>(
    () => searchParams.get('category') || sessionStorage.getItem('dashboardCategory') || '',
  );
  const [categories, setCategories] = useState<string[]>([]);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [validatorFilter, setValidatorFilter] = useState<ScreenerTab>(
    () =>
      pickEnum<ScreenerTab>(
        searchParams.get('tab'),
        VALID_TABS,
        (sessionStorage.getItem('dashboardValidatorFilter') as ScreenerTab) || 'active',
      ),
  );
  const [range, setRange] = useState<Range>(() =>
    pickEnum<Range>(searchParams.get('range'), VALID_RANGES, '24H'),
  );
  const [sortBy, setSortBy] = useState<SortKey>(() =>
    pickEnum<SortKey>(searchParams.get('sort'), VALID_SORTS, 'tps'),
  );
  const [sortDir, setSortDir] = useState<SortDir>(() =>
    pickEnum<SortDir>(searchParams.get('dir'), VALID_DIRS, 'desc'),
  );
  const [watchlist, setWatchlist] = useState<Set<string>>(loadWatchlist);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const MAX_COMPARE = 4;

  const toggleWatchlist = (chainId: string) => {
    setWatchlist((prev) => {
      const next = new Set(prev);
      if (next.has(chainId)) next.delete(chainId);
      else next.add(chainId);
      saveWatchlist(next);
      return next;
    });
  };

  const toggleSelection = (chainId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(chainId)) {
        next.delete(chainId);
      } else if (next.size < MAX_COMPARE) {
        next.add(chainId);
      }
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  const goCompare = () => {
    if (selected.size === 0) return;
    navigate(`/metrics?compare=${[...selected].join(',')}`);
  };

  const toggleSort = (key: SortKey) => {
    if (key === sortBy) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(key);
      setSortDir(key === 'name' ? 'asc' : 'desc');
    }
  };

  const [metrics, setMetrics] = useState<NetworkMetrics>({
    tpsHistory: [],
    txHistory: [],
    validators: null,
  });
  const [tpsHistoryByChain, setTpsHistoryByChain] = useState<Record<string, number[]>>({});

  async function fetchData() {
    try {
      if (chains.length === 0) {
        setLoading(true);
      } else {
        setIsRefetching(true);
      }
      setError(null);

      const filters: { category?: string; includeInactive?: boolean } = { includeInactive: true };
      if (selectedCategory) filters.category = selectedCategory;

      const [chainsData, categoriesData, tpsMap] = await Promise.all([
        getChains(filters),
        getCategories(),
        getAllChainsTPSLatest(),
      ]);

      const chainsWithLatestTps = chainsData.map((chain) => {
        const lookupId =
          (chain.evmChainId ? String(chain.evmChainId) : undefined) ||
          chain.originalChainId ||
          chain.chainId;
        const latest = lookupId ? tpsMap[lookupId] : undefined;
        if (!latest) return chain;
        return {
          ...chain,
          tps: { value: Number(latest.value), timestamp: Number(latest.timestamp) },
        };
      });

      const visible = chainsWithLatestTps.filter((chain) => {
        const name = chain.chainName.toLowerCase();
        return !name.includes('x-chain') && !name.includes('p-chain');
      });

      const sorted = [...visible].sort((a, b) => {
        const isCa = a.chainName.toLowerCase().includes('c-chain');
        const isCb = b.chainName.toLowerCase().includes('c-chain');
        if (isCa && !isCb) return -1;
        if (!isCa && isCb) return 1;
        const aTps = a.tps?.value ?? -1;
        const bTps = b.tps?.value ?? -1;
        if (aTps !== bTps) return bTps - aTps;
        return a.chainName.localeCompare(b.chainName);
      });

      setChains(sorted);
      setCategories(categoriesData);
    } catch {
      setError('Unable to connect to the server. Please try again later.');
    } finally {
      setLoading(false);
      setIsRefetching(false);
      setRetrying(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, [selectedCategory]);

  useEffect(() => {
    async function fetchMetrics() {
      try {
        const [tpsRaw, txRaw, validatorTotal] = await Promise.all([
          getTPSHistory(60),
          getNetworkTxCountHistory(60),
          getNetworkValidatorTotal(),
        ]);
        const tpsHistory: HistoryPoint[] = (tpsRaw || [])
          .map((p) => ({ timestamp: p.timestamp, value: Number(p.totalTps) || 0 }))
          .sort((a, b) => a.timestamp - b.timestamp);
        const txHistory: HistoryPoint[] = (txRaw || [])
          .map((p) => ({ timestamp: p.timestamp, value: Number(p.value) || 0 }))
          .sort((a, b) => a.timestamp - b.timestamp);
        setMetrics({
          tpsHistory,
          txHistory,
          validators: validatorTotal?.totalValidators ?? null,
        });
      } catch {
        // KPI strip is decorative; ignore failures
      }
    }
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const next = new URLSearchParams();
    if (searchTerm) next.set('q', searchTerm);
    if (validatorFilter !== 'active') next.set('tab', validatorFilter);
    if (selectedCategory) next.set('category', selectedCategory);
    if (sortBy !== 'tps') next.set('sort', sortBy);
    if (sortDir !== 'desc') next.set('dir', sortDir);
    if (currentPage !== 1) next.set('page', String(currentPage));
    if (range !== '24H') next.set('range', range);
    setSearchParams(next, { replace: true });
    sessionStorage.setItem('dashboardSearch', searchTerm);
    sessionStorage.setItem('dashboardCategory', selectedCategory);
    sessionStorage.setItem('dashboardValidatorFilter', validatorFilter);
    sessionStorage.setItem('dashboardPage', String(currentPage));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, validatorFilter, selectedCategory, sortBy, sortDir, currentPage, range]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedCategory, validatorFilter]);

  useEffect(() => {
    const saved = sessionStorage.getItem('dashboardScrollPosition');
    if (saved && !loading) {
      const scrollY = parseInt(saved, 10);
      setTimeout(() => {
        window.scrollTo(0, scrollY);
        sessionStorage.removeItem('dashboardScrollPosition');
      }, 0);
    }
  }, [loading]);

  const activeCount = chains.filter((c) => c.isActive).length;
  const watchlistCount = chains.filter((c) => watchlist.has(c.chainId)).length;
  const totalNetworkTps = chains.reduce((sum, c) => sum + (c.tps?.value ?? 0), 0);
  const tabCounts: Record<ScreenerTab, number> = {
    active: activeCount,
    all: chains.length,
    inactive: chains.length - activeCount,
    watchlist: watchlistCount,
  };

  const filteredChains = chains
    .filter((chain) => {
      if (validatorFilter === 'active') return chain.isActive;
      if (validatorFilter === 'inactive') return !chain.isActive;
      if (validatorFilter === 'watchlist') return watchlist.has(chain.chainId);
      return true;
    })
    .filter(
      (chain) =>
        chain.chainName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        chain.chainId.toLowerCase().includes(searchTerm.toLowerCase()),
    )
    .sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      const isCa = a.chainName.toLowerCase().includes('c-chain');
      const isCb = b.chainName.toLowerCase().includes('c-chain');
      if (isCa && !isCb) return -1;
      if (!isCa && isCb) return 1;
      if (sortBy === 'name') return a.chainName.localeCompare(b.chainName) * dir;
      if (sortBy === 'tps') return ((a.tps?.value ?? -1) - (b.tps?.value ?? -1)) * dir;
      if (sortBy === 'validators') return ((a.validatorCount ?? 0) - (b.validatorCount ?? 0)) * dir;
      return 0;
    });
  const totalPages = Math.ceil(filteredChains.length / CHAINS_PER_PAGE);
  const paginatedChains = filteredChains.slice(
    (currentPage - 1) * CHAINS_PER_PAGE,
    currentPage * CHAINS_PER_PAGE,
  );

  useEffect(() => {
    if (paginatedChains.length === 0) return;
    const missing = paginatedChains.filter((c) => !tpsHistoryByChain[c.chainId]);
    if (missing.length === 0) return;
    let active = true;
    Promise.allSettled(
      missing.map((c) => {
        const apiId = c.evmChainId ? String(c.evmChainId) : c.originalChainId || c.chainId;
        return getTPSHistory(TREND_FETCH_DAYS, apiId).then((history) => ({
          chainId: c.chainId,
          values: (history || [])
            .slice()
            .sort((a, b) => a.timestamp - b.timestamp)
            .map((h) => Number(h.totalTps) || 0),
        }));
      }),
    ).then((results) => {
      if (!active) return;
      const updates: Record<string, number[]> = {};
      for (const r of results) {
        if (r.status === 'fulfilled') {
          updates[r.value.chainId] = r.value.values;
        }
      }
      if (Object.keys(updates).length > 0) {
        setTpsHistoryByChain((prev) => ({ ...prev, ...updates }));
      }
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paginatedChains]);

  if (loading) return <DashboardSkeleton />;

  if (error) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4">
        <div className="bg-card border border-border rounded-xl p-6 max-w-md w-full text-center">
          <Activity className="h-12 w-12 text-[#ef4444] mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-foreground mb-2">Connection Error</h2>
          <p className="text-muted-foreground mb-6">{error}</p>
          <button
            onClick={() => {
              setRetrying(true);
              fetchData();
            }}
            disabled={retrying}
            className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-md text-white bg-[#ef4444] hover:bg-[#dc2626] disabled:opacity-50"
          >
            {retrying ? 'Retrying…' : 'Retry'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl 2xl:max-w-screen-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      <SEO
        title="Overview"
        description="Live screener for every Avalanche L1 — current TPS, validators, network share, 7-day trend, and a watchlist you can compare."
        url="/"
      />
      <Hero range={range} onRangeChange={setRange} />
      <KpiCards metrics={metrics} activeChains={activeCount} range={range} />

      <section className="rounded-xl border border-border bg-card overflow-hidden">
        <ScreenerHeader
          activeTab={validatorFilter}
          onTabChange={setValidatorFilter}
          counts={tabCounts}
          isRefetching={isRefetching}
        />
        <ScreenerToolbar
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          selectedCategory={selectedCategory}
          onCategoryChange={setSelectedCategory}
          categories={categories}
        />
        <AnimatePresence mode="wait">
          {filteredChains.length === 0 ? (
            <motion.div
              key="no-results"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="px-6 py-16 text-center text-muted-foreground"
            >
              No L1s match "{searchTerm}"
            </motion.div>
          ) : (
            <motion.div
              key={`${selectedCategory}-${searchTerm}-${currentPage}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <ScreenerTable
                chains={paginatedChains}
                historyByChain={tpsHistoryByChain}
                range={range}
                totalTps={totalNetworkTps}
                sortBy={sortBy}
                sortDir={sortDir}
                onSort={toggleSort}
                watchlist={watchlist}
                onToggleWatch={toggleWatchlist}
                selected={selected}
                onToggleSelect={toggleSelection}
                selectionFull={selected.size >= MAX_COMPARE}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {totalPages > 1 && (
          <ScreenerPagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalRows={filteredChains.length}
            pageSize={CHAINS_PER_PAGE}
            onChange={setCurrentPage}
          />
        )}
      </section>

      <FilterModal
        isOpen={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        selectedCategory={selectedCategory}
        onCategoryChange={setSelectedCategory}
        categories={categories}
        validatorFilter={validatorFilter}
        onValidatorFilterChange={setValidatorFilter}
      />

      {selected.size > 0 && (
        <div className="hidden md:flex fixed bottom-6 left-1/2 -translate-x-1/2 z-40 items-center gap-2 px-2.5 py-2 rounded-xl border border-border bg-card shadow-2xl">
          <span className="text-[12px] text-muted-foreground pl-1.5">
            <span className="text-foreground font-semibold">{selected.size}</span> selected
            {selected.size >= MAX_COMPARE && (
              <span className="ml-1 text-[10px] uppercase tracking-wider text-[#ef4444]">
                max
              </span>
            )}
          </span>
          <button
            onClick={clearSelection}
            className="inline-flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Clear selection"
          >
            <X className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={goCompare}
            className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md bg-[#ef4444] hover:bg-[#dc2626] text-white text-xs font-semibold transition-colors"
          >
            <GitCompareArrows className="w-3.5 h-3.5" />
            Compare
          </button>
        </div>
      )}
    </div>
  );
}

function Hero({ range, onRangeChange }: { range: Range; onRangeChange: (r: Range) => void }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="text-[11px] font-bold tracking-[0.15em] text-[#ef4444] mb-1.5">
          AVALANCHE L1 NETWORK
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
          What's moving across the L1s today?
        </h1>
      </div>
      <div className="flex items-center gap-1.5">
        {RANGES.map((r) => {
          const active = r === range;
          return (
            <button
              key={r}
              onClick={() => onRangeChange(r)}
              className={`h-8 px-3 rounded-lg text-xs font-medium transition-colors border ${
                active
                  ? 'bg-[#ef4444]/15 border-[#ef4444]/30 text-[#ef4444]'
                  : 'bg-card border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              {r}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function KpiCards({
  metrics,
  activeChains,
  range,
}: {
  metrics: NetworkMetrics;
  activeChains: number;
  range: Range;
}) {
  const tps = rangeWindow(metrics.tpsHistory, range, 'avg');
  const tx = rangeWindow(metrics.txHistory, range, 'sum');
  const tpsDelta = pctDelta(tps.current, tps.prior);
  const txDelta = pctDelta(tx.current, tx.prior);
  const windowLabel = rangeWindowLabel(range);
  const priorLabel = range === 'ALL' ? '' : `vs prior ${windowLabel}`;

  const cards: Array<{
    label: string;
    value: string;
    icon: typeof LayoutGrid;
    delta?: number | null;
    deltaLabel?: string;
  }> = [
    {
      label: 'Active L1s',
      value: activeChains > 0 ? String(activeChains) : '—',
      icon: LayoutGrid,
    },
    {
      label: range === '24H' ? 'Network TPS' : `Avg TPS · ${windowLabel}`,
      value: tps.current != null ? Math.round(tps.current).toLocaleString() : '—',
      icon: Activity,
      delta: tpsDelta,
      deltaLabel: priorLabel,
    },
    {
      label: 'Validators',
      value: metrics.validators != null ? metrics.validators.toLocaleString() : '—',
      icon: Users,
    },
    {
      label: range === '24H' ? 'Tx Count · 24h' : `Tx Count · ${windowLabel}`,
      value: tx.current != null ? formatCount(tx.current) : '—',
      icon: TrendingUp,
      delta: txDelta,
      deltaLabel: priorLabel,
    },
  ];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      {cards.map(({ label, value, icon: Icon, delta, deltaLabel }) => {
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
            {delta != null && (
              <div className="text-[11px] font-medium mt-1 flex items-center gap-1">
                <span className={positive ? 'text-green-500' : 'text-[#ef4444]'}>
                  {positive ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}%
                </span>
                {deltaLabel && <span className="text-muted-foreground">{deltaLabel}</span>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ScreenerHeader({
  activeTab,
  onTabChange,
  counts,
  isRefetching,
}: {
  activeTab: ScreenerTab;
  onTabChange: (t: ScreenerTab) => void;
  counts: Record<ScreenerTab, number>;
  isRefetching: boolean;
}) {
  const tabs: Array<{ id: ScreenerTab; label: string; hide?: boolean }> = [
    { id: 'active', label: 'Active L1s' },
    { id: 'all', label: 'All' },
    { id: 'watchlist', label: 'Watchlist', hide: counts.watchlist === 0 },
    { id: 'inactive', label: 'Inactive', hide: counts.inactive === 0 },
  ];
  const visibleTabs = tabs.filter((t) => !t.hide);
  return (
    <div className="border-b border-border">
      <div className="flex items-center justify-between gap-4 px-4 sm:px-5 pt-4 sm:pt-5 pb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-[15px] font-semibold text-foreground">L1 Screener</h2>
          <div className="flex items-center gap-1.5 px-2 h-5 rounded-full bg-green-500/10">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            <span className="text-[10px] font-bold tracking-wider text-green-500">LIVE</span>
          </div>
          {isRefetching && <LoadingSpinner size="sm" />}
        </div>
      </div>
      <nav className="flex items-center gap-1 px-4 sm:px-5">
        {visibleTabs.map((t) => {
          const active = t.id === activeTab;
          return (
            <button
              key={t.id}
              onClick={() => onTabChange(t.id)}
              className={`flex items-center gap-2 h-9 px-3 -mb-px border-b-2 transition-colors ${
                active
                  ? 'border-[#ef4444] text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <span className={`text-xs ${active ? 'font-semibold' : 'font-medium'}`}>{t.label}</span>
              <span
                className={`text-[10px] font-bold px-1.5 h-4 inline-flex items-center rounded-full ${
                  active ? 'bg-[#ef4444]/15 text-[#ef4444]' : 'bg-muted text-muted-foreground'
                }`}
              >
                {counts[t.id]}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

function ScreenerToolbar({
  searchTerm,
  onSearchChange,
  selectedCategory,
  onCategoryChange,
  categories,
}: {
  searchTerm: string;
  onSearchChange: (s: string) => void;
  selectedCategory: string;
  onCategoryChange: (c: string) => void;
  categories: string[];
}) {
  const quickCats = ['Gaming', 'DeFi', 'RWA', 'AI', 'DePIN'];
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 sm:px-5 py-3 border-b border-border">
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search L1s by name or ID…"
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full h-9 pl-9 pr-9 rounded-lg bg-muted border border-border text-sm placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#ef4444]/30 focus:border-[#ef4444]/40"
        />
        {searchTerm && (
          <button
            onClick={() => onSearchChange('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        {quickCats.map((cat) => {
          const matched = categories.find((c) => c.toLowerCase() === cat.toLowerCase());
          if (!matched) return null;
          const active = selectedCategory === matched;
          return (
            <button
              key={matched}
              onClick={() => onCategoryChange(active ? '' : matched)}
              className={`inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium border whitespace-nowrap transition-colors ${
                active
                  ? 'bg-[#ef4444] border-[#ef4444] text-white'
                  : 'bg-card border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              {cat}
              {active && <X className="w-3 h-3 -mr-0.5" />}
            </button>
          );
        })}
        {selectedCategory && (
          <button
            onClick={() => onCategoryChange('')}
            className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}

function ScreenerTable({
  chains,
  historyByChain,
  range,
  totalTps,
  sortBy,
  sortDir,
  onSort,
  watchlist,
  onToggleWatch,
  selected,
  onToggleSelect,
  selectionFull,
}: {
  chains: Chain[];
  historyByChain: Record<string, number[]>;
  range: Range;
  totalTps: number;
  sortBy: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
  watchlist: Set<string>;
  onToggleWatch: (chainId: string) => void;
  selected: Set<string>;
  onToggleSelect: (chainId: string) => void;
  selectionFull: boolean;
}) {
  const navigate = useNavigate();
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/40 border-b border-border">
            <th className="py-2.5 pl-5 pr-2 w-10" aria-label="Compare" />
            <th className="py-2.5 pr-3 w-10" aria-label="Watchlist" />
            <SortableTh
              align="left"
              label="L1"
              sortKey="name"
              active={sortBy === 'name'}
              dir={sortDir}
              onSort={onSort}
            />
            <SortableTh
              align="right"
              label="TPS"
              sortKey="tps"
              active={sortBy === 'tps'}
              dir={sortDir}
              onSort={onSort}
            />
            <Th align="right" className="hidden md:table-cell">Δ 24h</Th>
            <Th align="right" className="hidden lg:table-cell">Share</Th>
            <Th align="right" className="hidden sm:table-cell">{rangeTrendLabel(range)}</Th>
            <SortableTh
              align="right"
              label="Validators"
              sortKey="validators"
              active={sortBy === 'validators'}
              dir={sortDir}
              onSort={onSort}
            />
            <Th align="left" className="pl-8 hidden lg:table-cell">
              Category
            </Th>
            <Th align="right" className="pr-5">
              Status
            </Th>
          </tr>
        </thead>
        <tbody>
          {chains.map((chain, idx) => {
            const history = historyByChain[chain.chainId];
            const category = chain.categories?.[0];
            const starred = watchlist.has(chain.chainId);
            const isSelected = selected.has(chain.chainId);
            const disabled = !isSelected && selectionFull;
            return (
              <tr
                key={chain.chainId}
                onClick={() => {
                  sessionStorage.setItem('dashboardScrollPosition', String(window.scrollY));
                  navigate(`/chain/${chain.chainId}`);
                }}
                className={`group cursor-pointer transition-colors ${
                  isSelected ? 'bg-[#ef4444]/[0.06]' : 'hover:bg-[#ef4444]/[0.04]'
                } ${idx !== chains.length - 1 ? 'border-b border-border/60' : ''}`}
              >
                <td className="py-3 pl-5 pr-2 w-10">
                  <label
                    onClick={(e) => e.stopPropagation()}
                    className={`flex items-center justify-center w-4 h-4 rounded border transition-colors ${
                      disabled
                        ? 'border-border/40 cursor-not-allowed'
                        : isSelected
                          ? 'bg-[#ef4444] border-[#ef4444] cursor-pointer'
                          : 'border-border hover:border-foreground cursor-pointer'
                    }`}
                    title={disabled ? 'Maximum 4 chains' : 'Select to compare'}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={disabled}
                      onChange={() => onToggleSelect(chain.chainId)}
                      className="sr-only"
                    />
                    {isSelected && (
                      <svg
                        className="w-3 h-3 text-white"
                        viewBox="0 0 16 16"
                        fill="none"
                        aria-hidden="true"
                      >
                        <path
                          d="M3 8.5L6.5 12L13 4.5"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </label>
                </td>
                <td className="py-3 pr-3 w-10">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleWatch(chain.chainId);
                    }}
                    className={`p-1 -m-1 rounded transition-colors ${
                      starred
                        ? 'text-[#ef4444]'
                        : 'text-muted-foreground/40 hover:text-muted-foreground'
                    }`}
                    title={starred ? 'Remove from watchlist' : 'Add to watchlist'}
                    aria-label={starred ? 'Remove from watchlist' : 'Add to watchlist'}
                  >
                    <Star
                      className="w-3.5 h-3.5"
                      fill={starred ? 'currentColor' : 'none'}
                    />
                  </button>
                </td>
                <td className="py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <ChainAvatar chain={chain} />
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold text-foreground truncate">
                        {chain.chainName}
                      </div>
                      <div className="text-[11px] text-muted-foreground font-medium truncate">
                        {chain.networkToken?.symbol || chain.subnetId?.slice(0, 8) || chain.chainId.slice(0, 12)}
                      </div>
                    </div>
                  </div>
                </td>
                <td
                  className={`py-3 text-right tabular-nums text-[13px] font-medium ${tpsColor(
                    chain.tps?.value,
                  )}`}
                >
                  {formatTps(chain.tps?.value)}
                </td>
                <td className="py-3 text-right hidden md:table-cell">
                  <DeltaCell history={history} loaded={chain.chainId in historyByChain} />
                </td>
                <td className="py-3 text-right tabular-nums text-[12px] text-muted-foreground hidden lg:table-cell">
                  {(() => {
                    const share = totalTps > 0 ? ((chain.tps?.value ?? 0) / totalTps) * 100 : 0;
                    if (share < 0.05) return '<0.05%';
                    if (share < 1) return `${share.toFixed(2)}%`;
                    return `${share.toFixed(1)}%`;
                  })()}
                </td>
                <td className="py-3 hidden sm:table-cell">
                  <div className="flex justify-end pr-1">
                    <Sparkline values={history} range={range} loaded={chain.chainId in historyByChain} />
                  </div>
                </td>
                <td className="py-3 text-right tabular-nums text-[13px] font-medium text-foreground">
                  {chain.validatorCount?.toLocaleString() ?? '—'}
                </td>
                <td className="py-3 pl-8 hidden lg:table-cell">
                  {category ? (
                    <span
                      className={`inline-flex items-center px-2 h-5 rounded-full text-[10px] font-semibold tracking-wide ${categoryClass(
                        category,
                      )}`}
                    >
                      {category}
                    </span>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">—</span>
                  )}
                </td>
                <td className="py-3 pr-5">
                  <div className="flex items-center justify-end gap-2">
                    <StatusPill active={chain.isActive ?? false} />
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground hidden group-hover:inline-block" />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SortableTh({
  label,
  sortKey,
  active,
  dir,
  onSort,
  align = 'left',
  className = '',
}: {
  label: string;
  sortKey: SortKey;
  active: boolean;
  dir: SortDir;
  onSort: (k: SortKey) => void;
  align?: 'left' | 'right';
  className?: string;
}) {
  return (
    <th
      className={`py-2.5 text-[10px] font-bold tracking-wider uppercase ${
        align === 'right' ? 'text-right' : 'text-left'
      } ${className}`}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 transition-colors ${
          active ? 'text-[#ef4444]' : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        {label}
        {active && <span className="text-[9px]">{dir === 'asc' ? '▲' : '▼'}</span>}
      </button>
    </th>
  );
}

function DeltaCell({ history, loaded }: { history?: number[]; loaded?: boolean }) {
  if (!loaded) {
    return <span className="text-[11px] text-muted-foreground">—</span>;
  }
  if (!history || history.length < 2) {
    return <span className="text-[11px] text-muted-foreground">—</span>;
  }
  const last = history[history.length - 1];
  const prior = history[history.length - 2];
  if (!Number.isFinite(prior) || prior === 0) {
    return <span className="text-[11px] text-muted-foreground">—</span>;
  }
  const delta = ((last - prior) / prior) * 100;
  if (!Number.isFinite(delta) || Math.abs(delta) < 0.05) {
    return <span className="text-[11px] text-muted-foreground tabular-nums">0%</span>;
  }
  const positive = delta >= 0;
  return (
    <span
      className={`text-[12px] font-medium tabular-nums ${
        positive ? 'text-green-500' : 'text-[#ef4444]'
      }`}
    >
      {positive ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}%
    </span>
  );
}

function rangeTrendLabel(r: Range): string {
  if (r === '24H') return '24h trend';
  if (r === '7D') return '7-day trend';
  if (r === '30D') return '30-day trend';
  return 'Trend';
}

function Sparkline({
  values,
  range,
  loaded,
}: {
  values?: number[];
  range: Range;
  loaded?: boolean;
}) {
  if (!loaded) {
    return (
      <div className="h-[22px] w-[72px] rounded bg-muted/40 animate-pulse" aria-hidden="true" />
    );
  }
  if (!values || values.length === 0) {
    return <span className="text-[11px] text-muted-foreground">—</span>;
  }
  const window = RANGE_DAYS[range];
  const sliced = values.slice(-window);
  if (sliced.length < 2) {
    return <span className="text-[11px] text-muted-foreground">—</span>;
  }
  const W = 72;
  const H = 22;
  const max = Math.max(...sliced);
  const min = Math.min(...sliced);
  const span = max - min || 1;
  const dx = W / (sliced.length - 1);
  const points = sliced
    .map((v, i) => `${(i * dx).toFixed(1)},${(H - ((v - min) / span) * H).toFixed(1)}`)
    .join(' ');
  const last = sliced[sliced.length - 1];
  const first = sliced[0];
  const positive = last >= first;
  const color = positive ? '#22c55e' : '#ef4444';
  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      className="overflow-visible"
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.25"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle
        cx={(sliced.length - 1) * dx}
        cy={H - ((last - min) / span) * H}
        r="1.5"
        fill={color}
      />
    </svg>
  );
}

function Th({
  children,
  align = 'left',
  className = '',
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
  className?: string;
}) {
  return (
    <th
      className={`py-2.5 text-[10px] font-bold tracking-wider uppercase text-muted-foreground ${
        align === 'right' ? 'text-right' : 'text-left'
      } ${className}`}
    >
      {children}
    </th>
  );
}

function ChainAvatar({ chain }: { chain: Chain }) {
  if (chain.chainLogoUri) {
    return (
      <img
        src={chain.chainLogoUri}
        alt=""
        className="w-7 h-7 rounded-full bg-muted shrink-0 object-cover"
        loading="lazy"
      />
    );
  }
  const initial = chain.chainName.charAt(0).toUpperCase();
  return (
    <div className="w-7 h-7 rounded-full bg-[#ef4444]/15 text-[#ef4444] flex items-center justify-center text-[11px] font-bold shrink-0">
      {initial}
    </div>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2 h-5 rounded-full ${
        active ? 'bg-green-500/10' : 'bg-muted'
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-green-500' : 'bg-muted-foreground/60'}`} />
      <span
        className={`text-[10px] font-bold tracking-wider ${
          active ? 'text-green-500' : 'text-muted-foreground'
        }`}
      >
        {active ? 'ACTIVE' : 'INACTIVE'}
      </span>
    </div>
  );
}

function ScreenerPagination({
  currentPage,
  totalPages,
  totalRows,
  pageSize,
  onChange,
}: {
  currentPage: number;
  totalPages: number;
  totalRows: number;
  pageSize: number;
  onChange: (p: number) => void;
}) {
  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalRows);
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1)
    .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
    .reduce<(number | 'ellipsis')[]>((acc, p, idx, arr) => {
      if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('ellipsis');
      acc.push(p);
      return acc;
    }, []);
  return (
    <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-t border-border">
      <span className="text-xs text-muted-foreground">
        {start}–{end} of {totalRows} L1s
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
          className="px-2.5 h-7 text-xs border border-border rounded-md bg-card hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Prev
        </button>
        {pages.map((item, idx) =>
          item === 'ellipsis' ? (
            <span key={`e-${idx}`} className="px-1 text-muted-foreground text-xs">
              …
            </span>
          ) : (
            <button
              key={item}
              onClick={() => onChange(item as number)}
              className={`px-2.5 h-7 text-xs border rounded-md transition-colors ${
                currentPage === item
                  ? 'bg-[#ef4444] border-[#ef4444] text-white'
                  : 'border-border bg-card hover:bg-muted'
              }`}
            >
              {item}
            </button>
          ),
        )}
        <button
          onClick={() => onChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
          className="px-2.5 h-7 text-xs border border-border rounded-md bg-card hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="max-w-7xl 2xl:max-w-screen-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      {/* Hero */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2.5">
          <div className="h-3 w-24 rounded bg-muted animate-pulse" />
          <div className="h-8 w-64 rounded bg-muted animate-pulse" />
          <div className="h-4 w-80 rounded bg-muted animate-pulse" />
        </div>
        <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-card border border-border h-9 w-44 animate-pulse" />
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="h-3 w-20 rounded bg-muted animate-pulse" />
              <div className="w-7 h-7 rounded-lg bg-muted animate-pulse" />
            </div>
            <div className="h-8 w-24 rounded bg-muted animate-pulse" />
            <div className="h-3 w-32 rounded bg-muted animate-pulse" />
          </div>
        ))}
      </div>

      {/* Screener */}
      <section className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center gap-3 px-4 sm:px-5 py-3 border-b border-border">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-7 w-24 rounded-md bg-muted animate-pulse" />
          ))}
        </div>
        <div className="flex items-center gap-3 px-4 sm:px-5 py-3 border-b border-border">
          <div className="flex-1 h-9 rounded-lg bg-muted animate-pulse" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-7 w-16 rounded-full bg-muted animate-pulse" />
          ))}
        </div>
        <div className="px-2 sm:px-0">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 px-3 sm:px-5 py-3 border-b border-border/60 last:border-b-0"
            >
              <div className="w-4 h-4 rounded bg-muted animate-pulse" />
              <div className="w-4 h-4 rounded bg-muted animate-pulse" />
              <div className="flex items-center gap-3 flex-1">
                <div className="w-8 h-8 rounded-full bg-muted animate-pulse" />
                <div className="space-y-1.5">
                  <div className="h-3 w-24 rounded bg-muted animate-pulse" />
                  <div className="h-2.5 w-16 rounded bg-muted animate-pulse" />
                </div>
              </div>
              <div className="h-3 w-12 rounded bg-muted animate-pulse" />
              <div className="hidden md:block h-3 w-12 rounded bg-muted animate-pulse" />
              <div className="hidden lg:block h-3 w-12 rounded bg-muted animate-pulse" />
              <div className="hidden sm:block h-6 w-20 rounded bg-muted animate-pulse" />
              <div className="h-3 w-12 rounded bg-muted animate-pulse" />
              <div className="hidden lg:block h-5 w-16 rounded-full bg-muted animate-pulse" />
              <div className="h-5 w-16 rounded-full bg-muted animate-pulse" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
