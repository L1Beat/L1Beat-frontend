import { memo, useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Chain, TPSHistory, CumulativeTxCount, DailyTxCount } from '../../types';
import { Plus, X, Trash2, BarChart3, Share2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChainSelector } from './ChainSelector';
import { ComparisonMetricsTable } from './ComparisonMetricsTable';
import { ComparisonChart } from './ComparisonChart';
import { getTPSHistory, getCumulativeTxCount, getChainTxCountHistory, getChains } from '../../api';
import { LoadingSpinner } from '../LoadingSpinner';

interface ComparisonViewProps {
  currentChain?: Chain;
  availableChains?: Chain[];
}

interface ChainComparisonData {
  chain: Chain;
  tpsHistory: TPSHistory[];
  cumulativeTx: CumulativeTxCount[];
  dailyTxCount: DailyTxCount[];
  loading: boolean;
}

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

  // Read timeframe from URL or default to 7
  const timeframeParam = searchParams.get('timeframe');
  const timeframe = (timeframeParam === '30' ? 30 : 7) as 7 | 30;

  // Update URL with current state
  const updateUrl = useCallback((chainIds: string[], newTimeframe?: number) => {
    const newParams = new URLSearchParams(searchParams);

    if (chainIds.length > 0) {
      newParams.set('compare', chainIds.join(','));
    } else {
      newParams.delete('compare');
    }

    if (newTimeframe) {
      newParams.set('timeframe', String(newTimeframe));
    }

    setSearchParams(newParams, { replace: true });
  }, [searchParams, setSearchParams]);

  // Handle timeframe change
  const handleTimeframeChange = useCallback((newTimeframe: 7 | 30) => {
    const chainIds = comparisonChains.map(c => c.chain.chainId);
    updateUrl(chainIds, newTimeframe);
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
        // Filter to show chains with validators or Avalanche chains
        const filteredChains = chains.filter(chain =>
          (chain.validatorCount && chain.validatorCount >= 1) ||
          chain.chainName.toLowerCase().includes('avalanche') ||
          chain.chainName.toLowerCase().includes('c-chain')
        );
        // Exclude X-Chain and P-Chain
        const excludedChains = filteredChains.filter(chain => {
          const name = chain.chainName.toLowerCase();
          return !name.includes('x-chain') && !name.includes('p-chain');
        });
        // Sort: C-Chain first, then alphabetically
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

  // Define fetchChainData before using it in useEffects
  const fetchChainData = useCallback(async (chain: Chain, index: number) => {
    try {
      const chainId = chain.originalChainId || chain.chainId;
      const [tpsData, txData, dailyTxData] = await Promise.all([
        getTPSHistory(timeframe, chainId).catch(() => []),
        getCumulativeTxCount(chainId, timeframe).catch(() => []),
        getChainTxCountHistory(chainId, timeframe).catch(() => [])
      ]);

      setComparisonChains(prev => {
        const updated = [...prev];
        updated[index] = {
          chain,
          tpsHistory: tpsData,
          cumulativeTx: txData,
          dailyTxCount: dailyTxData,
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
            tpsHistory: [],
            cumulativeTx: [],
            dailyTxCount: [],
            loading: true
          });
        }
      });

      if (initialChains.length > 0) {
        setComparisonChains(initialChains);
        // Fetch data for each chain
        initialChains.forEach((data, index) => {
          fetchChainData(data.chain, index);
        });
      }
    } else if (currentChain) {
      // No URL params, use currentChain if provided
      setComparisonChains([{
        chain: currentChain,
        tpsHistory: [],
        cumulativeTx: [],
        dailyTxCount: [],
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
    // Skip if timeframe hasn't actually changed
    if (prevTimeframeRef.current === timeframe) return;
    prevTimeframeRef.current = timeframe;

    // Use functional update to get current chains without dependency
    setComparisonChains(prev => {
      if (prev.length === 0) return prev;

      // Set all to loading
      const updated = prev.map(c => ({ ...c, loading: true }));

      // Refetch data for each chain
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
        tpsHistory: [],
        cumulativeTx: [],
        dailyTxCount: [],
        loading: true
      }
    ];
    setComparisonChains(newChains);

    // Update URL with new chain
    updateUrl(newChains.map(c => c.chain.chainId));

    fetchChainData(chain, newIndex);
    setIsModalOpen(false);
  };

  const handleRemoveChain = (chainId: string) => {
    const newChains = comparisonChains.filter(c => c.chain.chainId !== chainId);
    setComparisonChains(newChains);

    // Update URL
    updateUrl(newChains.map(c => c.chain.chainId));
  };

  const handleClearAll = () => {
    setComparisonChains([]);
    // Clear URL params
    updateUrl([]);
  };

  const selectedChainIds = comparisonChains.map(c => c.chain.chainId);
  const canAddMore = comparisonChains.length < 4;
  const hasMultipleChains = comparisonChains.length >= 2;
  const hasAnyChains = comparisonChains.length > 0;

  if (chainsLoading) {
    return (
      <div className="bg-card border border-border rounded-xl p-12 flex flex-col items-center justify-center">
        <LoadingSpinner size="lg" />
        <p className="mt-4 text-muted-foreground">Loading chains...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Actions */}
      <div className="bg-card border border-border rounded-xl p-6">
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
            {hasAnyChains && (
              <motion.button
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                onClick={handleClearAll}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-all"
              >
                <Trash2 className="w-4 h-4" />
                Clear All
              </motion.button>
            )}

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
        {hasAnyChains && (
          <div className="mt-4 pt-4 border-t border-border">
            <div className="flex flex-wrap gap-2">
              <AnimatePresence mode="popLayout">
                {comparisonChains.map((data, index) => (
                  <motion.div
                    key={data.chain.chainId}
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
        )}
      </div>

      {/* Comparison Content */}
      {hasMultipleChains ? (
        <div className="space-y-6">
          {/* Metrics Table */}
          <ComparisonMetricsTable comparisonChains={comparisonChains} />

          {/* Timeframe Selector and Share Button */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <div className="inline-flex items-center gap-2 p-1 bg-muted rounded-lg border border-border">
              <button
                onClick={() => handleTimeframeChange(7)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  timeframe === 7
                    ? 'bg-[#ef4444] text-white'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                7 Days
              </button>
              <button
                onClick={() => handleTimeframeChange(30)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  timeframe === 30
                    ? 'bg-[#ef4444] text-white'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                30 Days
              </button>
            </div>

            <motion.button
              onClick={handleCopyShareUrl}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
            >
              <Share2 className="w-4 h-4" />
              {copied ? 'Copied!' : 'Share'}
            </motion.button>
          </div>

          {/* TPS Chart */}
          <ComparisonChart
            comparisonChains={comparisonChains}
            metricType="tps"
            title="TPS Comparison"
            valueLabel="TPS"
          />

          {/* Daily Transactions Chart */}
          <ComparisonChart
            comparisonChains={comparisonChains}
            metricType="dailyTransactions"
            title="Daily Transactions"
            valueLabel="Transactions"
          />
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <BarChart3 className="w-16 h-16 text-muted-foreground/50 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">
            {comparisonChains.length === 0 ? 'Start Comparing Chains' : 'Add More Chains'}
          </h3>
          <p className="text-sm text-muted-foreground mb-6">
            {comparisonChains.length === 0
              ? 'Select at least 2 chains to compare their performance metrics side-by-side'
              : 'Add at least one more chain to see the comparison'}
          </p>
          <motion.button
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
        </div>
      )}

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
