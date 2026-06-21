import { memo, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Chain, DailyTxCount, DailyActiveAddresses, MaxTPSHistory, GasUsedHistory, AvgGasPriceHistory, FeesPaidHistory, L1BeatFeeMetrics } from '../../types';
import { Info, Plus, X, Trash2, Share2, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChainSelector } from './ChainSelector';
import { ComparisonChart, ComparisonMetricType } from './ComparisonChart';
import { getDailyActiveAddresses, getChainTxCountHistory, getChainMaxTPSHistory, getChainGasUsedHistory, getChainAvgGasPriceHistory, getChainFeesPaidHistory, getChains, getL1BeatFeeMetrics } from '../../api';
import { LoadingSpinner } from '../LoadingSpinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '../branding/ui/tooltip';

interface ComparisonViewProps {
  currentChain?: Chain;
  availableChains?: Chain[];
  validatorCountBySubnet?: Record<string, number>;
}

interface ChainComparisonData {
  chain: Chain;
  dailyActiveAddresses: DailyActiveAddresses[];
  dailyTxCount: DailyTxCount[];
  maxTPS: MaxTPSHistory[];
  gasUsed: GasUsedHistory[];
  avgGasPrice: AvgGasPriceHistory[];
  feesPaid: FeesPaidHistory[];
  feeMetrics: L1BeatFeeMetrics | null;
  loading: boolean;
}

const CHAIN_COLORS = [
  { border: 'border-indigo-500', bg: 'bg-indigo-500', bgFaint: 'bg-indigo-500/10', dot: 'bg-indigo-500', barTrack: 'bg-indigo-500/20', text: 'text-indigo-400' },
  { border: 'border-emerald-500', bg: 'bg-emerald-500', bgFaint: 'bg-emerald-500/10', dot: 'bg-emerald-500', barTrack: 'bg-emerald-500/20', text: 'text-emerald-400' },
  { border: 'border-amber-500', bg: 'bg-amber-500', bgFaint: 'bg-amber-500/10', dot: 'bg-amber-500', barTrack: 'bg-amber-500/20', text: 'text-amber-400' },
  { border: 'border-red-500', bg: 'bg-red-500', bgFaint: 'bg-red-500/10', dot: 'bg-red-500', barTrack: 'bg-red-500/20', text: 'text-red-400' },
];

const COMPARISON_METRICS: { id: ComparisonMetricType; name: string; shortName: string; valueLabel: string }[] = [
  { id: 'dailyActiveAddresses', name: 'Daily Active Addresses', shortName: 'Active Addresses', valueLabel: 'addresses' },
  { id: 'dailyTxCount', name: 'Daily Transaction Count', shortName: 'Transactions', valueLabel: 'transactions' },
  { id: 'maxTPS', name: 'Daily Max TPS', shortName: 'Max TPS', valueLabel: 'TPS' },
  { id: 'gasUsed', name: 'Daily Gas Used', shortName: 'Gas Used', valueLabel: 'gas' },
  { id: 'feesPaid', name: 'Daily Fees Paid', shortName: 'Fees Paid', valueLabel: '' },
];

