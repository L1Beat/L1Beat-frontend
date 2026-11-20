import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronRight, ExternalLink } from 'lucide-react';
import { SEO } from '../components/SEO';
import { PAGE_SEO } from '../utils/pageSeo';
import { SectionErrorBoundary } from '../components/SectionErrorBoundary';
import { Delta, ProtocolLogo, SegmentedControl, Sparkline, StatStrip, UpdatedAgo } from '../components/instrument';
import type { StatItem } from '../components/instrument';
import { getFxRates, getStablecoins } from '../api';
import type { FxRates, TokenFeed } from '../api';
import type { Stablecoin } from '../types';
import { CATEGORY_LABEL, fundPrice, loadTokenizedFunds } from '../utils/tokenizedFunds';
import type { FundRow } from '../utils/tokenizedFunds';
import { SupplyHistoryCard } from './Stablecoins';
import { OTHERS, stackGroups } from '../utils/stackGroups';

/** Page settings, kept apart from the layout so another token feed can reuse it. */
export interface AssetPageConfig {
  feed: TokenFeed;
  seo: (typeof PAGE_SEO)[keyof typeof PAGE_SEO];
  title: string;
  /** Headline sentence around the formatted total. */
  headline: (total: ReactNode) => ReactNode;
  /** Small print under the headline. */
  note: ReactNode;
  /** Singular and plural noun for a row: fund/funds, asset/assets. */
  noun: [string, string];
  /** Column label for token amounts: Shares, or Tokens when rows mix funds and gold. */
  unitLabel: string;
  /** Show a category filter (Funds, Equity, Commodities), kept in ?category=. */
  categories?: boolean;
  /** Rows priced below this many dollars are folded behind "show all". */
  hideBelowUsd?: number;
  /** Chart always stacked by issuer, as on Lending, with no Total toggle. */
  stackedChart?: boolean;
  /** Offer a By platform view of the list, kept in ?view=platform. */
  platforms?: boolean;
  /** How the numbers are made, under the table, as on Lending. */
  method?: ReactNode;
}

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
        {row.symbol.charAt(0).toUpperCase()}
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

// Every real-world asset on the C-Chain that isn't a stablecoin: tokenized
// funds, company shares and gold, from the rwa feed, with a category filter
// on top of the list.
const RWA_CONFIG: AssetPageConfig = {
  feed: 'rwa',
  seo: PAGE_SEO.rwa,
  title: 'Real-world assets',
  headline: (total) => <>Real-world assets on Avalanche C&#8209;Chain total {total}.</>,
  note: (
    <>
      Funds, company shares and gold issued as tokens on the C&#8209;Chain, priced on-chain. Stablecoins are not counted
      here, see <Link to="/stablecoins" className="text-foreground hover:underline underline-offset-2">Stablecoins</Link>.
    </>
  ),
  method: (
    <>
      Supply and holders are read from each token&apos;s contract on the C&#8209;Chain. Prices are on-chain only: $1 a share for
      funds pegged to the dollar, the vault&apos;s own share price for ERC-4626 and ERC-7540 vaults, RedStone feeds for fund
      NAVs and Securitize&apos;s daily closing price, and Chainlink&apos;s XAU/USD for gold. An asset without an on-chain price is listed in tokens and left out of every
      dollar figure. The chart values past holdings at today&apos;s prices. Holders are addresses, and one address can hold for
      many clients. Platforms are the companies that put each asset on-chain, such as Securitize for BlackRock&apos;s BUIDL.
    </>
  ),
  noun: ['asset', 'assets'],
  unitLabel: 'Tokens',
  categories: true,
  hideBelowUsd: 1000,
  stackedChart: true,
  platforms: true,
};

export function Rwa() {
  return <TokenAssetsPage config={RWA_CONFIG} />;
}

