import { memo, useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Chain, DailyTxCount, DailyActiveAddresses, MaxTPSHistory, GasUsedHistory, AvgGasPriceHistory, FeesPaidHistory } from '../../types';
import { Plus, X, Trash2, BarChart3, Share2, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChainSelector } from './ChainSelector';
import { ComparisonMetricsTable } from './ComparisonMetricsTable';
import { ComparisonChart, ComparisonMetricType } from './ComparisonChart';
import { getDailyActiveAddresses, getChainTxCountHistory, getChainMaxTPSHistory, getChainGasUsedHistory, getChainAvgGasPriceHistory, getChainFeesPaidHistory, getChains } from '../../api';
import { LoadingSpinner } from '../LoadingSpinner';

interface ComparisonViewProps {
  currentChain?: Chain;
  availableChains?: Chain[];
}

interface ChainComparisonData {
  chain: Chain;
  dailyActiveAddresses: DailyActiveAddresses[];
  dailyTxCount: DailyTxCount[];
  maxTPS: MaxTPSHistory[];
  gasUsed: GasUsedHistory[];
  avgGasPrice: AvgGasPriceHistory[];
  feesPaid: FeesPaidHistory[];
  loading: boolean;
}

const COMPARISON_METRICS: { id: ComparisonMetricType; name: string; valueLabel: string }[] = [
  { id: 'dailyActiveAddresses', name: 'Daily Active Addresses', valueLabel: 'addresses' },
  { id: 'dailyTxCount', name: 'Daily Transaction Count', valueLabel: 'transactions' },
  { id: 'maxTPS', name: 'Daily Max TPS', valueLabel: 'TPS' },
  { id: 'gasUsed', name: 'Daily Gas Used', valueLabel: 'gas' },
  { id: 'avgGasPrice', name: 'Daily Avg Gas Price', valueLabel: '' },
  { id: 'feesPaid', name: 'Daily Fees Paid', valueLabel: '' },
];

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] } },
};

