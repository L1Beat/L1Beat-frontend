import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getChains, getIcmSummary, getIcmTimeseries } from '../api';
import type { IcmDay, IcmSummary } from '../api';
import type { Chain } from '../types';
import { L1Logo, SegmentedControl } from './instrument';
import { DailyBars } from './instrument/DailyBars';
import { FROM_CCHAIN, TO_CCHAIN } from './IcmByChain';

const C_CHAIN_ID = '2q9e4r6Mu3U68nU1fYjgbR6JvwrRx36CohpAX5UQxse55x1Q5';
const BAR_COLOR = 'rgb(57, 135, 229)';
const OMNICOIN_ID = 'B5gLCyeRWScxf1CeGHfXjEkcp5au8dQYQjtSV6cRammsLjsbK';

const RANGES = [
  { value: '30', label: '30D' },
  { value: '90', label: '90D' },
  { value: '365', label: '1Y' },
] as const;
type RangeValue = (typeof RANGES)[number]['value'];

const num = (n: number) => n.toLocaleString('en-US');

/**
 * A chain's ICM traffic with the C-Chain, from the indexer's TeleporterMessenger
 * counts. On the C-Chain itself it shows the whole network and its busiest partners.
 * Chains that never exchanged a message render nothing.
 */
export function ChainIcmCard({ chain }: { chain: Chain }) {
  const id = chain.platformChainId ?? '';
  const isCChain = id === C_CHAIN_ID;
  const [range, setRange] = useState<RangeValue>('90');
  const [allTime, setAllTime] = useState<IcmSummary | null>(null);
  const [summary, setSummary] = useState<IcmSummary | null>(null);
  const [days, setDays] = useState<IcmDay[] | null>(null);
  const [chains, setChains] = useState<Chain[]>([]);

  useEffect(() => {
    if (!id) return;
    getIcmSummary(3650).then(setAllTime);
    if (isCChain) getChains().then(setChains).catch(() => setChains([]));
  }, [id, isCChain]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const n = Number(range);
    Promise.all([getIcmSummary(n), getIcmTimeseries(n)]).then(([s, d]) => {
      if (cancelled) return;
      setSummary(s);
      setDays(d);
    });
    return () => {
      cancelled = true;
    };
  }, [id, range]);

  const ranked = useMemo(() => (allTime?.by_chain ?? []).filter((c) => c.total > 0), [allTime]);
  const rank = ranked.findIndex((c) => c.blockchain_id === id);
  const lifetime = isCChain ? allTime?.totals : ranked[rank];

  // Counts come from the C-Chain's side; for an L1, "to C-Chain" is what the C-Chain received.
  const mine = isCChain ? summary?.totals : summary?.by_chain.find((c) => c.blockchain_id === id);
  const out = mine ? (isCChain ? mine.sent : mine.received) : 0;
  const back = mine ? (isCChain ? mine.received : mine.sent) : 0;
  const series = (days ?? []).map((d) => (isCChain ? d.total : d.by_chain.find((c) => c.blockchain_id === id)?.total ?? 0));
  const byId = useMemo(() => new Map(chains.filter((c) => c.platformChainId).map((c) => [c.platformChainId!, c])), [chains]);

  if (!id || !allTime || !lifetime || lifetime.total === 0) return null;

  const total = out + back;
  const label = RANGES.find((r) => r.value === range)!.label;
  const windowText = range === '365' ? 'in the last year' : `in the last ${label.replace('D', ' days')}`;
  const outLabel = isCChain ? 'To L1s' : 'To C-Chain';
  const backLabel = isCChain ? 'From L1s' : 'From C-Chain';
  const since = new Date(`${allTime.from}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  // Omnicoin's bridge sent one repeated transfer to the C-Chain about 258K times on Sep 4 to 11, 2026.
  const burst = (isCChain || id === OMNICOIN_ID) && (days ?? []).some((d) => d.date >= '2026-09-04' && d.date <= '2026-09-11');
  const partners = isCChain ? (summary?.by_chain ?? []).filter((c) => c.total > 0).slice(0, 5) : [];

  return (
    <section className="rounded-md border border-border bg-card">
      <header className="px-4 sm:px-5 pt-4 pb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[14px] font-semibold text-foreground">Interchain messages</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {isCChain ? 'ICM messages between the C-Chain and Avalanche L1s, per day.' : `ICM messages between ${chain.chainName} and the C-Chain, per day.`}
          </p>
        </div>
        <SegmentedControl size="xs" value={range} options={RANGES} onChange={setRange} ariaLabel="ICM range" />
      </header>

      <div className="px-4 sm:px-5 pb-3">
        {summary ? (
          <p className="text-[13px] text-foreground">
            {isCChain ? (
              <>
                The C-Chain sent <span className="num">{num(out)}</span> messages to L1s and received <span className="num">{num(back)}</span> {windowText}.
              </>
            ) : total > 0 ? (
              <>
                {chain.chainName} sent <span className="num">{num(out)}</span> messages to the C-Chain and received <span className="num">{num(back)}</span> {windowText}.
              </>
            ) : (
              <>No messages with the C-Chain {windowText}.</>
            )}
          </p>
        ) : (
          <div className="h-5 w-72 rounded bg-muted/50 animate-pulse" />
        )}
        {total > 0 && (
          <div className="mt-2 flex h-2 rounded-sm overflow-hidden" title={`${outLabel} ${num(out)}, ${backLabel.toLowerCase()} ${num(back)}`}>
            <span style={{ width: `${(out / total) * 100}%`, background: TO_CCHAIN }} />
            <span style={{ width: `${(back / total) * 100}%`, background: FROM_CCHAIN }} />
          </div>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          {total > 0 && (
            <>
              <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: TO_CCHAIN }} />{outLabel}</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: FROM_CCHAIN }} />{backLabel}</span>
            </>
          )}
          <span>
            <span className="num text-foreground">{num(lifetime.total)}</span> since {since}
            {!isCChain && rank >= 0 && (
              <>
                , <span className="num text-foreground">#{rank + 1}</span> of {ranked.length} L1s
              </>
            )}
          </span>
          <Link to="/interchain" className="ml-auto hover:text-foreground underline-offset-2 hover:underline">All interchain traffic</Link>
        </div>
      </div>

      {days && series.some((v) => v > 0) && (
        <div className="px-2 sm:px-3 pb-3 h-[160px]">
          <DailyBars values={series} dates={(days ?? []).map((d) => d.date)} color={BAR_COLOR} format={(v) => `${num(Math.round(v))} messages`} />
        </div>
      )}
      {burst && (
        <p className="px-4 sm:px-5 pb-3 text-[11px] text-muted-foreground">
          The Sep 4 to 11, 2026 spike is a one-off burst of repeated Omnicoin bridge transfers to the C-Chain.
        </p>
      )}

      {partners.length > 0 && (
        <div className="border-t border-border px-4 sm:px-5 py-3">
          <p className="text-[11px] text-muted-foreground mb-2">Busiest L1s {windowText}</p>
          <ul className="space-y-1.5">
            {partners.map((p) => {
              const c = byId.get(p.blockchain_id);
              const name = c?.chainName || p.name || `${p.blockchain_id.slice(0, 8)}…`;
              const share = (p.total / Math.max(1, summary!.totals.total)) * 100;
              const row = (
                <span className="inline-flex items-center gap-2 min-w-0">
                  <L1Logo src={c?.chainLogoUri} name={name} size={16} />
                  <span className="truncate">{name}</span>
                </span>
              );
              return (
                <li key={p.blockchain_id} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 text-[12px] text-foreground">
                  {c ? <Link to={`/chain/${c.chainId}`} className="hover:underline underline-offset-2 min-w-0">{row}</Link> : row}
                  <span className="h-1.5 rounded-sm bg-muted overflow-hidden">
                    <span className="block h-full" style={{ width: `${share}%`, background: TO_CCHAIN }} />
                  </span>
                  <span className="num text-muted-foreground w-24 text-right">{num(p.total)} <span className="text-[10px]">{share.toFixed(0)}%</span></span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
