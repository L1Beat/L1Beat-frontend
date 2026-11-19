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
import { FUNDS_FEED, loadTokenizedFunds } from '../utils/tokenizedFunds';
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

  useEffect(() => {
    let alive = true;
    // The list request is cached, so the chart's coin metadata and the rows
    // share one call.
    Promise.all([loadTokenizedFunds(), getStablecoins(43114, FUNDS_FEED), getFxRates()])
      .then(([r, c, rates]) => {
        if (!alive) return;
        setRows(r);
        setCoins(c);
        setFx(rates);
        setState(r.length ? 'ready' : 'error');
      })
      .catch(() => alive && setState('error'));
    return () => {
      alive = false;
    };
  }, []);

  const totals = useMemo(() => {
    const supply = sum(rows.map((r) => r.supply));
    const has30 = rows.length > 0 && rows.every((r) => r.supply30d != null);
    const prev30 = has30 ? sum(rows.map((r) => r.supply30d as number)) : 0;
    return {
      supply,
      prev30,
      change30: prev30 > 0 ? ((supply - prev30) / prev30) * 100 : null,
      holders: sum(rows.map((r) => r.holders)),
      issuers: [...new Set(rows.map((r) => r.issuer))],
    };
  }, [rows]);

  const ready = state === 'ready' && totals.supply > 0;
  const top = rows[0];
  const topShare = top && totals.supply > 0 ? Math.round((top.supply / totals.supply) * 100) : null;

  const stats: StatItem[] = [
    {
      label: 'Supply change, 30d',
      value: totals.change30 == null ? '—' : fmtPct(totals.change30),
      sub: totals.change30 == null ? 'Not available right now' : `from ${fmtUsd(totals.prev30)} 30 days ago`,
      tooltip: 'Change in fund supply on the C-Chain against the daily close 30 days ago.',
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
      sub: top ? `${top.symbol}, ${fmtUsd(top.supply)}` : ' ',
    },
    {
      label: 'Issuers',
      value: ready ? String(totals.issuers.length) : '—',
      sub: ready ? totals.issuers.join(', ') : ' ',
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
                  Money-market fund shares issued as tokens on the C&#8209;Chain. They are funds, not stablecoins, so they are counted here and
                  not on <Link to="/stablecoins" className="text-foreground hover:underline underline-offset-2">Stablecoins</Link>.
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
                {r.supplySeries.length > 1 && (
                  <div className="flex items-center gap-2 mt-1.5">
                    <Sparkline data={r.supplySeries} width={64} height={16} />
                    <Change v={r.supplyChange} className="text-[10px]" />
                    <span className="text-[9px] text-muted-foreground">30d</span>
                  </div>
                )}
              </div>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[12px] pl-8">
              <div>
                <dt className="text-[10px] text-muted-foreground">Supply</dt>
                <dd className="num text-[13px] font-semibold text-foreground">{fmtUsd(r.supply)}</dd>
              </div>
              <div>
                <dt className="text-[10px] text-muted-foreground">Holders</dt>
                <dd className="num text-[13px] text-foreground">{r.holders.toLocaleString('en-US')}</dd>
              </div>
            </dl>
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
              <th className={`${TH} text-right`}>Supply</th>
              <th className={`${TH} text-right`}>Supply 30d</th>
              <th className={`${TH} text-right`}>Holders</th>
              <th className={`${TH} text-right`}>Holders 30d</th>
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
                <td className="px-3 py-3 text-right align-middle">
                  <div className="num text-[13px] font-semibold text-foreground">{fmtUsd(r.supply)}</div>
                  {r.supplySeries.length > 1 && (
                    <div className="mt-1 flex justify-end">
                      <Sparkline data={r.supplySeries} width={72} height={18} />
                    </div>
                  )}
                </td>
                <td className="px-3 py-3 text-right align-middle">
                  <Change v={r.supplyChange} />
                </td>
                <td className="num px-3 py-3 text-right text-foreground align-middle">{r.holders.toLocaleString('en-US')}</td>
                <td className="px-3 py-3 text-right align-middle">
                  <Change v={r.holdersChange} />
                </td>
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
