import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { AlertTriangle, ArrowLeft, Check, ChevronLeft, ChevronRight, Copy, ExternalLink, Wallet } from 'lucide-react';
import { getDelegatorDelegations, getStakingSummary, PRIMARY_NETWORK_SUBNET_ID } from '../api';
import type { DelegatorDelegation, DelegatorPage } from '../api';
import { SEO } from '../components/SEO';
import { NodeId } from '../components/NodeId';
import { useToast } from '../components/Toaster';
import { SegmentedControl, StatStrip } from '../components/instrument';
import type { StatItem } from '../components/instrument';
import { useLiquidStakingLabels } from '../hooks/useLiquidStakingLabels';

const EXPLORER = 'https://subnets.avax.network';
const PAGE_SIZE = 50;
const ADDRESS_RE = /^(P-)?avax1[02-9ac-hj-np-z]{38}$/;

type Status = 'running' | 'ended' | 'all';
type Sort = 'stake' | 'start' | 'end';

const STATUS_OPTIONS = [
  { value: 'running' as const, label: 'Running' },
  { value: 'ended' as const, label: 'Ended' },
  { value: 'all' as const, label: 'All' },
];

const toAvax = (nAvax: string | number) => Number(nAvax) / 1e9;
// Delegated stake is violet on the Staking and validator pages.
const DELEGATED = '#8b5cf6';

/** Time left as Staking shows it: "59d", then "3 mo". */
function timeLeft(days: number): string {
  if (days < 1) return 'today';
  return days < 60 ? `${Math.floor(days)}d` : `${Math.round(days / 30)} mo`;
}

