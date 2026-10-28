import { Suspense, lazy, memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { SEO } from '../components/SEO';
import { ChevronRight, GitCompareArrows, Info, Search, Star, X } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/branding/ui/tooltip';
import { SegmentedControl, StatStrip, UpdatedAgo } from '../components/instrument';
import { NetworkTopologyGraph } from '../components/NetworkTopologyGraph';
import type { SankeySelection } from '../components/TeleporterSankeyDiagram';
import { LoadingSpinner } from '../components/LoadingSpinner';

// Flows is the second hero view; loading it on demand keeps d3 off the Overview's first load.
const TeleporterSankeyDiagram = lazy(() =>
  import('../components/TeleporterSankeyDiagram').then((m) => ({ default: m.TeleporterSankeyDiagram })),
);
import { summarizeFlows, flowChainLabel } from '../utils/flowStats';
import type { TeleporterMessageData } from '../types';
import { PLACEHOLDER_CHAIN_LOGO } from '../api';
import { useMediaQuery } from '../hooks/useMediaQuery';
import type { StatItem } from '../components/instrument';
import {
  getAllChainsTPSLatest,
  getAllChainsTxCountLatest,
  getCategories,
  getChains,
  getNetworkTxCountHistory,
  getNetworkValidatorTotal,
  getTPSHistory,
  getTeleporterMessages,
} from '../api';
import type { Chain } from '../types';
import type { DailyTxLatest } from '../api';
import { FilterModal } from '../components/FilterModal';

type Range = '24H' | '7D' | '30D' | 'ALL';
type HeroView = 'map' | 'flows';
const HERO_VIEWS: { value: HeroView; label: string }[] = [
  { value: 'map', label: 'Map' },
  { value: 'flows', label: 'Flows' },
];
const FLOW_WINDOWS: { value: 'daily' | 'weekly'; label: string }[] = [
  { value: 'daily', label: '24H' },
  { value: 'weekly', label: '7D' },
];
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
const MAX_COMPARE = 4;
const WATCHLIST_STORAGE_KEY = 'dashboardWatchlist';

const VALID_TABS: ScreenerTab[] = ['active', 'all', 'watchlist', 'inactive'];
const VALID_SORTS: SortKey[] = ['name', 'tps', 'validators'];
const VALID_DIRS: SortDir[] = ['asc', 'desc'];

function pickEnum<T extends string>(value: string | null, allowed: T[], fallback: T): T {
  if (!value) return fallback;
  return (allowed as string[]).includes(value) ? (value as T) : fallback;
}

// sessionStorage is missing during the SSG pre-render and can throw in private
// windows; either way the screener starts from its defaults.
function readSession(key: string): string | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(key);
  } catch {
    return null;
  }
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

// Category is text with a small color key, not a pill. The key colors are
// categorical (no red) and shared with the comparison charts.
const CATEGORY_STYLE: Record<string, string> = {
  gaming: '[&>span]:text-violet-500',
  defi: '[&>span]:text-blue-500',
  rwa: '[&>span]:text-emerald-500',
  ai: '[&>span]:text-cyan-500',
  depin: '[&>span]:text-orange-500',
};

