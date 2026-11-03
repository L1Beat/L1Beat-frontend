import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { ArrowLeft, Copy, Check, ExternalLink, AlertTriangle, Shield } from 'lucide-react';
import { getChains, getL1BeatValidator, getL1BeatValidatorDeposits, getL1BeatNodeValidations, getChainBySubnetId, getL1BeatSubnetType, getValidatorDelegations } from '../api';
import type { L1BeatValidator, ValidatorDelegation } from '../api';
import type { Chain, ValidatorDeposit } from '../types';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { SEO } from '../components/SEO';
import { useToast } from '../components/Toaster';
import { shortNodeId } from '../utils/nodeId';
import { useLiquidStakingLabels } from '../hooks/useLiquidStakingLabels';
import type { LiquidStakingLabel } from '../hooks/useLiquidStakingLabels';
import { SegmentedControl, StatStrip } from '../components/instrument';
import type { StatItem } from '../components/instrument';
import { uptimeFill, uptimeMinimum } from '../utils/uptime';

const PRIMARY_NETWORK_SUBNET_ID = '11111111111111111111111111111111LpoYY';
const NAVAX_TO_AVAX = 1_000_000_000;
const DAILY_FEE_RATE = 44_236_800; // nAVAX per day, local fallback when the indexer gives no estimate
const EXPLORER = 'https://subnets.avax.network';
// Darker amber in light mode: the dark-mode tone fails contrast on white.
const WARN_TEXT = 'text-[#9a6b00] dark:text-[#d4a017]';

// Same colors as the Staking page: own stake blue, delegated violet.
const OWN = '#3987e5';
const DELEGATED = '#8b5cf6';
// A Primary Network validator's total stake is capped at 3M AVAX and at 5x its own stake.
const MAX_STAKE_NAVAX = 3_000_000 * NAVAX_TO_AVAX;
const MAX_DELEGATION_FACTOR = 5;

/** Time left as Staking shows it: "59d", then "3 mo". */
function timeLeft(days: number): string {
  if (days < 1) return 'today';
  return days < 60 ? `${Math.floor(days)}d` : `${Math.round(days / 30)} mo`;
}

type ValidatorKind = 'l1' | 'legacy' | 'primary';
type CopyKey = 'node' | 'validation' | 'bls' | 'owner' | 'tx';

