import React, { useEffect, useState } from 'react';
import { getChains, getHealth } from '../api';
import { Chain, HealthStatus } from '../types';
import { ChainCard } from '../components/ChainCard';
import { ChainListView } from '../components/ChainListView';
import { StatusBar } from '../components/StatusBar';
import { TVLChart } from '../components/TVLChart';
import { L1MetricsChart } from '../components/L1MetricsChart';
import { TeleporterSankeyDiagram } from '../components/TeleporterSankeyDiagram';
import { NetworkTopologyGraph } from '../components/NetworkTopologyGraph';
import { Footer } from '../components/Footer';
import { LayoutGrid, Activity, Network, Search, Grid, List } from 'lucide-react';
import { TeleporterDailyChart } from '../components/TeleporterDailyChart';

export function Dashboard() {
  const [chains, setChains] = useState<Chain[]>([]);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  async function fetchData() {
    try {
      setLoading(true);
      setError(null);
      const [chainsData, healthData] = await Promise.all([
        getChains(),
        getHealth()
      ]);
      
      // Filter chains with at least 1 validator, but always include Avalanche chains
      const filteredChains = chainsData.filter(chain => 
        // Include chains with validators
        (chain.validators && chain.validators.length >= 1) ||
        // OR include any Avalanche chain regardless of validators
        chain.chainName.toLowerCase().includes('avalanche') ||
        chain.chainName.toLowerCase().includes('c-chain')
      );

      // Sort chains: C-Chain first, then alphabetically
      const sortedChains = filteredChains.sort((a, b) => {
        const isAvalancheA = a.chainName.toLowerCase().includes('c-chain');
        const isAvalancheB = b.chainName.toLowerCase().includes('c-chain');

        if (isAvalancheA && !isAvalancheB) return -1;
        if (!isAvalancheA && isAvalancheB) return 1;
        return a.chainName.localeCompare(b.chainName);
      });
      
      setChains(sortedChains);
      setHealth(healthData);
      setError(null);
    } catch (err) {
      setError('Unable to connect to the server. Please try again later.');
    } finally {
      setLoading(false);
      setRetrying(false);
    }
  }

  useEffect(() => {
    fetchData();
    
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
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 max-w-md w-full">
          <div className="text-center">
            <Activity className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Connection Error</h2>
            <p className="text-gray-600 dark:text-gray-300 mb-6">{error}</p>
            <button
              onClick={() => {
                setRetrying(true);
                fetchData();
              }}
              disabled={retrying}
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
            </button>
          </div>
        </div>
      </div>
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
          <TeleporterDailyChart />
        </div>

        <div className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div className="flex items-center gap-2">
              <LayoutGrid className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Active Chains
              </h2>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  setViewMode(viewMode === 'grid' ? 'list' : 'grid');
                }}
                className="relative flex items-center bg-gray-100 dark:bg-dark-700 rounded-lg p-1 transition-all duration-200 overflow-hidden group"
                title={`Switch to ${viewMode === 'grid' ? 'list' : 'grid'} view`}
              >
                {/* Sliding background indicator */}
                <div 
                  className={`absolute top-1 bottom-1 w-8 bg-white dark:bg-dark-600 rounded shadow-sm transition-all duration-300 ease-out ${
                    viewMode === 'grid' ? 'left-1' : 'left-9'
                  }`}
                />
                
                {/* Grid icon */}
                <div className={`relative z-10 p-2 rounded transition-all duration-200 ${
                  viewMode === 'grid'
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-gray-600 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-300'
                }`}>
                  <Grid className="w-4 h-4" />
                </div>
                
                {/* List icon */}
                <div className={`relative z-10 p-2 rounded transition-all duration-200 ${
                  viewMode === 'list'
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-gray-600 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-300'
                }`}>
                  <List className="w-4 h-4" />
                </div>
              </button>
              
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="text"
                  placeholder="Search chains by name or ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg leading-5 bg-white dark:bg-dark-800 text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
              </div>
            </div>
          </div>

          {filteredChains.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 dark:text-gray-400">
                No chains found matching "{searchTerm}"
              </p>
            </div>
          ) : (
            <div key={viewMode} className="animate-fade-in">
              {viewMode === 'grid' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredChains.map((chain, index) => (
                    <div 
                      key={chain.chainId}
                      className="animate-fade-in"
                      style={{
                        animationDelay: `${index * 50}ms`,
                        animationFillMode: 'both'
                      }}
                    >
                      <ChainCard chain={chain} />
                    </div>
                  ))}
                </div>
              ) : (
                <ChainListView chains={filteredChains} />
              )}
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}