import React, { useEffect, useState } from 'react';
import { getAllChainsTPSLatest, getChains, getCategories, getTeleporterMessages, getL1BeatFeeMetrics } from '../api';
import { Chain, TeleporterMessageData } from '../types';
import { ChainCard } from '../components/ChainCard';
import { ChainListView } from '../components/ChainListView';
import { ChainTableView } from '../components/ChainTableView';
import { TVLChart } from '../components/TVLChart';
import { L1MetricsChart } from '../components/L1MetricsChart';
import { TeleporterSankeyDiagram } from '../components/TeleporterSankeyDiagram';
import { NetworkTopologyGraph } from '../components/NetworkTopologyGraph';
import { NetworkMetricsBar } from '../components/NetworkMetricsBar';
import { Footer } from '../components/Footer';
import { FilterModal } from '../components/FilterModal';
import { LoadingSpinner, LoadingPage } from '../components/LoadingSpinner';
import { LayoutGrid, Activity, Network, Filter, Search, Table } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function Dashboard() {
  const [chains, setChains] = useState<Chain[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefetching, setIsRefetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [currentPage, setCurrentPage] = useState(1);
  const CHAINS_PER_PAGE = 20;
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [categories, setCategories] = useState<string[]>([]);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [showChainsWithoutValidators, setShowChainsWithoutValidators] = useState(false);
  const [icmMessageCounts, setIcmMessageCounts] = useState<Record<string, number>>({});
  const [validatorCountBySubnet, setValidatorCountBySubnet] = useState<Record<string, number>>({});
  const [feesBySubnet, setFeesBySubnet] = useState<Record<string, number>>({});

  async function fetchData() {
    try {
      // Only show full-page loader on initial load, use subtle indicator for refetches
      if (chains.length === 0) {
        setLoading(true);
      } else {
        setIsRefetching(true);
      }
      setError(null);

      // Build filter object
      const filters: { category?: string } = {};
      if (selectedCategory) filters.category = selectedCategory;

      const [chainsData, categoriesData, tpsMap, teleporterData, feeData] = await Promise.all([
        getChains(filters),
        getCategories(),
        getAllChainsTPSLatest(),
        getTeleporterMessages(),
        getL1BeatFeeMetrics()
      ]);

      // Calculate ICM message counts per chain
      const icmCounts: Record<string, number> = {};
      if (teleporterData && teleporterData.messages) {
        teleporterData.messages.forEach((msg) => {
          // Add to source chain count
          icmCounts[msg.source] = (icmCounts[msg.source] || 0) + msg.value;
          // Add to target chain count
          icmCounts[msg.target] = (icmCounts[msg.target] || 0) + msg.value;
        });
      }
      setIcmMessageCounts(icmCounts);

      // Build validator count and fee maps from fee metrics (validator_count is included per subnet)
      const validatorCounts: Record<string, number> = {};
      const feesMap: Record<string, number> = {};
      feeData.forEach((f) => {
        validatorCounts[f.subnet_id] = f.validator_count;
        feesMap[f.subnet_id] = f.total_fees_paid;
      });
      setValidatorCountBySubnet(validatorCounts);
      setFeesBySubnet(feesMap);

      // Merge latest TPS from bulk endpoint (backend no longer includes tps on /chains)
      const chainsWithLatestTps = chainsData.map((chain) => {
        const lookupId =
          (chain.evmChainId ? String(chain.evmChainId) : undefined) ||
          chain.originalChainId ||
          chain.chainId;

        const latest = lookupId ? tpsMap[lookupId] : undefined;
        if (!latest) return chain;

        return {
          ...chain,
          tps: {
            value: Number(latest.value),
            timestamp: Number(latest.timestamp)
          }
        };
      });

      // Permanently exclude X-Chain and P-Chain
      const excludedChains = chainsWithLatestTps.filter(chain => {
        const name = chain.chainName.toLowerCase();
        return !name.includes('x-chain') && !name.includes('p-chain');
      });

      // Apply validator filter
      let filteredChains = excludedChains;

      if (!showChainsWithoutValidators) {
        // Default behavior: only show chains with validators or Avalanche primary chains
        filteredChains = filteredChains.filter(chain => {
          const subnetValidators = chain.subnetId ? validatorCounts[chain.subnetId] : undefined;
          return (
            (subnetValidators !== undefined && subnetValidators >= 1) ||
            (chain.validatorCount && chain.validatorCount >= 1) ||
            chain.chainName.toLowerCase().includes('avalanche') ||
            chain.chainName.toLowerCase().includes('c-chain')
          );
        });
      }
      // If showChainsWithoutValidators is true, include all chains (no validator filter)

      // Sort chains: C-Chain first, then alphabetically
      const sortedChains = filteredChains.sort((a, b) => {
        const nameA = a.chainName.toLowerCase();
        const nameB = b.chainName.toLowerCase();

        const isCChainA = nameA.includes('c-chain');
        const isCChainB = nameB.includes('c-chain');

        // C-Chain first
        if (isCChainA && !isCChainB) return -1;
        if (!isCChainA && isCChainB) return 1;

        // Rest alphabetically
        return a.chainName.localeCompare(b.chainName);
      });

      setChains(sortedChains);
      setCategories(categoriesData);
      setError(null);
    } catch (err) {
      setError('Unable to connect to the server. Please try again later.');
    } finally {
      setLoading(false);
      setIsRefetching(false);
      setRetrying(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, [selectedCategory, showChainsWithoutValidators]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedCategory, showChainsWithoutValidators, viewMode]);

  useEffect(() => {
    // Restore scroll position when returning from chain details
    const savedScrollPosition = sessionStorage.getItem('dashboardScrollPosition');
    if (savedScrollPosition && !loading) {
      const scrollY = parseInt(savedScrollPosition, 10);
      // Use setTimeout to ensure DOM is fully rendered
      setTimeout(() => {
        window.scrollTo(0, scrollY);
        // Clear the saved position after restoring
        sessionStorage.removeItem('dashboardScrollPosition');
      }, 0);
    }
  }, [loading]);

  // Filter chains based on search term
  const filteredChains = chains.filter(chain =>
    chain.chainName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    chain.chainId.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPages = Math.ceil(filteredChains.length / CHAINS_PER_PAGE);
  const paginatedChains = filteredChains.slice(
    (currentPage - 1) * CHAINS_PER_PAGE,
    currentPage * CHAINS_PER_PAGE
  );

  if (loading) {
    return <LoadingPage />;
  }

  if (error) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="min-h-screen bg-background flex items-center justify-center p-4"
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="bg-card border border-border rounded-lg p-6 max-w-md w-full"
        >
          <div className="text-center">
            <Activity className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Connection Error</h2>
            <p className="text-gray-600 dark:text-gray-300 mb-6">{error}</p>
            <motion.button
              onClick={() => {
                setRetrying(true);
                fetchData();
              }}
              disabled={retrying}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-[#ef4444] hover:bg-[#dc2626] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#ef4444] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {retrying ? (
                <>
                  <Activity className="animate-spin -ml-1 mr-2 h-4 w-4" />
                  Retrying...
                </>
              ) : (
                <>
                  <Activity className="-ml-1 mr-2 h-4 w-4" />
                  Retry Connection
                </>
              )}
            </motion.button>
          </div>
        </motion.div>
      </motion.div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 lg:py-12">
        <NetworkMetricsBar />
        
        <div className="mb-6 sm:mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Network className="w-4 h-4 sm:w-5 sm:h-5 text-[#ef4444] dark:text-[#ef4444]" />
            <h2 className="text-lg sm:text-xl font-semibold">
              Avalanche Interchain Messaging
            </h2>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            <NetworkTopologyGraph />
            <TeleporterSankeyDiagram />
          </div>
        </div>

        <div className="mb-6 sm:mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
            <div className="flex items-center gap-2">
              <LayoutGrid className="w-4 h-4 sm:w-5 sm:h-5 text-[#ef4444] dark:text-[#ef4444]" />
              <h2 className="text-lg sm:text-xl font-semibold">
                Active Chains
              </h2>
              <AnimatePresence>
                {isRefetching && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.2 }}
                  >
                    <LoadingSpinner size="sm" />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
              {/* View Toggle Buttons */}
              <div className="flex items-center gap-1 border border-border rounded-lg p-1 bg-card w-fit">
                <motion.button
                  onClick={() => setViewMode('grid')}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className={`p-2 rounded transition-all ${
                    viewMode === 'grid'
                      ? 'bg-[#ef4444] text-white'
                      : 'text-muted-foreground hover:bg-muted'
                  }`}
                  title="Grid View"
                >
                  <LayoutGrid className="w-4 h-4" />
                </motion.button>
                <motion.button
                  onClick={() => setViewMode('table')}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className={`p-2 rounded transition-all ${
                    viewMode === 'table'
                      ? 'bg-[#ef4444] text-white'
                      : 'text-muted-foreground hover:bg-muted'
                  }`}
                  title="Table View"
                >
                  <Table className="w-4 h-4" />
                </motion.button>
              </div>

              {/* Compact Search Bar */}
              <div className="relative group flex-1 sm:flex-initial">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-muted-foreground group-focus-within:text-[#ef4444] transition-colors" />
                </div>
                <input
                  type="text"
                  placeholder="Search chains..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="block w-full sm:w-64 pl-10 pr-4 py-2.5 border border-border rounded-lg text-sm bg-muted text-foreground placeholder-muted-foreground transition-all focus:outline-none focus:ring-2 focus:ring-[#ef4444]/20 focus:border-[#ef4444] focus:bg-background"
                />
              </div>

              {/* Filter Button */}
              <motion.button
                onClick={() => setIsFilterModalOpen(true)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={`flex items-center justify-center gap-2 px-4 py-2.5 border rounded-lg text-sm font-medium transition-all ${
                  (selectedCategory || showChainsWithoutValidators)
                    ? 'bg-[#ef4444]/10 border-[#ef4444]/20 text-[#ef4444]'
                    : 'bg-card border-border text-foreground hover:bg-muted'
                }`}
              >
                <Filter className="w-4 h-4" />
                <span>Filters</span>
                <AnimatePresence>
                  {(selectedCategory || showChainsWithoutValidators) && (
                    <motion.span
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="ml-1 px-2 py-0.5 text-xs font-bold bg-[#ef4444] text-white rounded-full"
                    >
                      {[selectedCategory, showChainsWithoutValidators].filter(Boolean).length}
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>
            </div>
          </div>

          <AnimatePresence mode="wait">
            {filteredChains.length === 0 ? (
              <motion.div
                key="no-results"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="text-center py-12"
              >
                <p className="text-muted-foreground">
                  No chains found matching "{searchTerm}"
                </p>
              </motion.div>
            ) : (
              <motion.div
                key={`${viewMode}-${selectedCategory}-${searchTerm}-${currentPage}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
              >
                {viewMode === 'table' ? (
                  <ChainTableView chains={paginatedChains} icmMessageCounts={icmMessageCounts} validatorCountBySubnet={validatorCountBySubnet} feesBySubnet={feesBySubnet} />
                ) : (
                  <ChainListView chains={filteredChains} validatorCountBySubnet={validatorCountBySubnet} />
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {viewMode === 'table' && totalPages > 1 && (
            <div className="flex items-center justify-between mt-6">
              <span className="text-sm text-muted-foreground">
                {(currentPage - 1) * CHAINS_PER_PAGE + 1}–{Math.min(currentPage * CHAINS_PER_PAGE, filteredChains.length)} of {filteredChains.length} chains
              </span>
              <div className="flex items-center gap-1">
                <motion.button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="px-3 py-1.5 text-sm border border-border rounded-lg bg-card text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Prev
                </motion.button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(page => page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1)
                  .reduce<(number | 'ellipsis')[]>((acc, page, idx, arr) => {
                    if (idx > 0 && page - (arr[idx - 1] as number) > 1) acc.push('ellipsis');
                    acc.push(page);
                    return acc;
                  }, [])
                  .map((item, idx) =>
                    item === 'ellipsis' ? (
                      <span key={`ellipsis-${idx}`} className="px-2 text-muted-foreground text-sm select-none">…</span>
                    ) : (
                      <motion.button
                        key={item}
                        onClick={() => setCurrentPage(item as number)}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className={`px-3 py-1.5 text-sm border rounded-lg transition-colors ${
                          currentPage === item
                            ? 'bg-[#ef4444] border-[#ef4444] text-white'
                            : 'border-border bg-card text-foreground hover:bg-muted'
                        }`}
                      >
                        {item}
                      </motion.button>
                    )
                  )}
                <motion.button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="px-3 py-1.5 text-sm border border-border rounded-lg bg-card text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </motion.button>
              </div>
            </div>
          )}
        </div>
      </main>

      <Footer />

      <FilterModal
        isOpen={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        selectedCategory={selectedCategory}
        onCategoryChange={setSelectedCategory}
        categories={categories}
        showChainsWithoutValidators={showChainsWithoutValidators}
        onShowChainsWithoutValidatorsChange={setShowChainsWithoutValidators}
      />
    </div>
  );
}