// Whole AVAX from 1,000 up, where cents are noise; smaller amounts keep their decimals.
function formatAvax(nAvax: number): string {
  const avax = nAvax / NAVAX_TO_AVAX;
  return avax >= 1000
    ? Math.round(avax).toLocaleString()
    : avax.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

function formatAvaxCompact(nAvax: number): string {
  const avax = nAvax / NAVAX_TO_AVAX;
  const trim = (n: number) => n.toFixed(2).replace(/\.?0+$/, '');
  if (avax >= 1_000_000) return `${trim(avax / 1_000_000)}M`;
  if (avax >= 1_000) return `${trim(avax / 1_000)}K`;
  return avax.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getDaysRemaining(balance: number): number {
  if (balance <= 0) return 0;
  return Math.floor(balance / DAILY_FEE_RATE);
}

function daysTone(days: number): string {
  if (days < 30) return 'text-down';
  if (days <= 90) return WARN_TEXT;
  return 'text-foreground';
}

// Small unit after the number, so four AVAX values fit a two-column strip on phones.
function avax(nAvax: number): ReactNode {
  return (
    <>
      {formatAvax(nAvax)}
      <span className="ml-1 text-[13px] text-muted-foreground">AVAX</span>
    </>
  );
}

function shortId(id: string, head = 8, tail = 6): string {
  return id.length > head + tail + 1 ? `${id.slice(0, head)}…${id.slice(-tail)}` : id;
}

const TX_TYPE_LABEL: Record<string, string> = {
  RegisterL1Validator: 'Registration',
  IncreaseL1ValidatorBalance: 'Top-up',
  DisableL1Validator: 'Disabled',
  SetL1ValidatorWeight: 'Weight change',
  ConvertSubnetToL1: 'L1 conversion',
};

const txLabel = (type: string) => TX_TYPE_LABEL[type.replace(/Tx$/, '')] ?? type;

export function ValidatorDetails() {
  const { validatorId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  const subnetId = searchParams.get('subnet') || undefined;

  const [validator, setValidator] = useState<L1BeatValidator | null>(null);
  const [deposits, setDeposits] = useState<ValidatorDeposit[]>([]);
  const [chain, setChain] = useState<Chain | null>(null);
  const [kind, setKind] = useState<ValidatorKind>('l1');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<CopyKey | null>(null);
  const [showAllDeposits, setShowAllDeposits] = useState(false);
  const [history, setHistory] = useState<L1BeatValidator[]>([]);
  const [historyChains, setHistoryChains] = useState<Record<string, Chain | null>>({});
  // Start of the node's active Primary Network validation; a legacy subnet validator's rewards come from it.
  const [primaryStart, setPrimaryStart] = useState<string | null>(null);

  useEffect(() => {
    if (!validatorId) return;
    setLoading(true);
    setError(null);

    // The chain list is only needed for the chain name, but it's the slowest
    // request: start it now, alongside the validator, instead of after it.
    void getChains().catch(() => null);

    getL1BeatValidator(validatorId, subnetId).then(async (v) => {
      if (!v) {
        setError('Validator not found');
        setLoading(false);
        return;
      }
      setValidator(v);

      const primary = v.subnet_id === PRIMARY_NETWORK_SUBNET_ID;
      // Deposits only apply to L1 validators, but fetching them alongside the
      // subnet type saves a round trip; they're dropped for legacy subnets.
      const [subnetType, d, c] = await Promise.all([
        primary ? Promise.resolve(null) : getL1BeatSubnetType(v.subnet_id),
        primary ? Promise.resolve([]) : getL1BeatValidatorDeposits(v.validation_id),
        getChainBySubnetId(v.subnet_id),
      ]);
      const resolvedKind: ValidatorKind = primary ? 'primary' : subnetType === 'legacy' ? 'legacy' : 'l1';
      setKind(resolvedKind);
      // By validation ID: a node that validated more than once would otherwise
      // list the deposits of every validation it ever had.
      setDeposits(resolvedKind === 'l1' ? [...d].sort((x, y) => new Date(y.block_time).getTime() - new Date(x.block_time).getTime()) : []);
      setChain(c);
      setLoading(false);
    }).catch(() => {
      setError('Failed to load validator data');
      setLoading(false);
    });
  }, [validatorId, subnetId]);

  // Other validations by the same node. Loaded after the page, it only adds a panel.
  const nodeId = validator?.node_id;
  useEffect(() => {
    if (!nodeId) return;
    let cancelled = false;
    setHistory([]);
    setPrimaryStart(null);
    getL1BeatNodeValidations(nodeId).then(async (all) => {
      if (cancelled) return;
      const primary = all
        .filter((v) => v.subnet_id === PRIMARY_NETWORK_SUBNET_ID && v.active)
        .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime())[0];
      setPrimaryStart(primary?.start_time ?? null);
      if (all.length < 2) return;
      const sorted = [...all].sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());
      const subnets = [...new Set(sorted.map((v) => v.subnet_id))].filter((s) => s !== PRIMARY_NETWORK_SUBNET_ID);
      const chains = await Promise.all(subnets.map((s) => getChainBySubnetId(s).catch(() => null)));
      if (cancelled) return;
      setHistoryChains(Object.fromEntries(subnets.map((s, i) => [s, chains[i]])));
      setHistory(sorted);
    });
    return () => {
      cancelled = true;
    };
  }, [nodeId]);

  const copyToClipboard = async (text: string, type: CopyKey) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast('Failed to copy to clipboard', 'error');
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 flex items-center justify-center">
        <LoadingSpinner size="xl" />
      </div>
    );
  }

  if (error || !validator) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 text-center">
        <AlertTriangle className="w-6 h-6 mx-auto mb-4 text-muted-foreground" />
        <h2 className="text-[18px] font-semibold text-foreground mb-1">{error || 'Validator not found'}</h2>
        <p className="text-[13px] text-muted-foreground mb-5">Check the node ID or validation ID and try again.</p>
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded bg-foreground text-background hover:bg-foreground/90 text-[13px] font-medium transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Go back
        </button>
      </div>
    );
  }

  const isL1 = kind === 'l1';
  const balance = validator.balance ?? 0;
  const initialDeposit = validator.initial_deposit ?? 0;
  const totalTopups = validator.total_topups ?? 0;
  const feesPaid = validator.fees_paid ?? 0;
  const refundAmount = validator.refund_amount ?? 0;

  const daysRemaining = isL1 ? Math.floor(validator.estimated_days_left ?? getDaysRemaining(balance)) : 0;
  const totalDeposited = validator.total_deposited ?? (initialDeposit + totalTopups);
  const displayedDeposits = showAllDeposits ? deposits : deposits.slice(0, 10);

  const stakeAvax = kind === 'legacy'
    ? (validator.primary_stake ?? 0) / NAVAX_TO_AVAX
    : kind === 'primary'
      ? validator.weight / NAVAX_TO_AVAX
      : 0;

  const uptimeValue = kind === 'legacy' ? (validator.primary_uptime ?? 0) : (validator.uptime_percentage ?? 0);
  // A legacy subnet validator is judged by the node's Primary Network validation, not the subnet one.
  const minUptime = uptimeMinimum(kind === 'legacy' ? primaryStart : validator.start_time);

  // Staking term for Primary Network and legacy subnet validators.
  const term = (() => {
    if (!validator.end_time || validator.end_time === '1970-01-01T00:00:00Z') return null;
    const startMs = new Date(validator.start_time).getTime();
    const endMs = new Date(validator.end_time).getTime();
    const totalDays = Math.max(1, (endMs - startMs) / 86_400_000);
    const daysLeft = !validator.active ? 0 : (validator.days_remaining ?? Math.max(0, (endMs - Date.now()) / 86_400_000));
    const progress = Math.min(100, Math.max(0, ((totalDays - daysLeft) / totalDays) * 100));
    return { daysLeft: Math.floor(daysLeft), totalDays: Math.floor(totalDays), progress };
  })();

  const kindLabel = { l1: 'L1 validator', primary: 'Primary Network validator', legacy: 'Legacy subnet validator' }[kind];
  const nodeShort = shortNodeId(validator.node_id);
  const backLabel = chain?.chainName ? chain.chainName : kind === 'primary' ? 'Primary Network' : 'Back';

  const stats: StatItem[] = kind === 'primary'
    ? [
        {
          label: 'Total stake',
          value: <>{formatAvaxCompact(validator.total_stake ?? validator.weight)}<span className="ml-1 text-[13px] text-muted-foreground">AVAX</span></>,
          sub: validator.network_share_percent != null ? `${validator.network_share_percent.toFixed(2)}% of the network` : 'Own stake plus delegations',
        },
        {
          label: 'Delegators',
          value: (validator.delegator_count ?? 0).toLocaleString(),
          sub: validator.delegation_fee_percent != null ? `${validator.delegation_fee_percent.toFixed(validator.delegation_fee_percent % 1 ? 2 : 0)}% fee` : undefined,
        },
        {
          label: 'Uptime',
          value: <span className={uptimeValue >= minUptime ? 'text-foreground' : 'text-down'}>{uptimeValue.toFixed(2)}%</span>,
          sub: uptimeValue < minUptime ? `Below the ${minUptime}% needed for rewards` : 'Earning rewards',
        },
        term
          ? {
              label: 'Staking period',
              value: validator.active ? `${term.daysLeft.toLocaleString()} days` : 'Ended',
              sub: validator.active ? `left of a ${term.totalDays.toLocaleString()} day period` : `${term.totalDays.toLocaleString()} day period`,
            }
          : { label: 'Weight', value: validator.weight.toLocaleString() },
      ]
    : isL1
    ? [
        {
          label: 'Balance',
          value: avax(balance),
          sub: validator.active ? 'Pays the daily validation fee' : 'Validation ended',
        },
        {
          label: 'Days left',
          value: validator.active
            ? <span className={daysTone(daysRemaining)}>{daysRemaining.toLocaleString()}</span>
            : '—',
          sub: validator.active
            ? daysRemaining >= 60 ? `About ${Math.floor(daysRemaining / 30)} months at the current fee` : 'At the current fee'
            : 'Inactive',
          tooltip: 'How long the balance lasts at the current daily validation fee.',
        },
        {
          label: 'Total deposited',
          value: avax(totalDeposited),
          sub: totalTopups > 0 ? `${formatAvaxCompact(totalTopups)} of it in top-ups` : 'Initial deposit only',
        },
        {
          label: 'Fees paid',
          value: avax(feesPaid),
          sub: totalDeposited > 0 ? `${Math.round((feesPaid / totalDeposited) * 100)}% of deposits` : undefined,
        },
      ]
    : [
        // Legacy subnet validators: backed by the node's Primary Network stake.
        { label: 'Primary Network stake', value: avax(stakeAvax * NAVAX_TO_AVAX) },
        {
          label: 'Primary uptime',
          value: <span className={uptimeValue >= minUptime ? 'text-foreground' : 'text-down'}>{uptimeValue.toFixed(2)}%</span>,
          sub: uptimeValue < minUptime ? `Below the ${minUptime}% needed for rewards` : undefined,
        },
        term
          ? {
              label: 'Staking period',
              value: validator.active ? `${term.daysLeft.toLocaleString()} days` : 'Ended',
              sub: validator.active ? `left of a ${term.totalDays.toLocaleString()} day period` : `${term.totalDays.toLocaleString()} day period`,
            }
          : { label: 'Weight', value: validator.weight.toLocaleString() },
        { label: 'Subnet weight', value: validator.weight.toLocaleString() },
      ];

  const copyButton = (text: string, key: CopyKey, title: string) => (
    <button
      onClick={() => copyToClipboard(text, key)}
      className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
      title={title}
      aria-label={title}
    >
      {copied === key ? <Check className="w-3 h-3 text-up" /> : <Copy className="w-3 h-3" />}
    </button>
  );

  const chainLabel = chain?.chainName ?? (kind === 'primary' ? 'the Primary Network' : 'its chain');
  const own = kind === 'primary' ? validator.weight : 0;
  const delegated = kind === 'primary' ? (validator.total_delegated ?? 0) : 0;
  const totalStake = kind === 'primary' ? (validator.total_stake ?? own + delegated) : 0;
  const delegators = validator.delegator_count ?? 0;
  const fee = validator.delegation_fee_percent;

  // The sentence the hero leads with, in the data pages' pattern.
  const headline: { lead: ReactNode; sub: ReactNode } = !validator.active
    ? {
        lead: (
          <>
            This validator stopped validating {chainLabel}
            {hasEnd(validator) ? <> on {format(new Date(validator.end_time!), 'MMM d, yyyy')}</> : null}.
          </>
        ),
        sub: <>It started on {format(new Date(validator.start_time), 'MMM d, yyyy')}. Its record stays below.</>,
      }
    : kind === 'primary'
      ? {
          lead: (
            <>
              This validator holds <span className="tabular-nums">{formatAvaxCompact(totalStake)}</span> AVAX
              {validator.network_share_percent != null && (
                <>, <span className="tabular-nums">{validator.network_share_percent.toFixed(2)}%</span> of all stake on the Primary Network</>
              )}
              .
            </>
          ),
          sub:
            delegators > 0 ? (
              <>
                <span className="num">{formatAvaxCompact(own)}</span> of its own and <span className="num">{formatAvaxCompact(delegated)}</span> from{' '}
                <span className="num">{delegators.toLocaleString()}</span> {delegators === 1 ? 'delegator' : 'delegators'}
                {fee != null && <>, at a <span className="num">{fee.toFixed(fee % 1 ? 2 : 0)}%</span> fee</>}.
              </>
            ) : (
              <>
                All of it is its own stake
                {fee != null && <>; it takes delegations at a <span className="num">{fee.toFixed(fee % 1 ? 2 : 0)}%</span> fee</>}.
              </>
            ),
        }
      : kind === 'legacy'
        ? {
            lead: (
              <>
                This node validates {chainLabel} with weight <span className="tabular-nums">{validator.weight.toLocaleString()}</span>.
              </>
            ),
            sub: (
              <>
                It's backed by <span className="num">{formatAvaxCompact(validator.primary_stake ?? 0)}</span> AVAX staked on the Primary Network
                {term && <>, with its period ending in <span className="num">{timeLeft(term.daysLeft)}</span></>}.
              </>
            ),
          }
        : {
            lead: (
              <>
                This validator secures {chainLabel} with weight <span className="tabular-nums">{validator.weight.toLocaleString()}</span>.
              </>
            ),
            sub: (
              <>
                It has <span className="num">{formatAvaxCompact(balance)}</span> AVAX left to pay the validation fee
                {daysRemaining > 0 ? <>, about <span className="num">{daysRemaining.toLocaleString()}</span> days at the current rate</> : null}.
              </>
            ),
          };

  // Room left under the 3M cap and the 5x rule.
  const capacity = kind === 'primary' && own > 0 ? Math.min(MAX_STAKE_NAVAX, own * MAX_DELEGATION_FACTOR) : 0;
  const room = Math.max(0, capacity - totalStake);
  const hasUptime = kind !== 'l1' && (kind === 'legacy' ? validator.primary_uptime != null : validator.uptime_percentage != null);

  return (
    <div>
      <SEO
        title={`${nodeShort} · Validator`}
        description={`${chain ? `${chain.chainName} validator ` : 'Avalanche validator '}${nodeShort}: balance, uptime, deposit history, and validation record.`}
        url={`/validator/${validator.node_id}`}
      />

      {/* A compact hero in the data pages' frame: identity, the headline sentence, the KPIs. */}
      <section className="border-b border-border bg-stage" aria-label="Validator summary">
        <div className="max-w-7xl 2xl:max-w-screen-2xl mx-auto px-4 sm:px-6 pt-5 pb-5 space-y-4">
          <button
            onClick={() => (chain ? navigate(`/chain/${chain.chainId}`) : navigate(-1))}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {backLabel}
          </button>

          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-4 min-w-0">
              <div className="w-11 h-11 rounded-md bg-muted flex items-center justify-center shrink-0">
                {chain?.chainLogoUri ? (
                  <img src={chain.chainLogoUri} alt="" className="w-7 h-7 rounded-full" />
                ) : (
                  <Shield className="w-5 h-5 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-start gap-2 min-w-0">
                  <h1 className="num text-[15px] sm:text-[17px] leading-7 font-medium text-foreground break-all">{validator.node_id}</h1>
                  <span className="pt-2">{copyButton(validator.node_id, 'node', 'Copy node ID')}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <span aria-hidden className={`w-1.5 h-1.5 rounded-full ${validator.active ? 'bg-up' : 'bg-muted-foreground/40'}`} />
                    {validator.active ? 'Active' : 'Inactive'}
                  </span>
                  <span>·</span>
                  <span>{kindLabel}</span>
                  {chain && (
                    <>
                      <span>·</span>
                      <button
                        onClick={() => navigate(`/chain/${chain.chainId}`)}
                        className="inline-flex items-center gap-1 font-medium text-foreground hover:underline underline-offset-2"
                      >
                        {chain.chainName}
                      </button>
                    </>
                  )}
                  <span>·</span>
                  <button
                    onClick={() => copyToClipboard(validator.validation_id, 'validation')}
                    className="num inline-flex items-center gap-1 h-5 px-1.5 rounded bg-muted hover:bg-accent transition-colors"
                    title={`Validation ID ${validator.validation_id}`}
                  >
                    <span>Validation {shortId(validator.validation_id, 6, 4)}</span>
                    {copied === 'validation' ? <Check className="w-2.5 h-2.5 text-up" /> : <Copy className="w-2.5 h-2.5" />}
                  </button>
                </div>
              </div>
            </div>
            <a
              href={`${EXPLORER}/validators/${validator.node_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded border border-border hover:bg-accent transition-colors text-[12px] font-medium text-muted-foreground hover:text-foreground shrink-0 self-start"
            >
              Explorer <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <div className="pt-1">
            <p className="text-[22px] sm:text-[30px] leading-tight font-medium text-foreground max-w-4xl">{headline.lead}</p>
            <p className="mt-1.5 text-[14px] sm:text-[16px] leading-snug text-foreground/80 max-w-3xl">{headline.sub}</p>
          </div>

          <StatStrip items={stats} floating />
        </div>
      </section>

      <div className="max-w-7xl 2xl:max-w-screen-2xl mx-auto px-4 sm:px-6 py-5 space-y-5">
        {isL1 ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
            <div className="lg:col-span-2 min-w-0">
              <Panel title="Balance">
                <div className="num text-[22px] leading-7 font-medium text-foreground">
                  {formatAvax(balance)} <span className="text-[13px] text-muted-foreground">AVAX left</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5 mb-3">
                  {validator.active
                    ? daysRemaining > 0
                      ? `About ${daysRemaining.toLocaleString()} days of validation fees at the current rate`
                      : 'Not enough left for another day of fees'
                    : 'Validation ended'}
                </p>
                {totalDeposited > 0 && <DepositSplit total={totalDeposited} fees={feesPaid} balance={balance} refund={refundAmount} />}
                <dl>
                  <Row label="Initial deposit" value={`${formatAvax(initialDeposit)} AVAX`} />
                  <Row label="Top-ups" value={`${formatAvax(totalTopups)} AVAX`} />
                  <Row label="Fees paid" value={`${formatAvax(feesPaid)} AVAX`} />
                  {refundAmount > 0 && <Row label="Refunded" value={`${formatAvax(refundAmount)} AVAX`} />}
                  <Row label="Current balance" value={`${formatAvax(balance)} AVAX`} />
                  <Row label="Weight" value={validator.weight.toLocaleString()} />
                </dl>
              </Panel>
            </div>
            <RecordPanel validator={validator} copyButton={copyButton} />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 items-stretch">
            {kind === 'primary' ? (
              <Panel title="Stake" aside={fee != null ? <FeeChip fee={fee} /> : undefined}>
                <StakeSplit own={own} delegated={delegated} />
                {capacity > 0 && validator.active && (
                  <div className="mt-4">
                    <div className="flex items-baseline justify-between text-[11px] text-muted-foreground mb-1.5">
                      <span>Room for delegations</span>
                      <span className="num text-foreground">{room > 0 ? `${formatAvaxCompact(room)} AVAX left` : 'Full'}</span>
                    </div>
                    <div className="h-1.5 rounded-sm bg-muted overflow-hidden">
                      <div className="h-full rounded-sm bg-foreground/40" style={{ width: `${Math.min(100, (totalStake / capacity) * 100)}%` }} />
                    </div>
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      A validator can hold up to {formatAvaxCompact(capacity)} AVAX: five times its own stake, and never more than 3M.
                    </p>
                  </div>
                )}
              </Panel>
            ) : (
              <Panel title="Backing stake">
                <div className="num text-[22px] leading-7 font-medium text-foreground">
                  {formatAvaxCompact(validator.primary_stake ?? 0)} <span className="text-[13px] text-muted-foreground">AVAX</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">staked by this node on the Primary Network</p>
                <dl className="mt-3">
                  <Row label="Weight on this chain" value={validator.weight.toLocaleString()} />
                </dl>
              </Panel>
            )}

            {hasUptime && <UptimeCard value={uptimeValue} legacy={kind === 'legacy'} minimum={minUptime} />}

            {term && (
              <Panel title="Staking period">
                <div className="num text-[22px] leading-7 font-medium text-foreground">
                  {validator.active ? <>Ends in {timeLeft(term.daysLeft)}</> : 'Ended'}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {term.totalDays.toLocaleString()} day period, {Math.floor(term.progress)}% through
                </p>
                <div className="mt-3 h-1.5 rounded-sm bg-muted overflow-hidden">
                  <div className={`h-full rounded-sm ${validator.active ? '' : 'bg-muted-foreground/50'}`} style={{ width: `${term.progress}%`, background: validator.active ? OWN : undefined }} />
                </div>
                <dl className="mt-3">
                  <Row label="Started" value={format(new Date(validator.start_time), 'MMM d, yyyy')} />
                  {hasEnd(validator) && <Row label={validator.active ? 'Ends' : 'Ended'} value={format(new Date(validator.end_time!), 'MMM d, yyyy')} />}
                </dl>
              </Panel>
            )}
          </div>
        )}

        {isL1 && deposits.length > 0 && (
          <Panel
            title="Deposit history"
            aside={<span className="num text-[11px] text-muted-foreground">{deposits.length} {deposits.length === 1 ? 'transaction' : 'transactions'}</span>}
            flush
          >
            {deposits.length > 1 && <DepositTimeline deposits={deposits} />}
            <table className="w-full text-[12px]">
              <thead className="hidden sm:table-header-group">
                <tr className="border-b border-border text-[11px] text-muted-foreground">
                  <th className="text-left font-normal py-2 px-4 sm:px-5">Date</th>
                  <th className="text-left font-normal py-2 px-3">Type</th>
                  <th className="text-right font-normal py-2 px-3">Amount</th>
                  <th className="text-right font-normal py-2 px-4 sm:px-5">Transaction</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {displayedDeposits.map((d) => (
                  <tr key={d.tx_id} className="hover:bg-muted/30 transition-colors">
                    {/* Phones get one stacked cell; the table columns don't fit. */}
                    <td className="sm:hidden px-4 py-2.5">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-foreground">{txLabel(d.tx_type)}</span>
                        <span className="num text-foreground">{formatAvax(d.amount)} AVAX</span>
                      </div>
                      <div className="mt-0.5 flex items-baseline justify-between gap-3 text-[11px] text-muted-foreground">
                        <span className="num">{format(new Date(d.block_time), 'MMM d, yyyy HH:mm')}</span>
                        <TxLink id={d.tx_id} />
                      </div>
                    </td>
                    <td className="hidden sm:table-cell num py-2.5 px-4 sm:px-5 text-muted-foreground whitespace-nowrap">
                      {format(new Date(d.block_time), 'MMM d, yyyy HH:mm')}
                    </td>
                    <td className="hidden sm:table-cell py-2.5 px-3 text-foreground whitespace-nowrap">{txLabel(d.tx_type)}</td>
                    <td className="hidden sm:table-cell num py-2.5 px-3 text-right text-foreground whitespace-nowrap">{formatAvax(d.amount)} AVAX</td>
                    <td className="hidden sm:table-cell py-2.5 px-4 sm:px-5 text-right">
                      <TxLink id={d.tx_id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {deposits.length > 10 && (
              <div className="border-t border-border px-4 sm:px-5 py-2.5">
                <button
                  onClick={() => setShowAllDeposits(!showAllDeposits)}
                  className="text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showAllDeposits ? 'Show fewer' : `Show all ${deposits.length} transactions`}
                </button>
              </div>
            )}
          </Panel>
        )}

        {kind === 'primary' && validator.active && delegators > 0 && <DelegationsPanel nodeId={validator.node_id} />}

        <div className={`grid grid-cols-1 gap-5 items-start ${!isL1 && history.length > 1 ? 'lg:grid-cols-3' : ''}`}>
          {history.length > 1 && (
            <div className={isL1 ? '' : 'lg:col-span-2 min-w-0'}>
              <ValidationHistory
                validations={history}
                current={validator.validation_id}
                chains={historyChains}
                onOpen={(v) => navigate(`/validator/${v.validation_id}?subnet=${v.subnet_id}`)}
              />
            </div>
          )}
          {!isL1 && <RecordPanel validator={validator} copyButton={copyButton} />}
        </div>
      </div>
    </div>
  );
}

/** Each deposit as a bar on a time axis from the first one to today, so the top-up rhythm shows. */
function DepositTimeline({ deposits }: { deposits: ValidatorDeposit[] }) {
  const times = deposits.map((d) => new Date(d.block_time).getTime());
  const start = Math.min(...times);
  const end = Date.now();
  const span = Math.max(1, end - start);
  const max = Math.max(...deposits.map((d) => d.amount), 1);
  return (
    <div className="px-4 sm:px-5 pt-3 pb-3 border-b border-border">
      <div className="relative h-16" role="img" aria-label="Deposits over time">
        <div className="absolute inset-x-0 bottom-0 h-px bg-border" />
        {deposits.map((d) => (
          <div
            key={d.tx_id}
            className="absolute bottom-0 w-1.5 -ml-0.5 rounded-t-sm"
            title={`${format(new Date(d.block_time), 'MMM d, yyyy')}: ${formatAvax(d.amount)} AVAX`}
            style={{
              left: `${((new Date(d.block_time).getTime() - start) / span) * 100}%`,
              height: `${Math.max(8, (d.amount / max) * 100)}%`,
              background: OWN,
            }}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground num">
        <span>{format(new Date(start), 'MMM yyyy')}</span>
        <span>today</span>
      </div>
    </div>
  );
}

/** Registration details: when, which transaction, keys and owners. */
function RecordPanel({ validator, copyButton }: {
  validator: L1BeatValidator;
  copyButton: (text: string, key: CopyKey, title: string) => ReactNode;
}) {
  return (
    <Panel title="Record">
      <dl>
        <Row label="Started" value={format(new Date(validator.start_time), 'MMM d, yyyy HH:mm')} />
        {hasEnd(validator) && (
          <Row label={validator.active ? 'Ends' : 'Ended'} value={format(new Date(validator.end_time!), 'MMM d, yyyy HH:mm')} />
        )}
        {validator.created_time && validator.created_time !== validator.start_time && (
          <Row label="Created" value={format(new Date(validator.created_time), 'MMM d, yyyy HH:mm')} />
        )}
        {validator.tx_type && <Row label="Registered by" value={txLabel(validator.tx_type)} mono={false} />}
        {validator.tx_hash && (
          <Row
            label="Registration tx"
            value={
              <span className="inline-flex items-center gap-1.5">
                <a
                  href={`${EXPLORER}/p-chain/tx/${validator.tx_hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 hover:underline underline-offset-2"
                >
                  {shortId(validator.tx_hash)}
                  <ExternalLink className="w-3 h-3 text-muted-foreground" />
                </a>
                {copyButton(validator.tx_hash, 'tx', 'Copy transaction ID')}
              </span>
            }
          />
        )}
        {validator.bls_public_key && (
          <Row
            label="BLS public key"
            value={
              <span className="inline-flex items-center gap-1.5">
                {shortId(validator.bls_public_key, 10, 8)}
                {copyButton(validator.bls_public_key, 'bls', 'Copy BLS public key')}
              </span>
            }
          />
        )}
        {validator.remaining_balance_owner && (
          <Row
            label="Balance owner"
            value={
              <span className="inline-flex items-center gap-1.5">
                {shortId(validator.remaining_balance_owner, 10, 8)}
                {copyButton(validator.remaining_balance_owner, 'owner', 'Copy address')}
              </span>
            }
          />
        )}
      </dl>
    </Panel>
  );
}

