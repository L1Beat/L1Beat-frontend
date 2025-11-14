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
import { SeparateMetricsCharts } from '../components/SeparateMetricsCharts';
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
  const [activeTab, setActiveTab] = useState<'validators' | 'metrics'>('validators');

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
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={() => navigate('/')}
              className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 shadow-sm text-sm font-medium rounded-lg text-gray-700 dark:text-gray-200 bg-white dark:bg-dark-800 hover:bg-gray-50 dark:hover:bg-dark-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </button>
            <div className="flex items-center gap-3">
              {chain.network && (
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                  chain.network === 'mainnet'
                    ? 'bg-green-100 text-green-800 dark:bg-green-900/80 dark:text-green-200'
                    : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/80 dark:text-yellow-200'
                }`}>
                  {chain.network === 'mainnet' ? 'Mainnet' : 'Fuji Testnet'}
                </span>
              )}
              {chain.explorerUrl && (
                <a
                  href={chain.explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-dark-800 hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors"
                >
                  <ExternalLink className="w-3 h-3 mr-1.5" />
                  Explorer
                </a>
              )}
            </div>
          </div>

          {/* Compact Chain Header Card */}
          <div className="bg-white dark:bg-dark-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden mb-6">
            <div className="p-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Column: Chain Info */}
                <div className="flex items-start gap-4">
                  {chain.chainLogoUri ? (
                    <div className="relative flex-shrink-0">
                      <img
                        src={chain.chainLogoUri}
                        alt={`${chain.chainName} logo`}
                        className="w-16 h-16 rounded-xl shadow-md bg-white p-2"
                      />
                      <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                        <CheckCircle className="w-3 h-3 text-white" />
                      </div>
                    </div>
                  ) : (
                    <div className="w-16 h-16 bg-gray-100 dark:bg-dark-700 rounded-xl flex items-center justify-center flex-shrink-0">
                      <Network className="w-8 h-8 text-gray-400" />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{chain.chainName}</h1>

                    {/* Categories */}
                    {chain.categories && chain.categories.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 mb-2">
                        {chain.categories.map(category => (
                          <span
                            key={category}
                            className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200"
                          >
                            {category}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Social Links & Website */}
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      {chain.website && (
                        <a
                          href={chain.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center px-2 py-1 bg-gray-100 dark:bg-dark-700 hover:bg-gray-200 dark:hover:bg-dark-600 rounded text-xs font-medium text-gray-700 dark:text-gray-300 transition-colors"
                          title="Official Website"
                        >
                          <ExternalLink className="w-3 h-3 mr-1" />
                          Website
                        </a>
                      )}
                      {chain.socials?.map((social, index) => (
                        <a
                          key={index}
                          href={social.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center px-2 py-1 bg-gray-100 dark:bg-dark-700 hover:bg-gray-200 dark:hover:bg-dark-600 rounded text-xs font-medium text-gray-700 dark:text-gray-300 transition-colors capitalize"
                          title={social.name}
                        >
                          {social.name}
                        </a>
                      ))}
                    </div>

                    {/* Network Assets */}
                    {chain.assets && chain.assets.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2 mb-3">
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Assets:</span>
                        {chain.assets.map((asset, index) => (
                          <span
                            key={index}
                            className="inline-flex items-center px-2 py-0.5 bg-gray-100 dark:bg-dark-700 rounded text-xs text-gray-700 dark:text-gray-300"
                          >
                            {asset.symbol}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center gap-3 mb-2">
                      <AddToMetaMask chain={chain} variant="compact" />
                    </div>
                    {chain.networkToken && (
                      <div className="flex items-center gap-2 text-sm">
                        {chain.networkToken.logoUri && (
                          <img
                            src={chain.networkToken.logoUri}
                            alt={chain.networkToken.name}
                            className="w-4 h-4 rounded-full"
                          />
                        )}
                        <span className="text-gray-600 dark:text-gray-400">
                          {chain.networkToken.symbol}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Column: Compact Metrics Grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 border border-blue-200 dark:border-blue-700/50">
                    <div className="flex items-center gap-2 mb-1">
                      <Activity className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      <span className="text-xs font-medium text-blue-600 dark:text-blue-400">TPS</span>
                    </div>
                    <p className={`text-xl font-bold ${tpsColor}`}>{tpsValue}</p>
                  </div>

                  <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 border border-green-200 dark:border-green-700/50">
                    <div className="flex items-center gap-2 mb-1">
                      <Users className="w-4 h-4 text-green-600 dark:text-green-400" />
                      <span className="text-xs font-medium text-green-600 dark:text-green-400">Validators</span>
                    </div>
                    <p className="text-xl font-bold text-green-900 dark:text-green-100">{chain.validators.length}</p>
                  </div>

                  <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 border border-purple-200 dark:border-purple-700/50">
                    <div className="flex items-center gap-2 mb-1">
                      <Shield className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                      <span className="text-xs font-medium text-purple-600 dark:text-purple-400">Uptime</span>
                    </div>
                    <p className="text-xl font-bold text-purple-900 dark:text-purple-100">{averageUptime.toFixed(1)}%</p>
                  </div>

                  <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-3 border border-orange-200 dark:border-orange-700/50">
                    <div className="flex items-center gap-2 mb-1">
                      <Database className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                      <span className="text-xs font-medium text-orange-600 dark:text-orange-400">Stake</span>
                    </div>
                    <p className="text-xl font-bold text-orange-900 dark:text-orange-100">{formatStakeNumber(totalStake)}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Compact Technical Details */}
            <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-4 bg-gray-50 dark:bg-dark-700/30">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Chain ID:</span>
                  <code className="px-2 py-1 bg-white dark:bg-dark-800 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-900 dark:text-white">
                    {chain.chainId}
                  </code>
                  <button
                    onClick={() => handleCopy('chainId', chain.chainId)}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                    title="Copy Chain ID"
                  >
                    {copied === 'chainId' ? (
                      <Check className="w-3.5 h-3.5 text-green-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>

                {chain.subnetId && (
                  <>
                    <span className="text-gray-300 dark:text-gray-600">•</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Subnet ID:</span>
                      <code className="px-2 py-1 bg-white dark:bg-dark-800 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-900 dark:text-white">
                        {chain.subnetId.slice(0, 12)}...{chain.subnetId.slice(-8)}
                      </code>
                      <button
                        onClick={() => handleCopy('subnetId', chain.subnetId)}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                        title="Copy Subnet ID"
                      >
                        {copied === 'subnetId' ? (
                          <Check className="w-3.5 h-3.5 text-green-500" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </>
                )}

                {chain.platformChainId && (
                  <>
                    <span className="text-gray-300 dark:text-gray-600">•</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Blockchain ID:</span>
                      <code className="px-2 py-1 bg-white dark:bg-dark-800 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-900 dark:text-white">
                        {chain.platformChainId.slice(0, 12)}...{chain.platformChainId.slice(-8)}
                      </code>
                      <button
                        onClick={() => handleCopy('platformChainId', chain.platformChainId)}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                        title="Copy Blockchain ID"
                      >
                        {copied === 'platformChainId' ? (
                          <Check className="w-3.5 h-3.5 text-green-500" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </>
                )}

                {/* RPC URLs */}
                {chain.rpcUrls && chain.rpcUrls.length > 0 && (
                  <>
                    <span className="text-gray-300 dark:text-gray-600">•</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">RPC:</span>
                      {chain.rpcUrls.slice(0, 1).map((url, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <code className="px-2 py-1 bg-white dark:bg-dark-800 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono text-gray-900 dark:text-white truncate max-w-[200px]">
                            {url}
                          </code>
                          <button
                            onClick={() => navigator.clipboard.writeText(url)}
                            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                            title="Copy RPC URL"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                      {chain.rpcUrls.length > 1 && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          +{chain.rpcUrls.length - 1} more
                        </span>
                      )}
                    </div>
                  </>
                )}

                {lastUpdate && (
                  <>
                    <span className="text-gray-300 dark:text-gray-600 ml-auto">•</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      Updated {format(new Date(lastUpdate * 1000), 'MMM d, HH:mm')}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Description */}
            {chain.description && (
              <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-4">
                <div className="flex items-start gap-3">
                  <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{chain.description}</p>
                </div>
              </div>
            )}

          </div>

          {/* Tab Navigation */}
          <div className="bg-white dark:bg-dark-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="border-b border-gray-200 dark:border-gray-700">
              <nav className="grid grid-cols-2 gap-1 p-2" aria-label="Tabs">
                {[
                  { id: 'validators', name: 'Validators', icon: Users },
                  { id: 'metrics', name: 'Metrics', icon: Activity }
                ].map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as 'validators' | 'metrics')}
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
              </nav>
            </div>

            <div className="p-8">
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
                <div className="space-y-6">
                  <SeparateMetricsCharts chainId={chain.chainId} chainName={chain.chainName} />
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