function formatCompact(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  if (value < 1 && value > 0) return value.toFixed(2);
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function getMetricSeries(data: ChainComparisonData, metric: ComparisonMetricType): number[] {
  const points =
    metric === 'dailyActiveAddresses'
      ? data.dailyActiveAddresses.map(d => d.activeAddresses)
      : metric === 'dailyTxCount'
      ? data.dailyTxCount.map(d => d.value)
      : metric === 'maxTPS'
      ? data.maxTPS.map(d => d.value)
      : metric === 'gasUsed'
      ? data.gasUsed.map(d => d.value)
      : metric === 'avgGasPrice'
      ? data.avgGasPrice.map(d => d.value)
      : data.feesPaid.map(d => d.value);
  return points.map(v => Number(v) || 0);
}

function Sparkline({ values, colorClass }: { values: number[]; colorClass: string }) {
  if (values.length < 2) return <div className="h-7" />;
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
      className={`w-full h-7 ${colorClass}`}
      aria-hidden="true"
    >
      <path d={areaPath} fill="currentColor" fillOpacity={0.15} />
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
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
  validatorCountBySubnet = {}
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

  const metricParam = searchParams.get('metric');
  const selectedMetric: ComparisonMetricType = COMPARISON_METRICS.some(m => m.id === metricParam)
    ? metricParam as ComparisonMetricType
    : 'dailyActiveAddresses';

  const timeframeParam = searchParams.get('timeframe');
  const timeframe = (timeframeParam === '30' ? 30 : 7) as 7 | 30;

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

  const handleTimeframeChange = useCallback((newTimeframe: 7 | 30) => {
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

  const fetchChainData = useCallback(async (chain: Chain) => {
    const targetChainId = chain.chainId;
    try {
      const apiChainId = chain.originalChainId || chain.chainId;
      const evmChainIdStr = chain.evmChainId ? String(chain.evmChainId) : apiChainId;
      const [activeAddresses, dailyTx, maxTps, gasUsedData, avgGasPriceData, feesPaidData, feeMetricsData] = await Promise.all([
        getDailyActiveAddresses(evmChainIdStr, timeframe).catch(() => []),
        getChainTxCountHistory(apiChainId, timeframe).catch(() => []),
        getChainMaxTPSHistory(apiChainId, timeframe).catch(() => []),
        getChainGasUsedHistory(apiChainId, timeframe).catch(() => []),
        getChainAvgGasPriceHistory(apiChainId, timeframe).catch(() => []),
        getChainFeesPaidHistory(apiChainId, timeframe).catch(() => []),
        chain.subnetId ? getL1BeatFeeMetrics(chain.subnetId).then(r => r[0] ?? null).catch(() => null) : Promise.resolve(null),
      ]);
      setComparisonChains(prev => {
        const idx = prev.findIndex(c => c.chain.chainId === targetChainId);
        if (idx === -1) return prev;
        const updated = [...prev];
        updated[idx] = { chain, dailyActiveAddresses: activeAddresses, dailyTxCount: dailyTx, maxTPS: maxTps, gasUsed: gasUsedData, avgGasPrice: avgGasPriceData, feesPaid: feesPaidData, feeMetrics: feeMetricsData, loading: false };
        return updated;
      });
    } catch {
      setComparisonChains(prev => {
        const idx = prev.findIndex(c => c.chain.chainId === targetChainId);
        if (idx === -1) return prev;
        const updated = [...prev];
        updated[idx] = { ...updated[idx], loading: false };
        return updated;
      });
    }
  }, [timeframe]);

  useEffect(() => {
    if (chainsLoading || urlInitialized || availableChains.length === 0) return;
    const compareParam = searchParams.get('compare');
    if (compareParam) {
      const chainIds = compareParam.split(',').filter(Boolean).slice(0, 4);
      const initialChains: ChainComparisonData[] = [];
      chainIds.forEach(chainId => {
        const chain = availableChains.find(c => c.chainId === chainId);
        if (chain) {
          initialChains.push({ chain, dailyActiveAddresses: [], dailyTxCount: [], maxTPS: [], gasUsed: [], avgGasPrice: [], feesPaid: [], feeMetrics: null, loading: true });
        }
      });
      if (initialChains.length > 0) {
        setComparisonChains(initialChains);
        initialChains.forEach(data => fetchChainData(data.chain));
      }
    } else if (currentChain) {
      setComparisonChains([{ chain: currentChain, dailyActiveAddresses: [], dailyTxCount: [], maxTPS: [], gasUsed: [], avgGasPrice: [], feesPaid: [], feeMetrics: null, loading: true }]);
      fetchChainData(currentChain);
      updateUrl([currentChain.chainId]);
    }
    setUrlInitialized(true);
  }, [chainsLoading, availableChains, urlInitialized, searchParams, currentChain, fetchChainData, updateUrl]);

  const prevTimeframeRef = useRef(timeframe);
  useEffect(() => {
    if (prevTimeframeRef.current === timeframe) return;
    prevTimeframeRef.current = timeframe;
    setComparisonChains(prev => prev.length === 0 ? prev : prev.map(c => ({ ...c, loading: true })));
    comparisonChains.forEach(data => fetchChainData(data.chain));
  }, [timeframe, fetchChainData]);

  const handleAddChain = (chain: Chain) => {
    if (comparisonChains.length >= 4) return;
    if (comparisonChains.some(c => c.chain.chainId === chain.chainId)) return;
    const newChains = [...comparisonChains, { chain, dailyActiveAddresses: [], dailyTxCount: [], maxTPS: [], gasUsed: [], avgGasPrice: [], feesPaid: [], feeMetrics: null, loading: true }];
    setComparisonChains(newChains);
    updateUrl(newChains.map(c => c.chain.chainId));
    fetchChainData(chain);
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
    const newChains: ChainComparisonData[] = picks.map(chain => ({
      chain,
      dailyActiveAddresses: [],
      dailyTxCount: [],
      maxTPS: [],
      gasUsed: [],
      avgGasPrice: [],
      feesPaid: [],
      feeMetrics: null,
      loading: true,
    }));
    setComparisonChains(newChains);
    updateUrl(picks.map(c => c.chainId));
    picks.forEach(chain => fetchChainData(chain));
  };

  const presets = useMemo(() => {
    if (availableChains.length === 0) return [];
    const byTps = [...availableChains]
      .sort((a, b) => (b.tps?.value ?? 0) - (a.tps?.value ?? 0))
      .slice(0, 4);
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
  }, [availableChains]);

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
  const canAddMore = comparisonChains.length < 4;
  const hasMultipleChains = comparisonChains.length >= 2;

  const currentMetricConfig = COMPARISON_METRICS.find(m => m.id === selectedMetric) || COMPARISON_METRICS[0];

  // Compute per-chain stats for cards
  const NAVAX_TO_AVAX = 1_000_000_000;

  const chainStats = useMemo(() => {
    const stats = comparisonChains.map(data => {
      const maxTps = data.maxTPS.length > 0 ? data.maxTPS[data.maxTPS.length - 1].value : 0;
      const validators = (data.chain.subnetId ? validatorCountBySubnet[data.chain.subnetId] : undefined) ?? data.chain.validatorCount ?? 0;
      const dailyTx = data.dailyTxCount.length > 0 ? data.dailyTxCount[data.dailyTxCount.length - 1].value : 0;
      const totalFeesPaid = data.feeMetrics ? data.feeMetrics.total_fees_paid / NAVAX_TO_AVAX : 0;
      const totalDeposited = data.feeMetrics ? data.feeMetrics.total_deposited / NAVAX_TO_AVAX : 0;
      const currentBalance = data.feeMetrics ? data.feeMetrics.current_balance / NAVAX_TO_AVAX : 0;
      return { maxTps, validators, dailyTx, totalFeesPaid, totalDeposited, currentBalance, hasFeeData: !!data.feeMetrics, loading: data.loading };
    });
    const maxTps = Math.max(...stats.map(s => s.maxTps), 0);
    const maxValidators = Math.max(...stats.map(s => s.validators), 0);
    const maxDailyTx = Math.max(...stats.map(s => s.dailyTx), 0);
    const maxFees = Math.max(...stats.map(s => s.totalFeesPaid), 0);

    const minOf = (vals: number[]) => {
      const nonZero = vals.filter(v => v > 0);
      return nonZero.length > 0 ? Math.min(...nonZero) : 0;
    };
    const minTps = minOf(stats.map(s => s.maxTps));
    const minValidators = minOf(stats.map(s => s.validators));
    const minDailyTx = minOf(stats.map(s => s.dailyTx));
    const minFees = minOf(stats.filter(s => s.hasFeeData).map(s => s.totalFeesPaid));
    const canRank = stats.length >= 2;
    const spreadTps = canRank && maxTps > minTps;
    const spreadValidators = canRank && maxValidators > minValidators;
    const spreadDailyTx = canRank && maxDailyTx > minDailyTx;
    const spreadFees = canRank && maxFees > minFees && minFees > 0;

    return stats.map(s => ({
      ...s,
      tpsPercent: maxTps > 0 ? (s.maxTps / maxTps) * 100 : 0,
      isBestTps: s.maxTps === maxTps && maxTps > 0 && canRank,
      isWorstTps: spreadTps && s.maxTps === minTps,
      isBestValidators: s.validators === maxValidators && maxValidators > 0 && canRank,
      isWorstValidators: spreadValidators && s.validators === minValidators,
      isBestDailyTx: s.dailyTx === maxDailyTx && maxDailyTx > 0 && canRank,
      isWorstDailyTx: spreadDailyTx && s.dailyTx === minDailyTx,
      isMostFees: s.totalFeesPaid === maxFees && maxFees > 0 && canRank,
      isLeastFees: spreadFees && s.hasFeeData && s.totalFeesPaid === minFees,
    }));
  }, [comparisonChains, validatorCountBySubnet]);

  if (chainsLoading) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-card border border-border rounded-xl p-12 flex flex-col items-center justify-center">
        <LoadingSpinner size="lg" />
        <p className="mt-4 text-muted-foreground">Loading chains...</p>
      </motion.div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Compare Chains</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {comparisonChains.length === 0
              ? 'Select up to 4 L1s to compare performance metrics'
              : comparisonChains.length === 1
              ? 'Add more chains to start comparing'
              : `Comparing ${comparisonChains.length} chains`}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <AnimatePresence>
            {comparisonChains.length > 0 && (
              <motion.button
                initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }}
                onClick={handleClearAll}
                className="flex items-center gap-2 px-3.5 py-2 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" /> Clear All
              </motion.button>
            )}
          </AnimatePresence>
          <motion.button
            onClick={() => setIsModalOpen(!isModalOpen)}
            disabled={!canAddMore}
            whileHover={canAddMore ? { scale: 1.03 } : {}}
            whileTap={canAddMore ? { scale: 0.97 } : {}}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              canAddMore ? 'bg-[#ef4444] text-white hover:bg-[#dc2626]' : 'bg-muted text-muted-foreground cursor-not-allowed'
            }`}
          >
            <Plus className="w-4 h-4" /> Add Chain
          </motion.button>
        </div>
      </div>

      {/* Quick-compare Presets */}
      {presets.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">
          <span className="shrink-0 text-[11px] font-medium tracking-wide text-muted-foreground uppercase mr-1">
            Quick compare
          </span>
          {presets.map(p => {
            const isActive = activePresetId === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => handleApplyPreset(p.chains)}
                disabled={p.chains.length === 0}
                className={`shrink-0 inline-flex items-center h-7 px-3 rounded-full text-[12px] font-semibold tracking-wide transition-colors ${
                  isActive
                    ? 'bg-[#ef4444] text-white shadow-sm shadow-[#ef4444]/20'
                    : 'border border-border bg-card text-muted-foreground hover:text-foreground hover:border-foreground/30'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Chain Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <AnimatePresence mode="popLayout">
          {comparisonChains.map((data, index) => {
            const color = CHAIN_COLORS[index % CHAIN_COLORS.length];
            const stats = chainStats[index];
            return (
              <motion.div
                key={data.chain.chainId}
                layout
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{
                  scale: 1,
                  opacity: hoveredChainId != null && hoveredChainId !== data.chain.chainId ? 0.45 : 1,
                }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 400, damping: 28, delay: index * 0.05 }}
                onMouseEnter={() => setHoveredChainId(data.chain.chainId)}
                onMouseLeave={() => setHoveredChainId(null)}
                className={`bg-card rounded-xl border ${color.border} p-4 flex flex-col gap-3.5 transition-shadow ${
                  hoveredChainId === data.chain.chainId ? 'shadow-lg shadow-black/30' : ''
                }`}
              >
                {/* Card Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {data.chain.chainLogoUri ? (
                      <img
                        src={data.chain.chainLogoUri}
                        alt=""
                        className={`w-6 h-6 rounded-full object-cover bg-muted ring-2 ${color.border} shrink-0`}
                        loading="lazy"
                        onError={(e) => {
                          const img = e.currentTarget;
                          const fallback = img.nextElementSibling as HTMLElement | null;
                          img.style.display = 'none';
                          if (fallback) fallback.style.display = 'flex';
                        }}
                      />
                    ) : null}
                    <div
                      className={`w-6 h-6 rounded-full ${color.bgFaint} ring-2 ${color.border} items-center justify-center shrink-0 ${data.chain.chainLogoUri ? 'hidden' : 'flex'}`}
                    >
                      <span className={`text-[10px] font-bold ${color.text}`}>
                        {data.chain.chainName.slice(0, 1).toUpperCase()}
                      </span>
                    </div>
                    <span className="text-sm font-semibold text-foreground truncate">{data.chain.chainName}</span>
                  </div>
                  <motion.button
                    onClick={() => handleRemoveChain(data.chain.chainId)}
                    whileHover={{ scale: 1.2, rotate: 90 }}
                    whileTap={{ scale: 0.9 }}
                    className="p-0.5 rounded hover:bg-muted transition-colors shrink-0"
                  >
                    <X className="w-3.5 h-3.5 text-muted-foreground" />
                  </motion.button>
                </div>

                {/* Stats */}
                {stats?.loading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Max TPS</span>
                      <span className={`text-xs font-semibold ${stats?.isBestTps ? 'text-green-500' : stats?.isWorstTps ? 'text-red-500' : 'text-foreground'}`}>
                        {stats ? (stats.maxTps < 1 && stats.maxTps > 0 ? '< 1.0' : stats.maxTps.toFixed(2)) : '–'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Validators</span>
                      <span className={`text-xs font-semibold ${stats?.isBestValidators ? 'text-green-500' : stats?.isWorstValidators ? 'text-red-500' : 'text-foreground'}`}>
                        {stats?.validators.toLocaleString() ?? '–'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Daily Tx</span>
                      <span className={`text-xs font-semibold ${stats?.isBestDailyTx ? 'text-green-500' : stats?.isWorstDailyTx ? 'text-red-500' : 'text-foreground'}`}>
                        {stats ? formatCompact(stats.dailyTx) : '–'}
                      </span>
                    </div>
                    <div className="border-t border-border/50 my-1" />
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Fees Burned 🔥</span>
                      {stats?.hasFeeData ? (
                        <span className={`text-xs font-semibold ${stats.isMostFees ? 'text-red-500' : 'text-foreground'}`}>
                          {formatCompact(stats.totalFeesPaid)} AVAX
                        </span>
                      ) : (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              aria-label="Why no fee data?"
                              className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <span>—</span>
                              <Info className="w-3 h-3" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent
                            side="top"
                            align="end"
                            className="max-w-[260px] bg-popover border border-border text-foreground text-[11px] leading-relaxed px-3 py-2 shadow-xl [&>span]:hidden"
                          >
                            This chain is a legacy subnet, not a converted L1. It doesn’t pay continuous validation fees to the P-Chain, so no fee burn is reported. Only chains converted via ACP-77 report this metric.
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </div>
                )}

                {/* Sparkline of selected metric */}
                <div className="-mx-1">
                  {stats?.loading ? (
                    <div className={`h-7 w-full rounded ${color.bgFaint} animate-pulse`} />
                  ) : (
                    <Sparkline
                      values={getMetricSeries(data, selectedMetric)}
                      colorClass={color.text}
                    />
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* Add Chain Placeholder Card(s) — fill remaining slots up to 4 */}
        {Array.from({ length: Math.max(0, 4 - comparisonChains.length) }).map((_, i) => {
          const slotNumber = comparisonChains.length + i + 1;
          const isPrimary = i === 0;
          return (
            <motion.button
              key={`placeholder-${slotNumber}`}
              onClick={() => setIsModalOpen(true)}
              whileHover={{ scale: 1.02, borderColor: 'rgba(113,113,122,0.5)' }}
              whileTap={{ scale: 0.98 }}
              className={`relative rounded-xl border border-dashed p-4 flex flex-col items-center justify-center gap-2 min-h-[140px] transition-all cursor-pointer ${
                isPrimary
                  ? 'border-border hover:bg-muted/30'
                  : 'border-border/50 hover:bg-muted/20'
              }`}
            >
              <span className="absolute top-3 right-3 text-[10px] font-semibold tracking-wider text-muted-foreground/60">
                {slotNumber}
              </span>
              <div
                className={`w-8 h-8 rounded-full border flex items-center justify-center ${
                  isPrimary ? 'border-border' : 'border-border/60'
                }`}
              >
                <Plus className={`w-4 h-4 ${isPrimary ? 'text-muted-foreground' : 'text-muted-foreground/60'}`} />
              </div>
              <span
                className={`text-xs font-medium ${
                  isPrimary ? 'text-muted-foreground' : 'text-muted-foreground/60'
                }`}
              >
                {isPrimary
                  ? comparisonChains.length === 0
                    ? 'Select a chain'
                    : 'Add chain'
                  : 'Empty slot'}
              </span>
            </motion.button>
          );
        })}
      </div>

      {/* Chart Section */}
      <AnimatePresence mode="wait">
        {hasMultipleChains ? (
          <motion.div
            key="chart-section"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.35 }}
            className="bg-card border border-border rounded-xl overflow-hidden"
          >
            {/* Chart Controls Bar */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-5 py-3 border-b border-border">
              <div className="flex flex-wrap gap-1 p-1 bg-muted/50 rounded-lg">
                {COMPARISON_METRICS.map(metric => (
                  <button
                    key={metric.id}
                    onClick={() => handleMetricChange(metric.id)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                      selectedMetric === metric.id
                        ? 'bg-[#ef4444] text-white shadow-sm'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    }`}
                  >
                    {metric.shortName}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <div className="flex gap-1 p-1 bg-muted/50 rounded-lg">
                  {(['absolute', 'normalized'] as const).map(mode => (
                    <button
                      key={mode}
                      onClick={() => setViewMode(mode)}
                      title={mode === 'normalized' ? 'Scale each chain to its own 0–100% range to compare shape, not magnitude' : 'Show raw values'}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all capitalize ${
                        viewMode === mode
                          ? 'bg-secondary text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {mode === 'absolute' ? 'Abs' : 'Norm'}
                    </button>
                  ))}
                </div>
                <div className="flex gap-1 p-1 bg-muted/50 rounded-lg">
                  {([7, 30] as const).map(days => (
                    <button
                      key={days}
                      onClick={() => handleTimeframeChange(days)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                        timeframe === days
                          ? 'bg-secondary text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {days}D
                    </button>
                  ))}
                </div>
                <button
                  onClick={handleCopyShareUrl}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
                >
                  <Share2 className="w-3 h-3" />
                  {copied ? 'Copied!' : 'Share'}
                </button>
              </div>
            </div>

            {/* Chart */}
            <div className="p-4">
              <ComparisonChart
                comparisonChains={comparisonChains}
                metricType={selectedMetric}
                title={currentMetricConfig.name}
                valueLabel={currentMetricConfig.valueLabel}
                hoveredChainId={hoveredChainId}
                onHoverChain={setHoveredChainId}
                viewMode={viewMode}
              />
            </div>
          </motion.div>
        ) : comparisonChains.length > 0 ? (
          <motion.div
            key="empty-state"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-card border border-border rounded-xl p-10 text-center"
          >
            <p className="text-muted-foreground text-sm">Add at least one more chain to see the comparison chart</p>
            <motion.button
              onClick={() => setIsModalOpen(true)}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#ef4444] text-white text-sm font-semibold hover:bg-[#dc2626] transition-all"
            >
              <Plus className="w-4 h-4" /> Add Another Chain
            </motion.button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Chain Selector Modal */}
      <ChainSelector
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        chains={availableChains}
        selectedChainIds={selectedChainIds}
        onSelectChain={handleAddChain}
        maxChains={4}
      />
    </div>
  );
});