/** Delegation fee as a gold chip; gold means fees on the Staking page too. */
function FeeChip({ fee }: { fee: number }) {
  return (
    <span className="num text-[11px] leading-5 px-1.5 rounded-[4px] text-[#9a6b00] dark:text-[#d4a017] bg-[#d4a017]/15" title="Delegation fee">
      {fee.toFixed(fee % 1 ? 2 : 0)}% fee
    </span>
  );
}

/** Own stake against delegations, as one bar. */
function StakeSplit({ own, delegated }: { own: number; delegated: number }) {
  const total = own + delegated;
  const ownPct = total > 0 ? (own / total) * 100 : 100;
  return (
    <div>
      <div className="num text-[22px] leading-7 font-medium text-foreground">
        {formatAvaxCompact(total)} <span className="text-[13px] text-muted-foreground">AVAX</span>
      </div>
      <div className="mt-3 flex h-2.5 rounded-sm overflow-hidden gap-px bg-muted" role="img" aria-label={`${Math.round(ownPct)}% own stake`}>
        <div style={{ width: `${ownPct}%`, background: OWN }} />
        {delegated > 0 && <div style={{ width: `${100 - ownPct}%`, background: DELEGATED }} />}
      </div>
      <dl className="mt-3 space-y-1.5 text-[12px]">
        <div className="flex items-center justify-between gap-3">
          <dt className="inline-flex items-center gap-1.5 text-muted-foreground"><span className="w-2 h-2 rounded-sm" style={{ background: OWN }} />Own stake</dt>
          <dd className="num text-foreground">{formatAvax(own)} AVAX <span className="text-muted-foreground">{Math.round(ownPct)}%</span></dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="inline-flex items-center gap-1.5 text-muted-foreground"><span className="w-2 h-2 rounded-sm" style={{ background: DELEGATED }} />Delegated</dt>
          <dd className="num text-foreground">{formatAvax(delegated)} AVAX <span className="text-muted-foreground">{Math.round(100 - ownPct)}%</span></dd>
        </div>
      </dl>
    </div>
  );
}

