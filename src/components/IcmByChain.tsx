import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getChains, getIcmSummary, getIcmTimeseries } from '../api';
import type { IcmDay, IcmSummary } from '../api';
import type { Chain } from '../types';
import { L1Logo, SegmentedControl, Sparkline } from './instrument';

// Direction colors, from the L1's side.
export const TO_CCHAIN = '#3987e5';
export const FROM_CCHAIN = '#d95926';

export const ICM_RANGES = [
  { value: '30', label: '30D' },
  { value: '90', label: '90D' },
  { value: '365', label: '1Y' },
  { value: '3650', label: 'All' },
] as const;
export type RangeValue = (typeof ICM_RANGES)[number]['value'];

const count = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n.toLocaleString('en-US'));

/** Sums long daily series into about 120 points so a sparkline stays readable. */
function buckets(values: number[], n = 120): number[] {
  if (values.length <= n) return values;
  const size = values.length / n;
  return Array.from({ length: n }, (_, i) => values.slice(Math.floor(i * size), Math.floor((i + 1) * size)).reduce((a, b) => a + b, 0));
}

/**
 * Avalanche L1s by the interchain messages they exchanged with the C-Chain.
 * With `range` the parent drives the window and the control is hidden; `limit`
 * caps the rows and `moreLink` replaces "Show all" with a link to the full list.
 */
