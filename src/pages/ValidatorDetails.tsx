import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { ArrowLeft, Copy, Check, ExternalLink, AlertTriangle, Shield } from 'lucide-react';
import { getL1BeatValidator, getL1BeatValidatorDeposits, getL1BeatNodeValidations, getChainBySubnetId, getL1BeatSubnetType, getValidatorDelegations } from '../api';
import type { L1BeatValidator, ValidatorDelegation } from '../api';
import type { Chain, ValidatorDeposit } from '../types';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { SEO } from '../components/SEO';
import { useToast } from '../components/Toaster';
import { shortNodeId } from '../utils/nodeId';
import { SegmentedControl, StatStrip } from '../components/instrument';
import type { StatItem } from '../components/instrument';

const PRIMARY_NETWORK_SUBNET_ID = '11111111111111111111111111111111LpoYY';
const NAVAX_TO_AVAX = 1_000_000_000;
const DAILY_FEE_RATE = 44_236_800; // nAVAX per day, local fallback when the indexer gives no estimate
const EXPLORER = 'https://subnets.avax.network';
// Darker amber in light mode: the dark-mode tone fails contrast on white.
const WARN_TEXT = 'text-[#9a6b00] dark:text-[#d4a017]';

type ValidatorKind = 'l1' | 'legacy' | 'primary';
type CopyKey = 'node' | 'validation' | 'bls' | 'owner' | 'tx';

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
        // By validation ID: a node that validated more than once would otherwise
        // list the deposits of every validation it ever had.
        const d = await getL1BeatValidatorDeposits(v.validation_id);
        setDeposits(d.sort((a, b) => new Date(b.block_time).getTime() - new Date(a.block_time).getTime()));
      } else {
        setDeposits([]);
      }

      const c = await getChainBySubnetId(v.subnet_id);
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
    getL1BeatNodeValidations(nodeId).then(async (all) => {
      if (cancelled || all.length < 2) return;
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
  const stakeText = `${stakeAvax.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} AVAX`;

  const uptimeValue = kind === 'legacy' ? (validator.primary_uptime ?? 0) : (validator.uptime_percentage ?? 0);

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

  const stats: StatItem[] = isL1
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
        { label: kind === 'legacy' ? 'Primary Network stake' : 'Staked', value: avax(stakeAvax * NAVAX_TO_AVAX) },
        {
          label: kind === 'legacy' ? 'Primary uptime' : 'Uptime',
          value: (
            <span className={uptimeValue >= 80 ? 'text-foreground' : uptimeValue >= 50 ? WARN_TEXT : 'text-down'}>
              {uptimeValue.toFixed(2)}%
            </span>
          ),
          sub: uptimeValue < 80 ? 'Below the 80% needed for rewards' : undefined,
        },
        term
          ? {
              label: 'Staking term',
              value: validator.active ? `${term.daysLeft.toLocaleString()} days left` : 'Ended',
              sub: `${term.totalDays.toLocaleString()} day term`,
            }
          : { label: 'Weight', value: validator.weight.toLocaleString() },
        ...(kind === 'primary' && validator.total_stake != null
          ? [{
              label: 'Total stake',
              value: <>{formatAvaxCompact(validator.total_stake)}<span className="ml-1 text-[13px] text-muted-foreground">AVAX</span></>,
              sub: validator.network_share_percent != null ? `${validator.network_share_percent.toFixed(4)}% of network` : 'Own stake plus delegations',
            }]
          : kind === 'legacy'
            ? [{ label: 'Subnet weight', value: validator.weight.toLocaleString() }]
            : []),
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

  return (
    <div className="max-w-7xl 2xl:max-w-screen-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      <SEO
        title={`${nodeShort} · Validator`}
        description={`${chain ? `${chain.chainName} validator ` : 'Avalanche validator '}${nodeShort}: balance, uptime, deposit history, and validation record.`}
        url={`/validator/${validator.node_id}`}
      />
      <button
        onClick={() => (chain ? navigate(`/chain/${chain.chainId}`) : navigate(-1))}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        {backLabel}
      </button>

      <header className="border-b border-border pb-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-4 min-w-0">
            <div className="w-11 h-11 rounded-md bg-muted flex items-center justify-center shrink-0">
              <Shield className="w-5 h-5 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <div className="flex items-start gap-2 min-w-0">
                <h1 className="num text-[17px] sm:text-[20px] leading-7 font-medium text-foreground break-all">
                  {validator.node_id}
                </h1>
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
                      {chain.chainLogoUri && <img src={chain.chainLogoUri} alt="" className="w-3.5 h-3.5 rounded-full" />}
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
      </header>

      <StatStrip items={stats} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel title={isL1 ? 'Balance' : 'Stake'}>
          {isL1 ? (
            <>
              {totalDeposited > 0 && (
                <DepositSplit total={totalDeposited} fees={feesPaid} balance={balance} refund={refundAmount} />
              )}
              <dl>
                <Row label="Initial deposit" value={`${formatAvax(initialDeposit)} AVAX`} />
                <Row label="Top-ups" value={`${formatAvax(totalTopups)} AVAX`} />
                <Row label="Fees paid" value={`${formatAvax(feesPaid)} AVAX`} />
                {refundAmount > 0 && <Row label="Refunded" value={`${formatAvax(refundAmount)} AVAX`} />}
                <Row label="Current balance" value={`${formatAvax(balance)} AVAX`} />
                <Row label="Weight" value={validator.weight.toLocaleString()} />
              </dl>
            </>
          ) : (
            <>
              {term && (
                <div className="mb-4">
                  <div className="flex items-baseline justify-between text-[11px] text-muted-foreground mb-1.5">
                    <span>Staking term</span>
                    <span className="num">{Math.floor(term.progress)}% complete</span>
                  </div>
                  <div className="h-2 rounded-sm bg-muted overflow-hidden">
                    <div
                      className={`h-full ${validator.active ? 'bg-up' : 'bg-muted-foreground/50'}`}
                      style={{ width: `${term.progress}%` }}
                    />
                  </div>
                </div>
              )}
              <dl>
                <Row label={kind === 'legacy' ? 'Primary Network stake' : 'Staked'} value={stakeText} />
                {kind === 'legacy' && <Row label="Subnet weight" value={validator.weight.toLocaleString()} />}
                {kind === 'primary' && validator.delegation_fee_percent != null && (
                  <Row label="Delegation fee" value={`${validator.delegation_fee_percent.toFixed(2)}%`} />
                )}
                {kind === 'primary' && validator.delegator_count != null && (
                  <Row label="Delegators" value={validator.delegator_count.toLocaleString()} />
                )}
                {kind === 'primary' && validator.total_delegated != null && (
                  <Row label="Delegated" value={`${formatAvax(validator.total_delegated)} AVAX`} />
                )}
                {kind === 'primary' && validator.total_stake != null && (
                  <Row label="Total stake" value={`${formatAvax(validator.total_stake)} AVAX`} />
                )}
                {kind === 'primary' && validator.network_share_percent != null && (
                  <Row label="Network share" value={`${validator.network_share_percent.toFixed(4)}%`} />
                )}
              </dl>
            </>
          )}
        </Panel>

        <Panel title="Record">
          <dl>
            <Row label="Started" value={format(new Date(validator.start_time), 'MMM d, yyyy HH:mm')} />
            {validator.end_time && validator.end_time !== '1970-01-01T00:00:00Z' && (
              <Row label={validator.active ? 'Ends' : 'Ended'} value={format(new Date(validator.end_time), 'MMM d, yyyy HH:mm')} />
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
      </div>

      {isL1 && deposits.length > 0 && (
        <Panel
          title="Deposit history"
          aside={<span className="num text-[11px] text-muted-foreground">{deposits.length} {deposits.length === 1 ? 'transaction' : 'transactions'}</span>}
          flush
        >
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
                  <td className="hidden sm:table-cell num py-2.5 px-3 text-right text-foreground whitespace-nowrap">
                    {formatAvax(d.amount)} AVAX
                  </td>
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

      {kind === 'primary' && validator.active && (validator.delegator_count ?? 0) > 0 && (
        <DelegationsPanel nodeId={validator.node_id} />
      )}

      {history.length > 1 && (
        <ValidationHistory
          validations={history}
          current={validator.validation_id}
          chains={historyChains}
          onOpen={(v) => navigate(`/validator/${v.validation_id}?subnet=${v.subnet_id}`)}
        />
      )}
    </div>
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
          <p className="px-4 sm:px-5 pt-3 pb-2 text-[12px] text-muted-foreground">
            <span className="num text-foreground">{rows.length.toLocaleString()}</span> running{' '}
            {rows.length === 1 ? 'delegation' : 'delegations'}, <span className="num text-foreground">{formatAvax(total)}</span> AVAX in total.
          </p>
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
                        <RewardOwner owners={d.reward_owner} />
                        <span className="num text-foreground">{avaxAmount}</span>
                      </div>
                      <div className="mt-0.5 flex items-baseline justify-between gap-3 text-[11px] text-muted-foreground">
                        <span className="num">Ends {format(new Date(d.end_time), 'MMM d, yyyy')}</span>
                        <TxLink id={d.tx_id} />
                      </div>
                    </td>
                    <td className="hidden sm:table-cell py-2.5 px-4 sm:px-5">
                      <RewardOwner owners={d.reward_owner} />
                    </td>
                    <td className="hidden sm:table-cell num py-2.5 px-3 text-right text-foreground whitespace-nowrap">{avaxAmount}</td>
                    <td className="hidden sm:table-cell num py-2.5 px-3 text-right text-muted-foreground whitespace-nowrap">
                      {share < 0.1 ? '<0.1' : share.toFixed(1)}%
                    </td>
                    <td className="hidden sm:table-cell num py-2.5 px-3 text-right text-muted-foreground whitespace-nowrap">
                      {format(new Date(d.start_time), 'MMM d, yyyy')}
                    </td>
                    <td className="hidden sm:table-cell num py-2.5 px-3 text-right text-muted-foreground whitespace-nowrap">
                      {format(new Date(d.end_time), 'MMM d, yyyy')}
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

/** The delegator's reward address, shortened, with a copy button for the full one. */
function RewardOwner({ owners }: { owners: string[] | null }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  if (!owners || owners.length === 0) return <span className="text-muted-foreground">—</span>;
  const first = owners[0];
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
      <span className="num text-foreground truncate" title={owners.join(', ')}>
        {shortId(first, 12, 6)}
      </span>
      {owners.length > 1 && <span className="num text-[11px] text-muted-foreground">+{owners.length - 1}</span>}
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