/** Uptime on the 80 to 100% scale Staking uses: gray, red only below the reward minimum (90% since Helicon, 80% before). */
function UptimeCard({ value, legacy, minimum }: { value: number; legacy: boolean; minimum: 80 | 90 }) {
  const low = value < minimum;
  const fill = uptimeFill(value);
  return (
    <Panel title={legacy ? 'Uptime on the Primary Network' : 'Uptime'}>
      <div className={`num text-[22px] leading-7 font-medium ${low ? 'text-down' : 'text-foreground'}`}>{value.toFixed(2)}%</div>
      <p className="text-[11px] text-muted-foreground mt-0.5">
        {low ? `Below the ${minimum}% needed for staking rewards` : `Above the ${minimum}% needed for staking rewards`}
        {minimum === 90 && ', the minimum for validations started since the Helicon upgrade'}
      </p>
      <div className="relative mt-3 h-1.5 rounded-sm bg-muted overflow-hidden">
        <div className={`h-full rounded-sm ${low ? 'bg-down' : 'bg-foreground/50'}`} style={{ width: `${low ? Math.max(4, fill) : fill}%` }} />
        {/* The reward minimum on the scale. */}
        {minimum === 90 && <span className="absolute top-0 bottom-0 w-px bg-foreground/70" style={{ left: '50%' }} aria-hidden />}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground num">
        <span>80%</span>
        <span>100%</span>
      </div>
    </Panel>
  );
}

