import React, { useEffect, useState } from 'react';
import { getChains, getHealth, getCategories } from '../api';
import { Chain, HealthStatus } from '../types';
import { ChainCard } from '../components/ChainCard';
import { ChainListView } from '../components/ChainListView';
import { StatusBar } from '../components/StatusBar';
import { TVLChart } from '../components/TVLChart';
import { L1MetricsChart } from '../components/L1MetricsChart';
import { TeleporterSankeyDiagram } from '../components/TeleporterSankeyDiagram';
import { NetworkTopologyGraph } from '../components/NetworkTopologyGraph';
import { NetworkMetricsBar } from '../components/NetworkMetricsBar';
import { Footer } from '../components/Footer';
import { FilterModal } from '../components/FilterModal';
import { LoadingSpinner, LoadingPage } from '../components/LoadingSpinner';
import { LayoutGrid, Activity, Network, Filter, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function Dashboard() {
  const [chains, setChains] = useState<Chain[]>([]);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefetching, setIsRefetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [categories, setCategories] = useState<string[]>([]);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [showChainsWithoutValidators, setShowChainsWithoutValidators] = useState(false);

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

      const [chainsData, healthData, categoriesData] = await Promise.all([
        getChains(filters),
        getHealth(),
        getCategories()
      ]);

      // Permanently exclude X-Chain and P-Chain
      const excludedChains = chainsData.filter(chain => {
        const name = chain.chainName.toLowerCase();
        return !name.includes('x-chain') && !name.includes('p-chain');
      });

      // Apply validator filter
      let filteredChains = excludedChains;

      if (!showChainsWithoutValidators) {
        // Default behavior: only show chains with validators or Avalanche primary chains
        filteredChains = filteredChains.filter(chain =>
          (chain.validatorCount && chain.validatorCount >= 1) ||
          chain.chainName.toLowerCase().includes('avalanche') ||
          chain.chainName.toLowerCase().includes('c-chain')
        );
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
      setHealth(healthData);
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
    // Refresh health status every 5 minutes (increased from 1 minute)
    const healthInterval = setInterval(() => {
      getHealth().then(setHealth).catch(console.error);
    }, 5 * 60 * 1000);

    return () => clearInterval(healthInterval);
  }, []);

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

  if (loading) {
    return <LoadingPage />;
  }

  if (error) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4"
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 max-w-md w-full"
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
      <StatusBar health={health} />
      
      <main className="max-w-7xl mx-auto px-6 py-12">
        <NetworkMetricsBar />
        
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Network className="w-5 h-5 text-[#ef4444] dark:text-[#ef4444]" />
            <h2 className="text-xl font-semibold">
              Avalanche Interchain Messaging
            </h2>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <NetworkTopologyGraph />
            <TeleporterSankeyDiagram />
          </div>
        </div>

        <div className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div className="flex items-center gap-2">
              <LayoutGrid className="w-5 h-5 text-[#ef4444] dark:text-[#ef4444]" />
              <h2 className="text-xl font-semibold">
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

            <div className="flex items-center gap-3">
              {/* Compact Search Bar */}
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-gray-400 group-focus-within:text-[#ef4444] transition-colors" />
                </div>
                <input
                  type="text"
                  placeholder="Search chains..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="block w-64 pl-10 pr-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-gray-50 dark:bg-dark-800/50 text-gray-900 dark:text-white placeholder-gray-500 transition-all focus:outline-none focus:ring-2 focus:ring-[#ef4444]/20 focus:border-[#ef4444] focus:bg-white dark:focus:bg-dark-800"
                />
              </div>

              {/* Filter Button */}
              <motion.button
                onClick={() => setIsFilterModalOpen(true)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={`flex items-center gap-2 px-4 py-2.5 border rounded-lg text-sm font-medium transition-all ${
                  (selectedCategory || showChainsWithoutValidators)
                    ? 'bg-[#ef4444]/10 border-[#ef4444]/20 text-[#ef4444]'
                    : 'bg-white dark:bg-dark-800/50 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-800 hover:border-gray-300 dark:hover:border-gray-600'
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
                <p className="text-gray-500 dark:text-gray-400">
                  No chains found matching "{searchTerm}"
                </p>
              </motion.div>
            ) : (
              <motion.div
                key={`${viewMode}-${selectedCategory}-${searchTerm}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
              >
                {viewMode === 'list' ? (
                  <motion.div
                    className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
                    initial="hidden"
                    animate="visible"
                    variants={{
                      visible: {
                        transition: {
                          staggerChildren: 0.03
                        }
                      }
                    }}
                  >
                    {filteredChains.map((chain) => (
                      <motion.div
                        key={chain.chainId}
                        variants={{
                          hidden: { opacity: 0, y: 20 },
                          visible: { opacity: 1, y: 0 }
                        }}
                        transition={{ duration: 0.3, ease: "easeOut" }}
                      >
                        <ChainCard chain={chain} />
                      </motion.div>
                    ))}
                  </motion.div>
                ) : (
                  <ChainListView chains={filteredChains} />
                )}
              </motion.div>
            )}
          </AnimatePresence>
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