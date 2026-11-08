import { memo, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Chain, ChainRisk, DailyTxCount, DailyActiveAddresses, MaxTPSHistory, GasUsedHistory, AvgGasPriceHistory, FeesPaidHistory } from '../../types';
import { Link } from 'react-router-dom';
import { Plus, X, Share2, Check } from 'lucide-react';
import { ChainSelector } from './ChainSelector';
import { ComparisonChart, ComparisonMetricType } from './ComparisonChart';
import { seriesColor } from './colors';
import { compact, windowText } from './headline';
import { SegmentedControl } from '../instrument';
import { recentlyRateLimited, getChainMetricsHistory, getChains, getAllChainsTxCountLatest, getIcmTimeseries, getChainRisk } from '../../api';
import type { ChainMetric, IcmDay } from '../../api';
import { LoadingSpinner } from '../LoadingSpinner';

export type CompareTimeframe = 7 | 30 | 90 | 365;
const TIMEFRAMES: CompareTimeframe[] = [7, 30, 90, 365];

/** What the page hero needs: one figure per compared chain for the window. */
export interface CompareSummary {
  metric: ComparisonMetricType;
  days: CompareTimeframe;
  /** lowerBound: the figure is an undercount (active addresses read over RPC). */
  rows: { chainId: string; name: string; value: number | null; lowerBound: boolean }[];
  /** A request failed, so missing values may not mean "no data". */
  failed: boolean;
  /**
   * Set when the chains' data doesn't reach back the whole window: the figures
   * then cover only the days every chain has, starting here (unix seconds).
   */
  since: number | null;
}

interface ComparisonViewProps {
  currentChain?: Chain;
  availableChains?: Chain[];
  /** The hero's heading, given the figures once they load (null while they don't). */
  renderHeading: (summary: CompareSummary | null) => ReactNode;
}

interface ChainComparisonData {
  chain: Chain;
  dailyActiveAddresses: DailyActiveAddresses[];
  dailyTxCount: DailyTxCount[];
  maxTPS: MaxTPSHistory[];
  gasUsed: GasUsedHistory[];
  avgGasPrice: AvgGasPriceHistory[];
  feesPaid: FeesPaidHistory[];
  /** ICM messages to and from the C-Chain per day. */
  icmMessages: { timestamp: number; value: number }[];
  /** ICM totals for the window, from this chain's side. Null until loaded. */
  icm: { sent: number; received: number } | null;
  /** A request for this chain's series failed (not the same as no data). */
  failed: boolean;
  /** The table's series (transactions, max TPS) are still loading. */
  loading: boolean;
  /** Series fetched so far, and series in flight. Others load when their tab is opened. */
  loaded: ComparisonMetricType[];
  pending: ComparisonMetricType[];
}

// The backend's name for each series. Average gas price isn't compared, so it isn't fetched.
const BACKEND_METRIC: Record<ComparisonMetricType, ChainMetric | null> = {
  dailyActiveAddresses: 'activeAddresses',
  dailyTxCount: 'txCount',
  maxTPS: 'maxTps',
  gasUsed: 'gasUsed',
  avgGasPrice: null,
  feesPaid: 'feesPaid',
  // From the ICM daily series, shared by every chain.
  icmMessages: null,
};

// The table always shows these; the chart's series load on demand.
const TABLE_METRICS: ComparisonMetricType[] = ['dailyTxCount', 'maxTPS', 'icmMessages'];

const emptyData = (chain: Chain): ChainComparisonData => ({
  chain, dailyActiveAddresses: [], dailyTxCount: [], maxTPS: [], gasUsed: [], avgGasPrice: [], feesPaid: [], icmMessages: [], icm: null,
  failed: false, loading: true, loaded: [], pending: [],
});


// What the hero strip's figure is, per metric.
const STRIP_LABEL: Record<ComparisonMetricType, string> = {
  dailyTxCount: 'Transactions',
  dailyActiveAddresses: 'Daily active addresses, avg',
  maxTPS: 'Peak TPS',
  gasUsed: 'Gas used',
  feesPaid: 'Fees paid',
  avgGasPrice: 'Avg gas price',
  icmMessages: 'ICM messages',
};

const CONTAINER = 'max-w-7xl 2xl:max-w-screen-2xl w-full mx-auto px-4 sm:px-6';

const COMPARISON_METRICS: { id: ComparisonMetricType; name: string; shortName: string; valueLabel: string }[] = [
  { id: 'dailyActiveAddresses', name: 'Daily Active Addresses', shortName: 'Active addresses', valueLabel: 'addresses' },
  { id: 'dailyTxCount', name: 'Daily Transaction Count', shortName: 'Transactions', valueLabel: 'transactions' },
  { id: 'maxTPS', name: 'Daily Max TPS', shortName: 'Max TPS', valueLabel: 'TPS' },
  { id: 'gasUsed', name: 'Daily Gas Used', shortName: 'Gas used', valueLabel: 'gas' },
  { id: 'feesPaid', name: 'Daily Fees Paid', shortName: 'Fees paid', valueLabel: '' },
  { id: 'icmMessages', name: 'Daily ICM Messages', shortName: 'ICM messages', valueLabel: 'messages' },
];