export function TokenAssetsPage({ config }: { config: AssetPageConfig }) {
  const { feed, noun } = config;
  const [rows, setRows] = useState<FundRow[]>([]);
  const [coins, setCoins] = useState<Stablecoin[]>([]);
  const [fx, setFx] = useState<FxRates | null>(null);
  const [state, setState] = useState<Load>('loading');
  const [loadedAt, setLoadedAt] = useState<number | null>(null);

  // The chart needs only the fund list and FX rates, so it mounts (and shows
  // its own spinner) without waiting on the per-fund history the table uses.
  // The list request is cached, so both effects share one call.
  useEffect(() => {
    let alive = true;
    Promise.all([getStablecoins(43114, feed), getFxRates()])
      .then(([c, rates]) => {
        if (!alive) return;
        // The chart turns supply into dollars through each coin's peg and an FX
        // rate. Give every priced fund its own pseudo-peg whose rate is its
        // share price, so vaults are drawn at their on-chain price rather than
        // $1. History is drawn at today's price. Unpriced funds stay out.
        const chartFx: FxRates = { ...rates };
        const chartCoins: Stablecoin[] = [];
        for (const coin of c) {
          const price = fundPrice(coin);
          if (price == null) continue;
          const peg = `FUND_${coin.token.toUpperCase()}`;
          chartFx[peg] = price;
          chartCoins.push({ ...coin, peg });
        }
        setCoins(chartCoins);
        setFx(chartFx);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [feed]);

  useEffect(() => {
    let alive = true;
    loadTokenizedFunds(43114, feed)
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
  }, [feed]);

  // The category filter narrows the chart as well as the table.
  const [category] = useCategory(rows);
  const inCategory = useMemo(
    () => (config.categories && category !== 'all' ? rows.filter((r) => r.category === category) : rows),
    [rows, category, config.categories],
  );
  const chartCoins = useMemo(
    () => (config.categories && category !== 'all' ? coins.filter((c) => (c.category ?? 'tokenized_fund') === category) : coins),
    [coins, category, config.categories],
  );

  // The issuer picked in the chart legend lives in the URL (?issuer=BlackRock),
  // as Lending keeps ?protocol=, so a link opens on that issuer's numbers.
  // Bands follow the chart's split: big issuers alone, the rest as Others.
  const [params, setParams] = useSearchParams();
  const setFocus = (name: string | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (name) next.set('issuer', name);
        else next.delete('issuer');
        return next;
      },
      { replace: true, preventScrollReset: true },
    );
  const issuerValues = (rs: FundRow[]): [string, number][] => {
    const m = new Map<string, number>();
    for (const r of rs) if (r.value != null && r.value > 0) m.set(r.issuer, (m.get(r.issuer) ?? 0) + r.value);
    return [...m.entries()];
  };
  const groups = useMemo(() => stackGroups(issuerValues(inCategory)), [inCategory]);
  const focusId = params.get('issuer');
  const focusMembers = useMemo(
    () => (focusId === OTHERS ? groups.others : focusId && groups.own.includes(focusId) ? [focusId] : []),
    [focusId, groups],
  );
  const focus = config.stackedChart && focusMembers.length ? focusId : null;
  // With an issuer picked, every number on the page is that issuer's own.
  const scoped = useMemo(() => (focus ? rows.filter((r) => focusMembers.includes(r.issuer)) : rows), [rows, focus, focusMembers]);
  // The table filters by category itself; the headline and KPIs follow the
  // chart, so a picked issuer is quoted only for the category on show.
  const kpiRows = useMemo(
    () => (focus ? inCategory.filter((r) => focusMembers.includes(r.issuer)) : rows),
    [rows, inCategory, focus, focusMembers],
  );

  const priced = useMemo(() => kpiRows.filter((r) => r.priced), [kpiRows]);
  const unpriced = useMemo(() => rows.filter((r) => !r.priced), [rows]);
  const allTotal = useMemo(() => sum(rows.map((r) => r.value ?? 0)), [rows]);

  // Dollar figures cover priced assets only. A priced asset newer than 30 days
  // counts from zero, so its arrival shows as growth.
  const totals = useMemo(() => {
    const supply = sum(priced.map((r) => r.value ?? 0));
    const prev30 = sum(priced.map((r) => r.value30d ?? 0));
    return {
      supply,
      prev30,
      change30: prev30 > 0 ? ((supply - prev30) / prev30) * 100 : null,
      holders: sum(kpiRows.map((r) => r.holders)),
      issuers: [...new Set(kpiRows.map((r) => r.issuer))],
    };
  }, [kpiRows, priced]);

  const ready = state === 'ready' && allTotal > 0;
  const top = priced[0];
  const topShare = top?.value != null && totals.supply > 0 ? Math.round((top.value / totals.supply) * 100) : null;
  // The share is of what the chart shows: the category on show, or everything.
  const shownTotal = useMemo(() => sum(inCategory.map((r) => r.value ?? 0)), [inCategory]);
  const shownLabel = config.categories && category !== 'all' ? `${(CATEGORY_LABEL[category] ?? category).toLowerCase()} total` : 'total';
  const focusShare = focus && shownTotal > 0 ? (totals.supply / shownTotal) * 100 : null;
  const focusName = focus === OTHERS ? `${focusMembers.length} smaller issuers` : focus;
  // The issuer split in words, as Lending lists each protocol with its amount.
  const split = useMemo(() => {
    const vals = issuerValues(rows);
    const g = stackGroups(vals);
    const byName = new Map(vals);
    const parts = g.own.map((n) => ({ name: n, value: byName.get(n) ?? 0 }));
    const rest = sum(g.others.map((n) => byName.get(n) ?? 0));
    if (rest > 0) parts.push({ name: 'others', value: rest });
    return parts;
  }, [rows]);
  const unpricedNames = listNames(unpriced.map((r) => r.symbol));
  const unpricedNote =
    unpriced.length === 0
      ? null
      : unpriced.length <= 2
        ? `${unpricedNames} ${unpriced.length === 1 ? 'has no on-chain price yet, so it is' : 'have no on-chain price yet, so they are'} listed in ${config.unitLabel.toLowerCase()} and left out of the total.`
        : `${unpriced.length} of ${rows.length} ${noun[1]} have no on-chain price yet, so they are listed in ${config.unitLabel.toLowerCase()} and left out of the total.`;

  const stats: StatItem[] = [
    {
      label: 'Value change, 30d',
      value: totals.change30 == null ? '—' : fmtPct(totals.change30),
      sub: totals.change30 == null ? 'Not available right now' : `from ${fmtUsd(totals.prev30)} 30 days ago`,
      tooltip: `Change in priced ${noun[1]} against the daily close 30 days ago, both valued at today's price. ${noun[1].charAt(0).toUpperCase()}${noun[1].slice(1)} without an on-chain price are left out.`,
    },
    {
      label: 'Holders',
      value: ready ? totals.holders.toLocaleString('en-US') : '—',
      sub: ready ? `addresses across ${kpiRows.length} ${kpiRows.length === 1 ? noun[0] : noun[1]}` : ' ',
      tooltip: 'Addresses, not investors: one address can hold for many clients.',
    },
    {
      label: `Largest ${noun[0]}`,
      value: topShare != null ? `${topShare}%` : '—',
      sub: top?.value != null ? `${top.symbol}, ${fmtUsd(top.value)}` : ' ',
    },
    focus
      ? {
          label: noun[1].charAt(0).toUpperCase() + noun[1].slice(1),
          value: String(kpiRows.length),
          sub: listNames(kpiRows.map((r) => r.symbol)),
        }
      : {
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
      <SEO {...config.seo} />

      {/* Hero in the shared page frame, as on Stablecoins: the chart fills the
          stage and the KPIs float over its foot from md up. */}
      <section
        className="relative border-b border-border bg-stage md:h-[min(calc(100vh-48px),1200px)] md:min-h-[600px]"
        aria-label={`${config.title} supply history`}
      >
        <div className="md:absolute md:inset-0 flex flex-col">
          <div className="max-w-7xl 2xl:max-w-screen-2xl w-full mx-auto px-4 sm:px-6 pt-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-[18px] leading-6 font-semibold text-foreground">{config.title}</h1>
              {ready && focus ? (
                <>
                  <p className="mt-2 text-[26px] sm:text-[34px] leading-tight font-medium text-foreground max-w-4xl">
                    {focusName} {focus === OTHERS ? 'hold' : 'holds'} <span className="tabular-nums">{fmtUsd(totals.supply)}</span> of real-world
                    assets on Avalanche C&#8209;Chain.
                  </p>
                  <p className="mt-1.5 text-[15px] sm:text-[17px] leading-snug text-foreground/80 max-w-3xl">
                    {focusShare != null && (
                      <>
                        That&apos;s <span className="num">{focusShare.toFixed(0)}%</span> of the <span className="num">{fmtUsd(shownTotal)}</span> {shownLabel},{' '}
                      </>
                    )}
                    across <span className="num">{kpiRows.length}</span> {kpiRows.length === 1 ? noun[0] : noun[1]}.{' '}
                    <button type="button" onClick={() => setFocus(null)} className="text-muted-foreground underline underline-offset-2 hover:text-foreground">
                      Show all issuers
                    </button>
                  </p>
                </>
              ) : ready ? (
                <>
                  <p className="mt-2 text-[26px] sm:text-[34px] leading-tight font-medium text-foreground max-w-4xl">
                    {config.headline(<span className="tabular-nums">{fmtUsd(allTotal)}</span>)}
                  </p>
                  <p className="mt-1.5 text-[15px] sm:text-[17px] leading-snug text-foreground/80 max-w-3xl">
                    {split.map((p, i) => (
                      <span key={p.name}>
                        {i > 0 && (i === split.length - 1 ? ' and ' : ', ')}
                        {p.name} <span className="num">{fmtUsd(p.value)}</span>
                      </span>
                    ))}
                    , across <span className="num">{rows.length}</span> {noun[1]}.
                  </p>
                  <p className="mt-1.5 text-[12px] text-muted-foreground max-w-2xl">
                    {config.note}
                    {unpricedNote && <> {unpricedNote}</>}
                  </p>
                </>
              ) : state === 'error' ? (
                <p className="mt-3 text-[13px] text-muted-foreground">Data couldn't be loaded. Try again in a minute.</p>
              ) : (
                <div className="mt-3 h-9 w-[min(560px,80vw)] rounded bg-muted animate-pulse" />
              )}
            </div>
            <div className="shrink-0">
              <UpdatedAgo at={loadedAt} />
            </div>
          </div>
          <div className="relative h-[520px] md:h-auto md:flex-1 md:min-h-0 mt-3">
            {fx && chartCoins.length === 0 && coins.length > 0 && (
              <div className="h-full flex items-center justify-center text-[12px] text-muted-foreground">
                Nothing in this category has an on-chain price yet, so there is no value to chart.
              </div>
            )}
            {fx && chartCoins.length > 0 && (
              <SectionErrorBoundary label="the supply chart">
                <SupplyHistoryCard
                  coins={chartCoins}
                  fx={fx}
                  hero
                  feed={feed}
                  metrics={['supply']}
                  stackedOnly={config.stackedChart}
                  focus={config.stackedChart ? focus : undefined}
                  onFocus={config.stackedChart ? setFocus : undefined}
                />
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

        <SectionErrorBoundary label="the table">
          <FundTable rows={scoped} state={state} config={config} />
        </SectionErrorBoundary>
        {config.method && <p className="text-[11px] leading-relaxed text-muted-foreground max-w-4xl">{config.method}</p>}
      </div>
    </div>
  );
}

/** Dollar value, or "price n/a" for a floating-NAV fund the feed can't price. Never $1 a share. */
function Value({ row }: { row: FundRow }) {
  if (row.value == null) {
    return (
      <span className="text-[11px] text-muted-foreground" title="No on-chain share price for this fund yet, so it is left out of the total.">
        price n/a
      </span>
    );
  }
  return <span className="num font-semibold text-foreground">{fmtUsd(row.value)}</span>;
}

function ago(ms: number): string {
  const m = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

// Caption per price source. Anything not listed is still an on-chain price.
const SOURCE_LABEL: Record<string, string> = {
  erc4626: 'vault price',
  erc7540: 'vault price',
  redstone: 'RedStone NAV feed',
  chainlink: 'Chainlink price feed',
};

/** Share price, with where it comes from: a $1 peg, a vault read or a NAV feed. */
function Price({ row, align = 'right' }: { row: FundRow; align?: 'left' | 'right' }) {
  if (row.price == null) return <span className="text-[11px] text-muted-foreground">n/a</span>;
  const peg = row.priceSource === 'peg';
  // Company shares are priced at the daily close, not a fund NAV.
  const equity = row.category === 'equity';
  const label = peg
    ? '$1 a share'
    : equity && row.priceSource === 'redstone'
      ? 'RedStone daily close'
      : row.category === 'commodity' && row.priceSource === 'chainlink'
        ? // Gold is priced per troy ounce off Chainlink's XAU/USD; it doesn't
          // trade on weekends, so the read can be a few days old.
          'Chainlink XAU/USD'
        : (SOURCE_LABEL[row.priceSource ?? ''] ?? 'on-chain price');
  // Four decimals show a vault's drift from $1; big NAVs like $977.30 and
  // share prices need two.
  const digits = peg || equity || row.price >= 100 ? 2 : 4;
  const price = row.price.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return (
    <span className={`inline-flex flex-col ${align === 'right' ? 'items-end' : 'items-start'}`}>
      <span className="num text-[13px] text-foreground">${price}</span>
      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
        {!peg && row.priceAt != null ? `${label}, ${ago(row.priceAt)}` : label}
      </span>
    </span>
  );
}

function TypeTag({ type }: { type: string | null }) {
  if (!type) return null;
  return (
    <span className="inline-flex items-center h-5 px-2 rounded-full bg-muted/60 text-[10px] font-medium text-muted-foreground whitespace-nowrap">
      {type}
    </span>
  );
}

const TH = 'font-bold tracking-wider text-[10px] px-3 py-2.5';

/** The category in ?category=, when it names one the rows have. */
function useCategory(rows: FundRow[]): [string, (c: string) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get('category') ?? 'all';
  const current = raw !== 'all' && rows.some((r) => r.category === raw) ? raw : 'all';
  const set = (c: string) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (c === 'all') next.delete('category');
        else next.set('category', c);
        return next;
      },
      { replace: true, preventScrollReset: true },
    );
  return [current, set];
}

/** All / Funds / Equity / Commodities, with the count in each. Shareable via ?category=. */
function CategoryFilter({ rows }: { rows: FundRow[] }) {
  const [current, set] = useCategory(rows);
  const cats = Object.keys(CATEGORY_LABEL).filter((c) => rows.some((r) => r.category === c));
  if (cats.length < 2) return null;
  const options = [
    { value: 'all', label: `All ${rows.length}` },
    ...cats.map((c) => ({ value: c, label: `${CATEGORY_LABEL[c]} ${rows.filter((r) => r.category === c).length}` })),
  ];
  return (
    <SegmentedControl value={current} options={options} onChange={set} ariaLabel="Filter by category" />
  );
}

/** By asset or by platform, in ?view=. */
function useView(): ['asset' | 'platform', (v: 'asset' | 'platform') => void] {
  const [params, setParams] = useSearchParams();
  const current = params.get('view') === 'platform' ? 'platform' : 'asset';
  const set = (v: 'asset' | 'platform') =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (v === 'asset') next.delete('view');
        else next.set('view', v);
        return next;
      },
      { replace: true, preventScrollReset: true },
    );
  return [current, set];
}

interface PlatformGroup {
  platform: string;
  rows: FundRow[];
  /** Sum of priced assets; null when none is priced. */
  value: number | null;
  unpriced: number;
}

function groupByPlatform(rows: FundRow[]): PlatformGroup[] {
  const map = new Map<string, FundRow[]>();
  for (const r of rows) map.set(r.platform, [...(map.get(r.platform) ?? []), r]);
  return [...map.entries()]
    .map(([platform, rs]) => {
      const priced = rs.filter((r) => r.value != null);
      return {
        platform,
        rows: rs,
        value: priced.length ? sum(priced.map((r) => r.value ?? 0)) : null,
        unpriced: rs.length - priced.length,
      };
    })
    .sort((a, b) => (b.value ?? -1) - (a.value ?? -1) || b.rows.length - a.rows.length);
}

// DefiLlama protocol slugs for each platform's logo; a lettered disc covers the rest.
const PLATFORM_LOGO: Record<string, string> = {
  Securitize: 'securitize',
  Centrifuge: 'centrifuge-protocol',
  OpenTrade: 'opentrade',
  Nest: 'nest-credit',
  'Franklin Templeton': 'franklin-templeton',
  HiYield: 'hiyield',
  Tether: 'tether',
  WisdomTree: 'wisdomtree',
  Asseto: 'asseto-aoabt',
};

function PlatformAvatar({ name }: { name: string }) {
  const slug = PLATFORM_LOGO[name];
  if (slug) return <ProtocolLogo protocol={slug} name={name} size={32} round />;
  return (
    <div className="w-8 h-8 rounded-full bg-accent text-foreground flex items-center justify-center text-[11px] font-bold shrink-0">
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function SnowtraceIcon({ r }: { r: FundRow }) {
  return (
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
  );
}

/** One asset as a table row; nested under its platform when `child`. */
function AssetRow({ r, rank, child = false }: { r: FundRow; rank: string; child?: boolean }) {
  return (
    <tr className={`group border-b border-border/60 hover:bg-accent/40 transition-colors ${child ? 'bg-muted/[0.05]' : 'even:bg-muted/[0.035]'}`}>
      <td className="px-4 py-3 text-[11px] tabular-nums text-muted-foreground align-middle">{rank}</td>
      <td className={`px-3 py-3 align-middle ${child ? 'pl-9' : ''}`}>
        <div className="flex items-center gap-2.5 min-w-0">
          <FundLogo row={r} />
          <div className="min-w-0">
            <div className="text-[13px] font-bold text-foreground">{r.symbol}</div>
            <div className="text-[11px] text-muted-foreground truncate max-w-[300px]">
              {r.fund} · {r.issuer}
            </div>
          </div>
        </div>
      </td>
      <td className="px-3 py-3 align-middle">
        <TypeTag type={r.type} />
      </td>
      <td className="px-3 py-3 text-right align-middle">
        <Price row={r} />
      </td>
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
      <td className="num px-3 py-3 text-right text-foreground align-middle hidden lg:table-cell">{r.holders.toLocaleString('en-US')}</td>
      <td className="px-3 py-3 align-middle text-right">
        <SnowtraceIcon r={r} />
      </td>
    </tr>
  );
}

/** One asset as a phone card. */
function AssetCard({ r, rank, unitLabel }: { r: FundRow; rank: string; unitLabel: string }) {
  return (
    <li className="px-1 py-3.5">
      <div className="flex items-start gap-3">
        <span className="text-[11px] tabular-nums text-muted-foreground w-5 mt-1.5 shrink-0">{rank}</span>
        <FundLogo row={r} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[14px] font-bold text-foreground">{r.symbol}</span>
            <TypeTag type={r.type} />
          </div>
          <div className="text-[11px] text-muted-foreground truncate">
            {r.fund} · {r.issuer}
          </div>
          {r.sharesSeries.length > 1 && (
            <div className="flex items-center gap-2 mt-1.5">
              <Sparkline data={r.sharesSeries} width={64} height={16} />
              <Change v={r.sharesChange} className="text-[10px]" />
              <span className="text-[9px] text-muted-foreground">{unitLabel.toLowerCase()}, 30d</span>
            </div>
          )}
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 text-[12px] pl-8">
        <div>
          <dt className="text-[10px] text-muted-foreground">Value</dt>
          <dd className="text-[13px]"><Value row={r} /></dd>
        </div>
        <div>
          <dt className="text-[10px] text-muted-foreground">Price</dt>
          <dd><Price row={r} align="left" /></dd>
        </div>
        <div>
          <dt className="text-[10px] text-muted-foreground">{unitLabel}</dt>
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
  );
}

/** A platform's value, with how many of its assets have no price. */
function GroupValue({ g }: { g: PlatformGroup }) {
  if (g.value == null) return <span className="text-[11px] text-muted-foreground">price n/a</span>;
  return (
    <span className="inline-flex flex-col items-end">
      <span className="num font-semibold text-foreground">{fmtUsd(g.value)}</span>
      {g.unpriced > 0 && <span className="text-[10px] text-muted-foreground">+{g.unpriced} unpriced</span>}
    </span>
  );
}

/** Same table styling as the coin list on Stablecoins. */
function FundTable({ rows: allRows, state, config }: { rows: FundRow[]; state: Load; config: AssetPageConfig }) {
  const [category] = useCategory(allRows);
  const [view, setView] = useView();
  const [showAll, setShowAll] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const inCategory = config.categories && category !== 'all' ? allRows.filter((r) => r.category === category) : allRows;
  // Dust: priced rows worth less than the threshold, like a fund with one share.
  const isDust = (r: FundRow) => config.hideBelowUsd != null && r.value != null && r.value < config.hideBelowUsd;
  const dust = inCategory.filter(isDust);
  const rows = showAll ? inCategory : inCategory.filter((r) => !isDust(r));
  const byPlatform = config.platforms && view === 'platform';
  const groups = useMemo(() => groupByPlatform(rows), [rows]);
  const pricedTotal = sum(rows.map((r) => r.value ?? 0));
  const toggle = (p: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  const [one, many] = config.noun;
  if (state === 'error') {
    return <p className="py-10 text-center text-[12px] text-muted-foreground">Figures couldn't be loaded. Try again in a minute.</p>;
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
  const shareOf = (g: PlatformGroup) => {
    if (g.value == null || pricedTotal <= 0) return null;
    const pct = (g.value / pricedTotal) * 100;
    return pct < 1 ? '<1%' : `${Math.round(pct)}%`;
  };
  return (
    <div>
      {(config.categories || config.platforms) && (
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
          {config.categories ? <CategoryFilter rows={allRows} /> : <span />}
          {config.platforms && (
            <SegmentedControl
              value={view}
              options={[
                { value: 'asset', label: 'By asset' },
                { value: 'platform', label: 'By platform' },
              ]}
              onChange={setView}
              ariaLabel="Group the list"
            />
          )}
        </div>
      )}

      {/* Phones: one card per asset, or per platform with its assets folded in. */}
      <ul className="md:hidden divide-y divide-border/60 border-y border-border">
        {byPlatform
          ? groups.map((g, gi) => {
              const isOpen = open.has(g.platform);
              return (
                <li key={g.platform}>
                  <button
                    type="button"
                    onClick={() => toggle(g.platform)}
                    aria-expanded={isOpen}
                    className="w-full flex items-center gap-3 px-1 py-3.5 text-left"
                  >
                    <span className="text-[11px] tabular-nums text-muted-foreground w-5 shrink-0">{gi + 1}</span>
                    <PlatformAvatar name={g.platform} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[14px] font-bold text-foreground">{g.platform}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {g.rows.length} {g.rows.length === 1 ? one : many}
                        {shareOf(g) && <>, {shareOf(g)} of the total</>}
                      </div>
                    </div>
                    <GroupValue g={g} />
                    <ChevronRight className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                  </button>
                  {isOpen && (
                    <ul className="divide-y divide-border/60 border-t border-border/60 bg-muted/[0.05] pl-4">
                      {g.rows.map((r, i) => (
                        <AssetCard key={r.token} r={r} rank={String(i + 1)} unitLabel={config.unitLabel} />
                      ))}
                    </ul>
                  )}
                </li>
              );
            })
          : rows.map((r, i) => <AssetCard key={r.token} r={r} rank={String(i + 1)} unitLabel={config.unitLabel} />)}
      </ul>

      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead className="bg-background">
            <tr className="border-b border-border bg-background text-muted-foreground">
              <th className={`${TH} text-left px-4 w-10`}>#</th>
              <th className={`${TH} text-left min-w-[220px]`}>{byPlatform ? 'Platform' : one.charAt(0).toUpperCase() + one.slice(1)}</th>
              <th className={`${TH} text-left`}>Type</th>
              <th className={`${TH} text-right`}>Price</th>
              <th className={`${TH} text-right`}>Value</th>
              <th className={`${TH} text-right`}>{config.unitLabel}</th>
              <th className={`${TH} text-right`}>{config.unitLabel} 30d</th>
              <th className={`${TH} text-right hidden lg:table-cell`}>Holders</th>
              <th className="px-3 py-2.5 w-10" aria-hidden />
            </tr>
          </thead>
          <tbody>
            {byPlatform
              ? groups.map((g, gi) => {
                  const isOpen = open.has(g.platform);
                  const types = [...new Set(g.rows.map((r) => r.type).filter(Boolean))] as string[];
                  return [
                    <tr
                      key={g.platform}
                      onClick={() => toggle(g.platform)}
                      className="border-b border-border/60 hover:bg-accent/40 transition-colors cursor-pointer"
                    >
                      <td className="px-4 py-3 text-[11px] tabular-nums text-muted-foreground align-middle">{gi + 1}</td>
                      <td className="px-3 py-3 align-middle">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <ChevronRight
                            className={`w-3.5 h-3.5 -ml-1 text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`}
                            aria-hidden
                          />
                          <PlatformAvatar name={g.platform} />
                          <div className="min-w-0">
                            <button
                              type="button"
                              aria-expanded={isOpen}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggle(g.platform);
                              }}
                              className="text-[13px] font-bold text-foreground hover:underline underline-offset-2"
                            >
                              {g.platform}
                            </button>
                            <div className="text-[11px] text-muted-foreground">
                              {g.rows.length} {g.rows.length === 1 ? one : many}: {g.rows.map((r) => r.symbol).join(', ')}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 align-middle">
                        <div className="flex flex-wrap gap-1">
                          {types.slice(0, 2).map((t) => (
                            <TypeTag key={t} type={t} />
                          ))}
                          {types.length > 2 && <span className="text-[10px] text-muted-foreground self-center">+{types.length - 2}</span>}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right align-middle text-[11px] text-muted-foreground">{shareOf(g) ? `${shareOf(g)} of total` : ''}</td>
                      <td className="px-3 py-3 text-right align-middle text-[13px]">
                        <GroupValue g={g} />
                      </td>
                      <td className="px-3 py-3" />
                      <td className="px-3 py-3" />
                      <td className="num px-3 py-3 text-right text-foreground align-middle hidden lg:table-cell">
                        {sum(g.rows.map((r) => r.holders)).toLocaleString('en-US')}
                      </td>
                      <td className="px-3 py-3" />
                    </tr>,
                    ...(isOpen ? g.rows.map((r, i) => <AssetRow key={r.token} r={r} rank={`${gi + 1}.${i + 1}`} child />) : []),
                  ];
                })
              : rows.map((r, i) => <AssetRow key={r.token} r={r} rank={String(i + 1)} />)}
          </tbody>
        </table>
      </div>

      <footer className="flex items-center justify-between gap-2 py-2 border-t border-border md:border-t-0">
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {rows.length} {rows.length === 1 ? one : many}
          {byPlatform && <> on {groups.length} platform{groups.length === 1 ? '' : 's'}</>}
        </span>
        {dust.length > 0 && config.hideBelowUsd != null && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
          >
            {showAll
              ? `Hide ${dust.length} under $${config.hideBelowUsd.toLocaleString('en-US')}`
              : `Show ${dust.length} more under $${config.hideBelowUsd.toLocaleString('en-US')}`}
          </button>
        )}
      </footer>
    </div>
  );
}

export default Rwa;
