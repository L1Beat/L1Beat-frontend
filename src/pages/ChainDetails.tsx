import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { getChains, getTPSHistory, getChainValidators } from '../api';
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
  AlertTriangle,
  Shield,
  Globe,
  MessageCircle,
  Github
} from 'lucide-react';
import { StakeDistributionChart, getValidatorColor } from '../components/StakeDistributionChart';
import { StatusBar } from '../components/StatusBar';
import { Footer } from '../components/Footer';
import { AddToMetaMask } from '../components/AddToMetaMask';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { useTheme } from '../hooks/useTheme';
import { getHealth } from '../api';
import { HealthStatus } from '../types';
import { formatUnits, parseBaseUnits, unitsToNumber } from '../utils/formatUnits';

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
  const [activeTab, setActiveTab] = useState<'validators'>('validators');
  const [hoveredTab, setHoveredTab] = useState<string | null>(null);

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
          // Fetch validators specifically for this chain
          const validators = await getChainValidators(foundChain.originalChainId || foundChain.chainId);
          const chainWithValidators = {
            ...foundChain,
            validators: validators.length > 0 ? validators : foundChain.validators // Use fetched validators if available
          };
          
          setChain(chainWithValidators);
          // Use originalChainId if available for API calls that might require the numeric ID
          // Fallback to chainId if originalChainId is not present
          const apiChainId = foundChain.originalChainId || foundChain.chainId;
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
    if (tpsStr === 'N/A') return 'text-muted-foreground';
    if (tpsStr === '< 1.00') return 'text-yellow-500 dark:text-yellow-400';
    const tps = Number(tpsStr);
    if (tps >= 1) return 'text-green-500 dark:text-green-400';
    if (tps >= 0.1) return 'text-yellow-500 dark:text-yellow-400';
    return 'text-red-500 dark:text-red-400';
  };

  const tokenDecimals = chain?.networkToken?.decimals ?? 18;
  const tokenSymbol = chain?.networkToken?.symbol || 'TOKEN';
  // Avalanche staking/validator APIs often represent AVAX in nAVAX (1e9).
  // Even if EVM-native AVAX uses 18 decimals, we should display validator stake using 9 decimals.
  const stakeTokenDecimals = tokenSymbol === 'AVAX' ? 9 : tokenDecimals;

  const getStakeBaseUnits = (v: { weight: string }) => parseBaseUnits(v.weight) ?? 0n;

  const filteredValidators = chain?.validators.filter(validator =>
    validator.address.toLowerCase().includes(searchTerm.toLowerCase())
  ).sort((a, b) => {
    let comparison = 0;
    
    switch (sortBy) {
      case 'stake':
        comparison = getStakeBaseUnits(a) < getStakeBaseUnits(b) ? -1 : (getStakeBaseUnits(a) > getStakeBaseUnits(b) ? 1 : 0);
        break;
      case 'uptime':
        // If uptime is missing for this chain, fall back to remainingBalance (if present).
        // Note: we treat 0 as a valid numeric value; missing is undefined/null/non-finite.
        if (chain?.validators?.some(v => Number.isFinite(v.uptime))) {
          comparison = (Number.isFinite(a.uptime) ? a.uptime : -1) - (Number.isFinite(b.uptime) ? b.uptime : -1);
        } else {
          const aBal = (a.remainingBalance ?? 0);
          const bBal = (b.remainingBalance ?? 0);
          comparison = aBal - bBal;
        }
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

  const totalStakeBaseUnits = chain?.validators.reduce((sum, v) => sum + getStakeBaseUnits(v), 0n) || 0n;
  const hasUptimeData = chain?.validators?.some(v => Number.isFinite(v.uptime)) ?? false;
  const hasRemainingBalanceData = chain?.validators?.some(v => Number.isFinite(v.remainingBalance)) ?? false;

  const sybilResistance = (chain?.sybilResistanceType || '').toLowerCase();

  // Sybil resistance determines the meaning of stake metrics:
  // - Proof of Stake: show stake (tokens)
  // - Proof of Authority: no staking, show weight
  // - Unknown/other: infer from validator payload
  //
  // NOTE: Some chains are marked PoS but the validator payload may not include `amountStaked`.
  // In that case, we fall back to weight-mode rather than displaying a misleading ~0 after decimals conversion.
  const stakeMode: 'tokens' | 'weight' =
    sybilResistance === 'proof of authority'
      ? 'weight'
      : sybilResistance === 'proof of stake'
        ? ((chain?.validators?.some(v => v.stakeUnit === 'tokens') ?? false) ? 'tokens' : 'weight')
        : ((chain?.validators?.some(v => v.stakeUnit === 'weight') ?? false) ? 'weight' : 'tokens');

  const stakeIsWeight = stakeMode === 'weight';
  const maxRemainingBalance = chain?.validators?.reduce((max, v) => {
    const bal = Number(v.remainingBalance);
    if (!Number.isFinite(bal)) return max;
    return Math.max(max, bal);
  }, 0) ?? 0;

  // Validator operator cost assumption (used for remaining-balance runway coloring)
  const MONTHLY_COST_AVAX = 1.33;
  // remainingBalance units vary across backends/chains (some return 1e9, some 1e18 base units).
  // Use a magnitude heuristic to normalize to AVAX:
  // - >= 1e15: treat as 18-decimals
  // - otherwise: treat as 9-decimals
  const toAvax = (raw: number) => {
    const n = Number(raw);
    if (!Number.isFinite(n)) return 0;
    return n >= 1e15 ? n / 1e18 : n / 1e9;
  };
  const formatAvax = (avax: number) => {
    const n = Number(avax);
    if (!Number.isFinite(n)) return 'N/A';
    if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
    return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  };
  const formatStakeDisplay = (rawBaseUnits: string, unit?: 'tokens' | 'weight') => {
    // If this validator is in "weight" mode, treat it as a plain integer.
    if (unit === 'weight') return formatUnits(rawBaseUnits, 0, { maxFractionDigits: 0 });
    return formatUnits(rawBaseUnits, stakeTokenDecimals, { maxFractionDigits: 2 });
  };
  
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <StatusBar health={health} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <LoadingSpinner size="lg" />
            <p className="mt-4 text-muted-foreground">Loading chain details...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !chain) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <StatusBar health={health} />
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl shadow-lg p-6 max-w-md w-full text-center">
            <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-4">{error}</h2>
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
    <div className="min-h-screen flex flex-col bg-background">
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
          <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-[0_18px_60px_-30px_rgba(239,68,68,0.45)] mb-6">
            {/* Decorative background */}
            <div aria-hidden className="pointer-events-none absolute inset-0">
              <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-[#ef4444]/15 blur-3xl" />
              <div className="absolute -bottom-28 -left-28 h-72 w-72 rounded-full bg-[#ef4444]/10 blur-3xl" />
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/5 dark:to-white/5" />
            </div>

            <div className="relative p-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Left Column: Chain Info */}
                <div className="flex flex-col gap-6">
                  <div className="flex items-start gap-5">
                    {chain.chainLogoUri ? (
                      <div className="relative flex-shrink-0">
                        <img
                          src={chain.chainLogoUri}
                          alt={`${chain.chainName} logo`}
                          className="w-20 h-20 rounded-2xl shadow-md bg-background/40 p-2 ring-1 ring-border"
                          onError={(e) => {
                            e.currentTarget.src = "/icon-dark-animated.svg";
                            e.currentTarget.onerror = null;
                          }}
                        />
                        <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center border-2 border-card">
                          <CheckCircle className="w-3.5 h-3.5 text-white" />
                        </div>
                      </div>
                    ) : (
                      <div className="relative flex-shrink-0">
                        <img
                          src="/icon-dark-animated.svg"
                          alt={`${chain.chainName} logo`}
                          className="w-20 h-20 rounded-2xl shadow-md bg-background/40 p-2 ring-1 ring-border"
                        />
                        <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center border-2 border-card">
                          <CheckCircle className="w-3.5 h-3.5 text-white" />
                        </div>
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <h1 className="text-3xl font-semibold tracking-tight text-foreground">{chain.chainName}</h1>
                        {chain.networkToken && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/50 text-xs font-medium text-foreground border border-border">
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
                        <p className="text-sm text-muted-foreground leading-relaxed mb-4 line-clamp-2">
                          {chain.description}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-2">
                        {chain.categories?.map(category => (
                          <span
                            key={category}
                            className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-[#ef4444]/10 text-[#ef4444] border border-[#ef4444]/20"
                          >
                            {category}
                          </span>
                        ))}
                        {chain.assets?.map((asset, index) => (
                          <span
                            key={index}
                            className="inline-flex items-center px-2.5 py-1 bg-muted/50 rounded-md text-xs font-medium text-muted-foreground border border-border"
                          >
                            {asset.symbol}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Actions Row */}
                  <div className="flex items-center gap-3 border-t border-border pt-4">
                    {chain.website && (
                      <a
                        href={chain.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-border bg-muted/40 hover:bg-muted/70 text-foreground transition-colors"
                      >
                        <Globe className="w-4 h-4" />
                        Website
                      </a>
                    )}
                    <div className="h-8 w-px bg-border mx-1"></div>
                    {chain.socials?.map((social, index) => {
                      const Icon = getSocialIcon(social.name);
                      return (
                        <a
                          key={index}
                          href={social.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 rounded-lg border border-transparent text-muted-foreground hover:text-[#ef4444] hover:bg-[#ef4444]/10 hover:border-[#ef4444]/15 transition-all"
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
                  <div className="relative overflow-hidden rounded-xl p-3 border border-[#ef4444]/20 bg-card">
                    <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#ef4444]/12 via-transparent to-transparent" />
                    <div className="flex items-center gap-2 mb-1">
                      <Activity className="w-4 h-4 text-[#ef4444]" />
                      <span className="text-xs font-medium text-[#ef4444]">TPS</span>
                    </div>
                    <p className={`text-xl font-bold ${tpsColor}`}>{tpsValue}</p>
                  </div>

                  <div className="relative overflow-hidden rounded-xl p-3 border border-[#ef4444]/20 bg-card">
                    <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#ef4444]/12 via-transparent to-transparent" />
                    <div className="flex items-center gap-2 mb-1">
                      <Users className="w-4 h-4 text-[#ef4444]" />
                      <span className="text-xs font-medium text-[#ef4444]">Validators</span>
                    </div>
                    <p className="text-xl font-bold text-[#ef4444]">{chain.validators.length}</p>
                  </div>

                  <div className="relative overflow-hidden rounded-xl p-3 border border-[#ef4444]/20 bg-card">
                    <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#ef4444]/12 via-transparent to-transparent" />
                    <div className="flex items-center gap-2 mb-1">
                      <Globe className="w-4 h-4 text-[#ef4444]" />
                      <span className="text-xs font-medium text-[#ef4444]">Type</span>
                    </div>
                    <p className="text-xl font-bold text-[#ef4444]">
                      {(() => {
                        const name = (chain.chainName || '').toLowerCase();
                        const evmId = String(chain.originalChainId || '');
                        const isAvalancheCChain = name.includes('c-chain') || evmId === '43114';
                        if (isAvalancheCChain) return 'Primary Network';
                        return chain.isL1 ? 'L1' : 'Legacy Subnet';
                      })()}
                    </p>
                  </div>

                  <div className="relative overflow-hidden rounded-xl p-3 border border-[#ef4444]/20 bg-card">
                    <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#ef4444]/12 via-transparent to-transparent" />
                    <div className="flex items-center gap-2 mb-1">
                      <Shield className="w-4 h-4 text-[#ef4444]" />
                      <span className="text-xs font-medium text-[#ef4444]">Sybil resistance</span>
                    </div>
                    <p className="text-xl font-bold text-[#ef4444] truncate" title={chain.sybilResistanceType || 'N/A'}>
                      {chain.sybilResistanceType || 'N/A'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Compact Technical Details Grid */}
            <div className="border-t border-border bg-muted/20 p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="flex flex-col p-3 bg-card rounded-lg border border-border">
                  <span className="text-xs font-medium text-muted-foreground mb-1">EVM Chain ID</span>
                  <div className="flex items-center justify-between">
                    <code className="text-sm font-mono font-semibold text-foreground">{chain.originalChainId || chain.chainId}</code>
                    <button
                      onClick={() => handleCopy('chainId', chain.originalChainId || chain.chainId)}
                      className="text-muted-foreground hover:text-[#ef4444] transition-colors p-1 rounded hover:bg-muted"
                    >
                      {copied === 'chainId' ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {chain.subnetId && (
                  <div className="flex flex-col p-3 bg-card rounded-lg border border-border">
                    <span className="text-xs font-medium text-muted-foreground mb-1">Subnet ID</span>
                    <div className="flex items-center justify-between">
                      <code className="text-sm font-mono text-foreground truncate mr-2" title={chain.subnetId}>
                        {chain.subnetId.slice(0, 8)}...{chain.subnetId.slice(-8)}
                      </code>
                      <button
                        onClick={() => handleCopy('subnetId', chain.subnetId)}
                        className="text-muted-foreground hover:text-[#ef4444] transition-colors p-1 rounded hover:bg-muted shrink-0"
                      >
                        {copied === 'subnetId' ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                )}

                {chain.platformChainId && (
                  <div className="flex flex-col p-3 bg-card rounded-lg border border-border">
                    <span className="text-xs font-medium text-muted-foreground mb-1">Blockchain ID</span>
                    <div className="flex items-center justify-between">
                      <code className="text-sm font-mono text-foreground truncate mr-2" title={chain.platformChainId}>
                        {chain.platformChainId.slice(0, 8)}...{chain.platformChainId.slice(-8)}
                      </code>
                      <button
                        onClick={() => handleCopy('platformChainId', chain.platformChainId)}
                        className="text-muted-foreground hover:text-[#ef4444] transition-colors p-1 rounded hover:bg-muted shrink-0"
                      >
                        {copied === 'platformChainId' ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                )}

                {chain.rpcUrls && chain.rpcUrls.length > 0 && (
                  <div className="flex flex-col p-3 bg-card rounded-lg border border-border">
                    <span className="text-xs font-medium text-muted-foreground mb-1">RPC URL</span>
                    <div className="flex items-center justify-between">
                      <code className="text-sm font-mono text-foreground truncate mr-2" title={chain.rpcUrls[0]}>
                        {chain.rpcUrls[0].replace('https://', '')}
                      </code>
                      <button
                        onClick={() => navigator.clipboard.writeText(chain.rpcUrls?.[0] || '')}
                        className="text-muted-foreground hover:text-[#ef4444] transition-colors p-1 rounded hover:bg-muted shrink-0"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
              
              {lastUpdate && (
                <div className="mt-4 flex justify-end">
                  <span className="text-xs text-muted-foreground">
                    Last updated: {format(new Date(lastUpdate * 1000), 'MMM d, yyyy HH:mm')}
                  </span>
                </div>
              )}
            </div>

          </div>

            {/* Tab Navigation */}
            <div className="mb-6">
              <div className="border-b border-border">
                <nav className="flex space-x-8" aria-label="Tabs">
                  {[
                    { id: 'validators', name: 'Validators', icon: Users, disabled: false },
                    { id: 'economics', name: 'Economics', icon: TrendingUp, disabled: true },
                    { id: 'stage', name: 'Stage', icon: Zap, disabled: true },
                    { id: 'social', name: 'Social', icon: MessageCircle, disabled: true }
                  ].map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                      <div key={tab.id} className="relative">
                        <button
                          onClick={() => !tab.disabled && setActiveTab(tab.id as 'validators')}
                          onMouseEnter={() => tab.disabled && setHoveredTab(tab.id)}
                          onMouseLeave={() => setHoveredTab(null)}
                          disabled={tab.disabled}
                          className={`
                            group inline-flex items-center py-4 px-1 border-b-2 font-medium text-sm transition-all
                            ${isActive
                              ? 'border-[#ef4444] text-[#ef4444]'
                              : tab.disabled
                                ? 'border-transparent text-muted-foreground cursor-not-allowed opacity-50'
                                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border cursor-pointer'
                            }
                          `}
                        >
                          <Icon className={`
                            -ml-0.5 mr-2 h-5 w-5
                            ${isActive
                              ? 'text-[#ef4444]'
                              : tab.disabled
                                ? 'text-muted-foreground'
                                : 'text-muted-foreground group-hover:text-foreground'
                            }
                          `} />
                          {tab.name}
                        </button>
                        {tab.disabled && hoveredTab === tab.id && (
                          <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 px-3 py-1.5 bg-popover text-popover-foreground text-xs rounded-lg shadow-lg whitespace-nowrap z-10 border border-border">
                            Coming soon
                            <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-popover"></div>
                          </div>
                        )}
                      </div>
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
                  <StakeDistributionChart
                    validators={chain.validators}
                    mode={stakeMode}
                    tokenSymbol={tokenSymbol}
                    tokenDecimals={stakeTokenDecimals}
                  />
                  
                  {/* Validators Table */}
                  <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
                    {/* Validators Header & Search */}
                    <div className="p-6 border-b border-border bg-muted/20">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div>
                          <h3 className="text-xl font-semibold text-foreground">
                            Validators
                          </h3>
                        </div>
                        <div className="relative w-full sm:w-72">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <input
                            type="text"
                            placeholder="Search by Node ID or Address..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="block w-full pl-10 pr-3 py-2.5 border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#ef4444] focus:border-transparent transition-all text-sm shadow-sm"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-border">
                        <thead className="bg-muted/20">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                              Status
                            </th>
                            <th 
                              className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground transition-colors"
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
                              className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground transition-colors"
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
                              {stakeIsWeight ? 'Weight' : 'Stake'}
                                {stakeIsWeight && (
                                  <span
                                    className="text-muted-foreground cursor-help inline-flex"
                                    title="A measure of voting influence of this validator when validating for the Avalanche L1"
                                    aria-label="Weight tooltip"
                                  >
                                    <Info className="w-3.5 h-3.5" />
                                  </span>
                                )}
                                {sortBy === 'stake' && (
                                  <span className="text-[#ef4444]">
                                    {sortOrder === 'asc' ? '↑' : '↓'}
                                  </span>
                                )}
                              </div>
                            </th>
                            <th 
                              className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground transition-colors"
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
                              {hasUptimeData ? 'Avg Validator Uptime' : (hasRemainingBalanceData ? 'Remaining Balance' : 'Avg Validator Uptime')}
                                {sortBy === 'uptime' && (
                                  <span className="text-[#ef4444]">
                                    {sortOrder === 'asc' ? '↑' : '↓'}
                                  </span>
                                )}
                              </div>
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-card divide-y divide-border">
                          {displayedValidators.map((validator, index) => {
                            const percentage = (() => {
                              const v = unitsToNumber(validator.weight, stakeIsWeight ? 0 : stakeTokenDecimals);
                              const t = unitsToNumber(totalStakeBaseUnits, stakeIsWeight ? 0 : stakeTokenDecimals);
                              if (!Number.isFinite(v) || !Number.isFinite(t) || t <= 0) return '0.00';
                              return ((v / t) * 100).toFixed(2);
                            })();
                            return (
                              <tr 
                                key={validator.address} 
                                className="hover:bg-muted/30 transition-colors cursor-pointer"
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
                                      className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-xs font-bold shadow-sm ring-2 ring-card" 
                                      style={{ 
                                        backgroundColor: getValidatorColor(index, theme === 'dark', 0.9)
                                      }}
                                    >
                                      {validator.address.slice(0, 2).toUpperCase()}
                                    </div>
                                    <div>
                                      <div className="text-sm font-medium text-foreground">
                                        {validator.address.slice(0, 8)}...{validator.address.slice(-6)}
                                      </div>
                                      <div className="text-xs text-muted-foreground">
                                        Node ID
                                      </div>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="text-sm text-foreground font-medium">
                                    {formatStakeDisplay(
                                      validator.weight,
                                      stakeMode === 'weight' ? 'weight' : validator.stakeUnit
                                    )}{' '}
                                    {(stakeMode === 'weight' ? 'weight' : validator.stakeUnit) === 'weight' ? (
                                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                        weight
                                        <span
                                          className="text-muted-foreground cursor-help inline-flex"
                                          title="A measure of voting influence of this validator when validating for the Avalanche L1"
                                          aria-label="Weight tooltip"
                                        >
                                          <Info className="w-3 h-3" />
                                        </span>
                                      </span>
                                    ) : (
                                      tokenSymbol
                                    )}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {percentage}% of total
                                  </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  {hasUptimeData ? (
                                    <div className="flex items-center">
                                      <div className="flex-1 bg-muted rounded-full h-2 mr-3 overflow-hidden">
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
                                        {Number.isFinite(validator.uptime) ? `${validator.uptime.toFixed(1)}%` : 'N/A'}
                                      </span>
                                    </div>
                                  ) : (
                                    <div className="flex items-center">
                                      <div className="flex-1 bg-muted rounded-full h-2 mr-3 overflow-hidden">
                                        {(() => {
                                          const raw = Number(validator.remainingBalance ?? 0);
                                          const avax = Number.isFinite(raw) ? toAvax(raw) : 0;
                                          const monthsRemaining = MONTHLY_COST_AVAX > 0 ? avax / MONTHLY_COST_AVAX : 0;
                                          const barColor =
                                            monthsRemaining <= 1 ? 'bg-red-500' :
                                            monthsRemaining <= 3 ? 'bg-yellow-500' :
                                            'bg-green-500';

                                          return (
                                        <div
                                          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                                          style={{
                                            width: `${maxRemainingBalance > 0 ? Math.min(100, ((validator.remainingBalance ?? 0) / maxRemainingBalance) * 100) : 0}%`
                                          }}
                                        ></div>
                                          );
                                        })()}
                                      </div>
                                      {(() => {
                                        const raw = Number(validator.remainingBalance);
                                        if (!Number.isFinite(raw)) {
                                          return <span className="text-sm font-medium min-w-[6rem] text-muted-foreground">N/A</span>;
                                        }

                                        const avax = toAvax(raw);
                                        const monthsRemaining = MONTHLY_COST_AVAX > 0 ? avax / MONTHLY_COST_AVAX : 0;
                                        const textColor =
                                          monthsRemaining <= 1 ? 'text-red-600 dark:text-red-400' :
                                          monthsRemaining <= 3 ? 'text-yellow-600 dark:text-yellow-400' :
                                          'text-green-600 dark:text-green-400';

                                        return (
                                          <span className={`text-sm font-medium min-w-[6rem] ${textColor}`}>
                                            {formatAvax(avax)} AVAX
                                          </span>
                                        );
                                      })()}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Show More Button */}
                    {filteredValidators.length > 10 && !showAllValidators && (
                      <div className="px-6 py-4 bg-muted/20 border-t border-border">
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
                        <p className="text-muted-foreground">
                          No validators found matching "{searchTerm}"
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      
      <Footer />
    </div>
  );
}