export const ComparisonView = memo(function ComparisonView({
  currentChain,
  availableChains: providedChains
}: ComparisonViewProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [comparisonChains, setComparisonChains] = useState<ChainComparisonData[]>([]);
  const [availableChains, setAvailableChains] = useState<Chain[]>(providedChains || []);
  const [chainsLoading, setChainsLoading] = useState(!providedChains);
  const [urlInitialized, setUrlInitialized] = useState(false);
  const [copied, setCopied] = useState(false);
  const [metricDropdownOpen, setMetricDropdownOpen] = useState(false);

  // Read selected metric from URL or default
  const metricParam = searchParams.get('metric');
  const selectedMetric: ComparisonMetricType = COMPARISON_METRICS.some(m => m.id === metricParam)
    ? metricParam as ComparisonMetricType
    : 'dailyActiveAddresses';

  // Read timeframe from URL or default to 7
  const timeframeParam = searchParams.get('timeframe');
  const timeframe = (timeframeParam === '30' ? 30 : 7) as 7 | 30;

  // Update URL with current state
  const updateUrl = useCallback((chainIds: string[], newTimeframe?: number, newMetric?: ComparisonMetricType) => {
    const newParams = new URLSearchParams(searchParams);

    if (chainIds.length > 0) {
      newParams.set('compare', chainIds.join(','));
    } else {
      newParams.delete('compare');
    }

    if (newTimeframe) {
      newParams.set('timeframe', String(newTimeframe));
    }

    if (newMetric) {
      newParams.set('metric', newMetric);
    }

    setSearchParams(newParams, { replace: true });
  }, [searchParams, setSearchParams]);

  // Handle timeframe change
  const handleTimeframeChange = useCallback((newTimeframe: 7 | 30) => {
    const chainIds = comparisonChains.map(c => c.chain.chainId);
    updateUrl(chainIds, newTimeframe);
  }, [comparisonChains, updateUrl]);

  // Handle metric change
  const handleMetricChange = useCallback((metric: ComparisonMetricType) => {
    const chainIds = comparisonChains.map(c => c.chain.chainId);
    updateUrl(chainIds, undefined, metric);
    setMetricDropdownOpen(false);
  }, [comparisonChains, updateUrl]);

  // Copy share URL to clipboard
  const handleCopyShareUrl = useCallback(() => {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, []);

  // Fetch available chains if not provided
  useEffect(() => {
    if (providedChains) {
      setAvailableChains(providedChains);
      setChainsLoading(false);
      return;
    }

    async function fetchAvailableChains() {
      setChainsLoading(true);
      try {
        const chains = await getChains();
        const filteredChains = chains.filter(chain =>
          (chain.validatorCount && chain.validatorCount >= 1) ||
          chain.chainName.toLowerCase().includes('avalanche') ||
          chain.chainName.toLowerCase().includes('c-chain')
        );
        const excludedChains = filteredChains.filter(chain => {
          const name = chain.chainName.toLowerCase();
          return !name.includes('x-chain') && !name.includes('p-chain');
        });
        const sortedChains = excludedChains.sort((a, b) => {
          const nameA = a.chainName.toLowerCase();
          const nameB = b.chainName.toLowerCase();
          const isCChainA = nameA.includes('c-chain');
          const isCChainB = nameB.includes('c-chain');
          if (isCChainA && !isCChainB) return -1;
          if (!isCChainA && isCChainB) return 1;
          return a.chainName.localeCompare(b.chainName);
        });
        setAvailableChains(sortedChains);
      } catch (error) {
        console.error('Failed to fetch chains:', error);
      } finally {
        setChainsLoading(false);
      }
    }

    fetchAvailableChains();
  }, [providedChains]);

  // Fetch all 6 metric types for a chain
  const fetchChainData = useCallback(async (chain: Chain, index: number) => {
    try {
      const chainId = chain.originalChainId || chain.chainId;
      const evmChainIdStr = chain.evmChainId ? String(chain.evmChainId) : chainId;

      const [activeAddresses, dailyTx, maxTps, gasUsedData, avgGasPriceData, feesPaidData] = await Promise.all([
        getDailyActiveAddresses(evmChainIdStr, timeframe).catch(() => []),
        getChainTxCountHistory(chainId, timeframe).catch(() => []),
        getChainMaxTPSHistory(chainId, timeframe).catch(() => []),
        getChainGasUsedHistory(chainId, timeframe).catch(() => []),
        getChainAvgGasPriceHistory(chainId, timeframe).catch(() => []),
        getChainFeesPaidHistory(chainId, timeframe).catch(() => [])
      ]);

      setComparisonChains(prev => {
        const updated = [...prev];
        updated[index] = {
          chain,
          dailyActiveAddresses: activeAddresses,
          dailyTxCount: dailyTx,
          maxTPS: maxTps,
          gasUsed: gasUsedData,
          avgGasPrice: avgGasPriceData,
          feesPaid: feesPaidData,
          loading: false
        };
        return updated;
      });
    } catch (error) {
      console.error('Failed to fetch chain data:', error);
      setComparisonChains(prev => {
        const updated = [...prev];
        updated[index] = {
          ...updated[index],
          loading: false
        };
        return updated;
      });
    }
  }, [timeframe]);

  // Initialize comparison chains from URL params after chains are loaded
  useEffect(() => {
    if (chainsLoading || urlInitialized || availableChains.length === 0) return;

    const compareParam = searchParams.get('compare');
    if (compareParam) {
      const chainIds = compareParam.split(',').filter(Boolean).slice(0, 4);
      const initialChains: ChainComparisonData[] = [];

      chainIds.forEach(chainId => {
        const chain = availableChains.find(c => c.chainId === chainId);
        if (chain) {
          initialChains.push({
            chain,
            dailyActiveAddresses: [],
            dailyTxCount: [],
            maxTPS: [],
            gasUsed: [],
            avgGasPrice: [],
            feesPaid: [],
            loading: true
          });
        }
      });

      if (initialChains.length > 0) {
        setComparisonChains(initialChains);
        initialChains.forEach((data, index) => {
          fetchChainData(data.chain, index);
        });
      }
    } else if (currentChain) {
      setComparisonChains([{
        chain: currentChain,
        dailyActiveAddresses: [],
        dailyTxCount: [],
        maxTPS: [],
        gasUsed: [],
        avgGasPrice: [],
        feesPaid: [],
        loading: true
      }]);
      fetchChainData(currentChain, 0);
      updateUrl([currentChain.chainId]);
    }

    setUrlInitialized(true);
  }, [chainsLoading, availableChains, urlInitialized, searchParams, currentChain, fetchChainData, updateUrl]);

  // Track previous timeframe to detect changes
  const prevTimeframeRef = useRef(timeframe);

  // Refetch data when timeframe changes
  useEffect(() => {
    if (prevTimeframeRef.current === timeframe) return;
    prevTimeframeRef.current = timeframe;

    setComparisonChains(prev => {
      if (prev.length === 0) return prev;

      const updated = prev.map(c => ({ ...c, loading: true }));

      prev.forEach((data, index) => {
        fetchChainData(data.chain, index);
      });

      return updated;
    });
  }, [timeframe, fetchChainData]);

  const handleAddChain = (chain: Chain) => {
    if (comparisonChains.length >= 4) return;
    if (comparisonChains.some(c => c.chain.chainId === chain.chainId)) return;

    const newIndex = comparisonChains.length;
    const newChains = [
      ...comparisonChains,
      {
        chain,
        dailyActiveAddresses: [],
        dailyTxCount: [],
        maxTPS: [],
        gasUsed: [],
        avgGasPrice: [],
        feesPaid: [],
        loading: true
      }
    ];
    setComparisonChains(newChains);

    updateUrl(newChains.map(c => c.chain.chainId));

    fetchChainData(chain, newIndex);
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
  const hasAnyChains = comparisonChains.length > 0;

  const currentMetricConfig = COMPARISON_METRICS.find(m => m.id === selectedMetric) || COMPARISON_METRICS[0];

  if (chainsLoading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="bg-card border border-border rounded-xl p-12 flex flex-col items-center justify-center"
      >
        <LoadingSpinner size="lg" />
        <p className="mt-4 text-muted-foreground">Loading chains...</p>
      </motion.div>
    );
  }

  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* Header with Actions */}
      <motion.div variants={fadeUp} className="bg-card border border-border rounded-xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-[#ef4444]" />
              Chain Comparison
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {comparisonChains.length === 0
                ? 'Select chains to compare performance metrics'
                : comparisonChains.length === 1
                ? 'Add more chains to compare'
                : `Comparing ${comparisonChains.length} chains`}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <AnimatePresence>
              {hasAnyChains && (
                <motion.button
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                  onClick={handleClearAll}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                  Clear All
                </motion.button>
              )}
            </AnimatePresence>

            <motion.button
              onClick={() => setIsModalOpen(!isModalOpen)}
              disabled={!canAddMore}
              whileHover={canAddMore ? { scale: 1.05 } : {}}
              whileTap={canAddMore ? { scale: 0.95 } : {}}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                isModalOpen
                  ? 'bg-[#dc2626] text-white'
                  : canAddMore
                  ? 'bg-[#ef4444] text-white hover:bg-[#dc2626]'
                  : 'bg-muted text-muted-foreground cursor-not-allowed'
              }`}
            >
              {isModalOpen ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {isModalOpen ? 'Close' : 'Add Chain'}
            </motion.button>
          </div>
        </div>

        {/* Selected Chains Pills */}
        <AnimatePresence>
          {hasAnyChains && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
              className="overflow-hidden"
            >
              <div className="mt-4 pt-4 border-t border-border">
                <div className="flex flex-wrap gap-2">
                  <AnimatePresence mode="popLayout">
                    {comparisonChains.map((data, index) => (
                      <motion.div
                        key={data.chain.chainId}
                        layout
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0 }}
                        transition={{
                          type: "spring",
                          stiffness: 500,
                          damping: 30,
                          delay: index * 0.05
                        }}
                        className="flex items-center gap-2 px-3 py-2 bg-muted rounded-lg border border-border"
                      >
                        {data.chain.chainLogoUri ? (
                          <img
                            src={data.chain.chainLogoUri}
                            alt={`${data.chain.chainName} logo`}
                            className="w-5 h-5 rounded"
                            onError={(e) => {
                              e.currentTarget.src = "/icon-dark-animated.svg";
                              e.currentTarget.onerror = null;
                            }}
                          />
                        ) : (
                          <img
                            src="/icon-dark-animated.svg"
                            alt={`${data.chain.chainName} logo`}
                            className="w-5 h-5 rounded"
                          />
                        )}
                        <span className="text-sm font-medium text-foreground">
                          {data.chain.chainName}
                        </span>
                        <motion.button
                          onClick={() => handleRemoveChain(data.chain.chainId)}
                          whileHover={{ scale: 1.2, rotate: 90 }}
                          whileTap={{ scale: 0.9 }}
                          className="p-0.5 rounded hover:bg-muted-foreground/20 transition-colors"
                        >
                          <X className="w-4 h-4 text-muted-foreground" />
                        </motion.button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Comparison Content */}
      <AnimatePresence mode="wait">
        {hasMultipleChains ? (
          <motion.div
            key="comparison-content"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
            className="space-y-6"
          >
            {/* Metrics Table */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 }}
            >
              <ComparisonMetricsTable comparisonChains={comparisonChains} />
            </motion.div>

            {/* Controls: Metric Dropdown, Timeframe, Share */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2 }}
              className="flex flex-col sm:flex-row items-center justify-center gap-4"
            >
              {/* Metric Selector Dropdown */}
              <div className="relative">
                <motion.button
                  onClick={() => setMetricDropdownOpen(!metricDropdownOpen)}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="flex items-center gap-2 px-4 py-2 bg-muted rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted/70 transition-all min-w-[220px] justify-between"
                >
                  <span>{currentMetricConfig.name}</span>
                  <motion.div
                    animate={{ rotate: metricDropdownOpen ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  </motion.div>
                </motion.button>

                <AnimatePresence>
                  {metricDropdownOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -8, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -8, scale: 0.96 }}
                      transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
                      className="absolute left-0 mt-2 w-full bg-card border border-border rounded-lg shadow-lg z-20 overflow-hidden"
                    >
                      {COMPARISON_METRICS.map((metric, i) => (
                        <motion.button
                          key={metric.id}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.03 }}
                          onClick={() => handleMetricChange(metric.id)}
                          className={`w-full px-4 py-2.5 text-left text-sm transition-colors first:rounded-t-lg last:rounded-b-lg ${
                            selectedMetric === metric.id
                              ? 'bg-[#ef4444]/10 text-[#ef4444] font-medium'
                              : 'text-foreground hover:bg-muted/30'
                          }`}
                        >
                          {metric.name}
                        </motion.button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Timeframe Selector */}
              <div className="inline-flex items-center gap-1 p-1 bg-muted rounded-lg border border-border">
                {([7, 30] as const).map(days => (
                  <motion.button
                    key={days}
                    onClick={() => handleTimeframeChange(days)}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className={`relative px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                      timeframe === days
                        ? 'text-white'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {timeframe === days && (
                      <motion.div
                        layoutId="timeframe-pill"
                        className="absolute inset-0 bg-[#ef4444] rounded-md"
                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                      />
                    )}
                    <span className="relative z-10">{days} Days</span>
                  </motion.button>
                ))}
              </div>

              <motion.button
                onClick={handleCopyShareUrl}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
              >
                <Share2 className="w-4 h-4" />
                <AnimatePresence mode="wait">
                  <motion.span
                    key={copied ? 'copied' : 'share'}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.15 }}
                  >
                    {copied ? 'Copied!' : 'Share'}
                  </motion.span>
                </AnimatePresence>
              </motion.button>
            </motion.div>

            {/* Single Comparison Chart */}
            <motion.div
              key={selectedMetric}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.3 }}
            >
              <ComparisonChart
                comparisonChains={comparisonChains}
                metricType={selectedMetric}
                title={currentMetricConfig.name}
                valueLabel={currentMetricConfig.valueLabel}
              />
            </motion.div>
          </motion.div>
        ) : (
          <motion.div
            key="empty-state"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
            className="bg-card border border-border rounded-xl p-12 text-center"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1, type: 'spring', stiffness: 300, damping: 20 }}
            >
              <BarChart3 className="w-16 h-16 text-muted-foreground/50 mx-auto mb-4" />
            </motion.div>
            <motion.h3
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-lg font-semibold text-foreground mb-2"
            >
              {comparisonChains.length === 0 ? 'Start Comparing Chains' : 'Add More Chains'}
            </motion.h3>
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="text-sm text-muted-foreground mb-6"
            >
              {comparisonChains.length === 0
                ? 'Select at least 2 chains to compare their performance metrics side-by-side'
                : 'Add at least one more chain to see the comparison'}
            </motion.p>
            <motion.button
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              onClick={() => setIsModalOpen(!isModalOpen)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className={`inline-flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all ${
                isModalOpen
                  ? 'bg-[#dc2626] text-white'
                  : 'bg-[#ef4444] text-white hover:bg-[#dc2626]'
              }`}
            >
              {isModalOpen ? <X className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
              {isModalOpen ? 'Close' : comparisonChains.length === 0 ? 'Select Chains' : 'Add Another Chain'}
            </motion.button>
          </motion.div>
        )}
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
    </motion.div>
  );
});
