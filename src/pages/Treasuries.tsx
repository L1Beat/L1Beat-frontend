import { useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ExternalLink } from 'lucide-react';
import { SEO } from '../components/SEO';
import { PAGE_SEO } from '../utils/pageSeo';
import { StatStrip, UpdatedAgo } from '../components/instrument';
import type { StatItem } from '../components/instrument';
import { SectionErrorBoundary } from '../components/SectionErrorBoundary';
import { useTheme } from '../hooks/useTheme';
import { getTreasuries } from '../api';
import type { TreasuryHolder, Treasuries as TreasuriesData } from '../api';

// Categorical palette from DESIGN_SYSTEM.md, one meaning each on this page.
const KIND = {
  treasury: { color: '#3987e5', label: 'Treasury', plural: 'Treasuries' },
  etf: { color: '#8b5cf6', label: 'ETF', plural: 'ETFs' },
} as const;

// Wordmarks ship in one tone; `tone` says which, so it can be inverted for the
// other theme. 'color' reads on both.
const LOGOS: Record<string, { src: string; dark?: string; tone: 'light' | 'dark' | 'color' }> = {
  'avax-one': { src: '/logos/treasuries/avaxone-light.png', dark: '/logos/treasuries/avaxone-dark.png', tone: 'color' },
  avat: { src: '/logos/treasuries/avat.svg', tone: 'color' },
  deft: { src: '/logos/treasuries/deft.png', tone: 'dark' },
  'vaneck-vavx': { src: '/logos/treasuries/vaneck.png', tone: 'dark' },
  'grayscale-gava': { src: '/logos/treasuries/grayscale.png', tone: 'light' },
  'bitwise-bava': { src: '/logos/treasuries/bitwise.png', tone: 'light' },
};

// Context a single figure needs that the API doesn't carry.
const NOTES: Record<string, string> = {
  avat: "AVAT's figure is its June 30 holdings minus the AVAX it sold on September 23.",
  deft: 'DeFi Technologies has reported only the total value of its treasury since August 2025, so its AVAX count is older.',
};

const SEGMENT = 1_000_000;

function compact(v: number): string {
  const trim = (n: number) => n.toFixed(1).replace(/\.0$/, '');
  // Compare after rounding, so 999,960 reads 1M rather than 1000K.
  const a = Number(Math.abs(v).toPrecision(3));
  if (a >= 1e9) return `${trim(v / 1e9)}B`;
  if (a >= 1e6) return `${trim(v / 1e6)}M`;
  if (a >= 1e3) return `${trim(v / 1e3)}K`;
  return Math.round(v).toLocaleString();
}

const usd = (v: number | null | undefined) => (v == null ? '—' : `$${compact(v)}`);
const asOf = (d: string | null) => (d ? format(parseISO(d), 'MMM d, yyyy') : '—');

