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
  Shield,
  Globe,
  Twitter,
  MessageCircle,
  Github
} from 'lucide-react';
import { StakeDistributionChart, getValidatorColor } from '../components/StakeDistributionChart';
import { L1MetricsChart } from '../components/L1MetricsChart';
import { StatusBar } from '../components/StatusBar';
import { Footer } from '../components/Footer';
import { AddToMetaMask } from '../components/AddToMetaMask';
import { LoadingSpinner } from '../components/LoadingSpinner';
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
        const [chains, healthData] = await Promise.all([
          getChains(),
          getHealth()
        ]);
        
        const foundChain = chains.find(c => c.chainId === chainId);
        
        if (foundChain) {
          setChain(foundChain);
          // Use originalChainId if available for API calls that might require the numeric ID
          // Fallback to chainId if originalChainId is not present (though it should be based on api.ts changes)
          const apiChainId = (foundChain as any).originalChainId || foundChain.chainId;
          const history = await getTPSHistory(7, apiChainId);
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
            <LoadingSpinner size="lg" />
            <p className="mt-4 text-gray-600 dark:text-gray-300">Loading chain details...</p>
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
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-[#ef4444] hover:bg-[#dc2626] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#ef4444]"
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

  const getSocialIcon = (name: string) => {
    const lowerName = name.toLowerCase();
    if (lowerName.includes('twitter') || lowerName.includes('x.com')) {
      // Custom X icon
      return ({ className }: { className?: string }) => (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      );
    }
    if (lowerName.includes('discord')) return MessageCircle;
    if (lowerName.includes('github')) return Github;
    if (lowerName.includes('telegram')) return MessageCircle;
    if (lowerName.includes('youtube')) return ({ className }: { className?: string }) => (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z"></path>
        <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"></polygon>
      </svg>
    );
    if (lowerName.includes('linkedin')) return ({ className }: { className?: string }) => (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"></path>
        <rect x="2" y="9" width="4" height="12"></rect>
        <circle cx="4" cy="4" r="2"></circle>
      </svg>
    );
    if (lowerName.includes('reddit')) return ({ className }: { className?: string }) => (
      <svg className={className} role="img" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.249-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"/>
      </svg>
    );
    if (lowerName.includes('website')) return Globe;
    
    return Globe;
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-dark-900">
      <StatusBar health={health} />
      
      <div className="flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={() => navigate('/')}
              className="inline-flex items-center px-4 py-2 border border-border shadow-sm text-sm font-medium rounded-lg text-muted-foreground bg-card hover:bg-accent hover:text-foreground focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#ef4444] transition-colors"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </button>
            <div className="flex items-center gap-3">
              {chain.network && (
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                  chain.network === 'mainnet'
                    ? 'bg-[#ef4444]/10 text-[#ef4444] border border-[#ef4444]/20'
                    : 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/20'
                }`}>
                  {chain.network === 'mainnet' ? 'Mainnet' : 'Fuji Testnet'}
                </span>
              )}
              {chain.explorerUrl && (
                <a
                  href={chain.explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center px-3 py-1 border border-border rounded-lg text-sm font-medium text-muted-foreground bg-card hover:bg-accent hover:text-foreground transition-colors"
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
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Left Column: Chain Info */}
                <div className="flex flex-col gap-6">
                  <div className="flex items-start gap-5">
                    {chain.chainLogoUri ? (
                      <div className="relative flex-shrink-0">
                        <img
                          src={chain.chainLogoUri}
                          alt={`${chain.chainName} logo`}
                          className="w-20 h-20 rounded-2xl shadow-md bg-transparent p-2"
                          onError={(e) => {
                            e.currentTarget.src = "/icon-dark-animated.svg";
                            e.currentTarget.onerror = null;
                          }}
                        />
                        <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center border-2 border-white dark:border-dark-800">
                          <CheckCircle className="w-3.5 h-3.5 text-white" />
                        </div>
                      </div>
                    ) : (
                      <div className="relative flex-shrink-0">
                        <img
                          src="/icon-dark-animated.svg"
                          alt={`${chain.chainName} logo`}
                          className="w-20 h-20 rounded-2xl shadow-md bg-transparent p-2"
                        />
                        <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center border-2 border-white dark:border-dark-800">
                          <CheckCircle className="w-3.5 h-3.5 text-white" />
                        </div>
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{chain.chainName}</h1>
                        {chain.networkToken && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 dark:bg-dark-700 text-xs font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600">
                            {chain.networkToken.logoUri && (
                              <img
                                src={chain.networkToken.logoUri}
                                alt={chain.networkToken.symbol}
                                className="w-3.5 h-3.5 rounded-full"
                              />
                            )}
                            {chain.networkToken.symbol}
                          </span>
                        )}
                      </div>

                      {chain.description && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed mb-4 line-clamp-2">
                          {chain.description}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-2">
                        {chain.categories?.map(category => (
                          <span
                            key={category}
                            className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-[#ef4444]/10 text-[#ef4444] dark:bg-[#ef4444]/20 dark:text-[#ef4444] border border-[#ef4444]/20"
                          >
                            {category}
                          </span>
                        ))}
                        {chain.assets?.map((asset, index) => (
                          <span
                            key={index}
                            className="inline-flex items-center px-2.5 py-1 bg-gray-100 dark:bg-dark-700 rounded-md text-xs font-medium text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-600"
                          >
                            {asset.symbol}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Actions Row */}
                  <div className="flex items-center gap-3 border-t border-gray-200 dark:border-gray-700 pt-4">
                    {chain.website && (
                      <a
                        href={chain.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-dark-700 hover:bg-gray-200 dark:hover:bg-dark-600 rounded-lg text-sm font-medium text-gray-900 dark:text-white transition-colors"
                      >
                        <Globe className="w-4 h-4" />
                        Website
                      </a>
                    )}
                    <div className="h-8 w-px bg-gray-200 dark:bg-gray-700 mx-1"></div>
                    {chain.socials?.map((social, index) => {
                      const Icon = getSocialIcon(social.name);
                      return (
                        <a
                          key={index}
                          href={social.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 text-gray-500 dark:text-gray-400 hover:text-[#ef4444] dark:hover:text-[#ef4444] hover:bg-[#ef4444]/10 rounded-lg transition-all"
                          title={social.name}
                        >
                          <Icon className="w-5 h-5" />
                        </a>
                      );
                    })}
                    <div className="ml-auto">
                      <AddToMetaMask chain={chain} variant="compact" />
                    </div>
                  </div>
                </div>

                {/* Right Column: Compact Metrics Grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-[#ef4444]/10 dark:bg-[#ef4444]/20 rounded-lg p-3 border border-[#ef4444]/20 dark:border-[#ef4444]/50">
                    <div className="flex items-center gap-2 mb-1">
                      <Activity className="w-4 h-4 text-[#ef4444]" />
                      <span className="text-xs font-medium text-[#ef4444]">TPS</span>
                    </div>
                    <p className={`text-xl font-bold ${tpsColor}`}>{tpsValue}</p>
                  </div>

                  <div className="bg-[#ef4444]/10 dark:bg-[#ef4444]/20 rounded-lg p-3 border border-[#ef4444]/20 dark:border-[#ef4444]/50">
                    <div className="flex items-center gap-2 mb-1">
                      <Users className="w-4 h-4 text-[#ef4444]" />
                      <span className="text-xs font-medium text-[#ef4444]">Validators</span>
                    </div>
                    <p className="text-xl font-bold text-[#ef4444]">{chain.validators.length}</p>
                  </div>

                  <div className="bg-[#ef4444]/10 dark:bg-[#ef4444]/20 rounded-lg p-3 border border-[#ef4444]/20 dark:border-[#ef4444]/50">
                    <div className="flex items-center gap-2 mb-1">
                      <Shield className="w-4 h-4 text-[#ef4444]" />
                      <span className="text-xs font-medium text-[#ef4444]">Avg Validator Uptime</span>
                    </div>
                    <p className="text-xl font-bold text-[#ef4444]">{averageUptime.toFixed(1)}%</p>
                  </div>

                  <div className="bg-[#ef4444]/10 dark:bg-[#ef4444]/20 rounded-lg p-3 border border-[#ef4444]/20 dark:border-[#ef4444]/50">
                    <div className="flex items-center gap-2 mb-1">
                      <Database className="w-4 h-4 text-[#ef4444]" />
                      <span className="text-xs font-medium text-[#ef4444]">Stake</span>
                    </div>
                    <p className="text-xl font-bold text-[#ef4444]">{formatStakeNumber(totalStake)}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Compact Technical Details Grid */}
            <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-dark-700/30 p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="flex flex-col p-3 bg-white dark:bg-dark-800 rounded-lg border border-gray-200 dark:border-gray-600/50">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Chain ID</span>
                  <div className="flex items-center justify-between">
                    <code className="text-sm font-mono font-semibold text-gray-900 dark:text-white">{(chain as any).originalChainId || chain.chainId}</code>
                    <button
                      onClick={() => handleCopy('chainId', (chain as any).originalChainId || chain.chainId)}
                      className="text-gray-400 hover:text-[#ef4444] transition-colors p-1 rounded hover:bg-gray-100 dark:hover:bg-dark-700"
                    >
                      {copied === 'chainId' ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {chain.subnetId && (
                  <div className="flex flex-col p-3 bg-white dark:bg-dark-800 rounded-lg border border-gray-200 dark:border-gray-600/50">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Subnet ID</span>
                    <div className="flex items-center justify-between">
                      <code className="text-sm font-mono text-gray-900 dark:text-white truncate mr-2" title={chain.subnetId}>
                        {chain.subnetId.slice(0, 8)}...{chain.subnetId.slice(-8)}
                      </code>
                      <button
                        onClick={() => handleCopy('subnetId', chain.subnetId)}
                        className="text-gray-400 hover:text-[#ef4444] transition-colors p-1 rounded hover:bg-gray-100 dark:hover:bg-dark-700 shrink-0"
                      >
                        {copied === 'subnetId' ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                )}

                {chain.platformChainId && (
                  <div className="flex flex-col p-3 bg-white dark:bg-dark-800 rounded-lg border border-gray-200 dark:border-gray-600/50">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Blockchain ID</span>
                    <div className="flex items-center justify-between">
                      <code className="text-sm font-mono text-gray-900 dark:text-white truncate mr-2" title={chain.platformChainId}>
                        {chain.platformChainId.slice(0, 8)}...{chain.platformChainId.slice(-8)}
                      </code>
                      <button
                        onClick={() => handleCopy('platformChainId', chain.platformChainId)}
                        className="text-gray-400 hover:text-[#ef4444] transition-colors p-1 rounded hover:bg-gray-100 dark:hover:bg-dark-700 shrink-0"
                      >
                        {copied === 'platformChainId' ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                )}

                {chain.rpcUrls && chain.rpcUrls.length > 0 && (
                  <div className="flex flex-col p-3 bg-white dark:bg-dark-800 rounded-lg border border-gray-200 dark:border-gray-600/50">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">RPC URL</span>
                    <div className="flex items-center justify-between">
                      <code className="text-sm font-mono text-gray-900 dark:text-white truncate mr-2" title={chain.rpcUrls[0]}>
                        {chain.rpcUrls[0].replace('https://', '')}
                      </code>
                      <button
                        onClick={() => navigator.clipboard.writeText(chain.rpcUrls?.[0] || '')}
                        className="text-gray-400 hover:text-[#ef4444] transition-colors p-1 rounded hover:bg-gray-100 dark:hover:bg-dark-700 shrink-0"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
              
              {lastUpdate && (
                <div className="mt-4 flex justify-end">
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    Last updated: {format(new Date(lastUpdate * 1000), 'MMM d, yyyy HH:mm')}
                  </span>
                </div>
              )}
            </div>

          </div>

            {/* Tab Navigation */}
            <div className="mb-6">
              <div className="border-b border-gray-200 dark:border-gray-700">
                <nav className="flex space-x-8" aria-label="Tabs">
                  {[
                    { id: 'validators', name: 'Validators', icon: Users },
                    { id: 'metrics', name: 'Metrics', icon: Activity }
                  ].map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as 'validators' | 'metrics')}
                        className={`
                          group inline-flex items-center py-4 px-1 border-b-2 font-medium text-sm transition-all
                          ${isActive 
                            ? 'border-[#ef4444] text-[#ef4444]' 
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                          }
                        `}
                      >
                        <Icon className={`
                          -ml-0.5 mr-2 h-5 w-5
                          ${isActive ? 'text-[#ef4444]' : 'text-gray-400 group-hover:text-gray-500 dark:text-gray-500 dark:group-hover:text-gray-400'}
                        `} />
                        {tab.name}
                      </button>
                    );
                  })}
                </nav>
              </div>
            </div>

            <div className="space-y-6">
              {/* Validators Tab */}
              {activeTab === 'validators' && (
                <div className="space-y-6">
                  {/* Stake Distribution Chart */}
                  <StakeDistributionChart validators={chain.validators} />
                  
                  {/* Validators Table */}
                  <div className="bg-white dark:bg-dark-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden shadow-sm">
                    {/* Validators Header & Search */}
                    <div className="p-6 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-dark-700/20">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div>
                          <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                            Validators
                          </h3>
                        </div>
                        <div className="relative w-full sm:w-72">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                          </div>
                          <input
                            type="text"
                            placeholder="Search by Node ID or Address..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-dark-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#ef4444] focus:border-transparent transition-all text-sm shadow-sm"
                          />
                        </div>
                      </div>
                    </div>

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
                                  <span className="text-[#ef4444]">
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
                                  <span className="text-[#ef4444]">
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
                              Avg Validator Uptime
                                {sortBy === 'uptime' && (
                                  <span className="text-[#ef4444]">
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
                                      className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-xs font-bold shadow-sm ring-2 ring-white dark:ring-dark-800" 
                                      style={{ 
                                        backgroundColor: getValidatorColor(index, theme === 'dark', 0.9)
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
                                    <div className="flex-1 bg-gray-100 dark:bg-dark-700 rounded-full h-2 mr-3 overflow-hidden">
                                      <div 
                                        className={`h-full rounded-full transition-all duration-500 ${
                                          (validator.uptime || 0) >= 90 ? 'bg-green-500' :
                                          (validator.uptime || 0) >= 80 ? 'bg-yellow-500' : 'bg-red-500'
                                        }`}
                                        style={{ width: `${validator.uptime || 0}%` }}
                                      ></div>
                                    </div>
                                    <span className={`text-sm font-medium min-w-[3rem] ${
                                      (validator.uptime || 0) >= 90 ? 'text-green-600 dark:text-green-400' :
                                      (validator.uptime || 0) >= 80 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'
                                    }`}>
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
                          className="w-full text-center text-[#ef4444] dark:text-[#ef4444] hover:text-[#dc2626] dark:hover:text-[#dc2626] text-sm font-medium py-2 transition-colors"
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
                  <L1MetricsChart 
  chainId={(chain as any).originalChainId || chain.chainId} 
  chainName={chain.chainName} 
  evmChainId={chain.evmChainId ? String(chain.evmChainId) : undefined} 
  tokenSymbol={chain.networkToken?.symbol}
/>
                </div>
              )}
            </div>
          </div>
        </div>
      
      <Footer />
    </div>
  );
}