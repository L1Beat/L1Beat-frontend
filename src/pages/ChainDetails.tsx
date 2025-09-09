import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { getChains, getTPSHistory } from '../api';
import { Chain, TPSHistory } from '../types';
import { 
  Activity, 
  ArrowLeft, 
  Search, 
  CheckCircle, 
  Info, 
  Copy, 
  Check,
  ExternalLink,
  Users,
  Zap,
  TrendingUp,
  Database,
  Network,
  AlertTriangle,
  Shield
} from 'lucide-react';
import { StakeDistributionChart, getValidatorColor } from '../components/StakeDistributionChart';
import { L1MetricsChart } from '../components/L1MetricsChart';
import { StatusBar } from '../components/StatusBar';
import { Footer } from '../components/Footer';
import { AddToMetaMask } from '../components/AddToMetaMask';
import { useTheme } from '../hooks/useTheme';
import { getHealth } from '../api';
import { HealthStatus } from '../types';

export function ChainDetails() {
  const { chainId } = useParams();
  const navigate = useNavigate();
  const [chain, setChain] = useState<Chain | null>(null);
  const [tpsHistory, setTPSHistory] = useState<TPSHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAllValidators, setShowAllValidators] = useState(false);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [sortBy, setSortBy] = useState<'stake' | 'uptime' | 'address'>('stake');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const { theme } = useTheme();
  const [copied, setCopied] = useState<'chainId' | 'subnetId' | 'platformChainId' | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'validators' | 'metrics'>('overview');

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const [chains, history, healthData] = await Promise.all([
          getChains(),
          chainId ? getTPSHistory(7, chainId) : Promise.resolve([]),
          getHealth()
        ]);
        
        const foundChain = chains.find(c => c.chainId === chainId);
        
        if (foundChain) {
          setChain(foundChain);
          setTPSHistory(history);
          setHealth(healthData);
          setError(null);
        } else {
          setError('Chain not found');
        }
      } catch {
        setError('Failed to load chain details');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [chainId]);

  const handleCopy = async (type: 'chainId' | 'subnetId' | 'platformChainId', value?: string) => {
    if (value) {
      try {
        await navigator.clipboard.writeText(value);
        setCopied(type);
        setTimeout(() => setCopied(null), 2000);
      } catch (err) {
        console.error('Failed to copy:', err);
      }
    }
  };

  const getCurrentTPS = () => {
    if (!tpsHistory.length) return 'N/A';
    const latestTPS = tpsHistory[tpsHistory.length - 1].totalTps;
    if (latestTPS === 0) {
      return '< 1.00';
    }
    if (latestTPS < 1 && latestTPS > 0) {
      return '< 1.00';
    }
    return latestTPS.toFixed(2);
  };

  const getTPSColor = (tpsStr: string) => {
    if (tpsStr === 'N/A') return 'text-gray-400 dark:text-gray-500';
    if (tpsStr === '< 1.00') return 'text-yellow-500 dark:text-yellow-400';
    const tps = Number(tpsStr);
    if (tps >= 1) return 'text-green-500 dark:text-green-400';
    if (tps >= 0.1) return 'text-yellow-500 dark:text-yellow-400';
    return 'text-red-500 dark:text-red-400';
  };

  const filteredValidators = chain?.validators.filter(validator =>
    validator.address.toLowerCase().includes(searchTerm.toLowerCase())
  ).sort((a, b) => {
    let comparison = 0;
    
    switch (sortBy) {
      case 'stake':
        comparison = a.weight - b.weight;
        break;
      case 'uptime':
        comparison = (a.uptime || 0) - (b.uptime || 0);
        break;
      case 'address':
        comparison = a.address.localeCompare(b.address);
        break;
    }
    
    return sortOrder === 'desc' ? -comparison : comparison;
  }) || [];

  const displayedValidators = showAllValidators 
    ? filteredValidators 
    : filteredValidators.slice(0, 10);

  const totalStake = chain?.validators.reduce((sum, v) => sum + v.weight, 0) || 0;
  const activeValidators = chain?.validators.filter(v => v.active).length || 0;
  const averageUptime = chain?.validators.length 
    ? chain.validators.reduce((sum, v) => sum + (v.uptime || 0), 0) / chain.validators.length 
    : 0;

  // Format large numbers with abbreviations
  const formatStakeNumber = (num: number): string => {
    // Convert from blockchain denomination to actual tokens (divide by 10^9)
    const actualTokens = num / 1_000_000_000;
    
    if (actualTokens >= 1_000_000) {
      return `${(actualTokens / 1_000_000).toFixed(2)}M`;
    } else if (actualTokens >= 1_000) {
      return `${(actualTokens / 1_000).toFixed(2)}K`;
    } else {
      return actualTokens.toLocaleString(undefined, { maximumFractionDigits: 2 });
    }
  };
  
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-dark-900 flex flex-col">
        <StatusBar health={health} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-300">Loading chain details...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !chain) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-dark-900 flex flex-col">
        <StatusBar health={health} />
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-dark-800 rounded-lg shadow-lg p-6 max-w-md w-full text-center">
            <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">{error}</h2>
            <button
              onClick={() => navigate('/')}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  const tpsValue = getCurrentTPS();
  const tpsColor = getTPSColor(tpsValue);
  const lastUpdate = tpsHistory.length > 0 ? tpsHistory[tpsHistory.length - 1].timestamp : null;

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-dark-900">
      <StatusBar health={health} />
      
      <div className="flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <button
              onClick={() => navigate('/')}
              className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 shadow-sm text-sm font-medium rounded-lg text-gray-700 dark:text-gray-200 bg-white dark:bg-dark-800 hover:bg-gray-50 dark:hover:bg-dark-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </button>
          </div>

          {/* Chain Header Card */}
          <div className="bg-white dark:bg-dark-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden mb-8">
            {/* Hero Section */}
            <div className="relative bg-gradient-to-r from-blue-600 to-indigo-700 px-8 py-12">
              <div className="absolute inset-0 bg-black/10"></div>
              <div className="relative flex items-center gap-6">
                {chain.chainLogoUri ? (
                  <div className="relative">
                    <img 
                      src={chain.chainLogoUri} 
                      alt={`${chain.chainName} logo`}
                      className="w-20 h-20 rounded-2xl shadow-lg bg-white p-2"
                    />
                    <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-green-500 rounded-full flex items-center justify-center shadow-lg">
                      <CheckCircle className="w-4 h-4 text-white" />
                    </div>
                  </div>
                ) : (
                  <div className="w-20 h-20 bg-white/20 rounded-2xl flex items-center justify-center">
                    <Network className="w-10 h-10 text-white" />
                  </div>
                )}

                <div className="flex-1">
                  <h1 className="text-3xl font-bold text-white mb-2">{chain.chainName}</h1>
                  <div className="mt-3">
                    <AddToMetaMask chain={chain} variant="compact" />
                  </div>
                </div>

                {/* Quick Stats */}
                <div className="hidden lg:flex items-center gap-8">
                  <div className="text-center">
                    <div className={`text-2xl font-bold ${tpsColor.replace('text-', 'text-white')}`}>
                      {tpsValue}
                    </div>
                    <div className="text-white/80 text-sm">TPS</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-white">
                      {chain.validators.length}
                    </div>
                    <div className="text-white/80 text-sm">Validators</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-white">
                      {averageUptime.toFixed(1)}%
                    </div>
                    <div className="text-white/80 text-sm">Avg Uptime</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Chain Info Cards */}
            <div className="p-8">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                {/* Network Token */}
                {chain.networkToken && (
                  <div className="bg-gray-50 dark:bg-dark-700/50 rounded-xl p-6 border border-gray-200 dark:border-gray-600">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-lg flex items-center justify-center">
                        {chain.networkToken.logoUri ? (
                          <img 
                            src={chain.networkToken.logoUri} 
                            alt={`${chain.networkToken.name} logo`}
                            className="w-6 h-6 rounded-full"
                          />
                        ) : (
                          <Zap className="w-5 h-5 text-white" />
                        )}
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900 dark:text-white">Network Token</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Native currency</p>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="font-medium text-gray-900 dark:text-white">{chain.networkToken.name}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{chain.networkToken.symbol}</p>
                    </div>
                  </div>
                )}

                {/* Performance */}
                <div className="bg-gray-50 dark:bg-dark-700/50 rounded-xl p-6 border border-gray-200 dark:border-gray-600">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-gradient-to-br from-green-400 to-emerald-500 rounded-lg flex items-center justify-center">
                      <TrendingUp className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white">Performance</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Current metrics</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600 dark:text-gray-400">TPS</span>
                      <span className={`font-medium ${tpsColor}`}>{tpsValue}</span>
                    </div>
                    {lastUpdate && (
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600 dark:text-gray-400">Updated</span>
                        <span className="text-sm text-gray-900 dark:text-white">
                          {format(new Date(lastUpdate * 1000), 'MMM d, HH:mm')}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Security */}
                <div className="bg-gray-50 dark:bg-dark-700/50 rounded-xl p-6 border border-gray-200 dark:border-gray-600">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-gradient-to-br from-purple-400 to-pink-500 rounded-lg flex items-center justify-center">
                      <Shield className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white">Security</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Network status</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Active</span>
                      <span className="font-medium text-green-600 dark:text-green-400">{activeValidators}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Uptime</span>
                      <span className="font-medium text-gray-900 dark:text-white">{averageUptime.toFixed(1)}%</span>
                    </div>
                  </div>
                </div>

                {/* Explorer */}
                <div className="bg-gray-50 dark:bg-dark-700/50 rounded-xl p-6 border border-gray-200 dark:border-gray-600">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-cyan-500 rounded-lg flex items-center justify-center">
                      <ExternalLink className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white">Explorer</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Block explorer</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {chain.explorerUrl ? (
                      <a
                        href={chain.explorerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm font-medium transition-colors"
                      >
                        View Explorer
                        <ExternalLink className="w-3 h-3 ml-1" />
                      </a>
                    ) : (
                      <span className="text-sm text-gray-500 dark:text-gray-400">Not available</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Technical Details */}
              <div className="bg-gray-50 dark:bg-dark-700/50 rounded-xl p-6 border border-gray-200 dark:border-gray-600">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <Info className="w-5 h-5 text-blue-500" />
                  Technical Details
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Chain ID
                    </label>
                    <button
                      onClick={() => handleCopy('chainId', chain.chainId)}
                      className="w-full flex items-center justify-between p-3 bg-white dark:bg-dark-800 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors group"
                    >
                      <span className="font-mono text-sm text-gray-900 dark:text-white truncate">
                        {chain.chainId}
                      </span>
                      {copied === 'chainId' ? (
                        <Check className="w-4 h-4 text-green-500 flex-shrink-0 ml-2" />
                      ) : (
                        <Copy className="w-4 h-4 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 flex-shrink-0 ml-2" />
                      )}
                    </button>
                  </div>

                  {chain.subnetId && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Subnet ID
                      </label>
                      <button
                        onClick={() => handleCopy('subnetId', chain.subnetId)}
                        className="w-full flex items-center justify-between p-3 bg-white dark:bg-dark-800 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors group"
                      >
                        <span className="font-mono text-sm text-gray-900 dark:text-white truncate">
                          {chain.subnetId}
                        </span>
                        {copied === 'subnetId' ? (
                          <Check className="w-4 h-4 text-green-500 flex-shrink-0 ml-2" />
                        ) : (
                          <Copy className="w-4 h-4 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 flex-shrink-0 ml-2" />
                        )}
                      </button>
                    </div>
                  )}

                  {chain.platformChainId && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Blockchain ID
                      </label>
                      <button
                        onClick={() => handleCopy('platformChainId', chain.platformChainId)}
                        className="w-full flex items-center justify-between p-3 bg-white dark:bg-dark-800 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors group"
                      >
                        <span className="font-mono text-sm text-gray-900 dark:text-white truncate">
                          {chain.platformChainId}
                        </span>
                        {copied === 'platformChainId' ? (
                          <Check className="w-4 h-4 text-green-500 flex-shrink-0 ml-2" />
                        ) : (
                          <Copy className="w-4 h-4 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 flex-shrink-0 ml-2" />
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Description */}
              {chain.description && (
                <div className="mt-6 bg-blue-50 dark:bg-blue-900/20 rounded-xl p-6 border border-blue-200 dark:border-blue-700/50">
                  <div className="flex items-start gap-3">
                    <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <h3 className="font-semibold text-blue-900 dark:text-blue-300 mb-2">About this Chain</h3>
                      <p className="text-blue-800 dark:text-blue-200 leading-relaxed">{chain.description}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="bg-white dark:bg-dark-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="border-b border-gray-200 dark:border-gray-700">
              <nav className="grid grid-cols-4 gap-1 p-2" aria-label="Tabs">
                {[
                  { id: 'overview', name: 'Overview', icon: TrendingUp },
                  { id: 'validators', name: 'Validators', icon: Users },
                  { id: 'metrics', name: 'Metrics', icon: Activity }
                ].map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as 'overview' | 'validators' | 'metrics')}
                      className={`${
                        activeTab === tab.id
                          ? 'bg-blue-50 border-blue-500 text-blue-600 dark:bg-blue-900/20 dark:border-blue-400 dark:text-blue-400'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50 dark:text-gray-400 dark:hover:text-gray-300 dark:hover:bg-dark-700/50'
                      } rounded-lg border-2 py-2 px-3 font-medium text-sm flex flex-col items-center justify-center gap-1 transition-all min-h-[60px]`}
                    >
                      <Icon className="w-4 h-4" />
                      <span className="text-xs">{tab.name}</span>
                    </button>
                  );
                })}
                <div className="opacity-0 pointer-events-none"></div>
              </nav>
            </div>

            <div className="p-8">
              {/* Overview Tab */}
              {activeTab === 'overview' && (
                <div>
                  <L1MetricsChart chainId={chain.chainId} chainName={chain.chainName} />
                </div>
              )}

              {/* Validators Tab */}
              {activeTab === 'validators' && (
                <div className="space-y-6">
                  {/* Validators Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        Validators ({chain.validators.length})
                      </h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {activeValidators} active • {formatStakeNumber(totalStake)} total stake
                      </p>
                    </div>
                    <div className="relative max-w-xs">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                      </div>
                      <input
                        type="text"
                        placeholder="Search validators..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="block w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg leading-5 bg-white dark:bg-dark-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      />
                    </div>
                  </div>

                  {/* Stake Distribution Chart */}
                  <StakeDistributionChart validators={chain.validators} />
                  
                  {/* Validators Table */}
                  <div className="bg-white dark:bg-dark-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-dark-700/50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                              Status
                            </th>
                            <th 
                              className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                              onClick={() => {
                                if (sortBy === 'address') {
                                  setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                                } else {
                                  setSortBy('address');
                                  setSortOrder('asc');
                                }
                              }}
                            >
                              <div className="flex items-center gap-1">
                              Validator
                                {sortBy === 'address' && (
                                  <span className="text-blue-500">
                                    {sortOrder === 'asc' ? '↑' : '↓'}
                                  </span>
                                )}
                              </div>
                            </th>
                            <th 
                              className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                              onClick={() => {
                                if (sortBy === 'stake') {
                                  setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                                } else {
                                  setSortBy('stake');
                                  setSortOrder('desc');
                                }
                              }}
                            >
                              <div className="flex items-center gap-1">
                              Stake
                                {sortBy === 'stake' && (
                                  <span className="text-blue-500">
                                    {sortOrder === 'asc' ? '↑' : '↓'}
                                  </span>
                                )}
                              </div>
                            </th>
                            <th 
                              className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                              onClick={() => {
                                if (sortBy === 'uptime') {
                                  setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                                } else {
                                  setSortBy('uptime');
                                  setSortOrder('desc');
                                }
                              }}
                            >
                              <div className="flex items-center gap-1">
                              Uptime
                                {sortBy === 'uptime' && (
                                  <span className="text-blue-500">
                                    {sortOrder === 'asc' ? '↑' : '↓'}
                                  </span>
                                )}
                              </div>
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-dark-800 divide-y divide-gray-200 dark:divide-gray-700">
                          {displayedValidators.map((validator, index) => {
                            const percentage = ((validator.weight / totalStake) * 100).toFixed(2);
                            return (
                              <tr 
                                key={validator.address} 
                                className="hover:bg-gray-50 dark:hover:bg-dark-700/50 transition-colors cursor-pointer"
                                onClick={() => {
                                  if (validator.explorerUrl) {
                                    window.open(validator.explorerUrl, '_blank', 'noopener,noreferrer');
                                  }
                                }}
                              >
                                <td className="px-6 py-4 whitespace-nowrap">
                                  {validator.active ? (
                                    <div className="flex items-center">
                                      <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                                      <span className="text-green-800 dark:text-green-300 text-sm font-medium">Active</span>
                                    </div>
                                  ) : (
                                    <div className="flex items-center">
                                      <div className="w-2 h-2 bg-red-500 rounded-full mr-2"></div>
                                      <span className="text-red-800 dark:text-red-300 text-sm font-medium">Inactive</span>
                                    </div>
                                  )}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="flex items-center gap-3">
                                    <div 
                                      className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold" 
                                      style={{ 
                                        backgroundColor: getValidatorColor(index, theme === 'dark', 0.8)
                                      }}
                                    >
                                      {validator.address.slice(0, 2).toUpperCase()}
                                    </div>
                                    <div>
                                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                        {validator.address.slice(0, 8)}...{validator.address.slice(-6)}
                                      </div>
                                      <div className="text-xs text-gray-500 dark:text-gray-400">
                                        Node ID
                                      </div>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="text-sm text-gray-900 dark:text-gray-100 font-medium">
                                    {formatStakeNumber(validator.weight)} tokens
                                  </div>
                                  <div className="text-xs text-gray-500 dark:text-gray-400">
                                    {percentage}% of total
                                  </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="flex items-center">
                                    <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2 mr-2">
                                      <div 
                                        className="bg-green-500 h-2 rounded-full" 
                                        style={{ width: `${validator.uptime || 0}%` }}
                                      ></div>
                                    </div>
                                    <span className="text-sm text-gray-900 dark:text-gray-100 font-medium min-w-[3rem]">
                                      {validator.uptime ? `${validator.uptime.toFixed(1)}%` : 'N/A'}
                                    </span>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Show More Button */}
                    {filteredValidators.length > 10 && !showAllValidators && (
                      <div className="px-6 py-4 bg-gray-50 dark:bg-dark-700/50 border-t border-gray-200 dark:border-gray-700">
                        <button
                          onClick={() => setShowAllValidators(true)}
                          className="w-full text-center text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm font-medium py-2 transition-colors"
                        >
                          Show All Validators ({filteredValidators.length})
                        </button>
                      </div>
                    )}

                    {/* No Results */}
                    {searchTerm && filteredValidators.length === 0 && (
                      <div className="px-6 py-8 text-center">
                        <p className="text-gray-500 dark:text-gray-400">
                          No validators found matching "{searchTerm}"
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Metrics Tab */}
              {activeTab === 'metrics' && (
                <div className="space-y-8">
                  <L1MetricsChart chainId={chain.chainId} chainName={chain.chainName} />
                  
                  {/* Additional Metrics Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl p-6 border border-blue-200 dark:border-blue-700/50">
                      <div className="flex items-center justify-between mb-4">
                        <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
                          <Activity className="w-5 h-5 text-white" />
                        </div>
                        <span className="text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/50 px-2 py-1 rounded-full">
                          Live
                        </span>
                      </div>
                      <div className="space-y-1">
                        <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">{tpsValue}</p>
                        <p className="text-sm text-blue-600 dark:text-blue-400">Transactions per Second</p>
                      </div>
                    </div>

                    <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-xl p-6 border border-green-200 dark:border-green-700/50">
                      <div className="flex items-center justify-between mb-4">
                        <div className="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center">
                          <CheckCircle className="w-5 h-5 text-white" />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <p className="text-2xl font-bold text-green-900 dark:text-green-100">{activeValidators}</p>
                        <p className="text-sm text-green-600 dark:text-green-400">Active Validators</p>
                      </div>
                    </div>

                    <div className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-xl p-6 border border-purple-200 dark:border-purple-700/50">
                      <div className="flex items-center justify-between mb-4">
                        <div className="w-10 h-10 bg-purple-500 rounded-lg flex items-center justify-center">
                          <Shield className="w-5 h-5 text-white" />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <p className="text-2xl font-bold text-purple-900 dark:text-purple-100">{averageUptime.toFixed(1)}%</p>
                        <p className="text-sm text-purple-600 dark:text-purple-400">Average Uptime</p>
                      </div>
                    </div>

                    <div className="bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-900/20 dark:to-red-900/20 rounded-xl p-6 border border-orange-200 dark:border-orange-700/50">
                      <div className="flex items-center justify-between mb-4">
                        <div className="w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center">
                          <Database className="w-5 h-5 text-white" />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <p className="text-2xl font-bold text-orange-900 dark:text-orange-100">{formatStakeNumber(totalStake)}</p>
                        <p className="text-sm text-orange-600 dark:text-orange-400">Total Stake</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      
      <Footer />
    </div>
  );
}