import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { activityOwners, activityOwnerOf } from '../utils/activityOwner';
import { chainSeo } from '../utils/chainSeo';
import { format } from 'date-fns';
import { getChains, getTPSHistory, getChainTxCountHistory, getChainRisk, getL1BeatValidators, getL1BeatSubnetType, getL1BeatDailyFeeBurn, getL1BeatFeeMetrics, getEvmFeesBurned, DailyFeeBurn } from '../api';
import { Chain, TPSHistory, ChainRisk } from '../types';
import {
  ArrowLeft,
  Search,
  Info,
  Copy,
  Check,
  ExternalLink,
  TrendingUp,
  AlertTriangle,
  Shield,
  Globe,
  MessageCircle,
  Send,
  Github,
} from 'lucide-react';
import { Line, Bar } from 'react-chartjs-2';
import { watermarkPlugin, smoothLinePath, getInkRgb } from '../utils/chartConfig';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Filler, Tooltip as ChartTooltip, Legend as ChartLegend, TooltipItem } from 'chart.js';
import { StakeDistributionChart, getValidatorColor } from '../components/StakeDistributionChart';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Filler, ChartTooltip, ChartLegend);
import { AddToMetaMask } from '../components/AddToMetaMask';
import { SEO } from '../components/SEO';
import { StatStrip } from '../components/instrument';
import { SectionErrorBoundary } from '../components/SectionErrorBoundary';
import { ChartWatermark } from '../components/ChartWatermark';
import { useToast } from '../components/Toaster';
import { useTheme } from '../hooks/useTheme';
import { formatUnits, parseBaseUnits, unitsToNumber } from '../utils/formatUnits';

// Sticky section-nav scroll offset: navbar (56) + section nav (48) + gap (12).
const NAV_SCROLL_OFFSET = 56 + 48 + 12;
function scrollToSection(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const rect = el.getBoundingClientRect();
  window.scrollTo({ top: window.scrollY + rect.top - NAV_SCROLL_OFFSET, behavior: 'smooth' });
}

