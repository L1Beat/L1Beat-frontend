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
import { Footer } from '../components/Footer';
import { FilterModal } from '../components/FilterModal';
import { LayoutGrid, Activity, Network, Filter } from 'lucide-react';
import { AvalancheNetworkMetrics } from '../components/TeleporterDailyChart';
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
  const [minTPS, setMinTPS] = useState<number | ''>('');
  const [maxTPS, setMaxTPS] = useState<number | ''>('');

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

      // Apply validator filter
      let filteredChains = chainsData;

      if (!showChainsWithoutValidators) {
        // Default behavior: only show chains with validators or Avalanche primary chains
        filteredChains = filteredChains.filter(chain =>
          (chain.validators && chain.validators.length >= 1) ||
          chain.chainName.toLowerCase().includes('avalanche') ||
          chain.chainName.toLowerCase().includes('c-chain') ||
          chain.chainName.toLowerCase().includes('x-chain') ||
          chain.chainName.toLowerCase().includes('p-chain')
        );
      }
      // If showChainsWithoutValidators is true, include all chains (no validator filter)

      // Apply TPS filter
      if (minTPS !== '' || maxTPS !== '') {
        filteredChains = filteredChains.filter(chain => {
          const tps = chain.tps?.value || 0;
          const meetsMin = minTPS === '' || tps >= minTPS;
          const meetsMax = maxTPS === '' || tps <= maxTPS;
          return meetsMin && meetsMax;
        });
      }

      // Sort chains: C-Chain, X-Chain, P-Chain first, then alphabetically
      const sortedChains = filteredChains.sort((a, b) => {
        const nameA = a.chainName.toLowerCase();
        const nameB = b.chainName.toLowerCase();

        const isCChainA = nameA.includes('c-chain');
        const isCChainB = nameB.includes('c-chain');
        const isXChainA = nameA.includes('x-chain');
        const isXChainB = nameB.includes('x-chain');
        const isPChainA = nameA.includes('p-chain');
        const isPChainB = nameB.includes('p-chain');

        // C-Chain first
        if (isCChainA && !isCChainB) return -1;
        if (!isCChainA && isCChainB) return 1;

        // X-Chain second
        if (isXChainA && !isXChainB) return -1;
        if (!isXChainA && isXChainB) return 1;

        // P-Chain third
        if (isPChainA && !isPChainB) return -1;
        if (!isPChainA && isPChainB) return 1;

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
  }, [selectedCategory, showChainsWithoutValidators, minTPS, maxTPS]);

  useEffect(() => {
    // Refresh health status every 5 minutes (increased from 1 minute)
    const healthInterval = setInterval(() => {
      getHealth().then(setHealth).catch(console.error);
    }, 5 * 60 * 1000);

    return () => clearInterval(healthInterval);
  }, []);

  // Filter chains based on search term
  const filteredChains = chains.filter(chain =>
    chain.chainName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    chain.chainId.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center"
      >
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="rounded-full h-12 w-12 border-b-2 border-blue-500"
        />
      </motion.div>
    );
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
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
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
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
      <StatusBar health={health} />
      
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Network className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Avalanche Interchain Messaging
            </h2>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <NetworkTopologyGraph />
            <TeleporterSankeyDiagram />
          </div>
        </div>

        <div className="mb-8">
          <AvalancheNetworkMetrics />
        </div>

        <div className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div className="flex items-center gap-2">
              <LayoutGrid className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Active Chains
              </h2>
              <AnimatePresence>
                {isRefetching && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.2 }}
                    className="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent"
                  />
                )}
              </AnimatePresence>
            </div>

            <motion.button
              onClick={() => setIsFilterModalOpen(true)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <Filter className="w-4 h-4" />
              <span className="text-sm font-medium">Filters</span>
              <AnimatePresence>
                {(searchTerm || selectedCategory || showChainsWithoutValidators || minTPS !== '' || maxTPS !== '') && (
                  <motion.span
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="ml-1 px-2 py-0.5 text-xs font-semibold bg-blue-600 text-white rounded-full"
                  >
                    {[searchTerm, selectedCategory, showChainsWithoutValidators, minTPS !== '' ? 'min' : '', maxTPS !== '' ? 'max' : ''].filter(Boolean).length}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
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
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        selectedCategory={selectedCategory}
        onCategoryChange={setSelectedCategory}
        categories={categories}
        showChainsWithoutValidators={showChainsWithoutValidators}
        onShowChainsWithoutValidatorsChange={setShowChainsWithoutValidators}
        minTPS={minTPS}
        onMinTPSChange={setMinTPS}
        maxTPS={maxTPS}
        onMaxTPSChange={setMaxTPS}
      />
    </div>
  );
}