function hasEnd(v: L1BeatValidator): boolean {
  return !!v.end_time && v.end_time !== '1970-01-01T00:00:00Z';
}

function periodText(v: L1BeatValidator): string {
  const start = format(new Date(v.start_time), 'MMM d, yyyy');
  if (v.active) return `${start} to now`;
  return hasEnd(v) ? `${start} to ${format(new Date(v.end_time!), 'MMM d, yyyy')}` : start;
}

function validationStake(v: L1BeatValidator): string {
  if (v.staked_amount != null) {
    const n = Number(v.staked_amount);
    const amount = Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : v.staked_amount;
    return `${amount} ${v.staked_token ?? ''}`.trim();
  }
  return `Weight ${v.weight.toLocaleString()}`;
}

/** Every validation the node has run, newest first; the one on screen is marked. */
function ValidationHistory({ validations, current, chains, onOpen }: {
  validations: L1BeatValidator[];
  current: string;
  chains: Record<string, Chain | null>;
  onOpen: (v: L1BeatValidator) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? validations : validations.slice(0, 10);
  const chainName = (v: L1BeatValidator) =>
    v.subnet_id === PRIMARY_NETWORK_SUBNET_ID ? 'Primary Network' : chains[v.subnet_id]?.chainName ?? shortId(v.subnet_id);
  // One time axis for every row, from the node's first validation to today.
  const nowMs = Date.now();
  const startMs = Math.min(...validations.map((v) => new Date(v.start_time).getTime()));
  const endOf = (v: L1BeatValidator) => (v.active || !hasEnd(v) ? nowMs : Math.min(nowMs, new Date(v.end_time!).getTime()));
  const span = Math.max(1, nowMs - startMs);

  return (
    <Panel
      title="Validation history"
      aside={<span className="num text-[11px] text-muted-foreground">{validations.length} validations by this node</span>}
      flush
    >
      <table className="w-full text-[12px]">
        <thead className="hidden sm:table-header-group">
          <tr className="border-b border-border text-[11px] text-muted-foreground">
            <th className="text-left font-normal py-2 px-4 sm:px-5">Period</th>
            <th className="text-left font-normal py-2 px-3">Chain</th>
            <th className="text-left font-normal py-2 px-3 hidden md:table-cell w-[22%]">
              <span className="flex justify-between"><span className="num">{format(new Date(startMs), 'MMM yyyy')}</span><span>now</span></span>
            </th>
            <th className="text-right font-normal py-2 px-3">Stake</th>
            <th className="text-right font-normal py-2 px-3">Uptime</th>
            <th className="text-right font-normal py-2 px-4 sm:px-5">Validation</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {shown.map((v) => {
            const isCurrent = v.validation_id === current;
            const status = (
              <span
                aria-hidden
                className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${v.active ? 'bg-up' : 'bg-muted-foreground/40'}`}
              />
            );
            const id = isCurrent ? (
              <span className="text-[11px] text-foreground">Viewing</span>
            ) : (
              <span className="num text-[11px] text-muted-foreground group-hover:text-foreground">{shortId(v.validation_id, 6, 4)}</span>
            );
            const uptime = v.uptime_percentage != null ? `${v.uptime_percentage.toFixed(2)}%` : '—';
            return (
              <tr
                key={v.validation_id}
                onClick={isCurrent ? undefined : () => onOpen(v)}
                onKeyDown={isCurrent ? undefined : (e) => { if (e.key === 'Enter') onOpen(v); }}
                tabIndex={isCurrent ? undefined : 0}
                aria-current={isCurrent ? 'true' : undefined}
                className={`group transition-colors ${isCurrent ? 'bg-muted/40' : 'cursor-pointer hover:bg-muted/30 focus-visible:outline-none focus-visible:bg-muted/40'}`}
              >
                <td className="sm:hidden px-4 py-2.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="inline-flex items-center gap-2 text-foreground">{status}{chainName(v)}</span>
                    {id}
                  </div>
                  <div className="mt-0.5 flex items-baseline justify-between gap-3 text-[11px] text-muted-foreground">
                    <span className="num">{periodText(v)}</span>
                    <span className="num">{uptime}</span>
                  </div>
                </td>
                <td className="hidden sm:table-cell num py-2.5 px-4 sm:px-5 text-muted-foreground whitespace-nowrap">
                  <span className="inline-flex items-center gap-2">{status}{periodText(v)}</span>
                </td>
                <td className="hidden sm:table-cell py-2.5 px-3 text-foreground whitespace-nowrap">{chainName(v)}</td>
                <td className="hidden md:table-cell py-2.5 px-3">
                  {/* When this validation ran, on the shared axis. */}
                  <div className="relative h-1.5 rounded-sm bg-muted">
                    <div
                      className={`absolute inset-y-0 rounded-sm ${v.active ? '' : 'bg-foreground/30'}`}
                      style={{
                        left: `${((new Date(v.start_time).getTime() - startMs) / span) * 100}%`,
                        width: `${Math.max(1, ((endOf(v) - new Date(v.start_time).getTime()) / span) * 100)}%`,
                        background: v.active ? (v.subnet_id === PRIMARY_NETWORK_SUBNET_ID ? OWN : DELEGATED) : undefined,
                      }}
                    />
                  </div>
                </td>
                <td className="hidden sm:table-cell num py-2.5 px-3 text-right text-foreground whitespace-nowrap">{validationStake(v)}</td>
                <td className="hidden sm:table-cell num py-2.5 px-3 text-right text-foreground whitespace-nowrap">{uptime}</td>
                <td className="hidden sm:table-cell py-2.5 px-4 sm:px-5 text-right whitespace-nowrap">{id}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {validations.length > 10 && (
        <div className="border-t border-border px-4 sm:px-5 py-2.5">
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            {showAll ? 'Show fewer' : `Show all ${validations.length} validations`}
          </button>
        </div>
      )}
    </Panel>
  );
}

type DelegationSort = 'stake' | 'end';
const DELEGATION_SORTS = [
  { value: 'stake' as const, label: 'Largest' },
  { value: 'end' as const, label: 'Ending soon' },
];

/** Running delegations to a Primary Network validator. */
function DelegationsPanel({ nodeId }: { nodeId: string }) {
  const [rows, setRows] = useState<ValidatorDelegation[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [sort, setSort] = useState<DelegationSort>('stake');
  const [showAll, setShowAll] = useState(false);
  const labels = useLiquidStakingLabels();

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setFailed(false);
    getValidatorDelegations(nodeId).then((r) => {
      if (cancelled) return;
      if (r) setRows(r);
      else setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [nodeId]);

  const sorted = rows
    ? [...rows].sort((a, b) =>
        sort === 'stake'
          ? Number(b.stake) - Number(a.stake)
          : new Date(a.end_time).getTime() - new Date(b.end_time).getTime(),
      )
    : [];
  const shown = showAll ? sorted : sorted.slice(0, 20);
  const total = rows?.reduce((sum, r) => sum + Number(r.stake), 0) ?? 0;
  const maxStake = rows?.reduce((m, r) => Math.max(m, Number(r.stake)), 0) ?? 0;

  return (
    <Panel
      title="Delegations"
      aside={
        rows && rows.length > 1 ? (
          <SegmentedControl size="xs" value={sort} options={DELEGATION_SORTS} onChange={setSort} ariaLabel="Sort delegations" />
        ) : undefined
      }
      flush
    >
      {failed ? (
        <p className="px-4 sm:px-5 py-4 text-[12px] text-muted-foreground">Delegations couldn't be loaded. Try again in a minute.</p>
      ) : !rows ? (
        <div className="px-4 sm:px-5 py-4 space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-5 rounded bg-muted animate-pulse" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="px-4 sm:px-5 py-4 text-[12px] text-muted-foreground">No running delegations.</p>
      ) : (
        <>
          <DelegationSummary rows={rows} total={total} />
          <table className="w-full text-[12px]">
            <thead className="hidden sm:table-header-group">
              <tr className="border-y border-border text-[11px] text-muted-foreground">
                <th className="text-left font-normal py-2 px-4 sm:px-5">Delegator</th>
                <th className="text-right font-normal py-2 px-3">Stake</th>
                <th className="text-right font-normal py-2 px-3">Share</th>
                <th className="text-right font-normal py-2 px-3">Started</th>
                <th className="text-right font-normal py-2 px-3">Ends</th>
                <th className="text-right font-normal py-2 px-4 sm:px-5">Transaction</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {shown.map((d) => {
                const avaxAmount = `${formatAvax(Number(d.stake))} AVAX`;
                const share = total > 0 ? (Number(d.stake) / total) * 100 : 0;
                return (
                  <tr key={d.tx_id} className="hover:bg-muted/30 transition-colors">
                    {/* Phones get one stacked cell; the table columns don't fit. */}
                    <td className="sm:hidden px-4 py-2.5">
                      <div className="flex items-baseline justify-between gap-3">
                        <RewardOwner owners={d.reward_owner} labels={labels} />
                        <span className="num text-foreground">{avaxAmount}</span>
                      </div>
                      <div className="mt-0.5 flex items-baseline justify-between gap-3 text-[11px] text-muted-foreground">
                        <span className="num">Ends {format(new Date(d.end_time), 'MMM d, yyyy')}</span>
                        <TxLink id={d.tx_id} />
                      </div>
                    </td>
                    <td className="hidden sm:table-cell py-2.5 px-4 sm:px-5">
                      <RewardOwner owners={d.reward_owner} labels={labels} />
                    </td>
                    <td className="hidden sm:table-cell num py-2.5 px-3 text-right text-foreground whitespace-nowrap">{avaxAmount}</td>
                    <td className="hidden sm:table-cell py-2.5 px-3">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-20 h-1.5 rounded-sm bg-muted overflow-hidden">
                          {/* Scaled to the largest delegation, so the small ones stay visible. */}
                          <div className="h-full rounded-sm" style={{ width: `${maxStake > 0 ? (Number(d.stake) / maxStake) * 100 : 0}%`, background: DELEGATED }} />
                        </div>
                        <span className="num w-10 text-right text-muted-foreground">{share < 0.1 ? '<0.1' : share.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td className="hidden sm:table-cell num py-2.5 px-3 text-right text-muted-foreground whitespace-nowrap">
                      {format(new Date(d.start_time), 'MMM d, yyyy')}
                    </td>
                    <td className="hidden sm:table-cell num py-2.5 px-3 text-right text-muted-foreground whitespace-nowrap">
                      {format(new Date(d.end_time), 'MMM d, yyyy')}
                      <span className="ml-1.5 text-foreground/70">(in {timeLeft((new Date(d.end_time).getTime() - Date.now()) / 86_400_000)})</span>
                    </td>
                    <td className="hidden sm:table-cell py-2.5 px-4 sm:px-5 text-right">
                      <TxLink id={d.tx_id} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length > 20 && (
            <div className="border-t border-border px-4 sm:px-5 py-2.5">
              <button
                onClick={() => setShowAll(!showAll)}
                className="text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                {showAll ? 'Show fewer' : `Show all ${rows.length.toLocaleString()} delegations`}
              </button>
            </div>
          )}
        </>
      )}
    </Panel>
  );
}

/**
 * Above the delegation list: how spread out the delegations are, and how much
 * AVAX each coming month frees up as delegations end.
 */
function DelegationSummary({ rows, total }: { rows: ValidatorDelegation[]; total: number }) {
  const sorted = [...rows].map((r) => Number(r.stake)).sort((a, b) => b - a);
  const top = sorted[0] ?? 0;
  const top10 = sorted.slice(0, 10).reduce((a, b) => a + b, 0);
  const pct = (v: number) => (total > 0 ? (v / total) * 100 : 0);
  // AVAX whose delegation ends in each of the next six calendar months.
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, i) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1)));
  const ending = months.map((m, i) => {
    const next = months[i + 1] ?? new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1));
    return rows.filter((r) => {
      const t = new Date(r.end_time).getTime();
      return t >= m.getTime() && t < next.getTime();
    }).reduce((a, r) => a + Number(r.stake), 0);
  });
  const maxEnding = Math.max(...ending, 1);
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 px-4 sm:px-5 pt-3 pb-4 border-b border-border">
      <div className="min-w-0">
        <p className="text-[12px] text-muted-foreground">
          <span className="num text-foreground">{rows.length.toLocaleString()}</span> running {rows.length === 1 ? 'delegation' : 'delegations'},{' '}
          <span className="num text-foreground">{formatAvax(total)}</span> AVAX in total.
          {rows.length > 1 && (
            <>
              {' '}The largest is <span className="num text-foreground">{pct(top).toFixed(1)}%</span>
              {rows.length > 10 && <>, the top 10 together <span className="num text-foreground">{pct(top10).toFixed(0)}%</span></>}.
            </>
          )}
        </p>
        <div className="mt-2.5 flex h-2.5 rounded-sm overflow-hidden gap-px bg-muted" role="img" aria-label="Share of each of the 10 largest delegations">
          {sorted.slice(0, 10).map((v, i) => (
            <div key={i} style={{ width: `${pct(v)}%`, background: DELEGATED, opacity: 1 - i * 0.07 }} />
          ))}
          {rows.length > 10 && <div style={{ width: `${pct(total - top10)}%` }} className="bg-foreground/20" />}
        </div>
        <div className="mt-1.5 flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm" style={{ background: DELEGATED }} />{rows.length > 10 ? '10 largest' : 'Each delegation'}</span>
          {rows.length > 10 && <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-foreground/20" />the other {(rows.length - 10).toLocaleString()}</span>}
        </div>
      </div>
      <div className="min-w-0">
        <p className="text-[12px] text-muted-foreground">Ending by month</p>
        <div className="mt-2 flex items-end gap-2 h-14" role="img" aria-label="AVAX whose delegation ends in each of the next six months">
          {ending.map((v, i) => (
            <div key={i} className="flex-1 flex flex-col items-center justify-end h-full min-w-0" title={`${format(months[i], 'MMM yyyy')}: ${formatAvax(v)} AVAX`}>
              <div className="w-full rounded-t-sm" style={{ height: `${v > 0 ? Math.max(4, (v / maxEnding) * 100) : 0}%`, background: DELEGATED, opacity: 0.8 }} />
            </div>
          ))}
        </div>
        <div className="mt-1 flex gap-2 text-[10px] text-muted-foreground num">
          {ending.map((v, i) => (
            <div key={i} className="flex-1 min-w-0 text-center truncate">
              {format(months[i], 'MMM')}
              <span className="block text-foreground/80">{v > 0 ? formatAvaxCompact(v) : '0'}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** The delegator's reward address, shortened and linked to its delegator page, with a copy button for the full one. */
function RewardOwner({ owners, labels }: { owners: string[] | null; labels: Record<string, LiquidStakingLabel> }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  if (!owners || owners.length === 0) return <span className="text-muted-foreground">—</span>;
  const first = owners[0];
  const label = labels[first];
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(first);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast('Failed to copy to clipboard', 'error');
    }
  };
  return (
    <span className="inline-flex items-center gap-1 min-w-0">
      <Link
        to={`/delegator/${first}`}
        className="num text-foreground truncate hover:underline underline-offset-2"
        title={owners.join(', ')}
      >
        {shortId(first, 12, 6)}
      </Link>
      {owners.length > 1 && <span className="num text-[11px] text-muted-foreground">+{owners.length - 1}</span>}
      {label && (
        <span
          className="shrink-0 inline-flex items-center gap-1 text-[10px] leading-4 pl-0.5 pr-1.5 rounded border border-border text-muted-foreground"
          title={`${label.name} ${label.token} liquid staking${label.attribution === 'unconfirmed' ? ', matched on-chain' : ''}`}
        >
          {label.logo && <img src={label.logo} alt="" className="w-3 h-3 rounded-full" loading="lazy" />}
          {label.name}
        </span>
      )}
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? 'Address copied' : `Copy address ${first}`}
        title={copied ? 'Copied' : 'Copy address'}
        className={`shrink-0 inline-flex items-center justify-center w-5 h-5 rounded transition-colors hover:bg-accent ${
          copied ? 'text-up' : 'text-muted-foreground/60 hover:text-foreground'
        }`}
      >
        {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      </button>
    </span>
  );
}

function Panel({ title, aside, flush = false, children }: {
  title: string;
  aside?: ReactNode;
  /** No body padding, for tables that run edge to edge. */
  flush?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="rounded-md border border-border bg-card overflow-hidden">
      <header className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-border">
        <h2 className="text-[14px] font-semibold text-foreground">{title}</h2>
        {aside}
      </header>
      <div className={flush ? '' : 'px-4 sm:px-5 py-3'}>{children}</div>
    </section>
  );
}

function Row({ label, value, mono = true }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 border-b border-border/60 last:border-0">
      <dt className="text-[12px] text-muted-foreground shrink-0">{label}</dt>
      <dd className={`text-[13px] text-foreground text-right min-w-0 truncate ${mono ? 'num' : ''}`}>{value}</dd>
    </div>
  );
}

function TxLink({ id }: { id: string }) {
  return (
    <a
      href={`${EXPLORER}/p-chain/tx/${id}`}
      target="_blank"
      rel="noopener noreferrer"
      className="num inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
    >
      {shortId(id)}
      <ExternalLink className="w-3 h-3" />
    </a>
  );
}

/** Where the deposits went: spent on fees, still held, or refunded. */
function DepositSplit({ total, fees, balance, refund }: { total: number; fees: number; balance: number; refund: number }) {
  const parts = [
    { label: 'Fees paid', value: fees, swatch: 'bg-foreground/35' },
    { label: 'Balance', value: balance, swatch: 'bg-up' },
    { label: 'Refunded', value: refund, swatch: 'bg-muted-foreground/25' },
  ].filter((p) => p.value > 0);
  const pct = (v: number) => (v / total) * 100;
  return (
    <div className="mb-3">
      <div className="flex h-2 rounded-sm overflow-hidden bg-muted">
        {parts.map((p, i) => (
          <div
            key={p.label}
            className={`h-full ${p.swatch} ${i > 0 ? 'border-l border-card' : ''}`}
            style={{ width: `${Math.min(100, pct(p.value))}%` }}
            title={`${p.label}: ${pct(p.value).toFixed(1)}%`}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        {parts.map((p) => (
          <span key={p.label} className="inline-flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-sm ${p.swatch}`} />
            {p.label} <span className="num">{Math.round(pct(p.value))}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}