function formatAvax(nAvax: string | number): string {
  return toAvax(nAvax).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function compactAvax(nAvax: string | number): string {
  const v = toAvax(nAvax);
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e4) return `${(v / 1e3).toFixed(1)}K`;
  return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function shortId(id: string, head = 8, tail = 6): string {
  return id.length > head + tail + 1 ? `${id.slice(0, head)}…${id.slice(-tail)}` : id;
}

/** Everything one reward address has delegated on the Primary Network. */
export function DelegatorDetails() {
  const { address: raw = '' } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  // Bech32 is case-insensitive; the prefix is optional.
  const bare = raw.trim().replace(/^p-/i, '').toLowerCase();
  const address = bare.startsWith('avax1') ? `P-${bare}` : raw;
  const valid = ADDRESS_RE.test(address);

  const [status, setStatus] = useState<Status>('running');
  const [sort, setSort] = useState<Sort>('stake');
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<DelegatorPage | null>(null);
  const [summary, setSummary] = useState<DelegatorPage['meta']['summary'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [allDelegated, setAllDelegated] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const tableRef = useRef<HTMLElement>(null);
  // The address the empty Running view already fell back to All for, so
  // choosing Running again afterwards stays put.
  const fellBack = useRef<string | null>(null);
  const label = useLiquidStakingLabels()[address];

  useEffect(() => {
    setStatus('running');
    setSort('stake');
    setPage(0);
    setSummary(null);
    setResult(null);
  }, [address]);

  useEffect(() => {
    getStakingSummary().then((s) => setAllDelegated(s ? Number(s.delegated_stake) : null));
  }, []);

  // The largest running delegations, for the overview card. Same request as the
  // table's default view, so it's usually served from the cache.
  const [running, setRunning] = useState<DelegatorDelegation[] | null>(null);
  useEffect(() => {
    if (!valid) return;
    let cancelled = false;
    setRunning(null);
    getDelegatorDelegations(address, { active: true, sort: 'stake', order: 'desc', limit: PAGE_SIZE, offset: 0 }).then((r) => {
      if (!cancelled) setRunning(r?.data ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [address, valid]);

  useEffect(() => {
    if (!valid) return;
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    // Soonest first for running delegations, most recent first for ended ones.
    const order = sort === 'end' && status === 'running' ? 'asc' : 'desc';
    getDelegatorDelegations(address, {
      active: status === 'all' ? undefined : status === 'running',
      sort: sort === 'stake' ? 'stake' : sort === 'start' ? 'start_time' : 'end_time',
      order,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }).then((r) => {
      if (cancelled) return;
      setLoading(false);
      if (!r) {
        setFailed(true);
        return;
      }
      setSummary(r.meta.summary);
      // Nothing running: open on the full history instead of an empty table.
      if (
        status === 'running' &&
        page === 0 &&
        r.meta.summary.active_count === 0 &&
        r.meta.summary.first_delegation_time &&
        fellBack.current !== address
      ) {
        fellBack.current = address;
        setStatus('all');
        return;
      }
      setResult(r);
    });
    return () => {
      cancelled = true;
    };
  }, [address, valid, status, sort, page]);

  const goTo = (p: number) => {
    setPage(p);
    tableRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast('Failed to copy to clipboard', 'error');
    }
  };

  if (!valid) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 text-center">
        <AlertTriangle className="w-6 h-6 mx-auto mb-4 text-muted-foreground" />
        <h2 className="text-[18px] font-semibold text-foreground mb-1">Not a P-Chain address</h2>
        <p className="text-[13px] text-muted-foreground mb-5">Delegator pages take a mainnet address starting with P-avax1.</p>
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

  const activeStake = summary ? Number(summary.active_stake) : 0;
  const share = activeStake > 0 && allDelegated ? (activeStake / allDelegated) * 100 : null;
  const stats: StatItem[] = [
    {
      label: 'Delegated now',
      value: summary ? (
        <>
          {compactAvax(summary.active_stake)}
          <span className="ml-1 text-[13px] text-muted-foreground">AVAX</span>
        </>
      ) : '—',
      sub: share != null ? `${share < 0.01 ? '<0.01' : share.toFixed(2)}% of delegated AVAX` : undefined,
    },
    {
      label: 'Running delegations',
      value: summary ? summary.active_count.toLocaleString() : '—',
    },
    {
      label: 'Validators',
      value: summary ? summary.validator_count.toLocaleString() : '—',
      sub: 'with a running delegation',
    },
    {
      label: 'First delegation',
      value: summary?.first_delegation_time ? format(new Date(summary.first_delegation_time), 'MMM yyyy') : '—',
      sub: summary?.first_delegation_time ? format(new Date(summary.first_delegation_time), 'MMM d, yyyy') : undefined,
    },
  ];

  const rows = result?.data ?? [];
  const total = result?.meta.total ?? 0;
  const from = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const to = Math.min(total, (page + 1) * PAGE_SIZE);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const sortOptions = [
    { value: 'stake' as const, label: 'Largest' },
    { value: 'start' as const, label: 'Newest' },
    { value: 'end' as const, label: status === 'running' ? 'Ending soon' : status === 'ended' ? 'Recently ended' : 'End date' },
  ];
  const empty = !loading && summary && !summary.first_delegation_time;

  const who = label ? `${label.name} ${label.token}` : 'This address';
  // Exact only when every running delegation is loaded.
  const allLoaded = !!summary && !!running && running.length >= summary.active_count;
  const nextEnd = allLoaded && running!.length
    ? Math.min(...running!.map((d) => new Date(d.end_time).getTime()))
    : null;
  const headline = !summary ? null : summary.active_count > 0 ? (
    {
      lead: (
        <>
          {who} delegates <span className="tabular-nums">{compactAvax(summary.active_stake)}</span> AVAX to{' '}
          <span className="tabular-nums">{summary.validator_count.toLocaleString()}</span> {summary.validator_count === 1 ? 'validator' : 'validators'}
          {share != null && share >= 0.01 && <>, <span className="tabular-nums">{share.toFixed(2)}%</span> of all delegated AVAX</>}.
        </>
      ),
      sub: (
        <>
          {summary.first_delegation_time && <>Delegating since {format(new Date(summary.first_delegation_time), 'MMMM yyyy')}</>}
          {nextEnd != null && (
            <>
              {summary.first_delegation_time ? '; the' : 'The'} next delegation ends in{' '}
              <span className="num">{timeLeft((nextEnd - Date.now()) / 86_400_000)}</span>
            </>
          )}
          .
        </>
      ),
    }
  ) : summary.first_delegation_time ? (
    {
      lead: <>{who} has no running delegations.</>,
      sub: <>It first delegated on {format(new Date(summary.first_delegation_time), 'MMM d, yyyy')}; its history is below.</>,
    }
  ) : null;

  return (
    <div>
      <SEO
        title={label ? `${label.name} ${label.token} · Delegator` : `${shortId(address, 12, 6)} · Delegator`}
        description={`Avalanche delegator ${shortId(address, 12, 6)}: AVAX delegated to Primary Network validators, running and ended.`}
        url={`/delegator/${address}`}
      />
      <section className="border-b border-border bg-stage" aria-label="Delegator summary">
      <div className="max-w-7xl 2xl:max-w-screen-2xl mx-auto px-4 sm:px-6 pt-5 pb-5 space-y-4">
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back
      </button>

      <header>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-4 min-w-0">
            {label?.logo ? (
              <img src={label.logo} alt={`${label.name} logo`} className="w-11 h-11 rounded-full shrink-0" />
            ) : (
              <div className="w-11 h-11 rounded-md bg-muted flex items-center justify-center shrink-0">
                <Wallet className="w-5 h-5 text-muted-foreground" />
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-start gap-2 min-w-0">
                <h1 className="num text-[15px] sm:text-[17px] leading-7 font-medium text-foreground break-all">{address}</h1>
                <button
                  onClick={copy}
                  className="pt-2 shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                  title={copied ? 'Copied' : 'Copy address'}
                  aria-label={copied ? 'Address copied' : 'Copy address'}
                >
                  {copied ? <Check className="w-3 h-3 text-up" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
              {label ? (
                <div className="mt-1 text-[12px] text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {label.name} {label.token}
                  </span>{' '}
                  liquid staking pool on the Primary Network.
                  {label.attribution === 'unconfirmed' && (
                    <> {label.name} doesn't publish this address; it was matched on-chain.</>
                  )}{' '}
                  <Link to="/staking" className="text-foreground underline underline-offset-2 decoration-border hover:decoration-foreground">
                    Liquid staking on the Staking page
                  </Link>
                </div>
              ) : (
                <div className="mt-1 text-[11px] text-muted-foreground">Primary Network delegator, by reward address</div>
              )}
            </div>
          </div>
          <a
            href={`${EXPLORER}/p-chain/address/${address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="self-start inline-flex items-center gap-1.5 h-8 px-3 rounded border border-border text-[12px] font-medium text-foreground hover:bg-muted transition-colors"
          >
            Explorer
            <ExternalLink className="w-3 h-3 text-muted-foreground" />
          </a>
        </div>
      </header>

      {headline && (
        <div className="pt-1">
          <p className="text-[22px] sm:text-[30px] leading-tight font-medium text-foreground max-w-4xl">{headline.lead}</p>
          <p className="mt-1.5 text-[14px] sm:text-[16px] leading-snug text-foreground/80 max-w-3xl">{headline.sub}</p>
        </div>
      )}

      <StatStrip items={stats} floating />
      </div>
      </section>

      <div className="max-w-7xl 2xl:max-w-screen-2xl mx-auto px-4 sm:px-6 py-5 space-y-5">
      {summary && summary.active_count > 0 && running && running.length > 0 && (
        <RunningOverview rows={running} activeStake={Number(summary.active_stake)} activeCount={summary.active_count} />
      )}


      <section ref={tableRef} className="rounded-md border border-border bg-card overflow-hidden scroll-mt-16">
        <header className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-border">
          <h2 className="text-[14px] font-semibold text-foreground">Delegations</h2>
          <div className="flex flex-wrap items-center gap-2">
            <SegmentedControl
              size="xs"
              value={status}
              options={STATUS_OPTIONS}
              onChange={(v) => {
                setStatus(v);
                setPage(0);
              }}
              ariaLabel="Delegation status"
            />
            <SegmentedControl
              size="xs"
              value={sort}
              options={sortOptions}
              onChange={(v) => {
                setSort(v);
                setPage(0);
              }}
              ariaLabel="Sort delegations"
            />
          </div>
        </header>

        {failed ? (
          <p className="px-4 sm:px-5 py-4 text-[12px] text-muted-foreground">Delegations couldn't be loaded. Try again in a minute.</p>
        ) : empty ? (
          <p className="px-4 sm:px-5 py-4 text-[12px] text-muted-foreground">No delegations name this address as their reward address.</p>
        ) : !result ? (
          <div className="px-4 sm:px-5 py-4 space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-5 rounded bg-muted animate-pulse" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="px-4 sm:px-5 py-4 text-[12px] text-muted-foreground">
            {status === 'running' ? 'No running delegations.' : 'No ended delegations.'}
          </p>
        ) : (
          <>
            <table className={`w-full text-[12px] ${loading ? 'opacity-50' : ''}`}>
              <thead className="hidden sm:table-header-group">
                <tr className="border-b border-border text-[11px] text-muted-foreground">
                  <th className="text-left font-normal py-2 px-4 sm:px-5">Validator</th>
                  <th className="text-right font-normal py-2 px-3">Stake</th>
                  {status === 'running' && <th className="text-left font-normal py-2 px-3 hidden md:table-cell w-[18%]">Share</th>}
                  <th className="text-right font-normal py-2 px-3">Started</th>
                  <th className="text-right font-normal py-2 px-3">{status === 'running' ? 'Ends' : status === 'ended' ? 'Ended' : 'End'}</th>
                  <th className="text-right font-normal py-2 px-4 sm:px-5">Transaction</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((d) => {
                  const to = `/validator/${d.node_id}?subnet=${PRIMARY_NETWORK_SUBNET_ID}`;
                  const end = format(new Date(d.end_time), 'MMM d, yyyy');
                  return (
                    <tr key={d.tx_id} className="hover:bg-muted/30 transition-colors">
                      {/* Phones get one stacked cell; the table columns don't fit. */}
                      <td className="sm:hidden px-4 py-2.5">
                        <div className="flex items-baseline justify-between gap-3">
                          <NodeId id={d.node_id} to={to} />
                          <span className="num text-foreground">{formatAvax(d.stake)} AVAX</span>
                        </div>
                        <div className="mt-0.5 flex items-baseline justify-between gap-3 text-[11px] text-muted-foreground">
                          <span className="num">
                            {d.active ? 'Ends' : 'Ended'} {end}
                          </span>
                          <TxLink id={d.tx_id} />
                        </div>
                      </td>
                      <td className="hidden sm:table-cell py-2.5 px-4 sm:px-5">
                        <NodeId id={d.node_id} to={to} />
                      </td>
                      <td className="hidden sm:table-cell num py-2.5 px-3 text-right text-foreground whitespace-nowrap">{formatAvax(d.stake)} AVAX</td>
                      {status === 'running' && (
                        <td className="hidden md:table-cell py-2.5 px-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 rounded-sm bg-muted overflow-hidden">
                              <div className="h-full rounded-sm" style={{ width: `${activeStake > 0 ? (Number(d.stake) / activeStake) * 100 : 0}%`, background: DELEGATED }} />
                            </div>
                            <span className="num w-11 text-right text-muted-foreground">
                              {activeStake > 0 ? `${((Number(d.stake) / activeStake) * 100).toFixed(1)}%` : '—'}
                            </span>
                          </div>
                        </td>
                      )}
                      <td className="hidden sm:table-cell num py-2.5 px-3 text-right text-muted-foreground whitespace-nowrap">
                        {format(new Date(d.start_time), 'MMM d, yyyy')}
                      </td>
                      <td className="hidden sm:table-cell num py-2.5 px-3 text-right text-muted-foreground whitespace-nowrap">
                        {status === 'all' && d.active ? <span className="text-foreground">{end}</span> : end}
                        {d.active && (
                          <span className="ml-1.5 text-foreground/70">(in {timeLeft((new Date(d.end_time).getTime() - Date.now()) / 86_400_000)})</span>
                        )}
                      </td>
                      <td className="hidden sm:table-cell py-2.5 px-4 sm:px-5 text-right">
                        <TxLink id={d.tx_id} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="flex items-center justify-between gap-3 border-t border-border px-4 sm:px-5 py-2.5">
              <span className="num text-[11px] text-muted-foreground">
                {from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()}
              </span>
              {pages > 1 && (
                <div className="flex items-center gap-1">
                  <PageButton label="Previous page" disabled={page === 0 || loading} onClick={() => goTo(page - 1)}>
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </PageButton>
                  <span className="num text-[11px] text-muted-foreground px-1.5">
                    {(page + 1).toLocaleString()} / {pages.toLocaleString()}
                  </span>
                  <PageButton label="Next page" disabled={page + 1 >= pages || loading} onClick={() => goTo(page + 1)}>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </PageButton>
                </div>
              )}
            </div>
          </>
        )}
      </section>
      </div>
    </div>
  );
}

/**
 * Where the running stake sits: one bar split by validator, the largest listed,
 * and how much each coming month frees up as delegations end.
 */
function RunningOverview({ rows, activeStake, activeCount }: { rows: DelegatorDelegation[]; activeStake: number; activeCount: number }) {
  const top = rows.slice(0, 8);
  const topSum = top.reduce((a, d) => a + Number(d.stake), 0);
  const rest = Math.max(0, activeStake - topSum);
  const pct = (v: number) => (activeStake > 0 ? (v / activeStake) * 100 : 0);
  const complete = rows.length >= activeCount;
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, i) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1)));
  const ending = months.map((m, i) => {
    const next = months[i + 1] ?? new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1));
    return rows
      .filter((d) => {
        const t = new Date(d.end_time).getTime();
        return t >= m.getTime() && t < next.getTime();
      })
      .reduce((a, d) => a + Number(d.stake), 0);
  });
  const maxEnding = Math.max(...ending, 1);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-stretch">
      <section className="lg:col-span-2 rounded-md border border-border bg-card px-4 sm:px-5 py-4 min-w-0">
        <h2 className="text-[14px] font-semibold text-foreground">Where it's delegated</h2>
        <p className="text-[11px] text-muted-foreground mt-0.5">Running delegations, largest first</p>
        <div className="mt-3 flex h-3 rounded-sm overflow-hidden gap-px bg-muted" role="img" aria-label="Share of running stake by validator">
          {top.map((d, i) => (
            <div key={d.tx_id} style={{ width: `${pct(Number(d.stake))}%`, background: DELEGATED, opacity: 1 - i * 0.09 }} title={`${shortId(d.node_id, 12, 4)} ${pct(Number(d.stake)).toFixed(1)}%`} />
          ))}
          {rest > 0 && <div className="bg-foreground/20" style={{ width: `${pct(rest)}%` }} />}
        </div>
        <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
          {top.map((d, i) => (
            <li key={d.tx_id} className="flex items-center gap-2 text-[12px] min-w-0">
              <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: DELEGATED, opacity: 1 - i * 0.09 }} />
              <span className="min-w-0 flex-1 truncate">
                <NodeId id={d.node_id} to={`/validator/${d.node_id}?subnet=${PRIMARY_NETWORK_SUBNET_ID}`} />
              </span>
              <span className="num text-muted-foreground shrink-0">{compactAvax(d.stake)}</span>
              <span className="num w-11 text-right text-foreground shrink-0">{pct(Number(d.stake)).toFixed(1)}%</span>
            </li>
          ))}
        </ul>
        {rest > 0 && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            <span className="inline-block w-2 h-2 rounded-sm bg-foreground/20 mr-1.5 align-middle" />
            {(activeCount - top.length).toLocaleString()} more {activeCount - top.length === 1 ? 'delegation' : 'delegations'} hold the other{' '}
            <span className="num text-foreground">{pct(rest).toFixed(1)}%</span>
          </p>
        )}
      </section>
      <section className="rounded-md border border-border bg-card px-4 sm:px-5 py-4 min-w-0">
        <h2 className="text-[14px] font-semibold text-foreground">Ending by month</h2>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {complete ? 'AVAX whose delegation ends each month' : `Of the ${rows.length} largest delegations`}
        </p>
        <div className="mt-4 flex items-end gap-2 h-24" role="img" aria-label="AVAX whose delegation ends in each of the next six months">
          {ending.map((v, i) => (
            <div key={i} className="flex-1 flex flex-col justify-end h-full min-w-0" title={`${format(months[i], 'MMM yyyy')}: ${formatAvax(v)} AVAX`}>
              <div className="w-full rounded-t-sm" style={{ height: `${v > 0 ? Math.max(4, (v / maxEnding) * 100) : 0}%`, background: DELEGATED, opacity: 0.8 }} />
            </div>
          ))}
        </div>
        <div className="mt-1 flex gap-2 text-[10px] text-muted-foreground num">
          {ending.map((v, i) => (
            <div key={i} className="flex-1 min-w-0 text-center truncate">
              {format(months[i], 'MMM')}
              <span className="block text-foreground/80">{v > 0 ? compactAvax(v) : '0'}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function PageButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="inline-flex items-center justify-center w-7 h-7 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 disabled:pointer-events-none transition-colors"
    >
      {children}
    </button>
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
