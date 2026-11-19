import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { SEO } from '../components/SEO';
import { PAGE_SEO } from '../utils/pageSeo';
import { Delta, PageHeader, Sparkline, StatStrip, UpdatedAgo } from '../components/instrument';
import type { StatItem } from '../components/instrument';
import { loadTokenizedFunds } from '../utils/tokenizedFunds';
import type { FundRow } from '../utils/tokenizedFunds';

type Load = 'loading' | 'ready' | 'error';

function compact(v: number): string {
  const trim = (n: number) => n.toFixed(2).replace(/\.?0+$/, '');
  const a = Math.abs(v);
  if (a >= 1e9) return `${trim(v / 1e9)}B`;
  if (a >= 1e6) return `${trim(v / 1e6)}M`;
  if (a >= 1e3) return `${trim(v / 1e3)}K`;
  return Math.round(v).toLocaleString('en-US');
}
const usd = (v: number) => `$${compact(v)}`;
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

const Change = ({ v }: { v: number | null }) =>
  v == null ? <span className="num text-muted-foreground">—</span> : <Delta value={v} className="num" />;

function FundLogo({ row }: { row: FundRow }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span className="w-6 h-6 rounded-full bg-accent text-foreground inline-flex items-center justify-center text-[10px] font-bold shrink-0">
        {row.symbol.charAt(0)}
      </span>
    );
  }
  return (
    <img
      src={row.logo}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className="w-6 h-6 rounded-full bg-muted object-cover shrink-0"
    />
  );
}

export function Funds() {
  const [rows, setRows] = useState<FundRow[]>([]);
  const [state, setState] = useState<Load>('loading');
  const [loadedAt, setLoadedAt] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    loadTokenizedFunds()
      .then((r) => {
        if (!alive) return;
        setRows(r);
        setState(r.length ? 'ready' : 'error');
        setLoadedAt(Date.now());
      })
      .catch(() => alive && setState('error'));
    return () => {
      alive = false;
    };
  }, []);

  const ready = state === 'ready';
  const total = sum(rows.map((r) => r.supply));
  const total30 = rows.every((r) => r.supply30d != null) ? sum(rows.map((r) => r.supply30d as number)) : 0;
  const holders = sum(rows.map((r) => r.holders));
  const top = rows[0];

  const stats: StatItem[] = [
    {
      label: 'Tokenized funds, C-Chain',
      value: ready ? usd(total) : '—',
      delta: total30 > 0 ? ((total - total30) / total30) * 100 : null,
      deltaLabel: 'vs 30d ago',
      sub: state === 'error' ? 'Unavailable' : ' ',
      tooltip: 'Fund shares on the C-Chain, counted at $1 a share.',
    },
    {
      label: 'Funds tracked',
      value: ready ? String(rows.length) : '—',
      sub: ready ? rows.map((r) => r.symbol).join(', ') : ' ',
    },
    {
      label: 'Holders',
      value: ready ? holders.toLocaleString('en-US') : '—',
      sub: ready ? 'addresses, across all funds' : ' ',
      tooltip: 'Addresses, not investors: one address can hold for many clients.',
    },
    {
      label: 'Largest fund',
      value: ready && top ? top.symbol : '—',
      sub: ready && top && total > 0 ? `${Math.round((top.supply / total) * 100)}% of the total` : ' ',
    },
  ];

  return (
    <div>
      <SEO {...PAGE_SEO.funds} />
      <div className="max-w-7xl 2xl:max-w-screen-2xl w-full mx-auto px-4 sm:px-6 py-5 space-y-4">
        <PageHeader
          title="Tokenized funds"
          description={
            <>
              Money-market fund shares issued as tokens on the Avalanche C-Chain. They are funds, not stablecoins, so they are
              counted here and not on the <Link to="/stablecoins" className="text-foreground hover:underline underline-offset-2">Stablecoins</Link> page.
            </>
          }
        >
          <UpdatedAgo at={loadedAt} />
        </PageHeader>

        <StatStrip items={stats} />

        <section className="rounded-md border border-border bg-card">
          <header className="px-4 sm:px-5 pt-4 pb-3">
            <h2 className="text-[14px] font-semibold text-foreground">Funds on C-Chain</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">Change is against 30 days ago.</p>
          </header>
          {state === 'error' ? (
            <div className="px-5 py-10 text-center text-[12px] text-muted-foreground">Fund figures couldn't be loaded. Try again in a minute.</div>
          ) : state === 'loading' ? (
            <div className="px-5 pb-5 space-y-2">
              {[0, 1].map((i) => (
                <div key={i} className="h-10 rounded bg-muted/50 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12px] whitespace-nowrap">
                <thead>
                  <tr className="border-y border-border text-[11px] text-muted-foreground">
                    <th className="text-left font-normal px-4 sm:px-5 py-2">Fund</th>
                    <th className="text-left font-normal px-3 py-2">Issuer</th>
                    <th className="text-right font-normal px-3 py-2">Supply</th>
                    <th className="text-right font-normal px-3 py-2">30d</th>
                    <th className="text-right font-normal px-3 py-2 hidden sm:table-cell">Trend</th>
                    <th className="text-right font-normal px-3 py-2">Holders</th>
                    <th className="text-right font-normal px-4 sm:px-5 py-2">30d</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r) => (
                    <tr key={r.token} className="hover:bg-muted/30">
                      <td className="px-4 sm:px-5 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <FundLogo row={r} />
                          <div className="min-w-0">
                            <a
                              href={`https://snowtrace.io/token/${r.token}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block text-[13px] font-medium text-foreground hover:underline underline-offset-2"
                            >
                              {r.symbol}
                            </a>
                            <span className="block text-[11px] text-muted-foreground truncate max-w-[260px]">{r.fund}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-foreground">{r.issuer}</td>
                      <td className="num text-right px-3 py-2.5 text-foreground">{usd(r.supply)}</td>
                      <td className="text-right px-3 py-2.5"><Change v={r.supplyChange} /></td>
                      <td className="px-3 py-2.5 hidden sm:table-cell">
                        <div className="flex justify-end">
                          {r.supplySeries.length ? <Sparkline data={r.supplySeries} /> : <span className="text-muted-foreground">—</span>}
                        </div>
                      </td>
                      <td className="num text-right px-3 py-2.5 text-foreground">{r.holders.toLocaleString('en-US')}</td>
                      <td className="text-right px-4 sm:px-5 py-2.5"><Change v={r.holdersChange} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="px-4 sm:px-5 py-3 border-t border-border text-[11px] leading-relaxed text-muted-foreground">
            Supply is fund shares on the C-Chain at $1 a share. Holders are addresses, and one address can hold for many clients.
          </div>
        </section>
      </div>
    </div>
  );
}

export default Funds;
