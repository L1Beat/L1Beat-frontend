import { memo, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Chain, DailyTxCount, DailyActiveAddresses, MaxTPSHistory, GasUsedHistory, AvgGasPriceHistory, FeesPaidHistory, L1BeatFeeMetrics } from '../../types';
import { Plus, X, Trash2, Share2, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChainSelector } from './ChainSelector';
import { ComparisonChart, ComparisonMetricType } from './ComparisonChart';
import { getDailyActiveAddresses, getChainTxCountHistory, getChainMaxTPSHistory, getChainGasUsedHistory, getChainAvgGasPriceHistory, getChainFeesPaidHistory, getChains, getL1BeatFeeMetrics } from '../../api';
import { LoadingSpinner } from '../LoadingSpinner';

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
    return stats.map(s => ({
      ...s,
      tpsPercent: maxTps > 0 ? (s.maxTps / maxTps) * 100 : 0,
      isBestTps: s.maxTps === maxTps && maxTps > 0,
      isBestValidators: s.validators === maxValidators && maxValidators > 0,
      isBestDailyTx: s.dailyTx === maxDailyTx && maxDailyTx > 0,
      isMostFees: s.totalFeesPaid === maxFees && maxFees > 0,
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
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 400, damping: 28, delay: index * 0.05 }}
                className={`bg-card rounded-xl border ${color.border} p-4 flex flex-col gap-3.5`}
              >
                {/* Card Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-2.5 h-2.5 rounded-full ${color.dot}`} />
                    <span className="text-sm font-semibold text-foreground">{data.chain.chainName}</span>
                  </div>
                  <motion.button
                    onClick={() => handleRemoveChain(data.chain.chainId)}
                    whileHover={{ scale: 1.2, rotate: 90 }}
                    whileTap={{ scale: 0.9 }}
                    className="p-0.5 rounded hover:bg-muted transition-colors"
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
                      <span className={`text-xs font-semibold ${stats?.isBestTps ? 'text-green-500' : 'text-foreground'}`}>
                        {stats ? (stats.maxTps < 1 && stats.maxTps > 0 ? '< 1.0' : stats.maxTps.toFixed(2)) : '–'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Validators</span>
                      <span className={`text-xs font-semibold ${stats?.isBestValidators ? 'text-green-500' : 'text-foreground'}`}>
                        {stats?.validators.toLocaleString() ?? '–'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Daily Tx</span>
                      <span className={`text-xs font-semibold ${stats?.isBestDailyTx ? 'text-green-500' : 'text-foreground'}`}>
                        {stats ? formatCompact(stats.dailyTx) : '–'}
                      </span>
                    </div>
                    {stats?.hasFeeData && (
                      <>
                        <div className="border-t border-border/50 my-1" />
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">Fees Burned 🔥</span>
                          <span className={`text-xs font-semibold ${stats.isMostFees ? 'text-red-500' : 'text-foreground'}`}>
                            {formatCompact(stats.totalFeesPaid)} AVAX
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Activity Bar */}
                <div className={`h-1 w-full rounded-full ${color.barTrack}`}>
                  <motion.div
                    className={`h-full rounded-full ${color.bg}`}
                    initial={{ width: 0 }}
                    animate={{ width: `${stats?.tpsPercent ?? 0}%` }}
                    transition={{ duration: 0.6, ease: 'easeOut', delay: 0.2 }}
                  />
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* Add Chain Placeholder Card(s) */}
        {canAddMore && (
          <motion.button
            onClick={() => setIsModalOpen(true)}
            whileHover={{ scale: 1.02, borderColor: 'rgba(113,113,122,0.5)' }}
            whileTap={{ scale: 0.98 }}
            className="rounded-xl border border-dashed border-border p-4 flex flex-col items-center justify-center gap-2 min-h-[140px] hover:bg-muted/30 transition-all cursor-pointer"
          >
            <div className="w-8 h-8 rounded-full border border-border flex items-center justify-center">
              <Plus className="w-4 h-4 text-muted-foreground" />
            </div>
            <span className="text-xs font-medium text-muted-foreground">
              {comparisonChains.length === 0 ? 'Select a chain' : `Add ${4 - comparisonChains.length === 1 ? 'last' : ''} chain`}
            </span>
          </motion.button>
        )}
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