export function IcmByChain({ range: fixedRange, limit = 10, moreLink }: { range?: RangeValue; limit?: number; moreLink?: string } = {}) {
  const [ownRange, setRange] = useState<RangeValue>('30');
  const range = fixedRange ?? ownRange;
  const [summary, setSummary] = useState<IcmSummary | null>(null);
  const [days, setDays] = useState<IcmDay[] | null>(null);
  const [chains, setChains] = useState<Chain[]>([]);
  const [failed, setFailed] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    getChains().then(setChains).catch(() => setChains([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setSummary(null);
    setDays(null);
    setFailed(false);
    const n = Number(range);
    Promise.all([getIcmSummary(n), getIcmTimeseries(n)]).then(([s, d]) => {
      if (cancelled) return;
      setSummary(s);
      setDays(d);
      setFailed(!s);
    });
    return () => {
      cancelled = true;
    };
  }, [range]);

  const byId = useMemo(() => new Map(chains.filter((c) => c.platformChainId).map((c) => [c.platformChainId!, c])), [chains]);

  // The API counts from the C-Chain's side; flip it so each row reads from the L1's side.
  const rows = useMemo(
    () =>
      (summary?.by_chain ?? [])
        .filter((c) => c.total > 0)
        .map((c) => ({ id: c.blockchain_id, name: byId.get(c.blockchain_id)?.chainName || c.name || `${c.blockchain_id.slice(0, 8)}…`, chain: byId.get(c.blockchain_id), toC: c.received, fromC: c.sent, total: c.total })),
    [summary, byId],
  );
  const trend = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const r of rows) m.set(r.id, []);
    for (const d of days ?? []) {
      const seen = new Map(d.by_chain.map((c) => [c.blockchain_id, c.total]));
      for (const r of rows) m.get(r.id)!.push(seen.get(r.id) ?? 0);
    }
    for (const [k, v] of m) m.set(k, buckets(v));
    return m;
  }, [rows, days]);

  const total = summary?.totals.total ?? 0;
  const max = Math.max(...rows.map((r) => r.total), 1);
  const shown = showAll ? rows : rows.slice(0, limit);
  const top = rows[0];
  const windowText = range === '3650' && summary ? `since ${new Date(`${summary.from}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })}` : `in the last ${ICM_RANGES.find((r) => r.value === range)!.label.replace('D', ' days').replace('1Y', 'year')}`;

  return (
    <section className="rounded-md border border-border bg-card">
      <header className="px-4 sm:px-5 pt-4 pb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[14px] font-semibold text-foreground">Interchain messages by chain</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">ICM messages each L1 sent to or received from the C-Chain.</p>
        </div>
        {!fixedRange && (
          <SegmentedControl size="xs" value={range} options={ICM_RANGES} onChange={(v) => { setRange(v); setShowAll(false); }} ariaLabel="ICM range" />
        )}
      </header>

      {failed ? (
        <p className="px-5 pb-5 text-[12px] text-muted-foreground">Message counts couldn't be loaded. Try again in a minute.</p>
      ) : !summary ? (
        <div className="px-5 pb-5 space-y-2">{Array.from({ length: 6 }, (_, i) => <div key={i} className="h-8 rounded bg-muted/50 animate-pulse" />)}</div>
      ) : rows.length === 0 ? (
        <p className="px-5 pb-5 text-[12px] text-muted-foreground">No messages in this range.</p>
      ) : (
        <>
          <div className="px-4 sm:px-5 pb-3">
            <p className="text-[13px] text-foreground">
              <span className="num">{total.toLocaleString('en-US')}</span> messages {windowText}, across{' '}
              <span className="num">{rows.length}</span> {rows.length === 1 ? 'L1' : 'L1s'}.
              {top && rows.length > 1 && (
                <span className="text-muted-foreground">
                  {' '}{top.name} accounts for <span className="num text-foreground">{((top.total / total) * 100).toFixed(0)}%</span>.
                </span>
              )}
            </p>
            <div className="mt-2 flex items-center gap-4 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: TO_CCHAIN }} />To C-Chain</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: FROM_CCHAIN }} />From C-Chain</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px] whitespace-nowrap">
              <thead>
                <tr className="border-y border-border text-[11px] text-muted-foreground">
                  <th className="text-left font-normal px-4 sm:px-5 py-2">Chain</th>
                  <th className="text-right font-normal px-3 py-2">To C-Chain</th>
                  <th className="text-right font-normal px-3 py-2">From C-Chain</th>
                  <th className="text-right font-normal px-3 py-2 hidden sm:table-cell">Share</th>
                  <th className="text-left font-normal px-3 py-2 hidden sm:table-cell w-[24%]">Messages</th>
                  <th className="text-right font-normal px-4 sm:px-5 py-2 hidden md:table-cell">Trend</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {shown.map((r) => {
                  const name = (
                    <span className="inline-flex items-center gap-2.5">
                      <L1Logo src={r.chain?.chainLogoUri} name={r.name} size={20} />
                      {r.name}
                    </span>
                  );
                  return (
                    <tr key={r.id}>
                      <td className="px-4 sm:px-5 py-2.5 text-[13px] font-medium text-foreground">
                        {r.chain ? <Link to={`/chain/${r.chain.chainId}`} className="hover:underline underline-offset-2">{name}</Link> : name}
                      </td>
                      <td className="num text-right px-3 py-2.5 text-foreground">{count(r.toC)}</td>
                      <td className="num text-right px-3 py-2.5 text-foreground">{count(r.fromC)}</td>
                      <td className="num text-right px-3 py-2.5 text-muted-foreground hidden sm:table-cell">{((r.total / total) * 100).toFixed(r.total / total >= 0.1 ? 0 : 1)}%</td>
                      <td className="px-3 py-2.5 hidden sm:table-cell">
                        <span
                          className="flex h-2 rounded-sm overflow-hidden"
                          style={{ width: `${Math.max(2, (r.total / max) * 100)}%` }}
                          title={`${r.name}: ${r.toC.toLocaleString('en-US')} to the C-Chain, ${r.fromC.toLocaleString('en-US')} from it`}
                        >
                          <span style={{ width: `${(r.toC / r.total) * 100}%`, background: TO_CCHAIN }} />
                          <span style={{ width: `${(r.fromC / r.total) * 100}%`, background: FROM_CCHAIN }} />
                        </span>
                      </td>
                      <td className="px-4 sm:px-5 py-2.5 hidden md:table-cell">
                        <span className="flex justify-end">
                          <Sparkline data={trend.get(r.id) ?? []} color={TO_CCHAIN} />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {moreLink ? (
            <Link to={moreLink} className="block w-full px-4 sm:px-5 py-2.5 text-[12px] text-muted-foreground hover:text-foreground border-t border-border">
              See all {rows.length} chains on the Interchain page
            </Link>
          ) : rows.length > limit && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="w-full px-4 sm:px-5 py-2.5 text-left text-[12px] text-muted-foreground hover:text-foreground border-t border-border"
            >
              {showAll ? `Show the top ${limit}` : `Show all ${rows.length} chains`}
            </button>
          )}
        </>
      )}
    </section>
  );
}
