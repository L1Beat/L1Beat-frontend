import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { SEO } from '../components/SEO';
import { PAGE_SEO } from '../utils/pageSeo';
import { SectionErrorBoundary } from '../components/SectionErrorBoundary';
import { Delta, Sparkline, StatStrip } from '../components/instrument';
import type { StatItem } from '../components/instrument';
import { getFxRates, getStablecoins } from '../api';
import type { FxRates } from '../api';
import type { Stablecoin } from '../types';
import { FUNDS_FEED, isPricedFund, loadTokenizedFunds } from '../utils/tokenizedFunds';
import type { FundRow } from '../utils/tokenizedFunds';
import { SupplyHistoryCard } from './Stablecoins';

type Load = 'loading' | 'ready' | 'error';

// Same formatting as the Stablecoins page, so the two read alike side by side.
function fmtUsd(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '$0';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}
const fmtPct = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}%`;
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
const fmtShares = (n: number) =>
  n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : n.toFixed(2);
/** "A", "A and B", "A, B and C". */
function listNames(xs: string[]): string {
  if (xs.length <= 1) return xs[0] ?? '';
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}

function FundLogo({ row }: { row: FundRow }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="w-8 h-8 rounded-full bg-accent text-foreground flex items-center justify-center text-[11px] font-bold shrink-0">
        {row.symbol.charAt(0)}
      </div>
    );
  }
  return (
    <img
      src={row.logo}
      alt=""
      title={row.symbol}
      loading="lazy"
      onError={() => setFailed(true)}
      className="w-8 h-8 rounded-full bg-muted object-cover shrink-0"
    />
  );
}

const Change = ({ v, className = '' }: { v: number | null; className?: string }) =>
  v == null ? <span className={`num text-muted-foreground/40 ${className}`}>—</span> : <Delta value={v} className={className} />;

export function Funds() {
  const [rows, setRows] = useState<FundRow[]>([]);
  const [coins, setCoins] = useState<Stablecoin[]>([]);
  const [fx, setFx] = useState<FxRates | null>(null);
  const [state, setState] = useState<Load>('loading');

  // The chart needs only the fund list and FX rates, so it mounts (and shows
  // its own spinner) without waiting on the per-fund history the table uses.
  // The list request is cached, so both effects share one call.
  useEffect(() => {
    let alive = true;
    Promise.all([getStablecoins(43114, FUNDS_FEED), getFxRates()])
      .then(([c, rates]) => {
        if (!alive) return;
        // Floating-NAV funds have no price yet, so the dollar chart leaves them out.
        setCoins(c.filter(isPricedFund));
        setFx(rates);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    loadTokenizedFunds()
      .then((r) => {
        if (!alive) return;
        setRows(r);
        setState(r.length ? 'ready' : 'error');
      })
      .catch(() => alive && setState('error'));
    return () => {
      alive = false;
    };
  }, []);

  const priced = useMemo(() => rows.filter((r) => r.priced), [rows]);
  const unpriced = useMemo(() => rows.filter((r) => !r.priced), [rows]);

  // Dollar figures cover priced funds only. A priced fund newer than 30 days
  // counts from zero, so its arrival shows as growth.
  const totals = useMemo(() => {
    const supply = sum(priced.map((r) => r.value ?? 0));
    const prev30 = sum(priced.map((r) => r.value30d ?? 0));
    return {
      supply,
      prev30,
      change30: prev30 > 0 ? ((supply - prev30) / prev30) * 100 : null,
      holders: sum(rows.map((r) => r.holders)),
      issuers: [...new Set(rows.map((r) => r.issuer))],
    };
  }, [rows, priced]);

  const ready = state === 'ready' && totals.supply > 0;
  const top = priced[0];
  const topShare = top?.value != null && totals.supply > 0 ? Math.round((top.value / totals.supply) * 100) : null;
  const unpricedNames = listNames(unpriced.map((r) => r.symbol));

  const stats: StatItem[] = [
    {
      label: 'Value change, 30d',
      value: totals.change30 == null ? '—' : fmtPct(totals.change30),
      sub: totals.change30 == null ? 'Not available right now' : `from ${fmtUsd(totals.prev30)} 30 days ago`,
      tooltip: 'Change in the value of priced funds on the C-Chain against the daily close 30 days ago. Funds without a published share price are left out.',
    },
    {
      label: 'Holders',
      value: ready ? totals.holders.toLocaleString('en-US') : '—',
      sub: ready ? `addresses across ${rows.length} funds` : ' ',
      tooltip: 'Addresses, not investors: one address can hold for many clients.',
    },
    {
      label: 'Largest fund',
      value: topShare != null ? `${topShare}%` : '—',
      sub: top?.value != null ? `${top.symbol}, ${fmtUsd(top.value)}` : ' ',
    },
    {
      label: 'Issuers',
      value: ready ? String(totals.issuers.length) : '—',
      sub: ready
        ? totals.issuers.length > 2
          ? `${totals.issuers.slice(0, 2).join(', ')} and ${totals.issuers.length - 2} more`
          : totals.issuers.join(' and ')
        : ' ',
    },
  ];

  return (
    <div>
      <SEO {...PAGE_SEO.funds} />

      {/* Hero in the shared page frame, as on Stablecoins: the chart fills the
          stage and the KPIs float over its foot from md up. */}
      <section
        className="relative border-b border-border bg-stage md:h-[min(calc(100vh-48px),1200px)] md:min-h-[600px]"
        aria-label="Tokenized fund supply history"
      >
        <div className="md:absolute md:inset-0 flex flex-col">
          <div className="max-w-7xl 2xl:max-w-screen-2xl w-full mx-auto px-4 sm:px-6 pt-5">
            <h1 className="text-[18px] leading-6 font-semibold text-foreground">Tokenized funds</h1>
            {ready ? (
              <>
                <p className="mt-2 text-[26px] sm:text-[34px] leading-tight font-medium text-foreground max-w-4xl">
                  Tokenized funds on Avalanche C&#8209;Chain total <span className="tabular-nums">{fmtUsd(totals.supply)}</span>.
                </p>
                <p className="mt-1.5 text-[15px] sm:text-[17px] leading-snug text-foreground/80 max-w-3xl">
                  {top && topShare != null && (
                    <>
                      {top.issuer}&apos;s {top.symbol} is <span className="num">{topShare}%</span> of it
                      {totals.change30 != null ? ', and ' : '.'}
                    </>
                  )}
                  {totals.change30 != null && (
                    <>
                      supply is {totals.change30 >= 0 ? 'up' : 'down'} <span className="num">{Math.abs(totals.change30).toFixed(1)}%</span> in 30 days.
                    </>
                  )}
                </p>
                <p className="mt-1.5 text-[12px] text-muted-foreground max-w-2xl">
                  Fund shares issued as tokens on the C&#8209;Chain. They are funds, not stablecoins, so they are counted here and
                  not on <Link to="/stablecoins" className="text-foreground hover:underline underline-offset-2">Stablecoins</Link>.
                  {unpricedNames && (
                    <>
                      {' '}
                      {unpricedNames} {unpriced.length === 1 ? 'has a floating share price that isn\'t' : 'have floating share prices that aren\'t'} published
                      yet, so {unpriced.length === 1 ? 'it is' : 'they are'} listed in shares and left out of the total.
                    </>
                  )}
                </p>
              </>
            ) : state === 'error' ? (
              <p className="mt-3 text-[13px] text-muted-foreground">Fund data couldn't be loaded. Try again in a minute.</p>
            ) : (
              <div className="mt-3 h-9 w-[min(560px,80vw)] rounded bg-muted animate-pulse" />
            )}
          </div>
          <div className="relative h-[520px] md:h-auto md:flex-1 md:min-h-0 mt-3">
            {fx && coins.length > 0 && (
              <SectionErrorBoundary label="the fund supply chart">
                <SupplyHistoryCard coins={coins} fx={fx} hero feed={FUNDS_FEED} metrics={['supply']} />
              </SectionErrorBoundary>
            )}
          </div>
        </div>
        <div className="hidden md:block absolute bottom-4 left-1/2 -translate-x-1/2 z-30 w-[min(960px,calc(100%-3rem))]">
          <StatStrip items={stats} floating />
        </div>
      </section>

      <div className="max-w-7xl 2xl:max-w-screen-2xl mx-auto px-4 sm:px-6 py-4 space-y-5">
        <div className="md:hidden">
          <StatStrip items={stats} />
        </div>

        <SectionErrorBoundary label="the fund table">
          <FundTable rows={rows} state={state} />
        </SectionErrorBoundary>
      </div>
    </div>
  );
}

/** Dollar value, or "price n/a" for a floating-NAV fund the feed can't price. Never $1 a share. */
function Value({ row }: { row: FundRow }) {
  if (row.value == null) {
    return (
      <span className="text-[11px] text-muted-foreground" title="This fund's share price floats and isn't published in the data yet.">
        price n/a
      </span>
    );
  }
  return <span className="num font-semibold text-foreground">{fmtUsd(row.value)}</span>;
}

const TH = 'font-bold tracking-wider text-[10px] px-3 py-2.5';

/** Same table styling as the coin list on Stablecoins. */
function FundTable({ rows, state }: { rows: FundRow[]; state: Load }) {
  if (state === 'error') {
    return <p className="py-10 text-center text-[12px] text-muted-foreground">Fund figures couldn't be loaded. Try again in a minute.</p>;
  }
  if (state === 'loading') {
    return (
      <div className="space-y-2 py-2">
        {[0, 1].map((i) => (
          <div key={i} className="h-12 rounded bg-muted/50 animate-pulse" />
        ))}
      </div>
    );
  }
  return (
    <div>
      {/* Phones: one card per fund. */}
      <ul className="md:hidden divide-y divide-border/60 border-y border-border">
        {rows.map((r, i) => (
          <li key={r.token} className="px-1 py-3.5">
            <div className="flex items-start gap-3">
              <span className="text-[11px] tabular-nums text-muted-foreground w-5 mt-1.5 shrink-0">{i + 1}</span>
              <FundLogo row={r} />
              <div className="flex-1 min-w-0">
                <span className="text-[14px] font-bold text-foreground">{r.symbol}</span>
                <div className="text-[11px] text-muted-foreground truncate">
                  {r.fund} · {r.issuer}
                </div>
                {r.sharesSeries.length > 1 && (
                  <div className="flex items-center gap-2 mt-1.5">
                    <Sparkline data={r.sharesSeries} width={64} height={16} />
                    <Change v={r.sharesChange} className="text-[10px]" />
                    <span className="text-[9px] text-muted-foreground">shares, 30d</span>
                  </div>
                )}
              </div>
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-x-4 gap-y-2 text-[12px] pl-8">
              <div>
                <dt className="text-[10px] text-muted-foreground">Value</dt>
                <dd className="text-[13px]"><Value row={r} /></dd>
              </div>
              <div>
                <dt className="text-[10px] text-muted-foreground">Shares</dt>
                <dd className="num text-[13px] text-foreground">{fmtShares(r.shares)}</dd>
              </div>
              <div>
                <dt className="text-[10px] text-muted-foreground">Holders</dt>
                <dd className="num text-[13px] text-foreground">{r.holders.toLocaleString('en-US')}</dd>
              </div>
            </dl>
            <div className="mt-3 pl-8">
              <a
                href={`https://snowtrace.io/token/${r.token}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded border border-border text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                Snowtrace
              </a>
            </div>
          </li>
        ))}
      </ul>

      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead className="bg-background">
            <tr className="border-b border-border bg-background text-muted-foreground">
              <th className={`${TH} text-left px-4 w-10`}>#</th>
              <th className={`${TH} text-left min-w-[220px]`}>Fund</th>
              <th className={`${TH} text-left`}>Issuer</th>
              <th className={`${TH} text-right`}>Value</th>
              <th className={`${TH} text-right`}>Shares</th>
              <th className={`${TH} text-right`}>Shares 30d</th>
              <th className={`${TH} text-right`}>Holders</th>
              <th className="px-3 py-2.5 w-10" aria-hidden />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.token} className="group border-b border-border/60 even:bg-muted/[0.035] hover:bg-accent/40 transition-colors">
                <td className="px-4 py-3 text-[11px] tabular-nums text-muted-foreground align-middle">{i + 1}</td>
                <td className="px-3 py-3 align-middle">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <FundLogo row={r} />
                    <div className="min-w-0">
                      <div className="text-[13px] font-bold text-foreground">{r.symbol}</div>
                      <div className="text-[11px] text-muted-foreground truncate max-w-[280px]">{r.fund}</div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3 text-foreground align-middle">{r.issuer}</td>
                <td className="px-3 py-3 text-right align-middle text-[13px]">
                  <Value row={r} />
                </td>
                <td className="px-3 py-3 text-right align-middle">
                  <div className="num text-[13px] text-foreground">{fmtShares(r.shares)}</div>
                  {r.sharesSeries.length > 1 && (
                    <div className="mt-1 flex justify-end">
                      <Sparkline data={r.sharesSeries} width={72} height={18} />
                    </div>
                  )}
                </td>
                <td className="px-3 py-3 text-right align-middle">
                  <Change v={r.sharesChange} />
                </td>
                <td className="num px-3 py-3 text-right text-foreground align-middle">{r.holders.toLocaleString('en-US')}</td>
                <td className="px-3 py-3 align-middle text-right">
                  <a
                    href={`https://snowtrace.io/token/${r.token}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent opacity-60 group-hover:opacity-100 transition"
                    title={`${r.symbol} on Snowtrace`}
                    aria-label={`${r.symbol} on Snowtrace`}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <footer className="flex items-center justify-between gap-2 py-2 border-t border-border md:border-t-0">
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {rows.length} fund{rows.length === 1 ? '' : 's'}
        </span>
      </footer>
    </div>
  );
}

export default Funds;