function formatCompact(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  if (value < 1 && value > 0) return value.toFixed(2);
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function getMetricSeries(data: ChainComparisonData, metric: ComparisonMetricType): number[] {
  return getMetricPoints(data, metric).map(p => p.value);
}

const isCChain = (chain: Chain) => chain.chainName.toLowerCase().includes('c-chain');

/**
 * One chain's ICM messages per day, from the C-Chain's TeleporterMessenger
 * index. The C-Chain's count is every message; an L1's is its traffic with
 * the C-Chain (direct L1-to-L1 messages, about 0.02%, aren't indexed).
 */
function icmForChain(chain: Chain, days: IcmDay[]) {
  const ids = new Set([chain.chainId, chain.platformChainId].filter(Boolean));
  let sent = 0;
  let received = 0;
  const points = days.map(d => {
    const timestamp = Date.parse(`${d.date}T00:00:00Z`) / 1000;
    if (isCChain(chain)) {
      sent += d.sent;
      received += d.received;
      return { timestamp, value: d.total };
    }
    const row = d.by_chain.find(r => ids.has(r.blockchain_id));
    // Counted from the C-Chain's side, so its sends are this chain's receives.
    if (row) {
      sent += row.received;
      received += row.sent;
    }
    return { timestamp, value: row?.total ?? 0 };
  });
  return { points, totals: { sent, received } };
}

/** Who controls the validator set, short, with the longer reading for a tooltip. */
function validatorSet(chain: Chain, risk: ChainRisk | null | undefined): { label: string; title: string } {
  switch (risk?.validator_manager?.type) {
    case 'PoA': return { label: 'PoA', title: 'Proof of authority: an owner adds and removes validators.' };
    case 'PoS-native': return { label: 'PoS', title: 'Proof of stake in the native token.' };
    case 'PoS-erc20': return { label: 'PoS, ERC-20', title: 'Proof of stake in an ERC-20 token.' };
    case 'balancer': return { label: 'Suzaku', title: 'Validator weight is split between security modules, including Suzaku restaking.' };
    case 'placeholder': return { label: 'Fixed', title: 'No contract can change the validator set.' };
  }
  const t = chain.sybilResistanceType ?? '';
  if (/stake/i.test(t)) return { label: 'PoS', title: 'Proof of stake.' };
  if (/authority/i.test(t)) return { label: 'PoA', title: 'Proof of authority.' };
  return { label: '—', title: '' };
}

function getMetricPoints(data: ChainComparisonData, metric: ComparisonMetricType): { timestamp: number; value: number }[] {
  const rows = data[metric] as { timestamp: number; value?: number; activeAddresses?: number }[];
  return rows.map(r => ({
    timestamp: r.timestamp,
    value: Number(metric === 'dailyActiveAddresses' ? r.activeAddresses : r.value) || 0,
  }));
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return <span className="text-muted-foreground">—</span>;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * 100;
      const y = 100 - ((v - min) / range) * 100;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
  const areaPath = `M 0,100 L ${points.replace(/ /g, ' L ')} L 100,100 Z`;
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="w-full h-5 block"
      style={{ color }}
      aria-hidden="true"
    >
      <path d={areaPath} fill="currentColor" fillOpacity={0.1} />
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export const ComparisonView = memo(function ComparisonView({
  currentChain,
  availableChains: providedChains,
  renderHeading,
}: ComparisonViewProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [comparisonChains, setComparisonChains] = useState<ChainComparisonData[]>([]);
  const [availableChains, setAvailableChains] = useState<Chain[]>(providedChains || []);
  const [chainsLoading, setChainsLoading] = useState(!providedChains);
  const [urlInitialized, setUrlInitialized] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hoveredChainId, setHoveredChainId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'absolute' | 'normalized'>('absolute');
  // Each chain's latest daily transactions, for ranking by activity; null until loaded.
  const [txLatest, setTxLatest] = useState<Record<string, number> | null>(null);

  const metricParam = searchParams.get('metric');
  const selectedMetric: ComparisonMetricType = COMPARISON_METRICS.some(m => m.id === metricParam)
    ? metricParam as ComparisonMetricType
    // Transactions by default: every chain reports them, while active addresses are missing for many.
    : 'dailyTxCount';

  const timeframeParam = Number(searchParams.get('timeframe'));
  const timeframe: CompareTimeframe = TIMEFRAMES.includes(timeframeParam as CompareTimeframe)
    ? timeframeParam as CompareTimeframe
    : 30;

  const searchParamsRef = useRef(searchParams);
  searchParamsRef.current = searchParams;

  const updateUrl = useCallback((chainIds: string[], newTimeframe?: number, newMetric?: ComparisonMetricType) => {
    const newParams = new URLSearchParams(searchParamsRef.current);
    if (chainIds.length > 0) {
      newParams.set('compare', chainIds.join(','));
    } else {
      newParams.delete('compare');
    }
    newParams.set('timeframe', String(newTimeframe ?? timeframe));
    newParams.set('metric', newMetric ?? selectedMetric);
    setSearchParams(newParams, { replace: true });
  }, [setSearchParams, timeframe, selectedMetric]);

  const handleTimeframeChange = useCallback((newTimeframe: CompareTimeframe) => {
    const chainIds = comparisonChains.map(c => c.chain.chainId);
    updateUrl(chainIds, newTimeframe);
  }, [comparisonChains, updateUrl]);

  const handleMetricChange = useCallback((metric: ComparisonMetricType) => {
    const chainIds = comparisonChains.map(c => c.chain.chainId);
    updateUrl(chainIds, undefined, metric);
  }, [comparisonChains, updateUrl]);

  const handleCopyShareUrl = useCallback(() => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const filterChains = (chains: Chain[]) =>
      chains
        .filter(chain => chain.validatorCount && chain.validatorCount >= 1 && chain.network === 'mainnet')
        .filter(chain => { const name = chain.chainName.toLowerCase(); return !name.includes('x-chain') && !name.includes('p-chain'); });

    if (providedChains) {
      setAvailableChains(filterChains(providedChains));
      setChainsLoading(false);
      return;
    }
    async function fetchAvailableChains() {
      setChainsLoading(true);
      try {
        const chains = await getChains({ network: 'mainnet' });
        const filtered = filterChains(chains)
          .sort((a, b) => {
            const isCChainA = a.chainName.toLowerCase().includes('c-chain');
            const isCChainB = b.chainName.toLowerCase().includes('c-chain');
            if (isCChainA && !isCChainB) return -1;
            if (!isCChainA && isCChainB) return 1;
            return a.chainName.localeCompare(b.chainName);
          });
        setAvailableChains(filtered);
      } catch (error) {
        console.error('Failed to fetch chains:', error);
      } finally {
        setChainsLoading(false);
      }
    }
    fetchAvailableChains();
  }, [providedChains]);

  useEffect(() => {
    if (availableChains.length === 0) return;
    let cancelled = false;
    getAllChainsTxCountLatest()
      .then((latest) => {
        if (cancelled) return;
        const out: Record<string, number> = {};
        for (const chain of availableChains) {
          const hit = [chain.evmChainId, chain.originalChainId, chain.subnetId]
            .map((k) => (k == null ? '' : String(k)))
            .find((k) => k && latest[k]);
          if (hit) out[chain.chainId] = Number(latest[hit].value) || 0;
        }
        setTxLatest(out);
      })
      .catch(() => !cancelled && setTxLatest({}));
    return () => {
      cancelled = true;
    };
  }, [availableChains]);
  // Busiest first by the latest day's transactions, which orders chains the same as their TPS.
  const byActivity = useCallback(
    (chains: Chain[]) => [...chains].sort((a, b) => (txLatest?.[b.chainId] ?? b.tps?.value ?? 0) - (txLatest?.[a.chainId] ?? a.tps?.value ?? 0)),
    [txLatest],
  );

  // Each compared chain's validator-set record; undefined while it loads.
  const [risks, setRisks] = useState<Record<string, ChainRisk | null>>({});
  const riskRequested = useRef(new Set<string>());
  useEffect(() => {
    comparisonChains.forEach(({ chain }) => {
      if (riskRequested.current.has(chain.chainId)) return;
      riskRequested.current.add(chain.chainId);
      getChainRisk(chain.platformChainId || chain.chainId)
        .catch(() => null)
        .then(r => setRisks(prev => ({ ...prev, [chain.chainId]: r })));
    });
  }, [comparisonChains]);

  const selectedMetricRef = useRef(selectedMetric);
  selectedMetricRef.current = selectedMetric;

  // Fetch only the given series for one chain.
  const fetchChainData = useCallback(async (chain: Chain, metrics: ComparisonMetricType[]) => {
    const targetChainId = chain.chainId;
    const apiChainId = chain.originalChainId || chain.chainId;
    const update = (fn: (c: ChainComparisonData) => ChainComparisonData) =>
      setComparisonChains(prev => {
        const idx = prev.findIndex(c => c.chain.chainId === targetChainId);
        if (idx === -1) return prev;
        const updated = [...prev];
        updated[idx] = fn(updated[idx]);
        return updated;
      });

    update(c => ({ ...c, pending: [...new Set([...c.pending, ...metrics])] }));
    let failed = false;
    const wantsIcm = metrics.includes('icmMessages');
    const [series, icmDays] = await Promise.all([
      getChainMetricsHistory(apiChainId, timeframe,
        metrics.map(m => BACKEND_METRIC[m]).filter((m): m is ChainMetric => m !== null))
        .catch(() => { failed = true; return {}; }),
      wantsIcm ? getIcmTimeseries(timeframe) : Promise.resolve(null),
    ]);
    if (wantsIcm && icmDays == null) failed = true;
    const icm = icmDays ? icmForChain(chain, icmDays) : null;
    update(c => {
      const next: ChainComparisonData = { ...c };
      // Each fetcher returns its own metric's row type.
      metrics.forEach(m => {
        const key = BACKEND_METRIC[m];
        (next as unknown as Record<string, unknown[]>)[m] = (key && (series as Record<string, unknown[]>)[key]) || [];
      });
      if (wantsIcm) {
        next.icmMessages = icm?.points ?? [];
        next.icm = icm?.totals ?? null;
      }
      // A later tab loading fine doesn't bring back the table's missing values.
      next.failed = failed || (c.failed && !TABLE_METRICS.every(m => metrics.includes(m)));
      next.loaded = [...new Set([...c.loaded, ...metrics])];
      next.pending = c.pending.filter(m => !metrics.includes(m));
      if (TABLE_METRICS.every(m => next.loaded.includes(m))) next.loading = false;
      return next;
    });
  }, [timeframe]);

  const loadChain = useCallback((chain: Chain) => {
    fetchChainData(chain, [...new Set([...TABLE_METRICS, selectedMetricRef.current])]);
  }, [fetchChainData]);

  useEffect(() => {
    if (chainsLoading || urlInitialized || availableChains.length === 0) return;
    const compareParam = searchParams.get('compare');
    // The default pick needs the activity ranking.
    if (!compareParam && !currentChain && txLatest == null) return;
    if (compareParam) {
      const chainIds = compareParam.split(',').filter(Boolean).slice(0, 4);
      const initialChains: ChainComparisonData[] = [];
      chainIds.forEach(chainId => {
        const chain = availableChains.find(c => c.chainId === chainId);
        if (chain) {
          initialChains.push(emptyData(chain));
        }
      });
      if (initialChains.length > 0) {
        setComparisonChains(initialChains);
        initialChains.forEach(data => loadChain(data.chain));
      }
    } else if (currentChain) {
      setComparisonChains([emptyData(currentChain)]);
      loadChain(currentChain);
      updateUrl([currentChain.chainId]);
    } else {
      // Nothing picked yet: start from the four busiest chains by TPS, the first
      // preset, so the section opens with something to read. The URL stays clean
      // until the reader changes the selection.
      const busiest = byActivity(availableChains).slice(0, 4);
      if (busiest.length > 0) {
        const initial = busiest.map(emptyData);
        setComparisonChains(initial);
        busiest.forEach(loadChain);
      }
    }
    setUrlInitialized(true);
  }, [chainsLoading, availableChains, urlInitialized, searchParams, currentChain, loadChain, updateUrl, txLatest, byActivity]);

  const prevTimeframeRef = useRef(timeframe);
  useEffect(() => {
    if (prevTimeframeRef.current === timeframe) return;
    prevTimeframeRef.current = timeframe;
    setComparisonChains(prev => prev.map(c => emptyData(c.chain)));
    comparisonChains.forEach(data => fetchChainData(data.chain, [...new Set([...TABLE_METRICS, selectedMetricRef.current])]));
  }, [timeframe, fetchChainData]);

  // Opening a metric tab loads that series for chains that don't have it yet.
  useEffect(() => {
    comparisonChains.forEach(c => {
      if (!c.loaded.includes(selectedMetric) && !c.pending.includes(selectedMetric) && !c.loading) {
        fetchChainData(c.chain, [selectedMetric]);
      }
    });
  }, [selectedMetric, comparisonChains, fetchChainData]);

  const handleAddChain = (chain: Chain) => {
    if (comparisonChains.length >= 4) return;
    if (comparisonChains.some(c => c.chain.chainId === chain.chainId)) return;
    const newChains = [...comparisonChains, emptyData(chain)];
    setComparisonChains(newChains);
    updateUrl(newChains.map(c => c.chain.chainId));
    loadChain(chain);
    setIsModalOpen(false);
  };

  const handleRemoveChain = (chainId: string) => {
    const newChains = comparisonChains.filter(c => c.chain.chainId !== chainId);
    setComparisonChains(newChains);
    updateUrl(newChains.map(c => c.chain.chainId));
  };

  const handleClearAll = () => {
    setComparisonChains([]);
    updateUrl([]);
  };

  const handleApplyPreset = (chains: Chain[]) => {
    const picks = chains.slice(0, 4);
    if (picks.length === 0) return;
    const newChains = picks.map(emptyData);
    setComparisonChains(newChains);
    updateUrl(picks.map(c => c.chainId));
    picks.forEach(loadChain);
  };

  const presets = useMemo(() => {
    if (availableChains.length === 0) return [];
    const byTps = byActivity(availableChains).slice(0, 4);
    const byValidators = [...availableChains]
      .sort((a, b) => (b.validatorCount ?? 0) - (a.validatorCount ?? 0))
      .slice(0, 4);
    const GAMING_NAMES = ['beam', 'gunz', 'henesy', 'dfk'];
    const gaming = GAMING_NAMES
      .map(needle => availableChains.find(c => c.chainName.toLowerCase().includes(needle)))
      .filter((c): c is Chain => !!c)
      .slice(0, 4);
    const list: { id: string; label: string; chains: Chain[] }[] = [
      { id: 'tps', label: 'Top 4 by TPS', chains: byTps },
      { id: 'validators', label: 'Top 4 by Validators', chains: byValidators },
    ];
    if (gaming.length >= 2) list.push({ id: 'gaming', label: 'Gaming L1s', chains: gaming });
    return list;
  }, [availableChains, byActivity]);

  const activePresetId = useMemo(() => {
    if (comparisonChains.length === 0) return null;
    const currentIds = comparisonChains.map(c => c.chain.chainId).sort().join(',');
    for (const p of presets) {
      const presetIds = p.chains.map(c => c.chainId).sort().join(',');
      if (presetIds === currentIds) return p.id;
    }
    return null;
  }, [presets, comparisonChains]);

  const selectedChainIds = comparisonChains.map(c => c.chain.chainId);

  const currentMetricConfig = COMPARISON_METRICS.find(m => m.id === selectedMetric) || COMPARISON_METRICS[0];

  // Compute per-chain stats for cards
  const NAVAX_TO_AVAX = 1_000_000_000;

  // null means the chain has no data for it, shown as '—' rather than 0.
  const chainStats = useMemo(() => {
    const last = <T extends { value: number }>(xs: T[]) => (xs.length > 0 ? xs[xs.length - 1].value : null);
    return comparisonChains.map(data => {
      const risk = risks[data.chain.chainId];
      return {
        maxTps: last(data.maxTPS),
        validators: data.chain.validatorCount ?? null,
        canHalt: risk?.decentralization?.nakamoto_33 ?? null,
        set: validatorSet(data.chain, risk),
        riskLoading: risk === undefined,
        dailyTx: last(data.dailyTxCount),
        feesBurned: data.chain.totalFeesPaid != null ? data.chain.totalFeesPaid / NAVAX_TO_AVAX : null,
        icmSent: data.icm?.sent ?? null,
        icmReceived: data.icm?.received ?? null,
        loading: data.loading,
      };
    });
  }, [comparisonChains, risks]);

  // The largest value in each column, set in a heavier weight when two or more chains are compared.
  const leaders = useMemo(() => {
    const top = (vals: (number | null)[]) => {
      const nums = vals.filter((v): v is number => v != null && v > 0);
      return comparisonChains.length >= 2 && nums.length >= 2 ? Math.max(...nums) : null;
    };
    return {
      maxTps: top(chainStats.map(s => s.maxTps)),
      validators: top(chainStats.map(s => s.validators)),
      canHalt: top(chainStats.map(s => s.canHalt)),
      dailyTx: top(chainStats.map(s => s.dailyTx)),
      feesBurned: top(chainStats.map(s => s.feesBurned)),
      icmSent: top(chainStats.map(s => s.icmSent)),
      icmReceived: top(chainStats.map(s => s.icmReceived)),
    };
  }, [chainStats, comparisonChains.length]);

  // Fees are paid in each chain's own token, so they can't be set against each
  // other; the hero speaks to transactions instead.
  const heroMetric: ComparisonMetricType = selectedMetric === 'feesPaid' ? 'dailyTxCount' : selectedMetric;
  const summary = useMemo<CompareSummary | null>(() => {
    if (comparisonChains.length === 0) return urlInitialized ? { metric: heroMetric, days: timeframe, rows: [], failed: false, since: null } : null;
    if (comparisonChains.some(c => !c.loaded.includes(heroMetric))) return null;
    const points = comparisonChains.map(c => getMetricPoints(c, heroMetric));
    // Compare like with like: only the days every chain with data has. A chain
    // whose history starts later would otherwise lose to a full year of another.
    const firsts = points.filter(p => p.length > 0).map(p => p[0].timestamp);
    const start = firsts.length > 0 ? Math.max(...firsts) : 0;
    const DAY = 86_400;
    const windowStart = Date.now() / 1000 - timeframe * DAY;
    const rows = comparisonChains.map((c, i) => {
      const series = points[i].filter(p => p.timestamp >= start).map(p => p.value);
      let value: number | null = null;
      if (series.length > 0) {
        value = heroMetric === 'maxTPS'
          ? Math.max(...series)
          : heroMetric === 'dailyActiveAddresses'
            ? series.reduce((a, b) => a + b, 0) / series.length
            : series.reduce((a, b) => a + b, 0);
      }
      const lowerBound = heroMetric === 'dailyActiveAddresses'
        && c.dailyActiveAddresses.some(p => p.lowerBound && p.timestamp >= start);
      return { chainId: c.chain.chainId, name: c.chain.chainName, value, lowerBound };
    });
    return {
      metric: heroMetric,
      days: timeframe,
      rows,
      failed: comparisonChains.some(c => c.failed),
      // A couple of days' slack: the API leaves out today and may lag a day.
      since: start > windowStart + 3 * DAY ? start : null,
    };
  }, [comparisonChains, heroMetric, timeframe, urlInitialized]);


  // Inline bars, each against the column's largest value among the compared chains.
  const colMax = {
    maxTps: Math.max(0, ...chainStats.map(s => s.maxTps ?? 0)),
    dailyTx: Math.max(0, ...chainStats.map(s => s.dailyTx ?? 0)),
    icm: Math.max(0, ...chainStats.map(s => Math.max(s.icmSent ?? 0, s.icmReceived ?? 0))),
  };
  const barCell = (value: number | null, leader: number | null, max: number, color: string, fmt: (v: number) => string) =>
    value == null ? (
      <span className="text-muted-foreground">—</span>
    ) : (
      <span className="inline-flex items-center justify-end gap-2 w-full">
        <span className="hidden md:block w-16 h-1.5 rounded-sm bg-muted overflow-hidden" aria-hidden>
          <span className="block h-full rounded-sm" style={{ width: `${max > 0 ? (value / max) * 100 : 0}%`, background: color }} />
        </span>
        <span className={value === leader ? 'font-semibold text-foreground' : 'text-foreground'}>{fmt(value)}</span>
      </span>
    );
  const cell = (value: number | null, leader: number | null, fmt: (v: number) => string) =>
    value == null ? (
      <span className="text-muted-foreground">—</span>
    ) : (
      <span className={value === leader ? 'font-semibold text-foreground' : 'text-foreground'}>{fmt(value)}</span>
    );
  const rangeShort = timeframe === 365 ? '1y' : `${timeframe}d`;
  const rowProps = (chainId: string) => ({
    onMouseEnter: () => setHoveredChainId(chainId),
    onMouseLeave: () => setHoveredChainId(null),
    className: `h-11 transition-opacity ${hoveredChainId != null && hoveredChainId !== chainId ? 'opacity-50' : ''}`,
  });
  const chainCell = (chain: Chain, color: string) => (
    <td className="pl-4 pr-3">
      <div className="flex items-center gap-2.5 min-w-0">
        <span aria-hidden className="w-[3px] h-4 rounded-sm shrink-0" style={{ background: color }} />
        {chain.chainLogoUri ? (
          <img src={chain.chainLogoUri} alt="" className="w-5 h-5 rounded-full object-cover bg-muted shrink-0" loading="lazy" />
        ) : (
          <span className="w-5 h-5 rounded-full bg-muted shrink-0" />
        )}
        <Link to={`/chain/${chain.chainId}`} className="truncate font-medium text-foreground hover:underline underline-offset-2">
          {chain.chainName}
        </Link>
      </div>
    </td>
  );
  const slotsLeft = 4 - comparisonChains.length;
  // Only this view's own failed requests count; a 429 elsewhere on the page
  // says nothing about these values.
  const anyFailed = comparisonChains.some(c => c.failed);
  const failureNote = recentlyRateLimited()
    ? 'The data API is limiting requests right now, so some values are missing. Try again in a minute.'
    : "Some values didn't load. Try again in a minute.";

  // The chart waits until every chain has the selected series.
  const chartChains = comparisonChains.map(c => ({
    ...c,
    loading: c.loading || !c.loaded.includes(selectedMetric),
  }));
  const metricLabel = currentMetricConfig.shortName.toLowerCase();

  const stripSub = summary
    ? `${STRIP_LABEL[summary.metric]}, ${summary.since != null ? windowText(summary) : summary.days === 365 ? '1y' : `${summary.days}d`}`
    : STRIP_LABEL[heroMetric];
  const stripCells = comparisonChains.length + (slotsLeft > 0 ? 1 : 0);
  const STRIP_COLS = ['', 'md:grid-cols-1', 'md:grid-cols-2', 'md:grid-cols-3', 'md:grid-cols-4', 'md:grid-cols-5'];

  // One cell per chain with its figure for the window, then a cell to add one.
  const chainStrip = (floating: boolean) => (
    <div
      className={`grid grid-cols-2 ${STRIP_COLS[stripCells]} gap-px rounded-md overflow-hidden border border-border bg-border ${
        floating ? 'shadow-lg' : ''
      }`}
    >
      {comparisonChains.map((data, index) => {
        const row = summary?.rows.find(r => r.chainId === data.chain.chainId);
        const dim = hoveredChainId != null && hoveredChainId !== data.chain.chainId;
        // A zero ICM count is a real figure: the index covers every message.
        const hasFigure = row?.value != null && (row.value > 0 || summary?.metric === 'icmMessages');
        return (
          <div
            key={data.chain.chainId}
            onMouseEnter={() => setHoveredChainId(data.chain.chainId)}
            onMouseLeave={() => setHoveredChainId(null)}
            className={`px-4 py-3 min-w-0 transition-opacity ${dim ? 'opacity-50' : ''} ${
              floating ? 'bg-card/85 supports-[backdrop-filter]:bg-card/70 backdrop-blur-md' : 'bg-card'
            }`}
          >
            <div className="flex items-center gap-1.5 text-[12px] leading-4 text-muted-foreground min-w-0">
              <span aria-hidden className="w-[3px] h-3 rounded-sm shrink-0" style={{ background: seriesColor(index) }} />
              {data.chain.chainLogoUri ? (
                <img src={data.chain.chainLogoUri} alt="" className="w-4 h-4 rounded-full object-cover bg-muted shrink-0" loading="lazy" />
              ) : (
                <span className="w-4 h-4 rounded-full bg-muted shrink-0" />
              )}
              <Link to={`/chain/${data.chain.chainId}`} className="truncate text-foreground hover:underline underline-offset-2">
                {data.chain.chainName}
              </Link>
              <button
                type="button"
                onClick={() => handleRemoveChain(data.chain.chainId)}
                aria-label={`Remove ${data.chain.chainName}`}
                className="ml-auto -mr-1 p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
            <div className="mt-1 num text-[22px] leading-7 font-medium text-foreground truncate">
              {!summary ? '…' : hasFigure ? compact(row!.value!) : '—'}
            </div>
            <div className="mt-0.5 text-[11px] leading-4 text-muted-foreground truncate">
              {summary && !hasFigure
                ? (data.failed ? "Didn't load" : 'No data for this chain yet')
                : row?.lowerBound ? <span title="Counted by L1Beat from the chain's blocks, which misses addresses reached only by internal calls.">At least, a lower bound</span> : stripSub}
            </div>
          </div>
        );
      })}
      {slotsLeft > 0 && (
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className={`px-4 py-3 min-h-[84px] flex flex-col items-start justify-center gap-0.5 text-left transition-colors hover:bg-accent ${
            floating ? 'bg-card/85 supports-[backdrop-filter]:bg-card/70 backdrop-blur-md' : 'bg-card'
          } ${comparisonChains.length % 2 === 0 ? 'col-span-2 md:col-span-1' : ''}`}
        >
          <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-foreground">
            <Plus className="w-3.5 h-3.5" />
            Add chain
          </span>
          <span className="text-[11px] text-muted-foreground">{slotsLeft} of 4 open</span>
        </button>
      )}
    </div>
  );

  return (
    <>
      {/* Hero in the shared page frame: a headline sentence, then the chart
          fills the stage and the chains float over its foot from md up. */}
      <section
        className="relative border-b border-border bg-stage md:h-[min(calc(100vh-48px),1200px)] md:min-h-[600px]"
        aria-label="Chain comparison"
      >
        <div className="md:absolute md:inset-0 flex flex-col">
          <div className={`${CONTAINER} pt-5`}>{renderHeading(chainsLoading ? null : summary)}</div>

          <div className={`${CONTAINER} flex flex-col gap-2 mt-4 lg:flex-row lg:items-center lg:justify-between`}>
            <div className="overflow-x-auto no-scrollbar -mx-4 px-4 lg:mx-0 lg:px-0 max-w-full">
              <SegmentedControl
                value={selectedMetric}
                options={COMPARISON_METRICS.map(m => ({ value: m.id, label: m.shortName }))}
                onChange={handleMetricChange}
                ariaLabel="Metric"
              />
            </div>
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 lg:mx-0 lg:px-0">
              <SegmentedControl
                value={viewMode}
                options={[{ value: 'absolute', label: 'Values' }, { value: 'normalized', label: 'Shape' }] as const}
                onChange={setViewMode}
                ariaLabel="Scale"
              />
              <SegmentedControl
                value={String(timeframe) as '7' | '30' | '90' | '365'}
                options={[{ value: '7', label: '7D' }, { value: '30', label: '30D' }, { value: '90', label: '90D' }, { value: '365', label: '1Y' }] as const}
                onChange={v => handleTimeframeChange(Number(v) as CompareTimeframe)}
                ariaLabel="Range"
              />
              <button
                type="button"
                onClick={handleCopyShareUrl}
                className="shrink-0 inline-flex items-center gap-1.5 h-7 px-2.5 rounded border border-border bg-background text-[12px] font-medium text-foreground hover:bg-accent transition-colors"
              >
                {copied ? <Check className="w-3 h-3" /> : <Share2 className="w-3 h-3" />}
                {copied ? 'Link copied' : 'Share'}
              </button>
            </div>
          </div>

          <div className="h-[380px] md:h-auto md:flex-1 md:min-h-0 mx-4 sm:mx-6 lg:mx-10 mt-3 mb-4 md:mb-[128px]">
            {chainsLoading ? (
              <div className="h-full flex items-center justify-center"><LoadingSpinner size="lg" /></div>
            ) : comparisonChains.length === 0 ? (
              <div className="h-full min-h-[280px] flex items-center justify-center">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(true)}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded border border-border bg-background text-[12px] font-medium text-foreground hover:bg-accent transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add a chain
                </button>
              </div>
            ) : (
              <ComparisonChart
                comparisonChains={chartChains}
                metricType={selectedMetric}
                valueLabel={currentMetricConfig.valueLabel}
                hoveredChainId={hoveredChainId}
                onHoverChain={setHoveredChainId}
                viewMode={viewMode}
                emptyMessage={anyFailed ? failureNote : undefined}
                fill
              />
            )}
          </div>
        </div>
        {!chainsLoading && (
          <div className="hidden md:block absolute bottom-4 left-1/2 -translate-x-1/2 z-30 w-[min(1100px,calc(100%-3rem))]">
            {chainStrip(true)}
          </div>
        )}
      </section>

      <div className={`${CONTAINER} py-4 space-y-3`}>
        {!chainsLoading && <div className="md:hidden">{chainStrip(false)}</div>}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-[14px] font-semibold text-foreground">Side by side</h2>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              {comparisonChains.length < 2
                ? 'Pick up to 4 L1s, or start from a preset.'
                : `Latest figures for the ${comparisonChains.length} chains, with ${metricLabel} over the ${timeframe === 365 ? 'last year' : `last ${timeframe} days`}.`}
            </p>
          </div>
          {presets.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
              {presets.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleApplyPreset(p.chains)}
                  disabled={p.chains.length === 0}
                  aria-pressed={activePresetId === p.id}
                  className={`shrink-0 h-7 px-2.5 rounded border text-[12px] font-medium transition-colors disabled:opacity-50 ${
                    activePresetId === p.id
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {anyFailed && (
          <p role="status" className="text-[12px] text-muted-foreground">{failureNote}</p>
        )}

        {comparisonChains.length > 0 && (
          <div className="rounded-md border border-border bg-card overflow-hidden">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-border text-[11px] text-muted-foreground">
                  <th className="text-left font-normal py-2 pl-4 pr-3">Chain</th>
                  <th className="hidden sm:table-cell text-right font-normal py-2 px-3">Max TPS</th>
                  <th className="text-right font-normal py-2 px-3">Txs, last day</th>
                  <th className="hidden lg:table-cell text-left font-normal py-2 px-3 w-[30%]">{currentMetricConfig.shortName}, {rangeShort}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {comparisonChains.map((data, index) => {
                  const color = seriesColor(index);
                  const st = chainStats[index];
                  return (
                    <tr key={data.chain.chainId} {...rowProps(data.chain.chainId)}>
                      {chainCell(data.chain, color)}
                      {st.loading ? (
                        <td colSpan={3} className="px-3 text-right text-muted-foreground">Loading…</td>
                      ) : (
                        <>
                          <td className="hidden sm:table-cell num px-3 text-right">{barCell(st.maxTps, leaders.maxTps, colMax.maxTps, color, v => v.toFixed(2))}</td>
                          <td className="num px-3 text-right">{barCell(st.dailyTx, leaders.dailyTx, colMax.dailyTx, color, formatCompact)}</td>
                          <td className="hidden lg:table-cell px-3">
                            <Sparkline values={getMetricSeries(data, selectedMetric)} color={color} />
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {comparisonChains.length > 0 && (
          <div className="pt-3">
            <h2 className="text-[14px] font-semibold text-foreground">Validators and interchain</h2>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              Who runs each chain, and its ICM traffic with the C-Chain {timeframe === 365 ? 'over the last year' : `over the last ${timeframe} days`}.
            </p>
          </div>
        )}

        {comparisonChains.length > 0 && (
          <div className="rounded-md border border-border bg-card overflow-hidden">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-border text-[11px] text-muted-foreground">
                  <th className="text-left font-normal py-2 pl-4 pr-3">Chain</th>
                  <th className="hidden sm:table-cell text-left font-normal py-2 px-3">Validator set</th>
                  <th className="text-right font-normal py-2 px-3">Validators</th>
                  <th className="text-right font-normal py-2 px-3" title="The fewest validators that together hold over a third of the weight, enough to halt the chain. Higher is harder to stop.">Can halt</th>
                  <th className="hidden md:table-cell text-right font-normal py-2 px-3" title="All-time validation fees paid to the P-Chain. Legacy subnets don't pay them.">Fees burned</th>
                  <th className="hidden sm:table-cell text-right font-normal py-2 px-3" title={`ICM messages this chain sent, ${rangeShort}`}>ICM sent</th>
                  <th className="hidden sm:table-cell text-right font-normal py-2 px-3" title={`ICM messages this chain received, ${rangeShort}`}>ICM received</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {comparisonChains.map((data, index) => {
                  const color = seriesColor(index);
                  const st = chainStats[index];
                  const icmLoading = !data.loaded.includes('icmMessages');
                  return (
                    <tr key={data.chain.chainId} {...rowProps(data.chain.chainId)}>
                      {chainCell(data.chain, color)}
                      <td className="hidden sm:table-cell px-3 text-foreground" title={st.set.title || undefined}>
                        {st.riskLoading ? <span className="text-muted-foreground">…</span> : st.set.label}
                      </td>
                      <td className="num px-3 text-right">{cell(st.validators, leaders.validators, v => v.toLocaleString())}</td>
                      <td className="num px-3 text-right">
                        {st.riskLoading ? <span className="text-muted-foreground">…</span> : cell(st.canHalt, leaders.canHalt, v => v.toLocaleString())}
                      </td>
                      <td className="hidden md:table-cell num px-3 text-right">
                        {cell(st.feesBurned, leaders.feesBurned, v => `${formatCompact(v)} AVAX`)}
                      </td>
                      <td className="hidden sm:table-cell num px-3 text-right">
                        {icmLoading ? <span className="text-muted-foreground">…</span> : barCell(st.icmSent, leaders.icmSent, colMax.icm, color, formatCompact)}
                      </td>
                      <td className="hidden sm:table-cell num px-3 text-right">
                        {icmLoading ? <span className="text-muted-foreground">…</span> : barCell(st.icmReceived, leaders.icmReceived, colMax.icm, color, formatCompact)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {comparisonChains.length > 0 && (
          <button
            type="button"
            onClick={handleClearAll}
            className="text-[12px] text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear all
          </button>
        )}

        <ChainSelector
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          chains={availableChains}
          selectedChainIds={selectedChainIds}
          onSelectChain={handleAddChain}
          maxChains={4}
        />
      </div>
    </>
  );
});