export function ChainDetails() {
  const { chainId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [chain, setChain] = useState<Chain | null>(null);
  const [tpsHistory, setTPSHistory] = useState<TPSHistory[]>([]);
  const [txHistory, setTxHistory] = useState<{ timestamp: number; value: number }[]>([]);
  const [loading, setLoading] = useState(true);
  // Shell (header + KPIs) renders as soon as the chain is found; the heavy
  // per-chain data (validators, TPS history, fees) streams in afterwards while
  // detailsLoading is true and the affected sections show inline skeletons.
  const [detailsLoading, setDetailsLoading] = useState(true);
  // Validators load on their own track — chains like the Primary Network have
  // 3000+ validators (paged + throttled to avoid rate limits), which would
  // otherwise hold up the fast TPS/fees data behind it.
  const [validatorsLoading, setValidatorsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [validatorStatus, setValidatorStatus] = useState<'all' | 'active' | 'inactive'>('active');
  const [sortBy, setSortBy] = useState<'stake' | 'uptime' | 'address'>('stake');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const { theme } = useTheme();
  const [copied, setCopied] = useState<'chainId' | 'subnetId' | 'platformChainId' | null>(null);
  const [activeSection, setActiveSection] = useState<string>('activity');
  const [subnetType, setSubnetType] = useState<'l1' | 'legacy' | null>(null);
  const [activityOwner, setActivityOwner] = useState<Chain | null>(null);
  const [risk, setRisk] = useState<ChainRisk | null>(null);
  const [dailyFeeBurn, setDailyFeeBurn] = useState<DailyFeeBurn[]>([]);
  // Full-history series used for the "All" timeframe. For L1s this is the same
  // daily data; for C-Chain it's monthly, because daily is capped at 100 points
  // by the API and monthly covers the whole history (2020→now).
  const [feeBurnAllSeries, setFeeBurnAllSeries] = useState<DailyFeeBurn[]>([]);
  const [allTimeFeesBurned, setAllTimeFeesBurned] = useState<number>(0);
  const [feeBurnTimeframe, setFeeBurnTimeframe] = useState<0 | 7 | 30 | 90>(0);
  // C-Chain burns base fee + priority tip (EIP-1559). This holds the all-time
  // base-vs-tip split for the subtitle; null for L1 validation-fee burn.
  const [feeBurnSplit, setFeeBurnSplit] = useState<{ basePct: number; priorityPct: number } | null>(null);
  // Base/priority burn (AVAX) for the C-Chain stacked breakdown chart — daily
  // (for 7/30/90D) and monthly (for the All view, full history).
  const [cchainBurnDaily, setCchainBurnDaily] = useState<{ date: string; base: number; priority: number }[]>([]);
  const [cchainBurnMonthly, setCchainBurnMonthly] = useState<{ date: string; base: number; priority: number }[]>([]);
  // Scroll container for the virtualized validator table (chains like the
  // Primary Network have 3000+ validators — rendering them all kills scroll/paint).
  const validatorScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      // Reset for the new chain so we never flash the previous chain's data.
      setLoading(true);
      setDetailsLoading(true);
      setValidatorsLoading(true);
      setTPSHistory([]);
      setTxHistory([]);
      setDailyFeeBurn([]);
      setFeeBurnAllSeries([]);
      setAllTimeFeesBurned(0);
      setFeeBurnSplit(null);
      setCchainBurnDaily([]);
      setCchainBurnMonthly([]);
      setSubnetType(null);
      setActivityOwner(null);

      // Phase 1 — find the chain and paint the shell (header + KPIs) immediately.
      let foundChain;
      let owner: Chain | undefined;
      try {
        const chains = await getChains({ includeInactive: true });
        if (cancelled) return;
        foundChain = chains.find(c => c.chainId === chainId);
        if (foundChain) owner = activityOwnerOf(activityOwners(chains), foundChain);
        if (!foundChain && chainId) {
          // Registry renames that only add word breaks ("turingchain" became
          // "Turing Chain") changed the slug; send old links to the new one.
          const bare = chainId.replace(/-/g, '');
          const renamed = chains.find(c => c.chainId.replace(/-/g, '') === bare);
          if (renamed) {
            navigate(`/chain/${renamed.chainId}${window.location.search}`, { replace: true });
            return;
          }
        }
      } catch {
        if (!cancelled) {
          setError('Failed to load chain details');
          setLoading(false);
          setDetailsLoading(false);
        }
        return;
      }

      if (!foundChain) {
        if (!cancelled) {
          setError('Chain not found');
          setLoading(false);
          setDetailsLoading(false);
        }
        return;
      }

      setChain({ ...foundChain, validators: [] });
      // Its EVM ID's activity is counted on another blockchain's page.
      const activityElsewhere = !!owner && owner !== foundChain;
      setActivityOwner(activityElsewhere ? owner! : null);
      setError(null);
      setLoading(false);
      setValidatorsLoading(!!foundChain.subnetId);

      // Use originalChainId where present (numeric ID), falling back to chainId.
      const apiChainId = foundChain.originalChainId || foundChain.chainId;
      const sid = foundChain.subnetId;

      // Kick off the validators fetch NOW (concurrent with the batch) but await
      // it separately so it never holds up the TPS/fees data. One request
      // returns every validator, active and inactive.
      const validatorsPromise = sid ? getL1BeatValidators(sid, false) : null;

      // The Primary Network / C-Chain burns EIP-1559 base fee + priority tip on
      // every tx (a different source than L1 validation-fee burn).
      const isPrimary = (foundChain.originalChainId || '') === '43114'
        || (foundChain.chainName || '').toLowerCase().includes('c-chain');

      // Phase 2 — fast per-chain data (TPS / fees / subnet type). A failure here
      // keeps the shell on screen rather than replacing the page with an error.
      try {
        // C-Chain: fetch daily (recent, for 7/30/90 — capped at 100 points) AND
        // monthly (full history 2020→now, for the "All" view).
        const [sType, history, txCounts, feeBurnData, feeMetrics, cchainDaily, cchainMonthly] = await Promise.all([
          sid ? getL1BeatSubnetType(sid) : Promise.resolve(null),
          // One extra day: the unfinished current day is dropped, leaving 30.
          activityElsewhere ? Promise.resolve([]) : getTPSHistory(31, apiChainId),
          activityElsewhere ? Promise.resolve([]) : getChainTxCountHistory(apiChainId, 31),
          sid && !isPrimary ? getL1BeatDailyFeeBurn(sid) : Promise.resolve([]),
          sid && !isPrimary ? getL1BeatFeeMetrics(sid) : Promise.resolve([]),
          isPrimary ? getEvmFeesBurned(foundChain.originalChainId || 43114, { granularity: 'day', limit: 100 }) : Promise.resolve(null),
          isPrimary ? getEvmFeesBurned(foundChain.originalChainId || 43114, { granularity: 'month', limit: 1000 }) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setSubnetType(sType);
        setTPSHistory(history.slice(-30));
        setTxHistory(txCounts.slice(-30));
        if (isPrimary && cchainDaily) {
          // Map the C-Chain burn series into the shared DailyFeeBurn shape so it
          // reuses the same cumulative-burn chart. Daily nAVAX is well under
          // MAX_SAFE_INTEGER; the all-time cumulative uses BigInt parsing.
          const toDaily = (s: typeof cchainDaily.series) =>
            s.map((p) => ({
              date: p.period.slice(0, 10),
              total_fees_burned: Number(BigInt(p.total_burned)),
              active_validators: 0,
            }));
          setDailyFeeBurn(toDaily(cchainDaily.series));
          setFeeBurnAllSeries(toDaily((cchainMonthly ?? cchainDaily).series));
          const toBreakdown = (s: typeof cchainDaily.series) =>
            s.map((p) => ({
              date: p.period.slice(0, 10),
              base: Number(BigInt(p.base_fee_burned)) / 1e9,
              priority: Number(BigInt(p.priority_fee_burned)) / 1e9,
            }));
          setCchainBurnDaily(toBreakdown(cchainDaily.series));
          setCchainBurnMonthly(toBreakdown(cchainMonthly?.series ?? []));
          const total = Number(BigInt(cchainDaily.cumulative.total_burned));
          const base = Number(BigInt(cchainDaily.cumulative.base_fee_burned));
          setAllTimeFeesBurned(total);
          setFeeBurnSplit(total > 0 ? { basePct: (base / total) * 100, priorityPct: 100 - (base / total) * 100 } : null);
        } else {
          setDailyFeeBurn(feeBurnData);
          setFeeBurnAllSeries(feeBurnData);
          if (feeMetrics.length > 0) {
            setAllTimeFeesBurned(feeMetrics[0].total_fees_paid);
          }
        }
      } catch {
        /* secondary data failed — keep the shell; sections show empty states */
      } finally {
        if (!cancelled) setDetailsLoading(false);
      }

      // Phase 3 — validators (already in flight).
      if (validatorsPromise) {
        try {
          const vals = await validatorsPromise;
          if (cancelled) return;
          // If there are no active validators at all, default the tab to "All"
          // so the user immediately sees the inactive history.
          if (!vals.some(v => v.active === true)) {
            setValidatorStatus('all');
          }
          setChain(prev => (prev ? { ...prev, validators: vals } : prev));
        } catch {
          /* validators failed — table shows its empty state */
        } finally {
          if (!cancelled) setValidatorsLoading(false);
        }
      }
    }

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [chainId]);


  // Filter fee burn data by timeframe for display
  const filteredFeeBurn = useMemo(() => {
    if (feeBurnTimeframe === 0) return feeBurnAllSeries;
    return dailyFeeBurn.slice(-feeBurnTimeframe);
  }, [dailyFeeBurn, feeBurnAllSeries, feeBurnTimeframe]);

  const handleCopy = async (type: 'chainId' | 'subnetId' | 'platformChainId', value?: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      toast('Failed to copy to clipboard', 'error');
    }
  };

  const getCurrentTPS = () => {
    if (!tpsHistory.length) return 'N/A';
    // The real figure: quiet chains run well under 1 TPS, and "< 1.00" hid how far under.
    return formatTpsExact(tpsHistory[tpsHistory.length - 1].totalTps);
  };

  const tokenDecimals = chain?.networkToken?.decimals ?? 18;
  const tokenSymbol = chain?.networkToken?.symbol || 'N/A';
  // Avalanche staking/validator APIs often represent AVAX in nAVAX (1e9).
  // Even if EVM-native AVAX uses 18 decimals, we should display validator stake using 9 decimals.
  const stakeTokenDecimals = tokenSymbol === 'AVAX' ? 9 : tokenDecimals;

  const getStakeBaseUnits = (v: { weight: string }) => parseBaseUnits(v.weight) ?? 0n;

  const filteredValidators = chain?.validators.filter(validator => {
    if (validatorStatus === 'active' && validator.active !== true) return false;
    if (validatorStatus === 'inactive' && validator.active === true) return false;
    return validator.address.toLowerCase().includes(searchTerm.toLowerCase());
  }).sort((a, b) => {
    let comparison = 0;
    
    switch (sortBy) {
      case 'stake':
        comparison = getStakeBaseUnits(a) < getStakeBaseUnits(b) ? -1 : (getStakeBaseUnits(a) > getStakeBaseUnits(b) ? 1 : 0);
        break;
      case 'uptime':
        // If uptime is missing for this chain, fall back to remainingBalance (if present).
        // Note: we treat 0 as a valid numeric value; missing is undefined/null/non-finite.
        if (chain?.validators?.some(v => Number.isFinite(v.uptime))) {
          comparison = (Number.isFinite(a.uptime) ? (a.uptime as number) : -1) - (Number.isFinite(b.uptime) ? (b.uptime as number) : -1);
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

  // Only the rows in (and near) the viewport are mounted. measureElement keeps
  // the total height accurate so the scrollbar is correct even for 3000+ rows.
  const rowVirtualizer = useVirtualizer({
    count: filteredValidators.length,
    getScrollElement: () => validatorScrollRef.current,
    estimateSize: () => 69,
    overscan: 12,
  });

  // Shares are of the stake that is validating now; inactive validators would dilute them.
  const totalStakeBaseUnits =
    chain?.validators.reduce((sum, v) => (v.active ? sum + getStakeBaseUnits(v) : sum), 0n) || 0n;
  // L1 subnets use continuous fees — show remaining balance column.
  // Legacy subnets (primary network) use staking — show uptime column.
  const isL1Subnet = subnetType === 'l1';
  const hasRemainingBalanceData = isL1Subnet && (chain?.validators?.some(v => Number.isFinite(v.remainingBalance)) ?? false);
  const hasUptimeData = !hasRemainingBalanceData && (chain?.validators?.some(v => Number.isFinite(v.uptime) && (v.uptime as number) > 0) ?? false);

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

  // Decentralization signal sourced from the backend risk endpoint, which
  // computes the Nakamoto coefficient on the COMPLETE validator set (the client
  // only ever sees a partial list for big chains). Falls back to the compact
  // summary on the chains list while the detail request is in flight. The
  // backend only emits this for chains with active L1 validators, so its
  // presence is the gate (no client-side primary/legacy filtering needed).
  const decentralization = useMemo(() => {
    const dec = risk?.decentralization ?? chain?.decentralization ?? null;
    if (!dec || dec.nakamoto_33 == null) return null;
    // Per-validator shares for the concentration bar (detail endpoint only),
    // capped to the top 24 + one "others" slice so huge sets don't render 1000
    // slivers. Weights are raw strings that can exceed JS safe-int — Number()
    // loses absolute precision but ratios are unaffected.
    const weights = (risk?.decentralization?.weights ?? [])
      .map((w) => Number(w))
      .filter((n) => Number.isFinite(n) && n > 0);
    const total = weights.reduce((a, b) => a + b, 0);
    let shares: number[] = [];
    if (total > 0) {
      const head = weights.slice(0, 24).map((n) => n / total);
      const tail = weights.slice(24).reduce((a, n) => a + n, 0) / total;
      shares = tail > 0 ? [...head, tail] : head;
    }
    return {
      count: dec.active_validator_count,
      nak33: dec.nakamoto_33,
      nak50: dec.nakamoto_50,
      shares,
      hasData: true,
    };
  }, [risk, chain?.decentralization]);

  useEffect(() => {
    const id = chain?.platformChainId || '';
    if (!id) {
      setRisk(null);
      return;
    }
    let alive = true;
    getChainRisk(id).then((r) => {
      if (alive) setRisk(r);
    });
    return () => {
      alive = false;
    };
  }, [chain?.platformChainId]);

  // Scroll-spy sections for the sticky nav. Validators now leads with the
  // decentralization summary, so it's a single validator-set section.
  const sections = useMemo(
    () => [
      { id: 'activity', label: 'Activity' },
      { id: 'validators', label: 'Validators' },
      { id: 'economics', label: 'Economics' },
    ],
    [],
  );

  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const threshold = NAV_SCROLL_OFFSET + 8;
        let next = sections[0]?.id ?? '';
        for (const s of sections) {
          const el = document.getElementById(s.id);
          if (el && el.getBoundingClientRect().top <= threshold) next = s.id;
        }
        setActiveSection((prev) => (prev === next ? prev : next));
        ticking = false;
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [sections]);

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
  // PoA: the abstract voting weight as a grouped integer.
  const formatWeight = (rawBaseUnits: string) => formatUnits(rawBaseUnits, 0, { maxFractionDigits: 0 });
  // PoS: the API gives the real staked amount already in whole tokens (decimal
  // string), so just group it for display.
  const formatStakedTokens = (amount?: string): string => {
    if (amount == null) return '—';
    const n = Number(amount);
    return Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: 2 }) : amount;
  };
  
  if (loading) {
    return <ChainDetailsSkeleton />;
  }

  if (error || !chain) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 text-center">
        <div className="w-14 h-14 mx-auto mb-5 rounded-md bg-muted flex items-center justify-center">
          <AlertTriangle className="w-7 h-7 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-bold text-foreground mb-2">{error || 'Chain not found'}</h2>
        <button
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded bg-foreground text-background hover:bg-foreground/90 text-sm font-semibold hover:bg-foreground/90 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Overview
        </button>
      </div>
    );
  }

  const tpsValue = getCurrentTPS();
  // Quiet chains read as 0 TPS, which hides real activity, so they get daily
  // transaction counts instead. Busy chains stay on TPS.
  const quiet = txHistory.length > 0 && Math.max(...txHistory.map((d) => d.value)) < QUIET_TX_PER_DAY;
  const activityPoints = quiet
    ? txHistory.map((d) => ({ t: d.timestamp, v: d.value }))
    : tpsHistory.map((h) => ({ t: h.timestamp, v: Number(h.totalTps) || 0 }));
  const latestTx = txHistory.length ? txHistory[txHistory.length - 1] : null;
  const lastUpdate = tpsHistory.length > 0 ? tpsHistory[tpsHistory.length - 1].timestamp : null;

  // Validators stream in after the shell. Until they arrive, derive active/
  // inactive from the chain's validatorCount (already in the list payload) so
  // the header badge doesn't flash INACTIVE on an active chain.
  const validatorsLoaded = chain.validators.length > 0 || !validatorsLoading;
  const hasActiveValidators = validatorsLoaded
    ? chain.validators.some((v) => v.active)
    : (chain.validatorCount ?? 0) > 0;

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
    // Paper plane, so Telegram and Discord don't share the speech bubble.
    if (lowerName.includes('telegram')) return Send;
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
    <div className="max-w-7xl 2xl:max-w-screen-2xl mx-auto px-4 sm:px-6 py-5 space-y-5">
      <SEO {...chainSeo(chain)} />
      <button
        onClick={() => navigate('/')}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        All chains
      </button>

      <header className="border-b border-border pb-5">
        <div>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-4 min-w-0">
              <img
                src={chain.chainLogoUri || '/icon-dark-animated.svg'}
                alt=""
                className="w-11 h-11 rounded-md bg-muted shrink-0 object-cover"
                onError={(e) => {
                  e.currentTarget.src = '/icon-dark-animated.svg';
                  e.currentTarget.onerror = null;
                }}
              />
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h1 className="text-[22px] leading-7 font-semibold text-foreground truncate">
                    {chain.chainName}
                  </h1>
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span aria-hidden className={`w-1.5 h-1.5 rounded-full ${hasActiveValidators ? 'bg-up' : 'bg-muted-foreground/40'}`} />
                    {hasActiveValidators ? 'Active' : 'Inactive'}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {[
                      chain.network === 'fuji' ? 'Fuji testnet' : chain.network === 'mainnet' ? 'Mainnet' : null,
                      (() => {
                        const name = (chain.chainName || '').toLowerCase();
                        const isCC = name.includes('c-chain') || String(chain.originalChainId || '') === '43114';
                        return isCC ? 'Primary Network' : chain.isL1 ? 'L1' : 'Legacy subnet';
                      })(),
                      chain.sybilResistanceType
                        ? /proof of authority/i.test(chain.sybilResistanceType)
                          ? 'PoA'
                          : /proof of stake/i.test(chain.sybilResistanceType)
                            ? 'PoS'
                            : chain.sybilResistanceType
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                  {chain.networkToken?.symbol && (
                    <span className="inline-flex items-center gap-1 font-medium text-foreground">
                      {chain.networkToken.logoUri && (
                        <img
                          src={chain.networkToken.logoUri}
                          alt=""
                          className="w-3.5 h-3.5 rounded-full"
                        />
                      )}
                      {chain.networkToken.symbol}
                    </span>
                  )}
                  {chain.networkToken?.name &&
                    chain.networkToken.name !== chain.networkToken.symbol && (
                      <>
                        <span>·</span>
                        <span>{chain.networkToken.name}</span>
                      </>
                    )}
                  {chain.originalChainId && (
                    <>
                      <span>·</span>
                      <span>EVM {chain.originalChainId}</span>
                    </>
                  )}
                  {chain.subnetId && (
                    <>
                      <span>·</span>
                      <button
                        onClick={() => handleCopy('subnetId', chain.subnetId)}
                        className="num inline-flex items-center gap-1 h-5 px-1.5 rounded bg-muted hover:bg-accent transition-colors"
                        title={chain.subnetId}
                      >
                        <span>
                          {chain.subnetId.slice(0, 6)}…{chain.subnetId.slice(-4)}
                        </span>
                        {copied === 'subnetId' ? (
                          <Check className="w-2.5 h-2.5 text-up" />
                        ) : (
                          <Copy className="w-2.5 h-2.5" />
                        )}
                      </button>
                    </>
                  )}
                  {chain.rpcUrls && chain.rpcUrls.length > 0 && (
                    <>
                      <span>·</span>
                      <button
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(chain.rpcUrls?.[0] || '');
                            toast('RPC URL copied', 'success');
                          } catch {
                            toast('Failed to copy RPC URL', 'error');
                          }
                        }}
                        className="inline-flex items-center gap-1 h-5 px-1.5 rounded bg-muted hover:bg-accent transition-colors"
                        title={chain.rpcUrls[0]}
                      >
                        <span>RPC</span>
                        <Copy className="w-2.5 h-2.5" />
                      </button>
                    </>
                  )}
                </div>
                {chain.description && (
                  <p className="text-[12px] text-muted-foreground leading-relaxed mt-2 max-w-2xl line-clamp-2">
                    {chain.description}
                  </p>
                )}
                {chain.categories && chain.categories.length > 0 && (
                  <div className="flex flex-wrap items-center gap-x-3 mt-2 text-[11px] text-muted-foreground capitalize">
                    {chain.categories.map((c) => (
                      <span key={c} className="inline-flex items-center gap-1.5">
                        <span aria-hidden className="w-1.5 h-1.5 rounded-sm bg-muted-foreground/60" />
                        {c.toLowerCase()}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {chain.website && (
                <a
                  href={chain.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center w-7 h-7 rounded border border-border bg-background hover:bg-accent transition-colors"
                  title="Website"
                >
                  <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                </a>
              )}
              {chain.explorerUrl && (
                <a
                  href={chain.explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center w-7 h-7 rounded border border-border bg-background hover:bg-accent transition-colors"
                  title="Explorer"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                </a>
              )}
              {chain.socials?.slice(0, 3).map((social, index) => {
                const Icon = getSocialIcon(social.name);
                return (
                  <a
                    key={index}
                    href={social.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center w-7 h-7 rounded border border-border bg-background hover:bg-accent transition-colors"
                    title={social.name}
                  >
                    <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                  </a>
                );
              })}
              <AddToMetaMask chain={chain} variant="compact" />
            </div>
          </div>
        </div>
      </header>

      <StatStrip
        items={[
          activityOwner
            ? {
                label: 'Activity',
                value: '—',
                sub: `Counted under ${activityOwner.chainName}`,
                tooltip: `This chain shares EVM chain ID ${activityOwner.evmChainId} with another ${activityOwner.chainName} blockchain, so its transactions are shown there.`,
              }
            : !detailsLoading && tpsHistory.length === 0 && txHistory.length === 0
            ? {
                label: 'Activity',
                value: '—',
                sub: 'No data yet',
                tooltip: "Transactions come from Avalanche's metrics API or the chain's public RPC. Neither has data for this chain yet.",
              }
            : quiet && latestTx
            ? {
                label: 'Transactions',
                value: latestTx.value.toLocaleString(),
                sub: `on ${format(new Date(latestTx.timestamp * 1000), 'MMM d')}`,
              }
            : {
                label: 'Current TPS',
                value: detailsLoading && tpsHistory.length === 0 ? '—' : String(tpsValue),
                sub: 'transactions per second',
              },
          {
            label: 'Active validators',
            value: (chain.validatorCount || chain.validators.filter((v) => v.active).length).toLocaleString(),
          },
          {
            label: 'Nakamoto (33%)',
            value: decentralization?.nak33 != null ? String(decentralization.nak33) : '—',
            sub: 'validators to control a third of stake',
            tooltip: 'Smallest number of validators that together control more than 33% of total stake. Higher means stake is more spread out.',
          },
          {
            label: 'Fees burned',
            value: allTimeFeesBurned > 0 ? formatAvaxAmount(allTimeFeesBurned / 1_000_000_000) : '—',
            sub: allTimeFeesBurned > 0 ? 'AVAX, all time' : 'No burn data',
          },
        ]}
        footnote={lastUpdate ? `Updated ${format(new Date(lastUpdate * 1000), 'MMM d, yyyy HH:mm')}` : undefined}
      />

            {/* Sticky section nav — scroll-spy, matching the Metrics page */}
            <nav
              className="sticky top-12 z-30 -mx-4 sm:-mx-6 px-4 sm:px-6 bg-background border-b border-border"
              aria-label="Sections"
            >
              <div className="flex items-center gap-0.5 overflow-x-auto no-scrollbar -mb-px">
                {sections.map((s) => {
                  const isActive = activeSection === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => scrollToSection(s.id)}
                      className={`shrink-0 inline-flex items-center h-10 px-2.5 border-b-2 text-[12px] font-medium transition-colors ${
                        isActive
                          ? 'border-foreground text-foreground'
                          : 'border-transparent text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </nav>

            <div className="flex flex-col gap-4 sm:gap-6">
              <section id="activity" className="order-1 scroll-mt-24">
                <SectionErrorBoundary label="activity">
                  <ChainActivityCard points={activityPoints} unit={quiet ? 'tx' : 'tps'} loading={detailsLoading && tpsHistory.length === 0} elsewhere={activityOwner} />
                </SectionErrorBoundary>
              </section>

              <section id="economics" className="order-3 scroll-mt-24">
                <SectionErrorBoundary label="economics">
                  {detailsLoading ? (
                    <EconomicsSkeleton />
                  ) : (() => {
                const evmId = (chain.originalChainId || '').toString();
                const lcName = (chain.chainName || '').toLowerCase();
                const isPrimaryNetwork = lcName.includes('c-chain') || evmId === '43114';
                const isLegacySubnet = subnetType === 'legacy';
                // The Primary Network DOES burn fees (EIP-1559 base + tip on every
                // C-Chain tx) — only legacy subnets have no fee burn to report.
                const notApplicable = isLegacySubnet;
                if (notApplicable) {
                  return (
                    <div className="space-y-4 sm:space-y-6">
                      <div className="bg-card rounded-md border border-border p-8 sm:p-10 text-center max-w-2xl mx-auto">
                        <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
                          <TrendingUp className="w-5 h-5 text-muted-foreground" />
                        </div>
                        <h3 className="text-base font-semibold text-foreground mb-2">
                          Fee burn doesn’t apply to this chain
                        </h3>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          This is a legacy subnet that hasn’t converted to an L1 via ACP-77.
                          Only converted L1s pay continuous validation fees to the P-Chain, so
                          there’s no fee burn to report.
                        </p>
                      </div>
                    </div>
                  );
                }
                return (
                <div className="space-y-4 sm:space-y-6">
                  {dailyFeeBurn.length > 0 ? (() => {
                    const allTimeBurnedAvax = allTimeFeesBurned / 1_000_000_000;
                    const latestDay = dailyFeeBurn[dailyFeeBurn.length - 1];
                    const latestDailyAvax = latestDay ? latestDay.total_fees_burned / 1_000_000_000 : 0;
                    const visibleBurnedAvax = filteredFeeBurn.reduce((sum, d) => sum + d.total_fees_burned, 0) / 1_000_000_000;
                    const avgDailyAvax = visibleBurnedAvax / filteredFeeBurn.length;
                    const formatAvaxValue = formatAvaxAmount;

                    return (
                      <>
                        {/* Summary Cards — shared KpiCard style for page consistency */}
                        <StatStrip
                          items={[
                            { label: 'Total burned', value: formatAvaxValue(allTimeBurnedAvax), sub: 'AVAX, all time' },
                            { label: "Today's burn", value: formatAvaxValue(latestDailyAvax), sub: 'AVAX' },
                            { label: 'Avg daily burn', value: formatAvaxValue(avgDailyAvax), sub: `AVAX, ${filteredFeeBurn.length}-day window` },
                          ]}
                        />

                        {/* Cumulative Fee Burn Chart */}
                        <div className="bg-card rounded-md border border-border overflow-hidden">
                          <div className="px-4 sm:px-5 pt-4 pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                            <div>
                              <h3 className="text-[14px] font-semibold text-foreground">Cumulative fee burn</h3>
                              <p className="text-[12px] text-muted-foreground mt-0.5">
                                {isPrimaryNetwork
                                  ? feeBurnSplit
                                    ? `AVAX burned via EIP-1559 · ${feeBurnSplit.basePct.toFixed(1)}% base fee · ${feeBurnSplit.priorityPct.toFixed(1)}% priority tip`
                                    : 'Total AVAX burned via EIP-1559 base fee + priority tip'
                                  : 'Total AVAX burned to P-Chain over time'}
                              </p>
                            </div>
                            <div className="flex gap-1.5">
                              {([{ value: 7, label: '7D' }, { value: 30, label: '30D' }, { value: 90, label: '90D' }, { value: 0, label: 'All' }] as const).map(({ value, label }) => (
                                <button
                                  key={value}
                                  onClick={() => setFeeBurnTimeframe(value as 0 | 7 | 30 | 90)}
                                  className={`num h-7 px-2.5 rounded text-[12px] font-medium transition-colors ${
                                    feeBurnTimeframe === value
                                      ? 'bg-foreground text-background'
                                      : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                                  }`}
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="px-2 sm:px-4 pb-4 sm:pb-6">
                            <div className="h-[300px] sm:h-[400px]">
                              {(() => {
                                // "All" uses the full-history series (sums to the cumulative total), so start from 0.
                                // Shorter views show a window, so offset the start so the line ends at the all-time total.
                                const startOffset = feeBurnTimeframe === 0 ? 0 : (() => {
                                  const visibleSum = filteredFeeBurn.reduce((s, d) => s + d.total_fees_burned, 0) / 1_000_000_000;
                                  return allTimeBurnedAvax - visibleSum;
                                })();
                                const cumulativeData = filteredFeeBurn.reduce<number[]>((acc, d, i) => {
                                  const dailyAvax = d.total_fees_burned / 1_000_000_000;
                                  acc.push(i === 0 ? startOffset + dailyAvax : acc[i - 1] + dailyAvax);
                                  return acc;
                                }, []);

                                // Crosshair plugin matching AvalancheNetworkMetrics
                                const crosshairPlugin = {
                                  id: 'feeBurnCrosshair',
                                  afterDraw: (chart: any) => {
                                    const { tooltip, ctx, chartArea } = chart;
                                    if (tooltip?.opacity > 0 && tooltip?.caretX) {
                                      ctx.save();
                                      ctx.beginPath();
                                      ctx.setLineDash([6, 4]);
                                      ctx.moveTo(tooltip.caretX, chartArea.top);
                                      ctx.lineTo(tooltip.caretX, chartArea.bottom);
                                      ctx.lineWidth = 1;
                                      ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)';
                                      ctx.stroke();
                                      ctx.restore();
                                    }
                                  },
                                };

                                // Line shadow plugin matching AvalancheNetworkMetrics
                                // Glow retired: instrument output has no drop shadow.
                                const lineShadowPlugin = { id: 'feeBurnLineShadow' };

                                const isDark = theme === 'dark';

                                return (
                                  <Line
                                    data={{
                                      labels: filteredFeeBurn.map(d => {
                                        const date = new Date(d.date + 'T00:00:00');
                                        // C-Chain "All" is monthly across years — show month + year; otherwise month + day.
                                        return feeBurnTimeframe === 0 && isPrimaryNetwork
                                          ? date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
                                          : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                                      }),
                                      datasets: [{
                                        label: 'Cumulative Burn (AVAX)',
                                        data: cumulativeData,
                                        borderColor: `rgb(${getInkRgb(isDark)})`,
                                        backgroundColor: (ctx: any) => {
                                          const chart = ctx.chart;
                                          const { ctx: c, chartArea } = chart;
                                          const ink = getInkRgb(isDark);
                                          if (!chartArea) return `rgba(${ink}, 0.08)`;
                                          const gradient = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                                          gradient.addColorStop(0, `rgba(${ink}, 0.12)`);
                                          gradient.addColorStop(0.5, `rgba(${ink}, 0.05)`);
                                          gradient.addColorStop(1, `rgba(${ink}, 0)`);
                                          return gradient;
                                        },
                                        fill: true,
                                        borderWidth: 1.5,
                                        tension: 0.2,
                                        pointRadius: 0,
                                        pointHoverRadius: 4,
                                        pointHoverBackgroundColor: isDark ? '#1a1d21' : '#ffffff',
                                        pointHoverBorderColor: `rgb(${getInkRgb(isDark)})`,
                                        pointHoverBorderWidth: 1.5,
                                      }],
                                    }}
                                    plugins={[crosshairPlugin, lineShadowPlugin, watermarkPlugin]}
                                    options={{
                                      responsive: true,
                                      maintainAspectRatio: false,
                                      animation: { duration: 750, easing: 'easeInOutQuart' },
                                      interaction: { mode: 'index', intersect: false },
                                      plugins: {
                                        legend: { display: false },
                                        tooltip: {
                                          backgroundColor: isDark ? 'rgba(15, 23, 42, 0.97)' : 'rgba(255, 255, 255, 0.98)',
                                          titleColor: isDark ? '#f1f5f9' : '#0f172a',
                                          bodyColor: isDark ? '#cbd5e1' : '#334155',
                                          borderColor: isDark ? 'rgba(148, 163, 184, 0.3)' : 'rgba(0, 0, 0, 0.1)',
                                          borderWidth: 1,
                                          padding: 16,
                                          boxPadding: 8,
                                          cornerRadius: 12,
                                          caretSize: 8,
                                          caretPadding: 12,
                                          titleFont: { size: 15, weight: 'bold' as const },
                                          bodyFont: { size: 13 },
                                          bodySpacing: 6,
                                          titleMarginBottom: 10,
                                          displayColors: false,
                                          callbacks: {
                                            title: (items: any[]) => {
                                              if (!items.length) return '';
                                              const idx = items[0].dataIndex;
                                              const entry = filteredFeeBurn[idx];
                                              if (!entry) return '';
                                              const date = new Date(entry.date + 'T00:00:00');
                                              return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
                                            },
                                            label: (ctx: any) => {
                                              const v = ctx.parsed.y;
                                              const formatted = v >= 100 ? v.toFixed(2) : v >= 1 ? v.toFixed(4) : v.toFixed(6);
                                              return `Total Burned: ${formatted} AVAX`;
                                            },
                                            afterLabel: (ctx: any) => {
                                              const idx = ctx.dataIndex;
                                              const entry = filteredFeeBurn[idx];
                                              if (!entry) return '';
                                              const dailyAvax = entry.total_fees_burned / 1_000_000_000;
                                              const dailyFormatted = dailyAvax >= 1 ? dailyAvax.toFixed(4) : dailyAvax.toFixed(6);
                                              return [
                                                `Daily Burn: ${dailyFormatted} AVAX`,
                                                `Validators: ${entry.active_validators}`,
                                              ];
                                            },
                                          },
                                        },
                                      },
                                      scales: {
                                        x: {
                                          grid: { display: false },
                                          border: { display: false },
                                          ticks: {
                                            color: isDark ? '#94a3b8' : '#64748b',
                                            font: { size: 11 },
                                            maxTicksLimit: 8,
                                            maxRotation: 0,
                                            // Drop labels that would collide on narrow screens.
                                            autoSkip: true,
                                            autoSkipPadding: 12,
                                          },
                                        },
                                        y: {
                                          beginAtZero: false,
                                          border: { display: false },
                                          grid: { color: isDark ? 'rgba(148, 163, 184, 0.08)' : 'rgba(0, 0, 0, 0.05)' },
                                          ticks: {
                                            color: isDark ? '#94a3b8' : '#64748b',
                                            font: { size: 11 },
                                            maxTicksLimit: 8,
                                            callback: (value: any) => {
                                              if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
                                              if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
                                              if (value >= 1) return value.toFixed(1);
                                              return value.toFixed(2);
                                            },
                                          },
                                        },
                                      },
                                    }}
                                  />
                                );
                              })()}
                            </div>
                          </div>
                        </div>

                        {isPrimaryNetwork && cchainBurnDaily.length > 0 && (
                          <CChainBurnBreakdownChart daily={cchainBurnDaily} monthly={cchainBurnMonthly} isDark={theme === 'dark'} />
                        )}
                      </>
                    );
                  })() : (
                    <div className="border-y border-border py-10 text-center text-[12px] text-muted-foreground">
                      No fee burn data for this chain yet.
                    </div>
                  )}
                </div>
                );
              })()}
                </SectionErrorBoundary>
              </section>

              <section id="validators" className="order-2 scroll-mt-24">
                <SectionErrorBoundary label="validators">
                <div className="space-y-4 sm:space-y-6">
                  {/* Decentralization summary — the verdict + control read that
                      the weight distribution and table below break down. */}
                  {decentralization && (
                    <DecentralizationCard
                      data={decentralization}
                      sybil={chain.sybilResistanceType}
                      vm={risk?.validator_manager ?? null}
                    />
                  )}

                  {validatorsLoading && chain.validators.length === 0 ? (
                    <ValidatorsSkeleton />
                  ) : (
                  <>
                  {/* No active validators warning */}
                  {chain.validators.length > 0 && !chain.validators.some(v => v.active) && (
                    <div className="flex items-center gap-2 py-2 text-[12px] text-muted-foreground">
                      <AlertTriangle className="w-3.5 h-3.5 text-[#d4a017] flex-shrink-0" />
                      This chain has no active validators. Showing historical validator data below.
                    </div>
                  )}

                  {/* Stake Distribution Chart — active validators only */}
                  {chain.validators.some(v => v.active) && (
                    <StakeDistributionChart
                      validators={chain.validators.filter(v => v.active)}
                      mode={stakeMode}
                      tokenSymbol={tokenSymbol}
                      tokenDecimals={stakeTokenDecimals}
                      onValidatorClick={(v) => navigate(`/validator/${v.validationId || v.address}${chain.subnetId ? `?subnet=${chain.subnetId}` : ''}`)}
                    />
                  )}

                  {/* Validators Table */}
                  <div>
                    {/* Validators toolbar */}
                    <div className="py-2">
                      <div className="flex flex-col lg:flex-row lg:items-center gap-2 lg:gap-4">
                        <div className="flex items-center gap-4">
                          <h3 className="text-[13px] font-medium text-foreground">
                            Validators
                            <span className="num ml-1.5 text-[11px] font-normal text-muted-foreground">
                              {filteredValidators.length}
                            </span>
                          </h3>
                          <div className="flex items-center gap-0.5">
                            {(['active', 'inactive', 'all'] as const).map((s) => {
                              const total = chain.validators.length;
                              const activeCount = chain.validators.filter(v => v.active === true).length;
                              const count =
                                s === 'all' ? total : s === 'active' ? activeCount : total - activeCount;
                              const isActive = validatorStatus === s;
                              return (
                                <button
                                  key={s}
                                  type="button"
                                  onClick={() => setValidatorStatus(s)}
                                  className={`inline-flex items-baseline gap-1.5 h-8 px-2.5 rounded text-[12.5px] font-medium capitalize transition-colors ${
                                    isActive
                                      ? 'bg-accent text-foreground'
                                      : 'text-muted-foreground hover:text-foreground'
                                  }`}
                                >
                                  {s}
                                  <span className="num text-[11px] font-normal text-muted-foreground">
                                    {count}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        <div className="hidden lg:block w-px h-5 bg-border" aria-hidden />
                        <div className="relative w-full sm:w-72">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                          <input
                            type="text"
                            placeholder="Search by node ID or address"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full h-8 pl-8 pr-3 rounded bg-background border border-border text-[12px] placeholder:text-muted-foreground focus:outline-none focus:border-foreground/40"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Own scroll context (max-height) so the header can stick
                        while the rows scroll — no pagination. */}
                    <div ref={validatorScrollRef} className="overflow-auto max-h-[70vh] border-t border-border">
                      <table className="min-w-full text-[12px]">
                        <thead className="sticky top-0 z-10 bg-background">
                          <tr className="h-9 border-b border-border">
                            {/* On phones the status is just the dot, so the stake column fits. */}
                            <th className="pr-2 sm:pr-4 text-left text-[11px] font-medium text-muted-foreground w-5 sm:w-24">
                              <span className="sr-only sm:not-sr-only">Status</span>
                            </th>
                            <th 
                              className="pr-4 text-left text-[11px] font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
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
                                  <span className="text-foreground">
                                    {sortOrder === 'asc' ? '↑' : '↓'}
                                  </span>
                                )}
                              </div>
                            </th>
                            <th 
                              className="pr-4 text-left text-[11px] font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
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
                                  <span className="text-foreground">
                                    {sortOrder === 'asc' ? '↑' : '↓'}
                                  </span>
                                )}
                              </div>
                            </th>
                            <th 
                              className="pr-4 text-left text-[11px] font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
                              onClick={() => {
                                if (sortBy === 'uptime') {
                                  setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                                } else {
                                  setSortBy('uptime');
                                  setSortOrder('desc');
                                }
                              }}
                            >
                              <div className="flex items-center justify-end gap-1">
                              <span className="hidden sm:inline">{hasUptimeData ? 'Avg uptime' : (hasRemainingBalanceData ? 'Remaining balance' : 'Avg uptime')}</span>
                              <span className="sm:hidden">{hasUptimeData ? 'Uptime' : (hasRemainingBalanceData ? 'Balance' : 'Uptime')}</span>
                                {sortBy === 'uptime' && (
                                  <span className="text-foreground">
                                    {sortOrder === 'asc' ? '↑' : '↓'}
                                  </span>
                                )}
                              </div>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {(() => {
                            const virtualRows = rowVirtualizer.getVirtualItems();
                            const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
                            const paddingBottom =
                              virtualRows.length > 0
                                ? rowVirtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end
                                : 0;
                            return (
                              <>
                                {paddingTop > 0 && (
                                  <tr aria-hidden>
                                    <td colSpan={4} style={{ height: paddingTop, padding: 0, border: 0 }} />
                                  </tr>
                                )}
                                {virtualRows.map((virtualRow) => {
                            const index = virtualRow.index;
                            const validator = filteredValidators[index];
                            const percentage = (() => {
                              const v = unitsToNumber(validator.weight, stakeIsWeight ? 0 : stakeTokenDecimals);
                              const t = unitsToNumber(totalStakeBaseUnits, stakeIsWeight ? 0 : stakeTokenDecimals);
                              if (!Number.isFinite(v) || !Number.isFinite(t) || t <= 0) return '0.00';
                              return ((v / t) * 100).toFixed(2);
                            })();
                            return (
                              <tr
                                key={validator.address}
                                data-index={index}
                                ref={rowVirtualizer.measureElement}
                                className="h-10 border-b border-border/50 hover:bg-accent/40 transition-colors cursor-pointer"
                                onClick={() => {
                                  navigate(`/validator/${validator.validationId || validator.address}${chain.subnetId ? `?subnet=${chain.subnetId}` : ''}`);
                                }}
                              >
                                <td className="pr-2 sm:pr-4 whitespace-nowrap">
                                  <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                    <span aria-hidden className={`w-1.5 h-1.5 rounded-full ${validator.active ? 'bg-up' : 'bg-muted-foreground/40'}`} />
                                    <span className="sr-only sm:not-sr-only">{validator.active ? 'Active' : 'Inactive'}</span>
                                  </span>
                                </td>
                                <td className="pr-4 whitespace-nowrap">
                                  <div className="flex items-center gap-2.5">
                                    <span
                                      aria-hidden
                                      className="w-2 h-2 rounded-sm shrink-0"
                                      style={{ backgroundColor: getValidatorColor(index, theme === 'dark', 0.9) }}
                                    />
                                    <span className="num text-[12px] text-foreground">
                                      {validator.address.slice(0, 8)}…{validator.address.slice(-6)}
                                    </span>
                                  </div>
                                </td>
                                <td className="pr-4 whitespace-nowrap">
                                  <div className="num flex items-baseline gap-3 text-[12px] text-foreground">
                                    <span className="min-w-[4.5rem]">
                                      {stakeIsWeight ? (
                                        formatWeight(validator.weight)
                                      ) : (
                                        <>
                                          {formatStakedTokens(validator.stakedAmount)}{' '}
                                          <span className="text-[11px] text-muted-foreground">{validator.stakedToken || tokenSymbol}</span>
                                        </>
                                      )}
                                    </span>
                                    <span className="text-[11px] text-muted-foreground">{percentage}%</span>
                                  </div>
                                </td>
                                <td className="pr-4 whitespace-nowrap">
                                  {hasUptimeData ? (
                                  <div className="flex items-center justify-end gap-2.5">
                                    <div className="hidden sm:block w-24 bg-muted/60 rounded-sm h-[3px] overflow-hidden">
                                      <div 
                                        className={`h-full rounded-sm ${
                                          (validator.uptime || 0) >= 90 ? 'bg-up' :
                                          (validator.uptime || 0) >= 80 ? 'bg-[#d4a017]' : 'bg-down'
                                        }`}
                                        style={{ width: `${validator.uptime || 0}%` }}
                                      ></div>
                                    </div>
                                    <span className={`num text-[12px] w-14 text-right ${
                                      (validator.uptime || 0) >= 90 ? 'text-foreground' :
                                      (validator.uptime || 0) >= 80 ? 'text-[#d4a017]' : 'text-down'
                                    }`}>
                                        {Number.isFinite(validator.uptime) ? `${(validator.uptime as number).toFixed(1)}%` : 'N/A'}
                                    </span>
                                  </div>
                                  ) : (
                                    <div className="flex items-center justify-end gap-2.5">
                                      <div className="hidden sm:block w-24 bg-muted/60 rounded-sm h-[3px] overflow-hidden">
                                        {(() => {
                                          const raw = Number(validator.remainingBalance ?? 0);
                                          const avax = Number.isFinite(raw) ? toAvax(raw) : 0;
                                          const monthsRemaining = MONTHLY_COST_AVAX > 0 ? avax / MONTHLY_COST_AVAX : 0;
                                          const barColor =
                                            monthsRemaining <= 1 ? 'bg-down' :
                                            monthsRemaining <= 3 ? 'bg-[#d4a017]' :
                                            'bg-up';

                                          return (
                                        <div
                                          className={`h-full rounded-sm ${barColor}`}
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
                                          return <span className="num text-[12px] w-24 text-right text-muted-foreground">—</span>;
                                        }

                                        const avax = toAvax(raw);
                                        const monthsRemaining = MONTHLY_COST_AVAX > 0 ? avax / MONTHLY_COST_AVAX : 0;
                                        const textColor =
                                          monthsRemaining <= 1 ? 'text-down' :
                                          monthsRemaining <= 3 ? 'text-[#d4a017]' :
                                          'text-foreground';

                                        return (
                                          <span className={`num text-[12px] w-24 text-right ${textColor}`}>
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
                                {paddingBottom > 0 && (
                                  <tr aria-hidden>
                                    <td colSpan={4} style={{ height: paddingBottom, padding: 0, border: 0 }} />
                                  </tr>
                                )}
                              </>
                            );
                          })()}
                        </tbody>
                      </table>
                    </div>

                    {/* No Results */}
                    {searchTerm && filteredValidators.length === 0 && (
                      <div className="border-b border-border py-8 text-center text-[12px] text-muted-foreground">
                        No validators match "{searchTerm}".
                      </div>
                    )}
                  </div>
                  </>
                  )}
                </div>
                </SectionErrorBoundary>
              </section>
            </div>
    </div>
  );
}

function formatTps(value: number | undefined | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  if (value <= 0) return '0';
  if (value < 0.01) return '<0.01';
  if (value < 1) return value.toFixed(2);
  if (value < 10) return value.toFixed(1);
  return Math.round(value).toLocaleString();
}

// Inline skeletons shown while the heavy per-chain data streams in after the
// shell has painted (progressive rendering).
function ValidatorsSkeleton() {
  return (
    <>
      <div className="bg-card rounded-md border border-border p-4 sm:p-6">
        <div className="h-4 w-40 rounded bg-muted animate-pulse mb-4" />
        <div className="h-56 rounded bg-muted animate-pulse" />
      </div>
      <div className="bg-card rounded-md border border-border overflow-hidden">
        <div className="p-4 sm:p-6 border-b border-border bg-muted/20">
          <div className="h-5 w-32 rounded bg-muted animate-pulse" />
        </div>
        <div className="divide-y divide-border">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 sm:px-6 py-4">
              <div className="h-4 flex-1 rounded bg-muted animate-pulse" />
              <div className="h-4 w-16 rounded bg-muted animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function EconomicsSkeleton() {
  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-md border border-border bg-card p-4 sm:p-5">
            <div className="h-3 w-24 rounded bg-muted animate-pulse mb-3" />
            <div className="h-7 w-28 rounded-md bg-muted animate-pulse" />
          </div>
        ))}
      </div>
      <div className="bg-card rounded-md border border-border p-4 sm:p-6">
        <div className="h-4 w-40 rounded bg-muted animate-pulse mb-4" />
        <div className="h-56 rounded bg-muted animate-pulse" />
      </div>
    </div>
  );
}

// C-Chain fee burn split into base fee (bottom) + priority tip (top) as a
// stacked bar. 7/30/90D use the daily series; All uses the monthly series
// (full history). Hover shows each segment's AVAX and its share of that bar.
function CChainBurnBreakdownChart({ daily, monthly, isDark }: {
  daily: { date: string; base: number; priority: number }[];
  monthly: { date: string; base: number; priority: number }[];
  isDark: boolean;
}) {
  const [tf, setTf] = useState<0 | 7 | 30 | 90>(30);
  if (daily.length === 0) return null;

  const isAll = tf === 0;
  const series = isAll ? monthly : daily.slice(-tf);

  const periodBase = series.reduce((s, d) => s + d.base, 0);
  const periodTotal = series.reduce((s, d) => s + d.base + d.priority, 0);
  const basePct = periodTotal > 0 ? (periodBase / periodTotal) * 100 : 0;

  const labels = series.map((d) =>
    new Date(d.date + 'T00:00:00').toLocaleDateString('en-US', isAll ? { month: 'short', year: 'numeric' } : { month: 'short', day: 'numeric' }),
  );
  const tick = (v: unknown) => formatAvaxAmount(Number(v));

  return (
    <div className="bg-card rounded-md border border-border overflow-hidden">
      <div className="px-4 sm:px-5 pt-4 pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-[14px] font-semibold text-foreground">Fee burn: base vs priority</h3>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            {isAll ? 'All time' : `Last ${tf} days`} · {basePct.toFixed(1)}% base fee · {(100 - basePct).toFixed(1)}% priority tip
          </p>
        </div>
        <div className="flex gap-1.5">
          {([{ value: 7, label: '7D' }, { value: 30, label: '30D' }, { value: 90, label: '90D' }, { value: 0, label: 'All' }] as const).map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setTf(value as 0 | 7 | 30 | 90)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
                tf === value ? 'bg-foreground text-background hover:bg-foreground/90' : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="px-2 sm:px-4 pb-4 sm:pb-6">
        <div className="h-[300px] sm:h-[360px]">
          <Bar
            data={{
              labels,
              datasets: [
                { label: 'Base fee', data: series.map((d) => d.base), backgroundColor: 'rgba(140, 148, 158, 0.9)', stack: 'burn', borderRadius: 2, borderSkipped: false },
                { label: 'Priority tip', data: series.map((d) => d.priority), backgroundColor: 'rgba(245, 158, 11, 0.85)', stack: 'burn', borderRadius: 2, borderSkipped: false },
              ],
            }}
            plugins={[watermarkPlugin]}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              interaction: { mode: 'index', intersect: false },
              scales: {
                x: { stacked: true, grid: { display: false }, border: { display: false }, ticks: { color: isDark ? '#94a3b8' : '#64748b', font: { size: 11 }, maxTicksLimit: 8, maxRotation: 0, autoSkip: true, autoSkipPadding: 12 } },
                y: { stacked: true, beginAtZero: true, border: { display: false }, grid: { color: isDark ? 'rgba(148, 163, 184, 0.08)' : 'rgba(0, 0, 0, 0.05)' }, ticks: { color: isDark ? '#94a3b8' : '#64748b', font: { size: 11 }, maxTicksLimit: 6, callback: tick } },
              },
              plugins: {
                legend: { display: true, position: 'top', align: 'end', labels: { color: isDark ? '#e5e7eb' : '#374151', boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'circle', font: { size: 11 } } },
                tooltip: {
                  backgroundColor: isDark ? 'rgba(10, 10, 10, 0.95)' : 'rgba(255, 255, 255, 0.97)',
                  titleColor: isDark ? '#fafafa' : '#0a0a0a',
                  bodyColor: isDark ? '#fafafa' : '#0a0a0a',
                  borderColor: isDark ? 'rgba(38, 38, 38, 0.8)' : 'rgba(0, 0, 0, 0.1)',
                  borderWidth: 1,
                  padding: 12,
                  callbacks: {
                    label: (ctx: TooltipItem<'bar'>) => {
                      const d = series[ctx.dataIndex];
                      const total = d.base + d.priority;
                      // Bar values are always numeric here; chart.js types y as number | null.
                      const y = ctx.parsed.y as number;
                      const pct = total > 0 ? (y / total) * 100 : 0;
                      return `${ctx.dataset.label}: ${formatAvaxAmount(y)} AVAX (${pct.toFixed(1)}%)`;
                    },
                    footer: (items: { dataIndex: number }[]) => {
                      const d = series[items[0].dataIndex];
                      return `Total: ${formatAvaxAmount(d.base + d.priority)} AVAX`;
                    },
                  },
                },
              },
            }}
          />
        </div>
      </div>
    </div>
  );
}

// Headline/hover value — always 2 decimals so it matches the "Current TPS" KPI
// card (which uses toFixed(2)). Axis ticks keep formatTps() for cleaner labels.
function formatTpsExact(value: number | undefined | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  if (value <= 0) return '0';
  if (value < 0.01) return '<0.01';
  return value.toFixed(2);
}

// AVAX amount for the fee-burn headlines: full comma-separated number for large
// values (e.g. 5,013,443), with decimals kept for small amounts.
function formatAvaxAmount(v: number): string {
  if (!Number.isFinite(v)) return 'N/A';
  if (v >= 1000) return v.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (v >= 1) return v.toFixed(2);
  if (v >= 0.01) return v.toFixed(4);
  return v > 0 ? v.toFixed(6) : '0';
}

const ACT_W = 760;
const ACT_H = 180;
const ACT_M = { top: 12, right: 14, bottom: 22, left: 48 };

// Daily TPS trend — uses the history already fetched for the headline number.
// Below this many transactions a day (about 0.01 TPS) the chain shows daily counts.
const QUIET_TX_PER_DAY = 864;

function ChainActivityCard({ points: raw, unit, loading = false, elsewhere = null }: {
  points: { t: number; v: number }[];
  unit: 'tps' | 'tx';
  loading?: boolean;
  /** The chain that carries this EVM ID's activity, when it isn't this one. */
  elsewhere?: Chain | null;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const isTx = unit === 'tx';
  const fmt = (v: number) => (isTx ? Math.round(v).toLocaleString() : formatTpsExact(v));
  const fmtTick = (v: number) => (isTx ? Math.round(v).toLocaleString() : formatTps(v));
  const subtitle = isTx ? 'Transactions per day' : 'Transactions per second';

  const points = useMemo(
    () => raw.filter((p) => Number.isFinite(p.t)).sort((a, b) => a.t - b.t),
    [raw],
  );

  const geom = useMemo(() => {
    if (points.length < 2) return null;
    const xs = points.map((p) => p.t);
    const ys = points.map((p) => p.v);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const peak = Math.max(...ys, 0);
    // Whole-number steps for counts; an all-zero series gets a single 0 line.
    const maxY = peak === 0 ? 1 : isTx ? Math.max(3, Math.ceil(peak / 3) * 3) : peak;
    const iw = ACT_W - ACT_M.left - ACT_M.right;
    const ih = ACT_H - ACT_M.top - ACT_M.bottom;
    // Bars sit inside their day slot, so the outer ones don't spill past the axis.
    const slot = iw / points.length;
    const pad = isTx ? slot / 2 : 0;
    const sx = (t: number) => ACT_M.left + pad + ((t - minX) / (maxX - minX || 1)) * (iw - 2 * pad);
    const sy = (v: number) => ACT_M.top + ih - (v / maxY) * ih;
    const line = smoothLinePath(points.map((p) => ({ x: sx(p.t), y: sy(p.v) })));
    const floor = ACT_M.top + ih;
    const area = `${line} L${sx(maxX).toFixed(1)},${floor} L${sx(minX).toFixed(1)},${floor} Z`;
    const yTicks = peak === 0 ? [0] : Array.from({ length: 4 }, (_, i) => (maxY * i) / 3);
    // Counts are whole days, so they're bars; a smoothed line would dip below zero between them.
    const barW = Math.max(2, slot * 0.7);
    return { sx, sy, line, area, yTicks, floor, barW };
  }, [points, isTx]);

  const latest = points.length ? points[points.length - 1] : null;
  const active = hover != null && points[hover] ? points[hover] : null;
  const shown = active ?? latest;
  const first = points[0];
  // Day-to-day counts on a quiet chain swing by hundreds of percent; the delta would be noise.
  const delta = !isTx && first && latest && first.v > 0 ? ((latest.v - first.v) / first.v) * 100 : null;
  const positive = delta != null && delta >= 0;

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!geom || !svgRef.current || points.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const vx = ((e.clientX - rect.left) / rect.width) * ACT_W;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < points.length; i++) {
      const d = Math.abs(geom.sx(points[i].t) - vx);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    setHover(best);
  };

  if (loading) {
    return (
      <div className="rounded-md border border-border bg-card p-4 sm:p-5">
        <header className="flex items-end justify-between gap-3 mb-3">
          <div>
            <h2 className="text-[14px] font-semibold text-foreground">Activity</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}, last 30 days</p>
          </div>
          <div className="h-7 w-16 rounded-md bg-muted animate-pulse" />
        </header>
        <div className="h-[180px] rounded bg-muted animate-pulse" />
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border bg-card p-4 sm:p-5">
      <header className="flex items-end justify-between gap-3 mb-3">
        <div>
          <h2 className="text-[14px] font-semibold text-foreground">Activity</h2>
          {points.length > 0 && (
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {points.length > 1 ? `${subtitle}, last ${points.length} days` : subtitle}
            </p>
          )}
        </div>
        {shown && (
          <div className="text-right">
            <div className="num text-[22px] font-medium text-foreground leading-none">{fmt(shown.v)}</div>
            <div className="text-[11px] mt-1">
              {active ? (
                <span className="text-muted-foreground">{format(new Date(active.t * 1000), 'MMM d')}</span>
              ) : delta != null ? (
                <span className={positive ? 'text-up' : 'text-down'}>
                  {positive ? '+' : '−'}{Math.abs(delta).toFixed(0)}% over 30d
                </span>
              ) : (
                <span className="text-muted-foreground">latest</span>
              )}
            </div>
          </div>
        )}
      </header>
      {!geom && elsewhere ? (
        <div className="flex flex-col items-center justify-center gap-1 h-[160px] px-6 text-center">
          <p className="text-[13px] text-foreground">Activity is counted under another blockchain</p>
          <p className="text-[12px] text-muted-foreground max-w-md">
            This chain shares EVM chain ID {elsewhere.evmChainId} with{' '}
            <Link to={`/chain/${elsewhere.chainId}`} className="text-foreground underline underline-offset-2">
              {elsewhere.chainName}
            </Link>
            , which has more active validators, so its transactions are shown there.
          </p>
        </div>
      ) : !geom ? (
        <div className="flex flex-col items-center justify-center gap-1 h-[160px] px-6 text-center">
          <p className="text-[13px] text-foreground">No activity data for this chain yet</p>
          <p className="text-[12px] text-muted-foreground max-w-md">
            Transactions come from Avalanche's metrics API or the chain's public RPC. Neither has data for this
            chain yet.
          </p>
        </div>
      ) : (
        <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${ACT_W} ${ACT_H}`}
          className="w-full h-auto block"
          onMouseMove={handleMove}
          onMouseLeave={() => setHover(null)}
          role="img"
          aria-label={isTx ? 'Daily transactions over time' : 'TPS over time'}
        >
          <defs>
            <linearGradient id="chain-tps-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--ink)" stopOpacity={0.12} />
              <stop offset="100%" stopColor="var(--ink)" stopOpacity={0} />
            </linearGradient>
          </defs>
          {geom.yTicks.map((tick, i) => (
            <g key={i}>
              <line x1={ACT_M.left} x2={ACT_W - ACT_M.right} y1={geom.sy(tick)} y2={geom.sy(tick)} stroke="currentColor" strokeOpacity={0.08} />
              <text x={ACT_M.left - 8} y={geom.sy(tick)} textAnchor="end" dominantBaseline="middle" className="fill-muted-foreground" fontSize={10}>
                {fmtTick(tick)}
              </text>
            </g>
          ))}
          {isTx ? (
            points.map((p, i) => (
              <rect
                key={p.t}
                x={geom.sx(p.t) - geom.barW / 2}
                y={geom.sy(p.v)}
                width={geom.barW}
                height={Math.max(0, geom.floor - geom.sy(p.v))}
                rx={1}
                fill="var(--ink)"
                fillOpacity={hover == null || hover === i ? 0.75 : 0.3}
              />
            ))
          ) : (
            <>
              <path d={geom.area} fill="url(#chain-tps-fill)" />
              <path d={geom.line} fill="none" stroke="var(--ink)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            </>
          )}
          {!isTx && latest && !active && <circle cx={geom.sx(latest.t)} cy={geom.sy(latest.v)} r={3} fill="var(--ink)" />}
          {active && !isTx && (
            <g>
              <line x1={geom.sx(active.t)} x2={geom.sx(active.t)} y1={ACT_M.top} y2={geom.floor} stroke="rgb(148, 163, 184)" strokeOpacity={0.5} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
              <circle cx={geom.sx(active.t)} cy={geom.sy(active.v)} r={4} fill="var(--ink)" stroke="var(--card, #fff)" strokeWidth={2} />
            </g>
          )}
        </svg>
        <ChartWatermark />
        </div>
      )}
    </div>
  );
}

type ValidatorManager = NonNullable<ChainRisk['validator_manager']>;

function shortAddr(a?: string): string {
  if (!a) return '—';
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

function formatDelay(seconds: number): string {
  if (seconds <= 0) return 'instant';
  const d = Math.floor(seconds / 86400);
  if (d >= 1) return `${d}d delay`;
  const h = Math.floor(seconds / 3600);
  if (h >= 1) return `${h}h delay`;
  const m = Math.floor(seconds / 60);
  if (m >= 1) return `${m}m delay`;
  return `${seconds}s delay`;
}

// Turn the ValidatorManager control/proxy data into a plain-English risk read.
// Mirrors the backend guidance: a single EOA + instant-upgrade proxy is the
// worst (and most common) case; shared control and/or upgrade delays are better.
// Churn limits only count when upgrades aren't instant (else they're bypassable).
function controlAssessment(vm: ValidatorManager | null | undefined) {
  if (!vm || (!vm.owner && !vm.proxy)) {
    return {
      chip: 'Unresolved',
      chipTone: 'text-muted-foreground bg-muted/50',
      headline: 'No on-chain validator manager resolved (placeholder or legacy chain).',
      rows: [] as { label: string; value: string; tone: string; sub?: string }[],
    };
  }
  const kind = vm.owner?.kind;
  const ms = vm.owner?.multisig;
  const isProxy = !!vm.proxy?.is_proxy;
  const delay = vm.proxy?.upgrade_delay_seconds ?? 0;
  const instant = isProxy && delay === 0;
  const singleKey = kind === 'eoa';
  const shared = kind === 'multisig' || kind === 'timelock' || kind === 'dao';

  const ownerLabel = singleKey
    ? 'Single key (EOA)'
    : kind === 'multisig'
      ? `Multisig${ms ? ` (${ms.threshold} of ${ms.owners})` : ''}`
      : kind === 'timelock'
        ? 'Timelock'
        : kind === 'dao'
          ? 'DAO'
          : kind === 'contract'
            ? 'Contract'
            : 'Unknown';
  const ownerTone = singleKey
    ? 'text-down'
    : shared
      ? 'text-up'
      : 'text-foreground';

  const upgradeLabel = !isProxy ? 'Immutable' : instant ? 'Instant upgrade' : formatDelay(delay);
  const upgradeTone = !isProxy
    ? 'text-up'
    : instant
      ? 'text-down'
      : 'text-[#d4a017]';

  let chip: string;
  let chipTone: string;
  let headline: string;
  if (singleKey && (instant || !isProxy)) {
    chip = 'Single-key control';
    chipTone = 'text-down bg-down/10';
    headline = instant
      ? 'A single key can instantly upgrade the manager and replace the validator set.'
      : 'A single key directly controls the validator set.';
  } else if (instant) {
    chip = 'Instantly upgradeable';
    chipTone = 'text-down bg-down/10';
    headline = 'The manager can be upgraded instantly by its admin, so control can be changed at any time.';
  } else if (shared && !isProxy) {
    chip = 'Shared control';
    chipTone = 'text-up bg-green-500/10';
    headline = 'Control is shared and the manager is not upgradeable.';
  } else {
    chip = 'Partial safeguards';
    chipTone = 'text-yellow-600 dark:text-yellow-400 bg-yellow-500/10';
    headline = 'Some safeguards on control or upgrades.';
  }

  const churnValue = vm.churn?.max_churn_percentage;
  const rows = [
    { label: 'Validator-set control', value: ownerLabel, tone: ownerTone, sub: shortAddr(vm.owner?.address) },
    { label: 'Upgradeable', value: upgradeLabel, tone: upgradeTone, sub: isProxy ? shortAddr(vm.proxy?.proxy_admin_owner) : undefined },
    {
      label: 'Churn limit',
      value: churnValue != null ? `${churnValue}% / window` : '—',
      tone: 'text-foreground',
      sub: churnValue != null && instant ? 'bypassable via upgrade' : undefined,
    },
  ];
  return { chip, chipTone, headline, rows };
}

// Where the ValidatorManager is deployed — a liveness/recoverability axis,
// separate from who controls it. "self" = no recovery path if the L1 halts.
function recoverability(deployedOn?: string) {
  if (deployedOn === 'self')
    return {
      tone: 'text-[#d4a017]',
      text: 'Validator manager runs on this L1, so if the chain halts its validator set can’t be changed (no recovery path).',
    };
  if (deployedOn === 'c-chain')
    return {
      tone: 'text-up',
      text: 'Validator manager runs on the C-Chain, so the validator set stays changeable even if this L1 halts.',
    };
  return null;
}

const PERMISSIONED = {
  label: 'Permissioned',
  text: 'text-[#d95926]',
  ring: 'bg-[#d95926]/10',
  dot: 'bg-[#d95926]',
  note: 'The chain operator controls who can validate (PoA).',
};
const PERMISSIONLESS = {
  label: 'Permissionless',
  text: 'text-up',
  ring: 'bg-up/10',
  dot: 'bg-up',
  note: 'Anyone meeting the stake requirement can validate (PoS).',
};

// The one control fact we can derive today: PoA = permissioned validator set
// (operator picks the validators), PoS = permissionless (stake to join). Prefer
// the indexer's ValidatorManager type; fall back to the chain's sybil-resistance
// label while that's still "unknown". We show this instead of a fabricated
// "decentralization grade", which would mislead — a PoA chain can have well-
// spread stake yet be entirely operator-controlled.
function permissionModel(managerType?: string, sybil?: string) {
  const t = (managerType || '').toLowerCase();
  if (t === 'poa') return PERMISSIONED;
  if (t.startsWith('pos')) return PERMISSIONLESS;
  const s = (sybil || '').toLowerCase();
  if (s.includes('authority')) return PERMISSIONED;
  if (s.includes('stake')) return PERMISSIONLESS;
  return null;
}

function DecentralizationCard({
  data,
  sybil,
  vm,
}: {
  data: { count: number; nak33: number | null; nak50: number | null; shares: number[]; hasData: boolean };
  sybil?: string;
  vm?: ValidatorManager | null;
}) {
  const perm = permissionModel(vm?.type, sybil);
  const control = controlAssessment(vm);
  const stats: { value: string; label: string; title?: string }[] = [
    {
      value: data.nak33 != null ? String(data.nak33) : '—',
      label: 'Nakamoto (33%)',
      title: 'Smallest number of validators that together control more than 33% of total stake. Higher means stake is more spread out.',
    },
    { value: data.nak50 != null ? String(data.nak50) : '—', label: 'to control 50%' },
    { value: data.count.toLocaleString(), label: 'Active validators' },
  ];
  return (
    <div className="rounded-md border border-border bg-card overflow-hidden">
      <header className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 border-b border-border">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-[14px] font-semibold text-foreground">Decentralization</h2>
        </div>
        {perm && (
          <span className={`inline-flex items-center gap-1.5 text-[11px] ${perm.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${perm.dot}`} />
            {perm.label}
          </span>
        )}
      </header>

      <div className="p-4 sm:p-5">
        {data.hasData ? (
          <>
            <dl className="grid grid-cols-3 divide-x divide-border border border-border rounded-md">
              {stats.map((s) => (
                <div key={s.label} className="px-3 py-2.5" title={s.title}>
                  <dt className="text-[11px] text-muted-foreground leading-4">{s.label}</dt>
                  <dd className="num text-[20px] leading-7 font-medium text-foreground">{s.value}</dd>
                </div>
              ))}
            </dl>

            {/* Stake-concentration bar: the top `nak33` validators (which control
                >33%) are highlighted; the rest are muted. Ticks mark 33% / 50%. */}
            {data.shares.length > 0 && (
              <div className="mt-4">
                <div className="relative flex h-2 rounded-sm overflow-hidden bg-muted/40">
                  {data.shares.map((s, i) => (
                    <div
                      key={i}
                      style={{ width: `${Math.max(s * 100, 0.4)}%` }}
                      className={`h-full ${i < (data.nak33 ?? 0) ? 'bg-[#d4a017]' : 'bg-up/45'} ${
                        i > 0 ? 'border-l border-card/70' : ''
                      }`}
                      title={`#${i + 1}: ${(s * 100).toFixed(1)}% of stake`}
                    />
                  ))}
                  <span className="absolute inset-y-0 w-px bg-foreground/45" style={{ left: '33%' }} />
                  <span className="absolute inset-y-0 w-px bg-foreground/25" style={{ left: '50%' }} />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 mt-2 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-sm bg-[#d4a017]" />
                    Top {data.nak33} control &gt;33% of stake
                  </span>
                  <span className="flex items-center gap-1.5">
                    Remaining {Math.max(0, data.count - (data.nak33 ?? 0))}
                    <span className="w-2 h-2 rounded-sm bg-up/45" />
                  </span>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-[13px] text-muted-foreground py-2">
            Not enough validator stake data to assess distribution.
          </div>
        )}

        {/* Control & upgradeability — on-chain ValidatorManager reads. */}
        <div className="mt-5 pt-4 border-t border-border/60">
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 mb-2">
            <div className="text-[11px] font-medium text-muted-foreground">
              Control &amp; upgradeability
            </div>
            <span className={`inline-flex items-center h-5 px-1.5 rounded text-[11px] font-medium ${control.chipTone}`}>
              {control.chip}
            </span>
          </div>
          <p className="text-[12px] text-foreground/90 mb-3">{control.headline}</p>
          {control.rows.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {control.rows.map((r) => (
                <div key={r.label} className="border border-border rounded px-3 py-2">
                  <div className="text-[11px] text-muted-foreground">{r.label}</div>
                  <div className={`text-[13px] font-medium ${r.tone}`}>{r.value}</div>
                  {r.sub && (
                    <div className="num text-[10px] text-muted-foreground/70 mt-0.5 truncate">{r.sub}</div>
                  )}
                </div>
              ))}
            </div>
          )}
          {(() => {
            const rec = recoverability(vm?.deployed_on);
            if (!rec) return null;
            return (
              <div className="mt-2.5 flex items-start gap-1.5 text-[12px]">
                <span className={`shrink-0 ${rec.tone}`}>●</span>
                <span className="text-muted-foreground">{rec.text}</span>
              </div>
            );
          })()}
        </div>

        <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground/70">
          A signal, not a security audit. Distribution is from on-chain stake weights; control is read
          from the ValidatorManager contract and refreshed periodically. {perm ? `${perm.label}: ${perm.note}` : ''}
        </p>
      </div>
    </div>
  );
}


function ChainDetailsSkeleton() {
  return (
    <div className="max-w-7xl 2xl:max-w-screen-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      <div className="h-4 w-24 rounded bg-muted animate-pulse" />

      {/* Header card */}
      <div className="rounded-md border border-border bg-card shadow-xl p-6 sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-md bg-muted animate-pulse" />
            <div className="space-y-2.5">
              <div className="flex items-center gap-2">
                <div className="h-7 w-48 rounded bg-muted animate-pulse" />
                <div className="h-5 w-16 rounded-full bg-muted animate-pulse" />
                <div className="h-5 w-14 rounded-full bg-muted animate-pulse" />
              </div>
              <div className="h-3 w-64 rounded bg-muted animate-pulse" />
              <div className="h-3 w-80 max-w-full rounded bg-muted animate-pulse" />
            </div>
          </div>
        </div>
      </div>

      {/* Sticky tab nav skeleton */}
      <div className="-mx-4 sm:-mx-6 px-4 sm:px-6 py-2 border-b border-border">
        <div className="flex items-center gap-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-8 w-24 rounded bg-muted animate-pulse" />
          ))}
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-md border border-border bg-card p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="h-3 w-20 rounded bg-muted animate-pulse" />
              <div className="w-7 h-7 rounded bg-muted animate-pulse" />
            </div>
            <div className="h-7 w-24 rounded bg-muted animate-pulse" />
          </div>
        ))}
      </div>

      {/* Content body — generic validator table placeholder */}
      <div className="rounded-md border border-border bg-card overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-border flex items-center justify-between">
          <div className="h-5 w-40 rounded bg-muted animate-pulse" />
          <div className="h-9 w-64 rounded bg-muted animate-pulse" />
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 px-4 sm:px-6 py-4 border-b border-border/60 last:border-b-0"
          >
            <div className="h-5 w-16 rounded-full bg-muted animate-pulse" />
            <div className="flex items-center gap-3 flex-1">
              <div className="w-9 h-9 rounded bg-muted animate-pulse" />
              <div className="space-y-1.5">
                <div className="h-3 w-40 rounded bg-muted animate-pulse" />
                <div className="h-2.5 w-24 rounded bg-muted animate-pulse" />
              </div>
            </div>
            <div className="h-3 w-20 rounded bg-muted animate-pulse" />
            <div className="h-3 w-24 rounded bg-muted animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}