import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { ArrowLeft, Copy, Check, ExternalLink, Clock, AlertTriangle, Shield, Coins, Timer, TrendingUp } from 'lucide-react';
import { motion } from 'framer-motion';
import { getL1BeatValidator, getL1BeatValidatorDeposits, getChainBySubnetId, getL1BeatSubnetType } from '../api';
import type { L1BeatValidator } from '../api';
import type { Chain, ValidatorDeposit } from '../types';
import { Footer } from '../components/Footer';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { useTheme } from '../hooks/useTheme';

const PRIMARY_NETWORK_SUBNET_ID = '11111111111111111111111111111111LpoYY';
const NAVAX_TO_AVAX = 1_000_000_000;
const DAILY_FEE_RATE = 44_236_800; // nAVAX per day — used as local fallback

type ValidatorKind = 'l1' | 'legacy' | 'primary';

function formatAvax(nAvax: number): string {
  return (nAvax / NAVAX_TO_AVAX).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

function formatAvaxCompact(nAvax: number): string {
  const avax = nAvax / NAVAX_TO_AVAX;
  if (avax >= 1_000_000) return `${(avax / 1_000_000).toFixed(2)}M`;
  if (avax >= 1_000) return `${(avax / 1_000).toFixed(2)}K`;
  return avax.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getDaysRemaining(balance: number): number {
  if (balance <= 0) return 0;
  return Math.floor(balance / DAILY_FEE_RATE);
}

function getDaysColor(days: number): string {
  if (days > 90) return 'text-green-500';
  if (days >= 30) return 'text-yellow-500';
  return 'text-red-500';
}

const TX_TYPE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  RegisterL1Validator: { label: 'Registration', color: 'text-blue-700 dark:text-blue-300', bg: 'bg-blue-100 dark:bg-blue-900/40' },
  IncreaseL1ValidatorBalance: { label: 'Top-up', color: 'text-green-700 dark:text-green-300', bg: 'bg-green-100 dark:bg-green-900/40' },
  DisableL1Validator: { label: 'Disabled', color: 'text-red-700 dark:text-red-300', bg: 'bg-red-100 dark:bg-red-900/40' },
  SetL1ValidatorWeight: { label: 'Weight Change', color: 'text-yellow-700 dark:text-yellow-300', bg: 'bg-yellow-100 dark:bg-yellow-900/40' },
  ConvertSubnetToL1: { label: 'L1 Conversion', color: 'text-purple-700 dark:text-purple-300', bg: 'bg-purple-100 dark:bg-purple-900/40' },
};

export function ValidatorDetails() {
  const { validatorId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { theme: _ } = useTheme();

  const subnetId = searchParams.get('subnet') || undefined;

  const [validator, setValidator] = useState<L1BeatValidator | null>(null);
  const [deposits, setDeposits] = useState<ValidatorDeposit[]>([]);
  const [chain, setChain] = useState<Chain | null>(null);
  const [kind, setKind] = useState<ValidatorKind>('l1');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<'node' | 'validation' | 'bls' | 'owner' | 'tx' | null>(null);
  const [showAllDeposits, setShowAllDeposits] = useState(false);

  useEffect(() => {
    if (!validatorId) return;
    setLoading(true);
    setError(null);

    getL1BeatValidator(validatorId, subnetId).then(async (v) => {
      if (!v) {
        setError('Validator not found');
        setLoading(false);
        return;
      }
      setValidator(v);

      let resolvedKind: ValidatorKind = 'l1';
      if (v.subnet_id === PRIMARY_NETWORK_SUBNET_ID) {
        resolvedKind = 'primary';
      } else {
        const subnetType = await getL1BeatSubnetType(v.subnet_id);
        resolvedKind = subnetType === 'legacy' ? 'legacy' : 'l1';
      }
      setKind(resolvedKind);

      if (resolvedKind === 'l1') {
        const d = await getL1BeatValidatorDeposits(v.node_id);
        setDeposits(d.sort((a, b) => new Date(b.block_time).getTime() - new Date(a.block_time).getTime()));
      }

      const c = await getChainBySubnetId(v.subnet_id);
      setChain(c);
      setLoading(false);
    }).catch(() => {
      setError('Failed to load validator data');
      setLoading(false);
    });
  }, [validatorId, subnetId]);

  const copyToClipboard = (text: string, type: 'node' | 'validation' | 'bls' | 'owner' | 'tx') => {
    navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <div className="flex-1 flex items-center justify-center">
          <LoadingSpinner size="xl" />
        </div>
      </div>
    );
  }

  if (error || !validator) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6">
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </button>
          <div className="bg-card rounded-xl border border-border p-8 text-center">
            <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">Error</h2>
            <p className="text-muted-foreground">{error || 'Validator not found'}</p>
          </div>
        </div>
      </div>
    );
  }

  const isL1 = kind === 'l1';
  const balance = validator.balance ?? 0;
  const initialDeposit = validator.initial_deposit ?? 0;
  const totalTopups = validator.total_topups ?? 0;
  const feesPaid = validator.fees_paid ?? 0;
  const refundAmount = validator.refund_amount ?? 0;
  const uptimePercentage = validator.uptime_percentage ?? 0;

  const daysRemaining = isL1
    ? (validator.estimated_days_left ?? getDaysRemaining(balance))
    : 0;
  const totalDeposited = validator.total_deposited ?? (initialDeposit + totalTopups);
  const displayedDeposits = showAllDeposits ? deposits : deposits.slice(0, 10);

  const stakeAvax = kind === 'legacy'
    ? (validator.primary_stake ?? 0) / NAVAX_TO_AVAX
    : kind === 'primary'
      ? validator.weight / NAVAX_TO_AVAX
      : 0;

  const uptimeValue = kind === 'legacy'
    ? (validator.primary_uptime ?? 0)
    : uptimePercentage;

  const backLabel = chain?.chainName
    ? `Back to ${chain.chainName}`
    : kind === 'primary'
      ? 'Back to Primary Network'
      : 'Back';

  // Staking period remaining for non-L1 validators
  const stakingPeriod = (() => {
    if (!validator.end_time || validator.end_time === '1970-01-01T00:00:00Z') return null;
    const startMs = new Date(validator.start_time).getTime();
    const endMs = new Date(validator.end_time).getTime();
    const totalDays = Math.max(1, (endMs - startMs) / (1000 * 60 * 60 * 24));
    const daysLeft = !validator.active ? 0 : (validator.days_remaining ?? Math.max(0, (endMs - Date.now()) / (1000 * 60 * 60 * 24)));
    const progress = Math.min(100, Math.max(0, ((totalDays - daysLeft) / totalDays) * 100));
    return { daysLeft, totalDays, progress };
  })();

  const kindConfig = {
    l1: { label: 'L1 Validator', badgeBg: 'bg-blue-100 dark:bg-blue-900/40', badgeText: 'text-blue-700 dark:text-blue-300' },
    primary: { label: 'Primary Network', badgeBg: 'bg-purple-100 dark:bg-purple-900/40', badgeText: 'text-purple-700 dark:text-purple-300' },
    legacy: { label: 'Legacy Subnet', badgeBg: 'bg-orange-100 dark:bg-orange-900/40', badgeText: 'text-orange-700 dark:text-orange-300' },
  }[kind];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {/* Back navigation */}
        <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3 }}>
          <button
            onClick={() => chain ? navigate(`/chain/${chain.chainId}`) : navigate(-1)}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{backLabel}</span>
          </button>
        </motion.div>

        {/* ── Header Card ── */}
        <motion.div
          className="bg-card rounded-xl border border-border p-6 mb-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="flex flex-col gap-4">
            {/* Top row: badges + explorer */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2.5">
                <div className={`w-2.5 h-2.5 rounded-full ${validator.active ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]' : 'bg-red-500'}`} />
                <span className={`text-sm font-medium ${validator.active ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {validator.active ? 'Active' : 'Inactive'}
                </span>
                <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${kindConfig.badgeBg} ${kindConfig.badgeText}`}>
                  {kindConfig.label}
                </span>
                {chain && (
                  <button
                    onClick={() => navigate(`/chain/${chain.chainId}`)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted hover:bg-accent transition-colors border border-border"
                  >
                    {chain.chainLogoUri && (
                      <img src={chain.chainLogoUri} alt="" className="w-3.5 h-3.5 rounded-full" />
                    )}
                    {chain.chainName}
                  </button>
                )}
              </div>
              <a
                href={`https://subnets.avax.network/validators/${validator.node_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-muted text-muted-foreground hover:text-foreground transition-colors border border-border"
              >
                Explorer <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            {/* Node ID + Validation ID */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-base sm:text-lg font-semibold text-foreground truncate font-mono">
                  {validator.node_id}
                </h1>
                <button
                  onClick={() => copyToClipboard(validator.node_id, 'node')}
                  className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                  title="Copy Node ID"
                >
                  {copied === 'node' ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground font-mono truncate">
                  {validator.validation_id}
                </span>
                <button
                  onClick={() => copyToClipboard(validator.validation_id, 'validation')}
                  className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                  title="Copy Validation ID"
                >
                  {copied === 'validation' ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
            </div>
          </div>
        </motion.div>

        {/* ── Hero Metrics ── */}
        <motion.div
          className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.08 }}
        >
          {isL1 ? (
            <>
              {/* L1 hero: Balance | Days Remaining | Total Deposited */}
              <HeroCard
                icon={<Coins className="w-5 h-5" />}
                label="Current Balance"
                value={`${formatAvax(balance)} AVAX`}
                warning={daysRemaining < 30 && validator.active}
              />
              <HeroCard
                icon={<Timer className="w-5 h-5" />}
                label="Days Remaining"
                value={validator.active ? daysRemaining.toLocaleString() : 'Inactive'}
                valueColor={validator.active ? getDaysColor(daysRemaining) : 'text-muted-foreground'}
                warning={daysRemaining < 30 && validator.active}
                subtitle={validator.active && daysRemaining > 0 ? `~${Math.floor(daysRemaining / 30)} months` : undefined}
              />
              <HeroCard
                icon={<TrendingUp className="w-5 h-5" />}
                label="Total Deposited"
                value={`${formatAvax(totalDeposited)} AVAX`}
              />
            </>
          ) : (
            <>
              {/* Stake/Legacy hero: Staked Amount | Uptime | Total Stake or Staking Period */}
              <HeroCard
                icon={<Coins className="w-5 h-5" />}
                label={kind === 'legacy' ? 'Primary Network Stake' : 'Staked Amount'}
                value={`${stakeAvax.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} AVAX`}
              />
              <div className={`bg-card rounded-xl border border-border p-5`}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-1.5 rounded-lg bg-muted">
                    <Shield className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground font-medium">
                    {kind === 'legacy' ? 'Primary Uptime' : 'Uptime'}
                  </p>
                </div>
                <p className={`text-2xl font-bold mb-2 ${
                  uptimeValue >= 80 ? 'text-green-500' : uptimeValue >= 50 ? 'text-yellow-500' : 'text-red-500'
                }`}>
                  {uptimeValue.toFixed(2)}%
                </p>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      uptimeValue >= 80 ? 'bg-green-500' : uptimeValue >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${Math.min(uptimeValue, 100)}%` }}
                  />
                </div>
              </div>
              {kind === 'primary' && validator.total_stake != null ? (
                <HeroCard
                  icon={<TrendingUp className="w-5 h-5" />}
                  label="Total Stake"
                  value={`${formatAvaxCompact(validator.total_stake)} AVAX`}
                  subtitle={validator.network_share_percent != null ? `${validator.network_share_percent.toFixed(4)}% of network` : undefined}
                />
              ) : stakingPeriod !== null ? (
                <StakingPeriodCard period={stakingPeriod} active={validator.active} />
              ) : (
                <HeroCard
                  icon={<Shield className="w-5 h-5" />}
                  label="Weight"
                  value={validator.weight.toLocaleString()}
                />
              )}
            </>
          )}
        </motion.div>

        {/* ── Details Section ── */}
        <motion.div
          className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.16 }}
        >
          {/* Left column: Financial / Staking details */}
          <div className="bg-card rounded-xl border border-border p-6">
            <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <Coins className="w-4 h-4 text-muted-foreground" />
              {isL1 ? 'Balance Details' : 'Staking Details'}
            </h2>
            <div className="space-y-3">
              {isL1 ? (
                <>
                  <DetailRow label="Total Deposited" value={`${formatAvax(totalDeposited)} AVAX`} />
                  <DetailRow label="Fees Paid" value={`${formatAvax(feesPaid)} AVAX`} valueColor="text-red-500" />
                  <DetailRow label="Initial Deposit" value={`${formatAvax(initialDeposit)} AVAX`} />
                  <DetailRow label="Total Top-ups" value={`${formatAvax(totalTopups)} AVAX`} valueColor="text-green-500" />
                  {refundAmount > 0 && (
                    <DetailRow label="Refund Amount" value={`${formatAvax(refundAmount)} AVAX`} />
                  )}
                  <DetailRow label="Weight" value={validator.weight.toLocaleString()} />

                  {/* Balance Breakdown Bar */}
                  {totalDeposited > 0 && (
                    <div className="pt-3 mt-1">
                      <p className="text-xs font-medium text-muted-foreground mb-2.5">Balance Breakdown</p>
                      <div className="flex w-full h-2.5 rounded-full bg-muted overflow-hidden gap-0.5">
                        <div
                          className="h-full rounded-l-full bg-red-500 transition-all"
                          style={{ width: `${(feesPaid / totalDeposited) * 100}%` }}
                        />
                        <div
                          className="h-full rounded-r-full bg-green-500 transition-all"
                          style={{ width: `${(balance / totalDeposited) * 100}%` }}
                        />
                      </div>
                      <div className="flex items-center gap-4 mt-2">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full bg-red-500" />
                          <span className="text-[10px] text-muted-foreground">Fees Paid ({totalDeposited > 0 ? Math.round((feesPaid / totalDeposited) * 100) : 0}%)</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full bg-green-500" />
                          <span className="text-[10px] text-muted-foreground">Balance ({totalDeposited > 0 ? Math.round((balance / totalDeposited) * 100) : 0}%)</span>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <DetailRow
                    label={kind === 'legacy' ? 'Primary Network Stake' : 'Staked Amount'}
                    value={`${stakeAvax.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} AVAX`}
                  />
                  {kind === 'legacy' && (
                    <DetailRow label="Subnet Weight" value={validator.weight.toLocaleString()} />
                  )}
                  {kind === 'primary' && validator.delegation_fee_percent != null && (
                    <DetailRow label="Delegation Fee" value={`${validator.delegation_fee_percent.toFixed(2)}%`} />
                  )}
                  {kind === 'primary' && validator.delegator_count != null && (
                    <DetailRow label="Delegators" value={validator.delegator_count.toLocaleString()} />
                  )}
                  {kind === 'primary' && validator.total_delegated != null && (
                    <DetailRow label="Total Delegated" value={`${(validator.total_delegated / NAVAX_TO_AVAX).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} AVAX`} />
                  )}
                  {kind === 'primary' && validator.total_stake != null && (
                    <DetailRow label="Total Stake" value={`${(validator.total_stake / NAVAX_TO_AVAX).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} AVAX`} />
                  )}
                  {kind === 'primary' && validator.network_share_percent != null && (
                    <DetailRow label="Network Share" value={`${validator.network_share_percent.toFixed(4)}%`} />
                  )}
                </>
              )}
            </div>
          </div>

          {/* Right column: Validator Info */}
          <div className="bg-card rounded-xl border border-border p-6">
            <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <Shield className="w-4 h-4 text-muted-foreground" />
              Validator Info
            </h2>
            <div className="space-y-3">
              <DetailRow
                label="Start Time"
                value={format(new Date(validator.start_time), 'MMM d, yyyy HH:mm')}
                icon={<Clock className="w-3.5 h-3.5 text-muted-foreground" />}
              />
              {validator.end_time && validator.end_time !== '1970-01-01T00:00:00Z' && (
                <DetailRow
                  label="End Time"
                  value={format(new Date(validator.end_time), 'MMM d, yyyy HH:mm')}
                  icon={<Clock className="w-3.5 h-3.5 text-muted-foreground" />}
                />
              )}
              {validator.created_time && (
                <DetailRow
                  label="Created"
                  value={format(new Date(validator.created_time), 'MMM d, yyyy HH:mm')}
                  icon={<Clock className="w-3.5 h-3.5 text-muted-foreground" />}
                />
              )}
              {stakingPeriod !== null && !isL1 && (
                <div className="flex flex-col gap-1.5 py-2 border-b border-border/50 last:border-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Staking Period</span>
                    <span className={`text-sm font-medium ${
                      !validator.active ? 'text-muted-foreground' : stakingPeriod.daysLeft > 30 ? 'text-foreground' : 'text-yellow-500'
                    }`}>
                      {validator.active ? `${Math.floor(stakingPeriod.daysLeft)} of ${Math.floor(stakingPeriod.totalDays)} days` : 'Ended'}
                    </span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        !validator.active ? 'bg-muted-foreground' : stakingPeriod.daysLeft > 30 ? 'bg-green-500' : 'bg-yellow-500'
                      }`}
                      style={{ width: `${stakingPeriod.progress}%` }}
                    />
                  </div>
                </div>
              )}
              {validator.tx_hash && (
                <div className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                  <span className="text-xs text-muted-foreground">Registration Tx</span>
                  <div className="flex items-center gap-1.5">
                    <a
                      href={`https://subnets.avax.network/p-chain/tx/${validator.tx_hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-mono text-[#ef4444] hover:underline"
                    >
                      {validator.tx_hash.slice(0, 8)}...{validator.tx_hash.slice(-6)}
                    </a>
                    <button
                      onClick={() => copyToClipboard(validator.tx_hash!, 'tx')}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                      title="Copy Tx Hash"
                    >
                      {copied === 'tx' ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                    </button>
                    <a
                      href={`https://subnets.avax.network/p-chain/tx/${validator.tx_hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              )}
              {validator.tx_type && (() => {
                const txKey = validator.tx_type!.replace('Tx', '');
                const config = TX_TYPE_CONFIG[txKey] || { label: validator.tx_type, color: 'text-foreground', bg: 'bg-muted' };
                return (
                  <div className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                    <span className="text-xs text-muted-foreground">Tx Type</span>
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${config.color} ${config.bg}`}>
                      {config.label}
                    </span>
                  </div>
                );
              })()}
              {validator.bls_public_key && (
                <div className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                  <span className="text-xs text-muted-foreground">BLS Public Key</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-mono text-foreground">
                      {validator.bls_public_key.slice(0, 10)}...{validator.bls_public_key.slice(-8)}
                    </span>
                    <button
                      onClick={() => copyToClipboard(validator.bls_public_key!, 'bls')}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                      title="Copy BLS Public Key"
                    >
                      {copied === 'bls' ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                </div>
              )}
              {validator.remaining_balance_owner && (
                <div className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                  <span className="text-xs text-muted-foreground">Balance Owner</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-mono text-foreground">
                      {validator.remaining_balance_owner.slice(0, 10)}...{validator.remaining_balance_owner.slice(-8)}
                    </span>
                    <button
                      onClick={() => copyToClipboard(validator.remaining_balance_owner!, 'owner')}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                      title="Copy Address"
                    >
                      {copied === 'owner' ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {/* ── Deposit History — L1 only ── */}
        {isL1 && deposits.length > 0 && (
          <motion.div
            className="bg-card rounded-xl border border-border p-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.24 }}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-muted-foreground" />
                Deposit History
              </h2>
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{deposits.length} transactions</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Date</th>
                    <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Type</th>
                    <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">Amount</th>
                    <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Tx ID</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {displayedDeposits.map((deposit) => {
                    const typeConfig = TX_TYPE_CONFIG[deposit.tx_type] || { label: deposit.tx_type, color: 'text-foreground', bg: 'bg-muted' };
                    return (
                      <tr key={deposit.tx_id} className="hover:bg-muted/30 transition-colors">
                        <td className="py-2.5 px-3 text-foreground whitespace-nowrap">
                          {format(new Date(deposit.block_time), 'MMM d, yyyy HH:mm')}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${typeConfig.color} ${typeConfig.bg}`}>
                            {typeConfig.label}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-medium text-foreground whitespace-nowrap">
                          {formatAvax(deposit.amount)} AVAX
                        </td>
                        <td className="py-2.5 px-3 font-mono text-xs">
                          <a
                            href={`https://subnets.avax.network/p-chain/tx/${deposit.tx_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[#ef4444] hover:underline"
                          >
                            {deposit.tx_id.slice(0, 8)}...{deposit.tx_id.slice(-6)}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {deposits.length > 10 && (
              <button
                onClick={() => setShowAllDeposits(!showAllDeposits)}
                className="mt-3 text-xs font-medium text-[#ef4444] hover:text-[#ef4444]/80 transition-colors"
              >
                {showAllDeposits ? 'Show less' : `Show all ${deposits.length} transactions`}
              </button>
            )}
          </motion.div>
        )}
      </div>
      <Footer />
    </div>
  );
}

/* ── Shared Components ── */

function HeroCard({ icon, label, value, valueColor, subtitle, warning }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueColor?: string;
  subtitle?: string;
  warning?: boolean;
}) {
  return (
    <div className={`bg-card rounded-xl border p-5 ${warning ? 'border-red-500/40' : 'border-border'}`}>
      <div className="flex items-center gap-2 mb-3">
        <div className="p-1.5 rounded-lg bg-muted">
          {icon}
        </div>
        <p className="text-sm text-muted-foreground font-medium">{label}</p>
        {warning && <AlertTriangle className="w-3.5 h-3.5 text-red-500 ml-auto" />}
      </div>
      <p className={`text-2xl font-bold ${valueColor || 'text-foreground'}`}>
        {value}
      </p>
      {subtitle && (
        <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
      )}
    </div>
  );
}

function StakingPeriodCard({ period, active }: {
  period: { daysLeft: number; totalDays: number; progress: number };
  active: boolean;
}) {
  const daysLeft = Math.floor(period.daysLeft);
  const barColor = !active ? 'bg-muted-foreground' : daysLeft > 30 ? 'bg-green-500' : daysLeft > 7 ? 'bg-yellow-500' : 'bg-red-500';
  const textColor = !active ? 'text-muted-foreground' : daysLeft > 30 ? 'text-green-500' : daysLeft > 7 ? 'text-yellow-500' : 'text-red-500';

  return (
    <div className="bg-card rounded-xl border border-border p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="p-1.5 rounded-lg bg-muted">
          <Timer className="w-5 h-5 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground font-medium">Staking Period</p>
      </div>
      <p className={`text-2xl font-bold mb-2 ${textColor}`}>
        {active ? `${daysLeft} days left` : 'Ended'}
      </p>
      <div className="h-2 bg-muted rounded-full overflow-hidden mb-1.5">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${period.progress}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {Math.floor(period.progress)}% complete — {Math.floor(period.totalDays)} day term
      </p>
    </div>
  );
}

function DetailRow({ label, value, valueColor, icon }: {
  label: string;
  value: string;
  valueColor?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1.5">
        {icon}
        <span className={`text-sm font-medium ${valueColor || 'text-foreground'}`}>{value}</span>
      </div>
    </div>
  );
}