export function Treasuries() {
  const [data, setData] = useState<TreasuriesData | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadedAt, setLoadedAt] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    getTreasuries().then((r) => {
      if (!alive) return;
      setData(r);
      setState(r ? 'ready' : 'error');
      setLoadedAt(Date.now());
    });
    return () => {
      alive = false;
    };
  }, []);

  const holders = useMemo(
    () => [...(data?.holders ?? [])].sort((a, b) => (b.avax_held ?? -1) - (a.avax_held ?? -1)),
    [data],
  );
  const t = data?.totals;
  const price = t?.avax_price_usd ?? null;
  const oldestEtf = holders
    .filter((h) => h.kind === 'etf' && h.aum_usd != null && h.as_of)
    .map((h) => h.as_of as string)
    .sort()[0];
  const etfAum = holders.filter((h) => h.kind === 'etf' && h.aum_usd != null).reduce((s, h) => s + (h.aum_usd ?? 0), 0);

  const stats: StatItem[] = t
    ? [
        {
          label: 'Held in total',
          value: `${compact(t.combined_avax)} AVAX`,
          sub: t.combined_share_of_circulating_percent != null ? `${t.combined_share_of_circulating_percent.toFixed(1)}% of circulating supply` : ' ',
        },
        { label: 'Company treasuries', value: `${compact(t.treasury_avax)} AVAX`, sub: `${t.treasury_count} companies` },
        { label: 'Spot ETFs', value: `${compact(t.etf_avax)} AVAX`, sub: `${t.etf_count} funds` },
        {
          label: 'ETF assets',
          value: etfAum > 0 ? usd(etfAum) : '—',
          sub: oldestEtf ? `as reported, oldest ${format(parseISO(oldestEtf), 'MMM d')}` : 'as the funds report them',
          tooltip: "The sum of each ETF's latest reported net assets. Funds report on different dates, so it can differ from AVAX held times today's price.",
        },
      ]
    : ['Held in total', 'Company treasuries', 'Spot ETFs', 'ETF assets'].map((label) => ({
        label,
        value: '—',
        sub: state === 'error' ? 'Unavailable' : ' ',
      }));

  return (
    <div>
      <SEO {...PAGE_SEO.treasuries} />

      {/* Hero in the shared page frame: the chart fills the stage and the KPIs
          float over its foot from md up. */}
      <section
        className="relative border-b border-border bg-stage md:h-[min(calc(100vh-48px),1200px)] md:min-h-[600px]"
        aria-label="AVAX held by treasuries and ETFs"
      >
        {/* Phones stack the six rows at their natural height; from md the chart fills the fixed stage. */}
        <div className="md:absolute md:inset-0 flex flex-col">
          <div className="max-w-7xl 2xl:max-w-screen-2xl w-full mx-auto px-4 sm:px-6 pt-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-[18px] leading-6 font-semibold text-foreground">Treasuries &amp; ETFs</h1>
              {t ? (
                <>
                  <p className="mt-2 text-[26px] sm:text-[34px] leading-tight font-medium text-foreground max-w-4xl">
                    Public companies and U.S. ETFs hold <span className="tabular-nums">{compact(t.combined_avax)}</span> AVAX
                    {t.combined_share_of_circulating_percent != null && (
                      <>, <span className="tabular-nums">{t.combined_share_of_circulating_percent.toFixed(1)}%</span> of the circulating supply</>
                    )}
                    .
                  </p>
                  <p className="mt-1.5 text-[15px] sm:text-[17px] leading-snug text-foreground/80 max-w-3xl">
                    {t.treasury_count} company treasuries hold <span className="num">{compact(t.treasury_avax)}</span> and {t.etf_count} spot ETFs
                    hold <span className="num">{compact(t.etf_avax)}</span>
                    {t.combined_usd != null && price != null && (
                      <>, worth <span className="num">{usd(t.combined_usd)}</span> together at <span className="num">${price.toFixed(2)}</span></>
                    )}
                    .
                  </p>
                </>
              ) : state === 'error' ? (
                <p className="mt-3 text-[13px] text-muted-foreground">Treasury and ETF holdings couldn't be loaded. Try again in a minute.</p>
              ) : (
                <div className="mt-3 h-9 w-[min(560px,80vw)] rounded bg-muted animate-pulse" />
              )}
            </div>
            <div className="flex flex-col gap-2 sm:items-end shrink-0">
              <UpdatedAgo at={loadedAt} />
              <span className="inline-flex items-center gap-3 text-[11px] text-muted-foreground">
                {(['treasury', 'etf'] as const).map((k) => (
                  <span key={k} className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-[2px]" style={{ background: KIND[k].color }} />
                    {KIND[k].label}
                  </span>
                ))}
                <span>One segment per 1M AVAX</span>
              </span>
            </div>
          </div>

          <div className="relative md:flex-1 md:min-h-0 mx-4 sm:mx-6 lg:mx-10 mt-5 mb-6 md:mt-4 md:mb-[128px]">
            <SectionErrorBoundary label="the holdings chart">
              <HoldingsChart holders={holders} price={price} loading={state === 'loading'} />
            </SectionErrorBoundary>
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 items-stretch">
          <SectionErrorBoundary label="the split by kind">
            <KindSplit holders={holders} state={state} />
          </SectionErrorBoundary>
          <SectionErrorBoundary label="the share of supply">
            <SupplyShare data={data} state={state} />
          </SectionErrorBoundary>
          <div className="md:col-span-2 lg:col-span-1 min-w-0">
            <SectionErrorBoundary label="the ETF staking">
              <EtfStaking holders={holders} state={state} />
            </SectionErrorBoundary>
          </div>
        </div>
        <SectionErrorBoundary label="the holders table">
          <HoldersTable holders={holders} price={price} state={state} />
        </SectionErrorBoundary>
      </div>
    </div>
  );
}