function categoryClass(name: string): string {
  return CATEGORY_STYLE[name.toLowerCase()] || '[&>span]:text-muted-foreground';
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

function dayLabel(daily: Record<string, DailyTxLatest>): string {
  const ts = Object.values(daily).reduce((m, d) => Math.max(m, d.timestamp), 0);
  return ts ? new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '';
}

function formatTps(value: number | undefined | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  if (value <= 0) return '0';
  if (value < 0.01) return '<0.01';
  if (value < 1) return value.toFixed(2);
  if (value < 10) return value.toFixed(1);
  return Math.round(value).toLocaleString();
}

function txColor(value: number | undefined | null): string {
  if (value == null || !Number.isFinite(value) || value < 10) return 'text-muted-foreground';
  if (value < 1000) return 'text-foreground/70';
  return 'text-foreground';
}

function tpsColor(value: number | undefined | null): string {
  if (value == null || !Number.isFinite(value)) return 'text-muted-foreground';
  if (value < 0.1) return 'text-muted-foreground';
  if (value < 1) return 'text-foreground/70';
  return 'text-foreground';
}

export function Dashboard() {
  const navigate = useNavigate();
  // The floating stat bar only overlays the hero from md up.
  const isDesktop = useMediaQuery('(min-width: 768px)', true);

  const [searchParams, setSearchParams] = useSearchParams();
  // Hero shows either the network map or the interchain message flows.
  const [heroView, setHeroView] = useState<HeroView>(() =>
    searchParams.get('view') === 'flows' ? 'flows' : 'map',
  );
  const [flowWindow, setFlowWindow] = useState<'daily' | 'weekly'>('daily');
  // Interchain message data for the Flows view's stat bar. Fetched only while
  // that view is showing; the Sankey fetches its own copy through the same cache.
  const [flowData, setFlowData] = useState<TeleporterMessageData | null>(null);
  useEffect(() => {
    if (heroView !== 'flows') return;
    let active = true;
    getTeleporterMessages(flowWindow)
      .then((d) => {
        if (active) setFlowData(d);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [heroView, flowWindow]);
  // A chain picked in the Sankey narrows the stat bar to that chain's flows.
  const [flowSelection, setFlowSelection] = useState<SankeySelection | null>(null);
  const flowStats = useMemo(() => {
    if (!flowData || !flowSelection) return summarizeFlows(flowData);
    const key = flowSelection.direction === 'outgoing' ? 'source' : 'target';
    return summarizeFlows({
      ...flowData,
      messages: flowData.messages.filter((m) => m[key] === flowSelection.chain),
    });
  }, [flowData, flowSelection]);
  useEffect(() => {
    setFlowSelection(null);
  }, [heroView, flowWindow]);
  const [chains, setChains] = useState<Chain[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefetching, setIsRefetching] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  const [searchTerm, setSearchTerm] = useState(
    () => searchParams.get('q') || readSession('dashboardSearch') || '',
  );
  const [currentPage, setCurrentPage] = useState(
    () => Number(searchParams.get('page')) || Number(readSession('dashboardPage')) || 1,
  );
  const [selectedCategory, setSelectedCategory] = useState<string>(
    () => searchParams.get('category') || readSession('dashboardCategory') || '',
  );
  const [categories, setCategories] = useState<string[]>([]);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [validatorFilter, setValidatorFilter] = useState<ScreenerTab>(
    () =>
      pickEnum<ScreenerTab>(
        searchParams.get('tab'),
        VALID_TABS,
        (readSession('dashboardValidatorFilter') as ScreenerTab) || 'active',
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
  // Stable identities so the memoized ScreenerTable doesn't re-render on every
  // parent state change (e.g. each search keystroke).
  const toggleWatchlist = useCallback((chainId: string) => {
    setWatchlist((prev) => {
      const next = new Set(prev);
      if (next.has(chainId)) next.delete(chainId);
      else next.add(chainId);
      saveWatchlist(next);
      return next;
    });
  }, []);

  const toggleSelection = useCallback((chainId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(chainId)) {
        next.delete(chainId);
      } else if (next.size < MAX_COMPARE) {
        next.add(chainId);
      }
      return next;
    });
  }, []);

  const clearSelection = () => setSelected(new Set());

  const goCompare = () => {
    if (selected.size === 0) return;
    navigate(`/metrics?compare=${[...selected].join(',')}`);
  };

  const toggleSort = useCallback(
    (key: SortKey) => {
      if (key === sortBy) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortBy(key);
        setSortDir(key === 'name' ? 'asc' : 'desc');
      }
    },
    [sortBy],
  );

  const [metrics, setMetrics] = useState<NetworkMetrics>({
    tpsHistory: [],
    txHistory: [],
    validators: null,
  });
  const [tpsHistoryByChain, setTpsHistoryByChain] = useState<Record<string, number[]>>({});
  // Daily transactions per chain, keyed by chain slug. Null until the backend
  // serves them; the table falls back to TPS meanwhile.
  const [dailyTx, setDailyTx] = useState<Record<string, DailyTxLatest> | null>(null);

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

      const [chainsData, categoriesData, tpsMap, txMap] = await Promise.all([
        getChains(filters),
        getCategories(),
        getAllChainsTPSLatest(),
        getAllChainsTxCountLatest(),
      ]);

      const daily: Record<string, DailyTxLatest> = {};
      for (const chain of chainsData) {
        const hit = [chain.evmChainId, chain.originalChainId, chain.subnetId]
          .map((k) => (k == null ? '' : String(k)))
          .find((k) => k && txMap[k]);
        if (hit) daily[chain.chainId] = txMap[hit];
      }
      const dailyOrNull = Object.keys(daily).length > 0 ? daily : null;
      setDailyTx(dailyOrNull);
      const rank = (c: Chain) => (dailyOrNull ? dailyOrNull[c.chainId]?.value : c.tps?.value) ?? -1;

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
        const aTps = rank(a);
        const bTps = rank(b);
        if (aTps !== bTps) return bTps - aTps;
        return a.chainName.localeCompare(b.chainName);
      });

      setChains(sorted);
      setCategories(categoriesData);
      setUpdatedAt(Date.now());
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
        const validators = validatorTotal?.totalValidators ?? null;
        setMetrics((prev) => {
          // Skip the state update (and the re-render it triggers) when the poll
          // returns the same data — compare length + latest point of each series.
          const sameSeries = (a: HistoryPoint[], b: HistoryPoint[]) => {
            if (a.length !== b.length) return false;
            const la = a[a.length - 1];
            const lb = b[b.length - 1];
            return !la || !lb || (la.timestamp === lb.timestamp && la.value === lb.value);
          };
          if (
            prev.validators === validators &&
            sameSeries(prev.tpsHistory, tpsHistory) &&
            sameSeries(prev.txHistory, txHistory)
          ) {
            return prev;
          }
          return { tpsHistory, txHistory, validators };
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
    if (heroView === 'flows') next.set('view', 'flows');
    setSearchParams(next, { replace: true });
    sessionStorage.setItem('dashboardSearch', searchTerm);
    sessionStorage.setItem('dashboardCategory', selectedCategory);
    sessionStorage.setItem('dashboardValidatorFilter', validatorFilter);
    sessionStorage.setItem('dashboardPage', String(currentPage));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, validatorFilter, selectedCategory, sortBy, sortDir, currentPage, range, heroView]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedCategory, validatorFilter]);

  // Deep link: /#screener lands on the table once it exists.
  useEffect(() => {
    if (loading || window.location.hash !== '#screener') return;
    document.getElementById('screener')?.scrollIntoView({ block: 'start' });
  }, [loading]);

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

  const activeCount = useMemo(() => chains.filter((c) => c.isActive).length, [chains]);
  const watchlistCount = useMemo(
    () => chains.filter((c) => watchlist.has(c.chainId)).length,
    [chains, watchlist],
  );
  // What the table ranks by: yesterday's transactions when available, else live TPS.
  const activityOf = useCallback(
    (c: Chain) => (dailyTx ? dailyTx[c.chainId]?.value : c.tps?.value),
    [dailyTx],
  );
  // Active chains with any activity figure; network totals only add these up.
  const coveredChains = useMemo(
    () => chains.filter((c) => c.isActive && activityOf(c) != null).length,
    [chains, activityOf],
  );
  const totalNetworkTps = useMemo(
    () => chains.reduce((sum, c) => sum + (activityOf(c) ?? 0), 0),
    [chains, activityOf],
  );
  const tabCounts: Record<ScreenerTab, number> = useMemo(
    () => ({
      active: activeCount,
      all: chains.length,
      inactive: chains.length - activeCount,
      watchlist: watchlistCount,
    }),
    [activeCount, watchlistCount, chains.length],
  );

  const filteredChains = useMemo(
    () =>
      chains
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
          if (sortBy === 'tps') return ((activityOf(a) ?? -1) - (activityOf(b) ?? -1)) * dir;
          if (sortBy === 'validators') return ((a.validatorCount ?? 0) - (b.validatorCount ?? 0)) * dir;
          return 0;
        }),
    [chains, validatorFilter, watchlist, searchTerm, sortBy, sortDir, activityOf],
  );
  // Bars in the table are relative to the busiest chain in the current list,
  // not the page, so paging doesn't rescale them.
  const maxTps = useMemo(
    () => filteredChains.reduce((m, c) => Math.max(m, activityOf(c) ?? 0), 0),
    [filteredChains, activityOf],
  );
  const maxValidators = useMemo(
    () => filteredChains.reduce((m, c) => Math.max(m, c.validatorCount ?? 0), 0),
    [filteredChains],
  );
  const totalPages = Math.ceil(filteredChains.length / CHAINS_PER_PAGE);
  const paginatedChains = useMemo(
    () => filteredChains.slice((currentPage - 1) * CHAINS_PER_PAGE, currentPage * CHAINS_PER_PAGE),
    [filteredChains, currentPage],
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
        <div className="bg-card border border-border rounded-md p-5 max-w-md w-full">
          <h2 className="text-[15px] font-semibold text-foreground mb-1">Can't reach the L1Beat API</h2>
          <p className="text-[12px] text-muted-foreground mb-4">{error}</p>
          <button
            onClick={() => {
              setRetrying(true);
              fetchData();
            }}
            disabled={retrying}
            className="inline-flex items-center h-7 px-3 text-[12px] font-medium rounded bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50"
          >
            {retrying ? 'Retrying…' : 'Retry'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <SEO
        title="Overview"
        description="Live screener for every Avalanche L1: current TPS, validators, network share, 7-day trend, and a watchlist you can compare."
        url="/"
      />

      {/* Hero: the network map fills the first screen. Title and range float
          top-left, headline numbers float along the bottom. */}
      <section
        className="relative border-b border-border bg-stage h-[420px] md:h-[min(calc(100vh-48px),960px)] md:min-h-[520px]"
        aria-label="Network map"
      >
        {heroView === 'map' ? (
          <NetworkTopologyGraph chains={chains} fill padTop={44} padBottom={isDesktop ? 124 : 0} />
        ) : (
          <div className="absolute inset-x-0 top-12 bottom-0 md:bottom-[124px]">
            <Suspense
              fallback={
                <div className="h-full flex items-center justify-center">
                  <LoadingSpinner size="lg" />
                </div>
              }
            >
              <TeleporterSankeyDiagram
                timeframe={flowWindow}
                onTimeframeChange={setFlowWindow}
                fill
                selection={flowSelection}
                onSelectionChange={setFlowSelection}
              />
            </Suspense>
          </div>
        )}
        <div
          className={`absolute top-3 left-4 sm:left-6 z-30 flex items-center justify-between gap-3 pointer-events-none [&>*]:pointer-events-auto ${
            heroView === 'map' ? 'right-14' : 'right-4 sm:right-6'
          }`}
        >
          <div className="flex items-center gap-3">
            {/* The nav already says Overview; on phones the title would push the controls off screen. */}
            <h1 className="hidden sm:block text-[15px] leading-6 font-semibold text-foreground whitespace-nowrap">Avalanche L1s</h1>
            <SegmentedControl value={heroView} options={HERO_VIEWS} onChange={setHeroView} ariaLabel="Hero view" />
            {heroView === 'flows' && flowSelection && (
              <span className="inline-flex items-center gap-1.5 h-7 pl-2.5 pr-1 rounded border border-border bg-card/85 text-[12px] text-foreground">
                {flowSelection.displayName}
                <span className="text-muted-foreground">{flowSelection.direction}</span>
                <button
                  type="button"
                  onClick={() => setFlowSelection(null)}
                  aria-label="Clear selection"
                  className="inline-flex items-center justify-center w-5 h-5 rounded text-muted-foreground hover:text-foreground hover:bg-accent"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
          </div>
          {heroView === 'map' ? (
            <SegmentedControl value={range} options={RANGES} onChange={setRange} ariaLabel="Time range" />
          ) : (
            <SegmentedControl value={flowWindow} options={FLOW_WINDOWS} onChange={setFlowWindow} ariaLabel="Flow window" />
          )}
        </div>
        <div className="hidden md:block absolute bottom-4 left-1/2 -translate-x-1/2 z-30 w-[min(960px,calc(100%-3rem))]">
          {heroView === 'map' ? (
            <KpiCards metrics={metrics} activeChains={activeCount} coveredChains={coveredChains} range={range} floating />
          ) : (
            <FlowCards stats={flowStats} window={flowWindow} selection={flowSelection} floating />
          )}
        </div>
      </section>

      <div className="max-w-7xl 2xl:max-w-screen-2xl mx-auto px-4 sm:px-6 py-4 space-y-4">
      <div className="md:hidden">
        {heroView === 'map' ? (
          <KpiCards metrics={metrics} activeChains={activeCount} coveredChains={coveredChains} range={range} />
        ) : (
          <FlowCards stats={flowStats} window={flowWindow} selection={flowSelection} />
        )}
      </div>

      <section id="screener" className="scroll-mt-12">
        <ScreenerToolbar
          activeTab={validatorFilter}
          onTabChange={setValidatorFilter}
          counts={tabCounts}
          isRefetching={isRefetching}
          updatedAt={updatedAt}
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
              className="px-6 py-12 text-center text-[12px] text-muted-foreground border-y border-border"
            >
              No L1s match "{searchTerm}". Clear the search or pick another category.
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
                startRank={(currentPage - 1) * CHAINS_PER_PAGE}
                historyByChain={tpsHistoryByChain}
                totalTps={totalNetworkTps}
                maxTps={maxTps}
                dailyTx={dailyTx}
                maxValidators={maxValidators}
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

        {coveredChains > 0 && coveredChains < activeCount && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Activity data covers {coveredChains} of {activeCount} active L1s. The rest have no public RPC and
            aren't in Avalanche's metrics API, so they show "—".
          </p>
        )}

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
        // The modal only offers active/all/inactive; when the tab is 'watchlist'
        // it simply renders with nothing selected. Narrow cast preserves that.
        validatorFilter={validatorFilter as 'active' | 'all' | 'inactive'}
        onValidatorFilterChange={setValidatorFilter}
      />

      </div>

      {selected.size > 0 && (
        <div className="hidden md:flex fixed bottom-6 left-1/2 -translate-x-1/2 z-40 items-center gap-2 px-2.5 py-1.5 rounded-md border border-border bg-popover shadow-lg">
          <span className="text-[12px] text-muted-foreground pl-1.5">
            <span className="num text-foreground font-medium">{selected.size}</span> selected
            {selected.size >= MAX_COMPARE && (
              <span className="ml-1 text-[11px] text-muted-foreground">(max {MAX_COMPARE})</span>
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
            className="inline-flex items-center gap-1.5 h-7 px-3 rounded bg-foreground hover:bg-foreground/90 text-background text-[12px] font-medium transition-colors"
          >
            <GitCompareArrows className="w-3.5 h-3.5" />
            Compare
          </button>
        </div>
      )}
    </div>
  );
}

// Memoized so a parent re-render (e.g. each search keystroke) only re-renders
// the components whose props actually changed. The per-row Sparkline/DeltaCell
// matter most: they skip path/percentage recompute for unchanged rows.
const KpiCards = memo(KpiCardsImpl);
const ScreenerToolbar = memo(ScreenerToolbarImpl);
const ScreenerTable = memo(ScreenerTableImpl);
const DeltaCell = memo(DeltaCellImpl);
const ChainAvatar = memo(ChainAvatarImpl);


function KpiCardsImpl({
  metrics,
  activeChains,
  coveredChains,
  range,
  floating = false,
}: {
  metrics: NetworkMetrics;
  activeChains: number;
  coveredChains: number;
  range: Range;
  floating?: boolean;
}) {
  const tps = rangeWindow(metrics.tpsHistory, range, 'avg');
  const tx = rangeWindow(metrics.txHistory, range, 'sum');
  const tpsDelta = pctDelta(tps.current, tps.prior);
  const txDelta = pctDelta(tx.current, tx.prior);
  const windowLabel = rangeWindowLabel(range);
  const priorLabel = range === 'ALL' ? undefined : `vs prior ${windowLabel}`;
  const pending = 'Not available right now';
  const coverage = coveredChains > 0
    ? ` Covers the ${coveredChains} chains with activity data; chains with no public RPC or metrics source aren't counted.`
    : '';

  const items: StatItem[] = [
    {
      label: 'Active L1s',
      value: activeChains > 0 ? activeChains.toLocaleString() : '—',
      sub: activeChains > 0 ? 'with validators online' : pending,
      tooltip: 'L1s with at least one validator currently online.',
    },
    {
      label: range === '24H' ? 'Network TPS' : `Avg TPS, ${windowLabel}`,
      value: tps.current != null ? Math.round(tps.current).toLocaleString() : '—',
      delta: tpsDelta,
      deltaLabel: priorLabel,
      sub: tps.current == null ? pending : 'transactions per second',
      tooltip: `Transactions per second summed across L1s and the C-Chain.${coverage}`,
    },
    {
      label: 'Validators',
      value: metrics.validators != null ? metrics.validators.toLocaleString() : '—',
      sub: metrics.validators != null ? 'across all L1s' : pending,
    },
    {
      label: range === '24H' ? 'Transactions, 24h' : `Transactions, ${windowLabel}`,
      value: tx.current != null ? formatCount(tx.current) : '—',
      delta: txDelta,
      deltaLabel: priorLabel,
      sub: tx.current == null ? pending : undefined,
      tooltip: coverage ? `Daily transactions summed across chains.${coverage}` : undefined,
    },
  ];
  return <StatStrip items={items} floating={floating} />;
}

function FlowCards({
  stats,
  window,
  selection = null,
  floating = false,
}: {
  stats: ReturnType<typeof summarizeFlows>;
  window: 'daily' | 'weekly';
  selection?: SankeySelection | null;
  floating?: boolean;
}) {
  const label = window === 'weekly' ? '7d' : '24h';
  const loaded = stats.total > 0;
  const who = selection ? flowChainLabel(selection.chain) : null;
  const incoming = selection?.direction === 'incoming';
  const items: StatItem[] = [
    {
      label: who ? `Messages ${incoming ? 'into' : 'out of'} ${who}, ${label}` : `Messages, ${label}`,
      value: loaded ? formatCount(stats.total) : '—',
      sub: loaded ? 'ICM and Teleporter' : 'Loading message data',
      tooltip: 'Interchain messages delivered between Avalanche L1s in the window, from Teleporter and ICM logs.',
    },
    {
      label: who ? 'Corridors' : 'Active corridors',
      value: loaded ? stats.corridors.toLocaleString() : '—',
      sub: loaded ? (who ? `${incoming ? 'into' : 'out of'} ${who}` : 'source to destination pairs') : undefined,
    },
    {
      label: who ? (incoming ? 'Chains sending' : 'Chains receiving') : 'Chains talking',
      value: loaded ? (who ? (incoming ? stats.sources : stats.targets) : stats.chains).toLocaleString() : '—',
      sub: loaded ? (who ? `counterparties of ${who}` : `${stats.sources} sending, ${stats.targets} receiving`) : undefined,
    },
    {
      label: 'Busiest corridor',
      value: stats.top ? `${stats.top.share.toFixed(0)}%` : '—',
      sub: stats.top ? `${flowChainLabel(stats.top.source)} to ${flowChainLabel(stats.top.target)}` : undefined,
      tooltip: 'Share of all messages in the window carried by the single busiest source to destination pair.',
    },
  ];
  return <StatStrip items={items} floating={floating} />;
}

function ScreenerToolbarImpl({
  activeTab,
  onTabChange,
  counts,
  isRefetching,
  updatedAt,
  searchTerm,
  onSearchChange,
  selectedCategory,
  onCategoryChange,
  categories,
}: {
  activeTab: ScreenerTab;
  onTabChange: (t: ScreenerTab) => void;
  counts: Record<ScreenerTab, number>;
  isRefetching: boolean;
  updatedAt: number | null;
  searchTerm: string;
  onSearchChange: (s: string) => void;
  selectedCategory: string;
  onCategoryChange: (c: string) => void;
  categories: string[];
}) {
  const tabs: Array<{ id: ScreenerTab; label: string; hide?: boolean }> = [
    { id: 'active', label: 'Active' },
    { id: 'all', label: 'All' },
    { id: 'watchlist', label: 'Watchlist', hide: counts.watchlist === 0 },
    { id: 'inactive', label: 'Inactive', hide: counts.inactive === 0 },
  ];
  const visibleTabs = tabs.filter((t) => !t.hide);
  const quickCats = ['Gaming', 'DeFi', 'RWA', 'AI', 'DePIN'];
  return (
    <div className="flex flex-col lg:flex-row lg:items-center gap-2 lg:gap-4 py-2">
      <nav className="flex items-center gap-0.5 -ml-2.5" aria-label="Screener tabs">
        {visibleTabs.map((t) => {
          const active = t.id === activeTab;
          return (
            <button
              key={t.id}
              onClick={() => onTabChange(t.id)}
              className={`flex items-baseline gap-1.5 h-8 px-2.5 rounded transition-colors ${
                active ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span className="text-[12.5px] font-medium">{t.label}</span>
              <span className="num text-[11px] text-muted-foreground">{counts[t.id]}</span>
            </button>
          );
        })}
      </nav>

      <div className="hidden lg:block w-px h-5 bg-border" aria-hidden />

      <div className="relative w-full sm:w-64">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search by name or chain ID"
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full h-8 pl-8 pr-8 rounded bg-background border border-border text-[12px] placeholder:text-muted-foreground focus:outline-none focus:border-foreground/40"
        />
        {searchTerm && (
          <button
            onClick={() => onSearchChange('')}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
        {quickCats.map((cat) => {
          const matched = categories.find((c) => c.toLowerCase() === cat.toLowerCase());
          if (!matched) return null;
          const active = selectedCategory === matched;
          return (
            <button
              key={matched}
              onClick={() => onCategoryChange(active ? '' : matched)}
              aria-pressed={active}
              className={`inline-flex items-center gap-1 h-8 px-2.5 rounded text-[12px] whitespace-nowrap transition-colors ${
                active
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              }`}
            >
              {cat}
              {active && <X className="w-3 h-3 -mr-0.5" />}
            </button>
          );
        })}
      </div>

      <div className="flex-1" />
      <UpdatedAgo at={updatedAt} refreshing={isRefetching} className="hidden sm:inline-flex" />
    </div>
  );
}

/** A short bar behind a number: the number stays exact, the bar gives the rank at a glance. */
function CellBar({ value, max, children }: { value: number; max: number; children: React.ReactNode }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <span className="inline-flex items-center justify-end gap-2.5">
      <span aria-hidden className="hidden xl:block w-14 h-[3px] rounded-sm bg-muted/60 overflow-hidden">
        <span className="block h-full bg-foreground/55 rounded-sm" style={{ width: `${pct}%` }} />
      </span>
      {children}
    </span>
  );
}

function ScreenerTableImpl({
  chains,
  startRank,
  historyByChain,
  totalTps,
  maxTps,
  dailyTx,
  maxValidators,
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
  startRank: number;
  historyByChain: Record<string, number[]>;
  totalTps: number;
  maxTps: number;
  dailyTx: Record<string, DailyTxLatest> | null;
  maxValidators: number;
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
    <TooltipProvider delayDuration={150}>
    <div className="overflow-x-auto md:overflow-visible border-t border-border">
      <table className="w-full text-[12px]">
        <thead className="md:sticky md:top-12 z-10 bg-background">
          <tr className="border-b border-border">
            <Th align="right" className="w-9 pr-2 num">#</Th>
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
              // The column names the UTC day it counts, e.g. "Txs Oct 27".
              label={dailyTx ? `Txs ${dayLabel(dailyTx) || '1d'}` : 'TPS'}
              sortKey="tps"
              active={sortBy === 'tps'}
              dir={sortDir}
              onSort={onSort}
            />
            <Th align="right" className="hidden md:table-cell" info={dailyTx ? 'Change in daily transactions versus the day before, not token price.' : 'Change in TPS (transactions per second) versus the prior day, not token price.'}>Δ 24h</Th>
            <Th align="right" className="hidden lg:table-cell" info={dailyTx ? "This L1's share of the network's daily transactions." : "This L1's share of total network TPS."}>Share</Th>
            <SortableTh
              align="right"
              label="Validators"
              sortKey="validators"
              active={sortBy === 'validators'}
              dir={sortDir}
              onSort={onSort}
            />
            <Th align="left" className="pl-8 hidden lg:table-cell">Category</Th>
            <th className="w-20" aria-label="Watch and compare" />
          </tr>
        </thead>
        <tbody>
          {chains.map((chain, idx) => {
            const history = historyByChain[chain.chainId];
            const category = chain.categories?.[0];
            const starred = watchlist.has(chain.chainId);
            const isSelected = selected.has(chain.chainId);
            const disabled = !isSelected && selectionFull;
            const active = chain.isActive ?? false;
            const day = dailyTx?.[chain.chainId];
            const tps = dailyTx ? day?.value : chain.tps?.value;
            const share = totalTps > 0 ? ((tps ?? 0) / totalTps) * 100 : 0;
            return (
              <tr
                key={chain.chainId}
                onClick={() => {
                  sessionStorage.setItem('dashboardScrollPosition', String(window.scrollY));
                  navigate(`/chain/${chain.chainId}`);
                }}
                className={`group h-10 cursor-pointer border-b border-border/50 transition-colors ${
                  isSelected ? 'bg-accent/60' : 'hover:bg-accent/40'
                }`}
              >
                <td className="num pr-2 text-right text-[11px] text-muted-foreground/70">{startRank + idx + 1}</td>
                <td>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <ChainAvatar chain={chain} />
                    <span className="text-[12.5px] font-medium text-foreground truncate">{chain.chainName}</span>
                    <span className="num text-[11px] text-muted-foreground truncate hidden xl:inline">
                      {chain.networkToken?.symbol && chain.networkToken.symbol !== 'N/A'
                        ? chain.networkToken.symbol
                        : ''}
                    </span>
                    {!active && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                        <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
                        inactive
                      </span>
                    )}
                  </div>
                </td>
                <td className="text-right">
                  <CellBar value={tps ?? 0} max={maxTps}>
                    {dailyTx ? (
                      <span
                        className={`num text-[12px] w-14 inline-block ${txColor(tps)}`}
                        title={tps == null ? "No activity data. This chain has no public RPC and isn't in Avalanche's metrics API." : undefined}
                      >
                        {tps == null ? '—' : formatCount(tps)}
                      </span>
                    ) : (
                      <span className={`num text-[12px] w-12 inline-block ${tpsColor(tps)}`}>{formatTps(tps)}</span>
                    )}
                  </CellBar>
                </td>
                <td className="text-right hidden md:table-cell">
                  {dailyTx ? (
                    <DeltaCell history={day && day.previous != null ? [day.previous, day.value] : undefined} loaded={!!day} />
                  ) : (
                    <DeltaCell history={history} loaded={chain.chainId in historyByChain} />
                  )}
                </td>
                <td className="num text-right text-[12px] text-muted-foreground hidden lg:table-cell">
                  {!tps ? '—' : share < 0.05 ? '<0.05%' : share < 1 ? `${share.toFixed(2)}%` : `${share.toFixed(1)}%`}
                </td>
                <td className="text-right">
                  <CellBar value={chain.validatorCount ?? 0} max={maxValidators}>
                    <span className="num text-[12px] text-foreground w-10 inline-block">
                      {chain.validatorCount?.toLocaleString() ?? '—'}
                    </span>
                  </CellBar>
                </td>
                <td className="pl-8 hidden lg:table-cell">
                  {category ? (
                    <span className={`inline-flex items-center gap-1.5 text-[11px] text-muted-foreground capitalize ${categoryClass(category)}`}>
                      <span aria-hidden className="w-1.5 h-1.5 rounded-sm bg-current opacity-70" />
                      {category.toLowerCase()}
                    </span>
                  ) : (
                    <span className="text-[11px] text-muted-foreground/40">—</span>
                  )}
                </td>
                <td className="pr-1">
                  <div
                    className={`flex items-center justify-end gap-1 transition-opacity ${
                      starred || isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleWatch(chain.chainId);
                      }}
                      className={`inline-flex items-center justify-center w-7 h-7 rounded transition-colors hover:bg-accent ${
                        starred ? 'text-foreground' : 'text-muted-foreground'
                      }`}
                      title={starred ? 'Remove from watchlist' : 'Add to watchlist'}
                      aria-label={starred ? 'Remove from watchlist' : 'Add to watchlist'}
                    >
                      <Star className="w-3.5 h-3.5" fill={starred ? 'currentColor' : 'none'} />
                    </button>
                    <label
                      onClick={(e) => e.stopPropagation()}
                      className={`inline-flex items-center justify-center w-7 h-7 rounded hover:bg-accent ${
                        disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'
                      }`}
                      title={disabled ? `Compare up to ${MAX_COMPARE} chains` : 'Select to compare'}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={disabled}
                        onChange={() => onToggleSelect(chain.chainId)}
                        className="sr-only"
                      />
                      <span
                        className={`flex items-center justify-center w-3.5 h-3.5 rounded-[3px] border ${
                          isSelected ? 'bg-foreground border-foreground' : 'border-muted-foreground/60'
                        }`}
                      >
                        {isSelected && (
                          <svg className="w-2.5 h-2.5 text-background" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                            <path d="M3 8.5L6.5 12L13 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </span>
                    </label>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    </TooltipProvider>
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
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={`h-9 text-[11px] font-medium ${align === 'right' ? 'text-right' : 'text-left'} ${className}`}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 transition-colors ${
          active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        {label}
        <span aria-hidden className={`text-[9px] ${active ? '' : 'opacity-0'}`}>{dir === 'asc' ? '▲' : '▼'}</span>
      </button>
    </th>
  );
}

function DeltaCellImpl({ history, loaded }: { history?: number[]; loaded?: boolean }) {
  const dash = <span className="text-[11px] text-muted-foreground/40">—</span>;
  if (!loaded || !history || history.length < 2) return dash;
  const last = history[history.length - 1];
  const prior = history[history.length - 2];
  if (!Number.isFinite(prior) || prior === 0) return dash;
  const delta = ((last - prior) / prior) * 100;
  if (!Number.isFinite(delta) || Math.abs(delta) < 0.05) {
    return <span className="num text-[12px] text-muted-foreground">0.0%</span>;
  }
  const positive = delta >= 0;
  return (
    <span className={`num text-[12px] ${positive ? 'text-up' : 'text-down'}`}>
      {positive ? '+' : '−'}{Math.abs(delta).toFixed(1)}%
    </span>
  );
}



function Th({
  children,
  align = 'left',
  className = '',
  info,
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
  className?: string;
  info?: string;
}) {
  return (
    <th
      className={`h-9 text-[11px] font-medium text-muted-foreground ${
        align === 'right' ? 'text-right' : 'text-left'
      } ${className}`}
    >
      {info ? (
        <span className="inline-flex items-center gap-1">
          {children}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={typeof children === 'string' ? `About ${children}` : 'More info'}
                className="shrink-0 text-muted-foreground/70 hover:text-foreground transition-colors"
              >
                <Info className="w-3 h-3" />
              </button>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              align={align === 'right' ? 'end' : 'start'}
              className="max-w-[240px] bg-popover border border-border text-foreground text-[11px] font-normal leading-relaxed px-3 py-2 shadow-lg [&>span]:hidden"
            >
              {info}
            </TooltipContent>
          </Tooltip>
        </span>
      ) : (
        children
      )}
    </th>
  );
}

function ChainAvatarImpl({ chain }: { chain: Chain }) {
  const uri = chain.chainLogoUri;
  const real = uri && !uri.endsWith(PLACEHOLDER_CHAIN_LOGO);
  if (real) {
    return (
      <img
        src={uri}
        alt=""
        className="w-[22px] h-[22px] rounded-full bg-muted shrink-0 object-cover"
        loading="lazy"
      />
    );
  }
  return (
    <span className="num w-[22px] h-[22px] rounded-full bg-muted text-muted-foreground flex items-center justify-center text-[10px] shrink-0">
      {chain.chainName.charAt(0).toUpperCase()}
    </span>
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
  const btn = 'num inline-flex items-center justify-center min-w-7 h-7 px-1.5 rounded text-[11px] transition-colors';
  return (
    <div className="flex items-center justify-between py-2">
      <span className="num text-[11px] text-muted-foreground">
        {start}–{end} of {totalRows}
      </span>
      <div className="flex items-center gap-0.5">
        <button
          onClick={() => onChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
          aria-label="Previous page"
          className={`${btn} text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed`}
        >
          <ChevronRight className="w-3.5 h-3.5 rotate-180" />
        </button>
        {pages.map((item, idx) =>
          item === 'ellipsis' ? (
            <span key={`e-${idx}`} className="px-1 text-muted-foreground text-[11px]">…</span>
          ) : (
            <button
              key={item}
              onClick={() => onChange(item as number)}
              aria-current={currentPage === item ? 'page' : undefined}
              className={`${btn} ${
                currentPage === item ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              }`}
            >
              {item}
            </button>
          ),
        )}
        <button
          onClick={() => onChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
          aria-label="Next page"
          className={`${btn} text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed`}
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="max-w-7xl 2xl:max-w-screen-2xl mx-auto px-4 sm:px-6 py-5 sm:py-6 space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <div className="h-5 w-40 rounded bg-muted animate-pulse" />
          <div className="h-3 w-72 rounded bg-muted animate-pulse" />
        </div>
        <div className="h-7 w-44 rounded border border-border animate-pulse" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 border border-border rounded-md divide-x divide-border">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="px-4 py-3 space-y-2">
            <div className="h-3 w-20 rounded bg-muted animate-pulse" />
            <div className="h-6 w-24 rounded bg-muted animate-pulse" />
            <div className="h-3 w-28 rounded bg-muted animate-pulse" />
          </div>
        ))}
      </div>

      <section className="border border-border rounded-md">
        <div className="flex items-center gap-4 px-4 h-10 border-b border-border">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-3 w-16 rounded bg-muted animate-pulse" />
          ))}
        </div>
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
          <div className="h-7 w-72 rounded bg-muted animate-pulse" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-7 w-14 rounded bg-muted animate-pulse" />
          ))}
        </div>
        <div>
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 px-4 h-[38px] border-b border-border/60 last:border-b-0"
            >
              <div className="w-3.5 h-3.5 rounded bg-muted animate-pulse" />
              <div className="w-3 h-3 rounded bg-muted animate-pulse" />
              <div className="flex items-center gap-2.5 flex-1">
                <div className="w-5 h-5 rounded-full bg-muted animate-pulse" />
                <div className="h-3 w-28 rounded bg-muted animate-pulse" />
              </div>
              <div className="h-3 w-12 rounded bg-muted animate-pulse" />
              <div className="hidden md:block h-3 w-12 rounded bg-muted animate-pulse" />
              <div className="hidden lg:block h-3 w-12 rounded bg-muted animate-pulse" />
              <div className="hidden sm:block h-4 w-[72px] rounded bg-muted animate-pulse" />
              <div className="h-3 w-10 rounded bg-muted animate-pulse" />
              <div className="hidden lg:block h-3 w-14 rounded bg-muted animate-pulse" />
              <div className="h-3 w-14 rounded bg-muted animate-pulse" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