function Logo({ h, className = '' }: { h: TreasuryHolder; className?: string }) {
  const { theme } = useTheme();
  const [failed, setFailed] = useState(false);
  const logo = LOGOS[h.id];
  if (!logo || failed) return <span className={`text-[13px] font-semibold text-foreground truncate ${className}`}>{h.name}</span>;
  const src = theme === 'dark' && logo.dark ? logo.dark : logo.src;
  const invert = logo.dark || logo.tone === 'color' ? '' : logo.tone === 'dark' ? 'dark:invert' : 'invert dark:invert-0';
  return (
    <img
      src={src}
      alt={h.name}
      title={h.name}
      onError={() => setFailed(true)}
      className={`h-4 sm:h-5 w-auto max-w-[120px] object-contain object-left ${invert} ${className}`}
    />
  );
}

// Holdings to scale, largest first. Bars share one axis and are cut into 1M AVAX
// segments, so lengths can be compared by eye and counted.
function HoldingsChart({ holders, price, loading }: { holders: TreasuryHolder[]; price: number | null; loading: boolean }) {
  const rows = holders.filter((h) => h.avax_held != null);
  const max = Math.max(...rows.map((h) => h.avax_held ?? 0), 1);

  if (loading) {
    return (
      <div className="h-full flex flex-col justify-around">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-9 rounded bg-muted/50 animate-pulse" style={{ width: `${90 - i * 12}%` }} />
        ))}
      </div>
    );
  }
  if (!rows.length) return null;

  return (
    <ol className="md:h-full flex flex-col justify-around gap-4 md:gap-2">
      {rows.map((h) => {
        const held = h.avax_held ?? 0;
        const color = KIND[h.kind].color;
        return (
          <li key={h.id} className="grid grid-cols-[1fr_auto] sm:grid-cols-[170px_1fr_170px] items-center gap-x-4 gap-y-1.5">
            <div className="min-w-0 flex items-center h-5">
              <Logo h={h} />
            </div>
            <div className="order-3 col-span-2 sm:order-none sm:col-span-1 relative h-6 sm:h-10">
              <div
                className="absolute inset-y-0 left-0 rounded-[2px]"
                style={{
                  width: `max(${(held / max) * 100}%, 3px)`,
                  background: color,
                  // A hairline in the page colour every 1M AVAX.
                  backgroundImage: held > SEGMENT ? 'linear-gradient(to right, transparent calc(100% - 1.5px), rgb(var(--stage-rgb)) 0)' : undefined,
                  backgroundSize: held > SEGMENT ? `${(SEGMENT / held) * 100}% 100%` : undefined,
                }}
                title={`${h.name}: ${held.toLocaleString('en-US', { maximumFractionDigits: 0 })} AVAX`}
              />
            </div>
            <div className="text-right sm:text-left min-w-0">
              <div className="num text-[15px] sm:text-[17px] leading-5 text-foreground whitespace-nowrap">
                {compact(held)} <span className="text-[11px] text-muted-foreground">AVAX</span>
              </div>
              <div className="text-[11px] text-muted-foreground whitespace-nowrap">
                {h.ticker} {KIND[h.kind].label}
                {price != null && <>, <span className="num">{usd(held * price)}</span></>}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="h-full rounded-md border border-border bg-card flex flex-col">
      <header className="px-4 sm:px-5 pt-4 pb-3">
        <h2 className="text-[14px] font-semibold text-foreground">{title}</h2>
        {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
      </header>
      <div className="px-4 sm:px-5 pb-4 flex-1 flex flex-col">{children}</div>
    </section>
  );
}

function CardBody({ state, children }: { state: 'loading' | 'ready' | 'error'; children: React.ReactNode }) {
  if (state === 'error') return <p className="py-6 text-center text-[12px] text-muted-foreground">Couldn't be loaded. Try again in a minute.</p>;
  if (state === 'loading') return <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-8 rounded bg-muted/50 animate-pulse" />)}</div>;
  return <>{children}</>;
}

const pctOf = (part: number, whole: number, digits = 1) => (whole > 0 ? `${((part / whole) * 100).toFixed(digits)}%` : '—');

/** Treasuries against ETFs, and how much of it sits with the two largest holders. */
function KindSplit({ holders, state }: { holders: TreasuryHolder[]; state: 'loading' | 'ready' | 'error' }) {
  const rows = holders.filter((h) => h.avax_held != null);
  const total = rows.reduce((s, h) => s + (h.avax_held ?? 0), 0);
  const top = rows.slice(0, 2);
  const topSum = top.reduce((s, h) => s + (h.avax_held ?? 0), 0);
  const kinds = (['treasury', 'etf'] as const).map((k) => {
    const of = rows.filter((h) => h.kind === k);
    return { k, held: of.reduce((s, h) => s + (h.avax_held ?? 0), 0), holders: of };
  });
  return (
    <Card title="Who holds it" sub="Company treasuries against spot ETFs, each holder a segment">
      <CardBody state={state}>
        {top.length === 2 && (
          <p className="text-[12px] text-muted-foreground">
            <span className="num text-[22px] leading-7 font-medium text-foreground mr-1.5">{pctOf(topSum, total, 0)}</span>
            is with {top[0].name} and {top[1].name}
          </p>
        )}
        {/* One segment per holder, shaded within its kind's color, largest first. */}
        <div className="mt-3 flex h-3 rounded-sm overflow-hidden gap-px bg-muted" role="img" aria-label="AVAX held by each holder">
          {kinds.flatMap(({ k, holders: of }) =>
            of.map((h, i) => (
              <div
                key={h.id}
                title={`${h.name} ${pctOf(h.avax_held ?? 0, total)}`}
                style={{ width: `${((h.avax_held ?? 0) / total) * 100}%`, background: KIND[k].color, opacity: 1 - i * 0.25 }}
              />
            )),
          )}
        </div>
        <ul className="mt-4 space-y-3">
          {kinds.map(({ k, held, holders: of }) => (
            <li key={k} className="text-[12px]">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-[2px] shrink-0" style={{ background: KIND[k].color }} aria-hidden />
                <span className="text-foreground flex-1">{KIND[k].plural}</span>
                <span className="num text-muted-foreground">{compact(held)} AVAX</span>
                <span className="num w-12 text-right text-foreground">{pctOf(held, total)}</span>
              </div>
              <div className="mt-1.5 pl-[18px] flex flex-wrap items-center gap-x-4 gap-y-1.5">
                {of.map((h) => (
                  <span key={h.id} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Logo h={h} className="!h-3.5 sm:!h-3.5 max-w-[84px]" />
                    <span className="num">{pctOf(h.avax_held ?? 0, total, 0)}</span>
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

/** The holdings drawn against the whole circulating supply, to scale. */
function SupplyShare({ data, state }: { data: TreasuriesData | null; state: 'loading' | 'ready' | 'error' }) {
  const t = data?.totals;
  const supply = t?.circulating_supply_avax ?? null;
  return (
    <Card title="Share of supply" sub="Against all circulating AVAX, drawn to scale">
      <CardBody state={state === 'ready' && supply == null ? 'error' : state}>
        {t && supply != null && (
          <>
            <p className="text-[12px] text-muted-foreground">
              <span className="num text-[22px] leading-7 font-medium text-foreground mr-1.5">{pctOf(t.combined_avax, supply)}</span>
              of {compact(supply)} circulating AVAX
            </p>
            <div className="mt-3 flex h-3 rounded-sm overflow-hidden bg-muted" role="img" aria-label="Held AVAX as a share of the circulating supply">
              <div style={{ width: `${(t.treasury_avax / supply) * 100}%`, background: KIND.treasury.color }} />
              <div style={{ width: `${(t.etf_avax / supply) * 100}%`, background: KIND.etf.color }} />
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-[12px]">
              {(['treasury', 'etf'] as const).map((k) => {
                const held = k === 'treasury' ? t.treasury_avax : t.etf_avax;
                return (
                  <div key={k} className="rounded border border-border px-3 py-2">
                    <dt className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span className="w-2 h-2 rounded-[2px]" style={{ background: KIND[k].color }} aria-hidden />
                      {KIND[k].plural}
                    </dt>
                    <dd className="num mt-0.5 text-[15px] text-foreground">{pctOf(held, supply, 2)}</dd>
                  </div>
                );
              })}
            </dl>
            <p className="mt-auto pt-3 text-[11px] text-muted-foreground">Circulating supply from CoinGecko.</p>
          </>
        )}
      </CardBody>
    </Card>
  );
}

/** How much of each ETF's AVAX is staked, against the most its rules allow. */
function EtfStaking({ holders, state }: { holders: TreasuryHolder[]; state: 'loading' | 'ready' | 'error' }) {
  const etfs = holders.filter((h) => h.kind === 'etf');
  const reported = etfs.filter((h) => h.staking_pct != null && h.avax_held != null);
  const stakedAvax = reported.reduce((s, h) => s + ((h.avax_held ?? 0) * (h.staking_pct ?? 0)) / 100, 0);
  return (
    <Card title="Staking in the ETFs" sub="Share of each fund's AVAX staked, with the tick at its cap">
      <CardBody state={state}>
        {reported.length > 0 && (
          <p className="text-[12px] text-muted-foreground">
            <span className="num text-[22px] leading-7 font-medium text-foreground mr-1.5">{compact(stakedAvax)}</span>
            AVAX staked by the {reported.length === etfs.length ? 'funds' : `${reported.length} funds that report it`}
          </p>
        )}
        <ul className="mt-3 space-y-3.5">
          {etfs.map((h) => (
            <li key={h.id} className="text-[12px]">
              <div className="flex items-center justify-between gap-2">
                <Logo h={h} className="!h-3.5 sm:!h-3.5 max-w-[88px]" />
                <span className="num text-muted-foreground text-right">
                  {h.staking_pct != null ? (
                    <><span className="text-foreground">{Math.round(h.staking_pct)}%</span>{h.staking_max_pct != null && ` of ${h.staking_max_pct}%`}</>
                  ) : h.staking_max_pct != null ? (
                    `not reported, up to ${h.staking_max_pct}%`
                  ) : (
                    '—'
                  )}
                  {h.sponsor_fee_pct != null && <span className="ml-3 pl-3 border-l border-border whitespace-nowrap">{h.sponsor_fee_pct}% fee</span>}
                </span>
              </div>
              <div className="relative mt-1.5 h-1.5 rounded-sm bg-muted">
                {h.staking_pct != null && (
                  <div className="absolute inset-y-0 left-0 rounded-sm" style={{ width: `${h.staking_pct}%`, background: KIND.etf.color }} />
                )}
                {h.staking_max_pct != null && (
                  <div className="absolute -top-1 -bottom-1 w-px bg-foreground/60" style={{ left: `${h.staking_max_pct}%` }} aria-hidden />
                )}
              </div>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

function HoldersTable({ holders, price, state }: { holders: TreasuryHolder[]; price: number | null; state: 'loading' | 'ready' | 'error' }) {
  const notes = holders.filter((h) => NOTES[h.id]);
  return (
    <section className="rounded-md border border-border bg-card">
      <header className="px-4 sm:px-5 pt-4 pb-3">
        <h2 className="text-[14px] font-semibold text-foreground">Holders</h2>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Each figure is dated. Live ones are read from the fund or CoinGecko every 6 hours; the rest come from each company's latest report.
        </p>
      </header>

      {state === 'error' ? (
        <div className="px-5 py-10 text-center text-[12px] text-muted-foreground">Holdings couldn't be loaded. Try again in a minute.</div>
      ) : state === 'loading' ? (
        <div className="px-5 pb-5 space-y-2">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-10 rounded bg-muted/50 animate-pulse" />)}
        </div>
      ) : (
        <>
          {/* Phones: one stacked row per holder. */}
          <ul className="md:hidden divide-y divide-border border-t border-border">
            {holders.map((h) => (
              <li key={h.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <HolderName h={h} />
                  <span className="num text-[14px] text-foreground whitespace-nowrap">{h.avax_held != null ? `${compact(h.avax_held)} AVAX` : '—'}</span>
                </div>
                <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                  <Fact label="Value" value={h.avax_held != null && price != null ? usd(h.avax_held * price) : '—'} />
                  {h.kind === 'etf' && <Fact label="Staked" value={staked(h)} />}
                  {h.kind === 'etf' && <Fact label="Fee" value={h.sponsor_fee_pct != null ? `${h.sponsor_fee_pct}%` : '—'} />}
                  <Fact label="As of" value={<SourceLink h={h} />} className="col-span-2" />
                </div>
              </li>
            ))}
          </ul>

          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-[12px] whitespace-nowrap">
              <thead>
                <tr className="border-y border-border text-[11px] text-muted-foreground">
                  <th className="text-left font-normal px-5 py-2">Holder</th>
                  <th className="text-right font-normal px-3 py-2">AVAX held</th>
                  <th className="text-right font-normal px-3 py-2">Share</th>
                  <th className="text-right font-normal px-3 py-2" title="AVAX held times the current AVAX price">Value</th>
                  <th className="text-right font-normal px-3 py-2" title="Net assets as the fund reports them">Fund assets</th>
                  <th className="text-right font-normal px-3 py-2" title="Share of the fund's AVAX staked now, and the most it may stake">Staked</th>
                  <th className="text-right font-normal px-3 py-2">Fee</th>
                  <th className="text-right font-normal px-5 py-2">As of</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {holders.map((h) => {
                  const total = holders.reduce((s, x) => s + (x.avax_held ?? 0), 0);
                  return (
                    <tr key={h.id} className="hover:bg-muted/30">
                      <td className="px-5 py-2.5"><HolderName h={h} /></td>
                      <td className="num text-right px-3 py-2.5 text-foreground">
                        {h.avax_held != null ? h.avax_held.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—'}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-20 h-1.5 rounded-sm bg-muted overflow-hidden">
                            <div className="h-full rounded-sm" style={{ width: `${h.avax_held != null && total > 0 ? (h.avax_held / total) * 100 : 0}%`, background: KIND[h.kind].color }} />
                          </div>
                          <span className="num w-11 text-right text-muted-foreground">
                            {h.avax_held != null && total > 0 ? `${((h.avax_held / total) * 100).toFixed(1)}%` : '—'}
                          </span>
                        </div>
                      </td>
                      <td className="num text-right px-3 py-2.5 text-foreground">{h.avax_held != null && price != null ? usd(h.avax_held * price) : '—'}</td>
                      <td className="num text-right px-3 py-2.5 text-foreground">{usd(h.aum_usd)}</td>
                      <td className="num text-right px-3 py-2.5 text-foreground">{staked(h)}</td>
                      <td className="num text-right px-3 py-2.5 text-foreground">{h.sponsor_fee_pct != null ? `${h.sponsor_fee_pct}%` : '—'}</td>
                      <td className="text-right px-5 py-2.5"><SourceLink h={h} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="px-4 sm:px-5 py-3 border-t border-border space-y-1 text-[11px] leading-relaxed text-muted-foreground">
            <p>Value is AVAX held times the current AVAX price. Share is of the AVAX held by everyone listed here.</p>
            {notes.map((h) => <p key={h.id}>{NOTES[h.id]}</p>)}
          </div>
        </>
      )}
    </section>
  );
}

function staked(h: TreasuryHolder): string {
  if (h.staking_pct == null && h.staking_max_pct == null) return '—';
  if (h.staking_pct == null) return `up to ${h.staking_max_pct}%`;
  return `${Math.round(h.staking_pct)}%${h.staking_max_pct != null ? ` of ${h.staking_max_pct}%` : ''}`;
}

function HolderName({ h }: { h: TreasuryHolder }) {
  const body = (
    <span className="inline-flex items-center gap-2 min-w-0">
      <span className="w-2 h-2 rounded-[2px] shrink-0" style={{ background: KIND[h.kind].color }} aria-hidden />
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-foreground truncate">{h.name}</span>
        <span className="block text-[11px] text-muted-foreground truncate">
          {h.ticker}, {h.exchange}, {KIND[h.kind].label}
        </span>
      </span>
    </span>
  );
  return h.website_url ? (
    <a href={h.website_url} target="_blank" rel="noopener noreferrer" className="hover:underline underline-offset-2 decoration-border min-w-0">
      {body}
    </a>
  ) : (
    body
  );
}

function SourceLink({ h }: { h: TreasuryHolder }) {
  const label = (
    <span>
      <span className="num">{asOf(h.as_of)}</span>
      <span className="text-muted-foreground">{h.source === 'live' ? ', live' : ', report'}</span>
    </span>
  );
  if (!h.source_url) return <span className="text-foreground whitespace-nowrap">{label}</span>;
  return (
    <a
      href={h.source_url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-foreground whitespace-nowrap hover:underline underline-offset-2 decoration-border"
      title={h.source === 'live' ? 'Read from the source automatically' : 'From the latest report or filing'}
    >
      {label}
      <ExternalLink className="w-3 h-3 text-muted-foreground" />
    </a>
  );
}

function Fact({ label, value, className = '' }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={`flex items-baseline justify-between gap-2 min-w-0 ${className}`}>
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground truncate">{value}</span>
    </div>
  );
}
