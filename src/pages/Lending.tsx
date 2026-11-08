import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { SEO } from '../components/SEO';
import { PAGE_SEO } from '../utils/pageSeo';
import { ProtocolLogo, SegmentedControl, Sparkline, StatStrip, TokenLogo, UpdatedAgo } from '../components/instrument';
import type { StatItem } from '../components/instrument';
import { SectionErrorBoundary } from '../components/SectionErrorBoundary';
import { getLending, getLendingAsset, getLendingTotals, getLiquidationsDaily, getLiquidationsRecent, getLiquidationsTop } from '../api';
import { WEEKLY_AFTER_DAYS, weekStart } from '../utils/weeks';
import { chartPointerProps } from '../utils/chartPointer';
import type { Lending as LendingData, LendingAssetDay, LendingMarket, LendingTotalsDay, Liquidation, LiquidationsDay } from '../api';

// Close to each protocol's brand so it's recognised without the legend: Aave's
// purple (V4 a lighter shade of it) and BENQI's teal. Same on the Staking page.
const PROTOCOL_STYLE: Record<string, { color: string; opacity: number }> = {
  'aave-v3': { color: '#8b5cf6', opacity: 1 },
  'aave-v4': { color: '#8b5cf6', opacity: 0.5 },
  benqi: { color: '#22a6c9', opacity: 1 },
};
const protocolStyle = (id: string) => PROTOCOL_STYLE[id] ?? { color: '#6b7280', opacity: 1 };
// DefiLlama icon slugs where they differ from our protocol ids.
const PROTOCOL_SLUG: Record<string, string> = { benqi: 'benqi-lending' };
// BENQI lists native AVAX at the zero address; WAVAX's logo stands in for it.
const ZERO = '0x0000000000000000000000000000000000000000';
const WAVAX = '0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7';
const SAVAX = '0x2b2c81e08f1af8835a78bb2a90ae924ace0ea4be';
const SUPPLIED = '#3987e5';

// Below this, a market's rates are noise (a $5 FRAX market can show 67%).
const MIN_COMPARE_USD = 100_000;

function compact(v: number): string {
  const trim = (n: number) => n.toFixed(1).replace(/\.0$/, '');
  // Compare after rounding, so 999,960 reads 1M rather than 1000K.
  const a = Number(Math.abs(v).toPrecision(3));
  if (a >= 1e9) return `${trim(v / 1e9)}B`;
  if (a >= 1e6) return `${trim(v / 1e6)}M`;
  if (a >= 1e3) return `${trim(v / 1e3)}K`;
  return Math.round(v).toLocaleString();
}
// Dust amounts read "<$1" rather than a misleading "$0".
const usd = (v: number | null | undefined) => (v == null ? '—' : v > 0 && v < 0.5 ? '<$1' : `$${compact(v)}`);
const apy = (v: number | null | undefined) => (v == null ? '—' : v <= 0 ? '0%' : v < 0.1 ? '<0.1%' : `${v.toFixed(1)}%`);
/** A 0% borrow rate with nothing borrowed means borrowing is off, not free. */
const borrowApy = (m: LendingMarket) => (!m.borrow_apy_percent && !Number(m.total_borrowed) ? '—' : apy(m.borrow_apy_percent));
const pct = (v: number | null | undefined, d = 0) => (v == null ? '—' : `${v.toFixed(d)}%`);

/** WAVAX on Aave and native AVAX on BENQI are the same asset to a user. */
const assetKey = (m: LendingMarket) => (m.symbol === 'WAVAX' ? 'AVAX' : m.symbol);

type CapUse = { kind: 'none' } | { kind: 'closed' } | { kind: 'pct'; value: number };
/** How much of a cap is used. A cap of one whole token or less marks a market being wound down. */
function capUse(cap: string | null, amount: string, decimals: number): CapUse {
  // Null and 0 both mean no cap.
  if (cap == null || Number(cap) === 0) return { kind: 'none' };
  const capTokens = Number(cap) / 10 ** decimals;
  if (!(capTokens > 1)) return { kind: 'closed' };
  return { kind: 'pct', value: (Number(amount) / 10 ** decimals / capTokens) * 100 };
}

/**
 * How an asset works as collateral right now. An LTV of 0 with a liquidation
 * threshold above 0 means new borrowing against it is switched off while
 * existing positions stay open.
 */
function collateralState(m: LendingMarket) {
  const groups = (m.emode ?? []).filter((e) => e.as_collateral);
  const usable = groups.filter((e) => (e.ltv_percent ?? 0) > 0).sort((a, b) => (b.ltv_percent ?? 0) - (a.ltv_percent ?? 0))[0];
  const pausedGroup = groups.find((e) => !(e.ltv_percent ?? 0) && ((e.configured_ltv_percent ?? 0) > 0 || (e.previous_ltv_percent ?? 0) > 0));
  if (m.protocol_id === 'aave-v4') {
    // V4 sets collateral per spoke, so the spokes are the whole story.
    if (usable) return { kind: 'ok' as const, ltv: usable.ltv_percent, liq: usable.liquidation_threshold_percent, note: usable.label };
    // A spoke that dropped the asset to 0 reports it as not collateral but keeps
    // the factor older positions still use.
    const was = Math.max(0, ...(m.emode ?? []).map((e) => e.previous_ltv_percent ?? e.configured_ltv_percent ?? 0));
    if (was > 0) return { kind: 'paused' as const, liq: null, was, note: null };
    return { kind: 'unknown' as const };
  }
  if (m.collateral_enabled === false) return { kind: 'none' as const };
  if (m.ltv_percent == null && m.liquidation_threshold_percent == null) return { kind: 'unknown' as const };
  if (!m.ltv_percent && (m.liquidation_threshold_percent ?? 0) > 0) {
    // No "was" here: the API carries the E-Mode value before the change, not the
    // normal-mode LTV, and quoting one as the other would overstate it.
    return {
      kind: 'paused' as const,
      liq: m.liquidation_threshold_percent,
      was: null,
      note: usable ? `E-Mode ${pct(usable.ltv_percent)} (${usable.label})` : pausedGroup ? 'E-Mode paused too' : null,
    };
  }
  return {
    kind: 'ok' as const,
    ltv: m.ltv_percent,
    liq: m.liquidation_threshold_percent,
    note: usable ? `E-Mode ${pct(usable.ltv_percent)}` : null,
  };
}

interface Row extends LendingMarket {
  protocolName: string;
  asset: string;
  /** The token contract; `asset` is overwritten with the display symbol. */
  address: string;
  supplyCap: CapUse;
  borrowCap: CapUse;
  closed: boolean;
}

const HIST_RANGES = [
  { value: '90', label: '90d' },
  { value: '365', label: '1y' },
  { value: '3650', label: 'All' },
] as const;

export function Lending() {
  const [histRange, setHistRange] = useState<'90' | '365' | '3650'>('90');
  const [data, setData] = useState<LendingData | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  // The protocol picked in the chart legend lives in the URL (?protocol=aave-v4),
  // so a link opens on that protocol's numbers.
  const [params, setParams] = useSearchParams();
  const setFocus = (id: string | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (id) next.set('protocol', id);
        else next.delete('protocol');
        return next;
      },
      { replace: true, preventScrollReset: true },
    );

  useEffect(() => {
    let alive = true;
    getLending().then((r) => {
      if (!alive) return;
      setData(r);
      setState(r ? 'ready' : 'error');
      setLoadedAt(Date.now());
    });
    return () => {
      alive = false;
    };
  }, []);

  const rows: Row[] = useMemo(() => {
    if (!data) return [];
    const name = (id: string) => data.protocols.find((p) => p.id === id)?.name ?? id;
    return data.markets.map((m) => {
      const supplyCap = capUse(m.supply_cap, m.total_supplied, m.decimals);
      const borrowCap = capUse(m.borrow_cap, m.total_borrowed, m.decimals);
      return {
        ...m,
        protocolName: name(m.protocol_id),
        asset: assetKey(m),
        address: m.asset.toLowerCase() === ZERO ? WAVAX : m.asset,
        supplyCap,
        borrowCap,
        closed: supplyCap.kind === 'closed' && (borrowCap.kind === 'closed' || borrowCap.kind === 'none'),
      };
    });
  }, [data]);

  const totals = data?.summary.totals;
  const live = rows.filter((r) => !r.closed && (r.supplied_usd ?? 0) > 0);
  const utilization = totals && totals.supplied_usd > 0 ? (totals.borrowed_usd / totals.supplied_usd) * 100 : null;
  const byProtocol = (totals?.by_protocol ?? [])
    .map((p) => ({ ...p, name: data?.protocols.find((x) => x.id === p.protocol_id)?.name ?? p.protocol_id }))
    .sort((a, b) => b.supplied_usd - a.supplied_usd);

  // Only a protocol the data knows; an unknown id in the URL falls back to all.
  const focusId = params.get('protocol');
  const focus = byProtocol.find((p) => p.protocol_id === focusId) ?? null;
  const focusLive = focus ? live.filter((r) => r.protocol_id === focus.protocol_id) : live;
  const focusUtil = focus && focus.supplied_usd > 0 ? (focus.borrowed_usd / focus.supplied_usd) * 100 : null;
  const focusShare = focus && totals && totals.supplied_usd > 0 ? (focus.supplied_usd / totals.supplied_usd) * 100 : null;

  const stats: StatItem[] = focus
    ? [
        { label: 'Supplied', value: usd(focus.supplied_usd), sub: focusShare != null ? `${pct(focusShare)} of all Avalanche lending` : focus.name },
        { label: 'Borrowed', value: usd(focus.borrowed_usd), sub: focusUtil != null ? `${pct(focusUtil)} of what's supplied` : ' ' },
        { label: 'Not borrowed', value: usd(focus.supplied_usd - focus.borrowed_usd), sub: 'supplied minus borrowed' },
        { label: 'Markets', value: String(focusLive.length), sub: `with deposits on ${focus.name}` },
      ]
    : totals
    ? [
        { label: 'Supplied', value: usd(totals.supplied_usd), sub: `${data?.protocols.length ?? 0} protocols` },
        { label: 'Borrowed', value: usd(totals.borrowed_usd), sub: utilization != null ? `${pct(utilization)} of what's supplied` : ' ' },
        {
          label: 'Not borrowed',
          value: usd(totals.supplied_usd - totals.borrowed_usd),
          sub: 'supplied minus borrowed',
          tooltip: "Includes markets that can't be borrowed, such as sAVAX, so it's more than anyone could borrow today.",
        },
        { label: 'Markets', value: String(live.length), sub: 'with deposits' },
      ]
    : ['Supplied', 'Borrowed', 'Not borrowed', 'Markets'].map((label) => ({ label, value: '—', sub: state === 'error' ? 'Unavailable' : ' ' }));

  return (
    <div>
      <SEO {...PAGE_SEO.lending} />

      {/* Hero in the shared page frame: the chart fills the stage and the KPIs
          float over its foot from md up. */}
      <section
        className="relative border-b border-border bg-stage md:h-[min(calc(100vh-48px),1200px)] md:min-h-[600px]"
        aria-label="Supplied and borrowed over time"
      >
        <div className="md:absolute md:inset-0 flex flex-col">
          <div className="max-w-7xl 2xl:max-w-screen-2xl w-full mx-auto px-4 sm:px-6 pt-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-[18px] leading-6 font-semibold text-foreground">Lending</h1>
              {totals && focus ? (
                <>
                  <p className="mt-2 text-[26px] sm:text-[34px] leading-tight font-medium text-foreground max-w-4xl">
                    {focus.name} holds <span className="tabular-nums">{usd(focus.supplied_usd)}</span> on Avalanche, and{' '}
                    <span className="tabular-nums">{usd(focus.borrowed_usd)}</span> of it is borrowed.
                  </p>
                  <p className="mt-1.5 text-[15px] sm:text-[17px] leading-snug text-foreground/80 max-w-3xl">
                    {focusShare != null && (
                      <>
                        That's <span className="num">{pct(focusShare)}</span> of the <span className="num">{usd(totals.supplied_usd)}</span> in Avalanche lending,{' '}
                      </>
                    )}
                    across <span className="num">{focusLive.length}</span> active {focusLive.length === 1 ? 'market' : 'markets'}.{' '}
                    <button type="button" onClick={() => setFocus(null)} className="text-muted-foreground underline underline-offset-2 hover:text-foreground">
                      Show all protocols
                    </button>
                  </p>
                </>
              ) : totals ? (
                <>
                  <p className="mt-2 text-[26px] sm:text-[34px] leading-tight font-medium text-foreground max-w-4xl">
                    Avalanche lending markets hold <span className="tabular-nums">{usd(totals.supplied_usd)}</span>, and{' '}
                    <span className="tabular-nums">{usd(totals.borrowed_usd)}</span> of it is borrowed.
                  </p>
                  <p className="mt-1.5 text-[15px] sm:text-[17px] leading-snug text-foreground/80 max-w-3xl">
                    {byProtocol.map((p, i) => (
                      <span key={p.protocol_id}>
                        {i > 0 && (i === byProtocol.length - 1 ? ' and ' : ', ')}
                        {p.name} <span className="num">{usd(p.supplied_usd)}</span>
                      </span>
                    ))}
                    , across <span className="num">{live.length}</span> active markets.
                  </p>
                </>
              ) : state === 'error' ? (
                <p className="mt-3 text-[13px] text-muted-foreground">Lending data couldn't be loaded. Try again in a minute.</p>
              ) : (
                <div className="mt-3 h-9 w-[min(560px,80vw)] rounded bg-muted animate-pulse" />
              )}
            </div>
            <div className="flex flex-col gap-2 sm:items-end shrink-0">
              <div className="flex items-center gap-3">
                <UpdatedAgo at={loadedAt} />
                <SegmentedControl size="xs" value={histRange} options={HIST_RANGES} onChange={setHistRange} ariaLabel="History range" />
              </div>
            </div>
          </div>

          <div className="relative md:flex-1 md:min-h-0 mx-4 sm:mx-6 lg:mx-10 mt-5 mb-6 md:mt-4 md:mb-[128px]">
            <SectionErrorBoundary label="the lending history chart">
              <HistoryChart
                days={Number(histRange)}
                names={Object.fromEntries((data?.protocols ?? []).map((p) => [p.id, p.name]))}
                focus={focus?.protocol_id ?? (data ? null : focusId)}
                onFocus={setFocus}
              />
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
        {state === 'ready' && data && (
          <>
            <PausedNotice rows={rows} />
            {/* By asset stretches to the side column's height; its rows spread to fill it. */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="lg:col-span-2 min-w-0">
                <SectionErrorBoundary label="supplied and borrowed by asset">
                  <Card title="By asset" subtitle="Supplied across all three protocols, with the share that is borrowed filled in. Top 10 assets." className="h-full flex flex-col">
                    <div className="px-4 sm:px-5 pb-5 pt-1 flex-1 flex flex-col">
                      <div className="flex items-center gap-3 mb-3 text-[11px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[2px]" style={{ background: SUPPLIED }} />Borrowed</span>
                        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[2px]" style={{ background: SUPPLIED, opacity: 0.25 }} />Not borrowed</span>
                      </div>
                      <div className="flex-1 min-h-0">
                        <AssetChart rows={rows} loading={false} />
                      </div>
                    </div>
                  </Card>
                </SectionErrorBoundary>
              </div>
              <div className="space-y-5 min-w-0">
                <SectionErrorBoundary label="the protocol split">
                  <ProtocolsCard data={data} />
                </SectionErrorBoundary>
                <SectionErrorBoundary label="AVAX and sAVAX deposits">
                  <AvaxSplitCard data={data} />
                </SectionErrorBoundary>
              </div>
            </div>
            <SectionErrorBoundary label="AVAX deposits in tokens">
              <AvaxDepositsCard names={Object.fromEntries(data.protocols.map((p) => [p.id, p.name]))} />
            </SectionErrorBoundary>
            <SectionErrorBoundary label="the rate comparison">
              <RatesCard rows={rows} />
            </SectionErrorBoundary>
            <SectionErrorBoundary label="markets near their limits">
              <LimitsCard rows={rows} />
            </SectionErrorBoundary>
            <SectionErrorBoundary label="liquidations">
              <LiquidationsCard names={Object.fromEntries(data.protocols.map((p) => [p.id, p.name]))} />
            </SectionErrorBoundary>
            <SectionErrorBoundary label="the market table">
              <MarketsTable rows={rows} protocols={data.protocols} />
            </SectionErrorBoundary>
          </>
        )}
        <p className="text-[11px] leading-relaxed text-muted-foreground max-w-4xl">
          Read from each protocol's contracts every few minutes and priced with each protocol's own oracle. Rates are variable
          APYs. Aave V4's borrow rate is its base rate, which borrowers pay a premium on top of, and its supply rate is an
          estimate. History is read from the contracts at the last block of each UTC day. Supplied includes deposits that were
          borrowed and supplied again, so it runs high when incentives reward looping, as at Aave V3's launch in April and May 2022.
        </p>
      </div>
    </div>
  );
}

// Supplied per asset across protocols, with the borrowed share filled in.
function AssetChart({ rows, loading }: { rows: Row[]; loading: boolean }) {
  const assets = useMemo(() => {
    const by = new Map<string, { asset: string; address: string; supplied: number; borrowed: number; protocols: Set<string> }>();
    for (const r of rows) {
      if (r.closed || !r.supplied_usd) continue;
      const a = by.get(r.asset) ?? { asset: r.asset, address: r.address, supplied: 0, borrowed: 0, protocols: new Set<string>() };
      a.supplied += r.supplied_usd ?? 0;
      a.borrowed += r.borrowed_usd ?? 0;
      a.protocols.add(r.protocolName);
      by.set(r.asset, a);
    }
    return [...by.values()].sort((a, b) => b.supplied - a.supplied).slice(0, 10);
  }, [rows]);
  const max = Math.max(...assets.map((a) => a.supplied), 1);

  if (loading) {
    return (
      <div className="md:h-full flex flex-col justify-around gap-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-7 rounded bg-muted/50 animate-pulse" style={{ width: `${90 - i * 12}%` }} />
        ))}
      </div>
    );
  }
  if (!assets.length) return null;

  return (
    <ol className="md:h-full flex flex-col justify-around gap-4 md:gap-1.5">
      {assets.map((a) => {
        const share = a.supplied > 0 ? (a.borrowed / a.supplied) * 100 : 0;
        return (
          <li key={a.asset} className="grid grid-cols-[1fr_auto] sm:grid-cols-[130px_1fr_180px] items-center gap-x-4 gap-y-1.5">
            <div className="min-w-0 flex items-center gap-2.5">
              <TokenLogo address={a.address} symbol={a.asset} size={22} />
              <div className="min-w-0">
                <div className="num text-[14px] font-medium text-foreground truncate">{a.asset}</div>
                <div className="text-[10px] text-muted-foreground truncate sm:hidden">{[...a.protocols].join(', ')}</div>
              </div>
            </div>
            <div className="order-3 col-span-2 sm:order-none sm:col-span-1 relative h-5 sm:h-7" title={[...a.protocols].join(', ')}>
              <div
                className="absolute inset-y-0 left-0 rounded-[2px] overflow-hidden"
                style={{ width: `max(${(a.supplied / max) * 100}%, 3px)`, background: `color-mix(in srgb, ${SUPPLIED} 25%, transparent)` }}
              >
                <div className="h-full" style={{ width: `${share}%`, background: SUPPLIED }} />
              </div>
            </div>
            <div className="text-right sm:text-left min-w-0">
              <div className="num text-[14px] sm:text-[15px] leading-5 text-foreground whitespace-nowrap">{usd(a.supplied)}</div>
              <div className="text-[11px] text-muted-foreground whitespace-nowrap">
                <span className="num">{usd(a.borrowed)}</span> borrowed, <span className="num">{pct(share)}</span>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Card({ title, subtitle, right, className = '', children }: { title: string; subtitle?: string; right?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <section className={`rounded-md border border-border bg-card ${className}`}>
      <header className="flex items-start justify-between gap-3 px-4 sm:px-5 pt-4 pb-3">
        <div className="min-w-0">
          <h2 className="text-[14px] font-semibold text-foreground">{title}</h2>
          {subtitle && <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        {right}
      </header>
      {children}
    </section>
  );
}

// The protocol's logo, with its chart color in the corner so rows match the bands.
function ProtocolDot({ id, size = 16 }: { id: string; size?: number }) {
  const st = protocolStyle(id);
  return (
    <span className="relative inline-flex shrink-0">
      <ProtocolLogo protocol={PROTOCOL_SLUG[id] ?? id} name={id} size={size} />
      <span
        className="absolute -right-1 -bottom-1 w-[7px] h-[7px] rounded-[2px] ring-2 ring-card"
        style={{ background: st.color, opacity: st.opacity }}
        aria-hidden
      />
    </span>
  );
}

const AssetLogo = ({ r, size = 18 }: { r: Row; size?: number }) => <TokenLogo address={r.address} symbol={r.asset} size={size} />;

// One bar per protocol share, in the chart colors.
function SplitBar({ parts, label }: { parts: { id: string; value: number; title: string }[]; label: string }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  if (total <= 0) return null;
  return (
    <div className="flex h-2.5 rounded-sm overflow-hidden gap-px bg-muted" role="img" aria-label={label}>
      {parts.map((p) => {
        const st = protocolStyle(p.id);
        return <div key={p.id} title={p.title} style={{ width: `${(p.value / total) * 100}%`, background: st.color, opacity: st.opacity }} />;
      })}
    </div>
  );
}

// Each protocol's deposits now, how much is lent out, and 90 days of deposits.
function ProtocolsCard({ data }: { data: LendingData }) {
  const { data: history } = useLoadOnce<LendingTotalsDay[], number>(() => getLendingTotals(90), 90);
  const name = (id: string) => data.protocols.find((p) => p.id === id)?.name ?? id;
  const list = [...data.summary.totals.by_protocol].sort((a, b) => b.supplied_usd - a.supplied_usd);
  const total = data.summary.totals.supplied_usd;
  const top = list[0];
  const trend = (id: string) => (history ?? []).map((d) => d.by_protocol.find((p) => p.protocol_id === id)?.supplied_usd ?? 0);
  return (
    <Card title="By protocol" subtitle="Supplied now, the share borrowed, and deposits over 90 days">
      <div className="px-4 sm:px-5 pb-4">
        {top && total > 0 && (
          <p className="text-[12px] text-muted-foreground">
            <span className="num text-[22px] leading-7 font-medium text-foreground mr-1.5">{pct((top.supplied_usd / total) * 100)}</span>
            of deposits are on {name(top.protocol_id)}
          </p>
        )}
        <div className="mt-3">
          <SplitBar
            label="Supplied by protocol"
            parts={list.map((p) => ({ id: p.protocol_id, value: p.supplied_usd, title: `${name(p.protocol_id)} ${usd(p.supplied_usd)}` }))}
          />
        </div>
        <ul className="mt-4 space-y-3.5">
          {list.map((p) => {
            const used = p.supplied_usd > 0 ? (p.borrowed_usd / p.supplied_usd) * 100 : 0;
            const st = protocolStyle(p.protocol_id);
            return (
              <li key={p.protocol_id} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 items-center">
                <span className="inline-flex items-center gap-2.5 min-w-0">
                  <ProtocolDot id={p.protocol_id} size={20} />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium text-foreground truncate">{name(p.protocol_id)}</span>
                    <span className="block num text-[11px] text-muted-foreground">
                      {usd(p.supplied_usd)} supplied, {pct(used)} borrowed
                    </span>
                  </span>
                </span>
                <Sparkline data={trend(p.protocol_id)} width={72} height={24} color={st.color} fill />
                <div className="col-span-2 h-1 rounded-sm bg-muted overflow-hidden" title={`${pct(used)} of deposits borrowed`}>
                  <div className="h-full rounded-sm" style={{ width: `${used}%`, background: st.color, opacity: st.opacity }} />
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </Card>
  );
}

// AVAX and sAVAX counted in tokens, split by where they're deposited.
function AvaxSplitCard({ data }: { data: LendingData }) {
  const name = (id: string) => (data.protocols.find((p) => p.id === id)?.name ?? id).replace(' Lending', '');
  const { avax, savax } = data.summary;
  const block = (
    symbol: string,
    address: string,
    sum: typeof avax,
    note: string,
  ) => {
    const parts = [...sum.by_protocol].map((p) => ({ id: p.protocol_id, value: tokens(p.supplied) })).sort((a, b) => b.value - a.value);
    return (
      <div>
        <div className="flex items-center gap-2.5">
          <TokenLogo address={address} symbol={symbol} size={22} />
          <div className="min-w-0">
            <div className="num text-[18px] leading-6 font-medium text-foreground">
              {compact(tokens(sum.supplied))} <span className="text-[12px] text-muted-foreground">{symbol}</span>
            </div>
            <div className="text-[11px] text-muted-foreground">{note}</div>
          </div>
        </div>
        <div className="mt-2.5">
          <SplitBar label={`${symbol} supplied by protocol`} parts={parts.map((p) => ({ ...p, title: `${name(p.id)} ${compact(p.value)} ${symbol}` }))} />
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {parts.map((p) => (
            <span key={p.id} className="num">
              {name(p.id)} {compact(p.value)}
            </span>
          ))}
        </div>
      </div>
    );
  };
  const avaxUsed = tokens(avax.supplied) > 0 ? (tokens(avax.borrowed) / tokens(avax.supplied)) * 100 : null;
  return (
    <Card title="AVAX in lending" subtitle="Counted in tokens, split by protocol">
      <div className="px-4 sm:px-5 pb-4 space-y-5">
        {block('AVAX', WAVAX, avax, `supplied, ${compact(tokens(avax.borrowed))} borrowed${avaxUsed != null ? ` (${pct(avaxUsed)})` : ''}`)}
        {block(
          'sAVAX',
          SAVAX,
          savax,
          savax.share_of_savax_supply_percent != null ? `supplied, ${pct(savax.share_of_savax_supply_percent)} of all sAVAX` : 'supplied',
        )}
      </div>
    </Card>
  );
}

// The same asset across protocols, answered in words: where it pays most to
// supply, where it's cheapest to borrow, and what the alternatives charge.
function RatesCard({ rows }: { rows: Row[] }) {
  const assets = useMemo(() => {
    const by = new Map<string, Row[]>();
    for (const r of rows) {
      if (r.closed || (r.supplied_usd ?? 0) < MIN_COMPARE_USD) continue;
      by.set(r.asset, [...(by.get(r.asset) ?? []), r]);
    }
    return [...by.entries()]
      .filter(([, list]) => list.length > 1)
      .map(([asset, list]) => {
        const supplies = list
          .filter((r) => r.supply_apy_percent != null)
          .sort((a, b) => (b.supply_apy_percent ?? 0) - (a.supply_apy_percent ?? 0));
        // Only markets people actually borrow from. Aave V4 quotes a base rate before
        // each borrower's premium, so it's listed but can't be the cheapest.
        const borrows = list
          .filter((r) => r.borrow_apy_percent != null && (r.borrowed_usd ?? 0) >= MIN_COMPARE_USD && r.borrowCap.kind !== 'closed')
          .sort((a, b) => (a.borrow_apy_percent ?? 0) - (b.borrow_apy_percent ?? 0));
        const bestSupply = (supplies[0]?.supply_apy_percent ?? 0) >= 0.05 ? supplies[0] : undefined;
        // With only Aave V4 borrowing it, show its base rate rather than nothing.
        const bestBorrow = borrows.find((r) => r.protocol_id !== 'aave-v4') ?? borrows[0];
        return {
          asset,
          address: list[0].address,
          bestSupply,
          otherSupplies: supplies.filter((r) => r !== bestSupply),
          bestBorrow,
          otherBorrows: borrows.filter((r) => r !== bestBorrow),
          size: list.reduce((s, r) => s + (r.supplied_usd ?? 0), 0),
        };
      })
      // Nothing to compare when no protocol pays to supply and nobody borrows it.
      .filter((a) => a.bestSupply || a.bestBorrow)
      .sort((a, b) => b.size - a.size);
  }, [rows]);

  if (!assets.length) return null;
  const others = (list: Row[], key: 'supply_apy_percent' | 'borrow_apy_percent') =>
    list.length === 0
      ? 'Only option'
      : list
          .map((r) => `${r.protocolName.replace(' Lending', '')} ${apy(r[key])}${key === 'borrow_apy_percent' && r.protocol_id === 'aave-v4' ? ' + premium' : ''}`)
          .join(', ');
  const best = (r: Row | undefined, key: 'supply_apy_percent' | 'borrow_apy_percent', none: string) =>
    r ? (
      <span className="inline-flex items-center gap-2">
        <span className="num text-[15px] font-medium text-foreground">
          {apy(r[key])}
          {key === 'borrow_apy_percent' && r.protocol_id === 'aave-v4' && <span className="text-[11px] text-muted-foreground"> + premium</span>}
        </span>
        <span className="inline-flex items-center gap-1.5 text-[12px] text-foreground/90">
          <ProtocolDot id={r.protocol_id} />
          {r.protocolName.replace(' Lending', '')}
        </span>
      </span>
    ) : (
      <span className="text-[12px] text-muted-foreground">{none}</span>
    );

  return (
    <Card title="Rates by asset" subtitle="For assets on more than one protocol: where supplying pays the most and where borrowing costs the least, with the other options beside it.">
      <div className="hidden md:grid grid-cols-[110px_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.2fr)] gap-x-6 px-5 py-2 border-y border-border text-[11px] text-muted-foreground">
        <span>Asset</span>
        <span>Best to supply</span>
        <span>Other options</span>
        <span>Cheapest to borrow</span>
        <span>Other options</span>
      </div>
      <ul className="divide-y divide-border border-t border-border md:border-t-0">
        {assets.map((a) => (
          <li key={a.asset} className="px-4 sm:px-5 py-3 md:py-2.5">
            {/* Phones: two sentences per asset. */}
            <div className="md:hidden space-y-1.5">
              <div className="flex items-center gap-2">
                <TokenLogo address={a.address} symbol={a.asset} size={18} />
                <span className="num text-[14px] font-medium text-foreground">{a.asset}</span>
              </div>
              <div className="flex items-baseline justify-between gap-3 text-[12px]">
                <span className="text-muted-foreground shrink-0">Supply</span>
                {best(a.bestSupply, 'supply_apy_percent', 'Pays nearly nothing')}
              </div>
              {a.bestSupply && a.otherSupplies.length > 0 && (
                <div className="text-right text-[11px] text-muted-foreground">{others(a.otherSupplies, 'supply_apy_percent')}</div>
              )}
              <div className="flex items-baseline justify-between gap-3 text-[12px]">
                <span className="text-muted-foreground shrink-0">Borrow</span>
                {best(a.bestBorrow, 'borrow_apy_percent', 'Hardly borrowed')}
              </div>
              {a.bestBorrow && a.otherBorrows.length > 0 && (
                <div className="text-right text-[11px] text-muted-foreground">{others(a.otherBorrows, 'borrow_apy_percent')}</div>
              )}
            </div>
            <div className="hidden md:grid grid-cols-[110px_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.2fr)] gap-x-6 items-center">
              <span className="inline-flex items-center gap-2 min-w-0">
                <TokenLogo address={a.address} symbol={a.asset} size={18} />
                <span className="num text-[13px] font-medium text-foreground truncate">{a.asset}</span>
              </span>
              {best(a.bestSupply, 'supply_apy_percent', 'Pays nearly nothing')}
              <span className="num text-[12px] text-muted-foreground truncate">{a.bestSupply ? others(a.otherSupplies, 'supply_apy_percent') : ''}</span>
              {best(a.bestBorrow, 'borrow_apy_percent', 'Hardly borrowed')}
              <span className="num text-[12px] text-muted-foreground truncate">{a.bestBorrow ? others(a.otherBorrows, 'borrow_apy_percent') : ''}</span>
            </div>
          </li>
        ))}
      </ul>
      <p className="px-4 sm:px-5 py-2.5 border-t border-border text-[11px] text-muted-foreground">
        Variable APYs. Aave V4 shows its base borrow rate; each borrower pays a premium on top, so it isn't ranked cheapest.
        Markets under $100K are left out.
      </p>
    </Card>
  );
}

// Lenders sometimes switch off new borrowing against an asset (LTV to 0) as a risk
// measure. Said once, up top, so the table's "Paused" cells make sense.
function PausedNotice({ rows }: { rows: Row[] }) {
  const paused = rows.filter((r) => !r.closed && (r.supplied_usd ?? 0) >= MIN_COMPARE_USD && collateralState(r).kind === 'paused');
  if (!paused.length) return null;
  const list = (xs: string[]) => (xs.length <= 1 ? xs[0] : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
  // Group by protocol set, so no asset is implied paused somewhere it isn't.
  const byAsset = new Map<string, string[]>();
  for (const r of paused) byAsset.set(r.asset, [...new Set([...(byAsset.get(r.asset) ?? []), r.protocolName.replace(' Lending', '')])]);
  const groups = new Map<string, string[]>();
  for (const [asset, ps] of byAsset) {
    const key = ps.sort().join('|');
    groups.set(key, [...(groups.get(key) ?? []), asset]);
  }
  const phrases = [...groups].map(([key, assets]) => `${list(assets)} on ${list(key.split('|'))}`);
  return (
    <div className="flex items-start gap-3 rounded-md border border-[#d4a017]/40 bg-[#d4a017]/[0.07] px-4 py-3">
      <span className="mt-1.5 w-2 h-2 rounded-full bg-[#d4a017] shrink-0" aria-hidden />
      <p className="text-[13px] leading-5 text-foreground">
        New borrowing is switched off against <span className="font-medium">{phrases.join('; ')}</span>: their loan-to-value
        is set to 0. Existing positions keep their liquidation thresholds, so the change doesn't liquidate anyone.
      </p>
    </div>
  );
}

// Markets where depositing, withdrawing or borrowing is about to get harder.
function LimitsCard({ rows }: { rows: Row[] }) {
  const items = useMemo(() => {
    const out: { r: Row; reason: string; level: number }[] = [];
    // `level` is the cap or utilization percent that put the market here.
    for (const r of rows) {
      if (r.closed || (r.supplied_usd ?? 0) < MIN_COMPARE_USD) continue;
      const s = r.supplyCap.kind === 'pct' ? r.supplyCap.value : null;
      const b = r.borrowCap.kind === 'pct' ? r.borrowCap.value : null;
      const u = r.utilization_percent;
      if (s != null && s >= 100) out.push({ r, reason: 'Over its supply cap, so new deposits are blocked', level: s });
      else if (b != null && b >= 100) out.push({ r, reason: 'Borrow cap reached, so new borrowing is blocked', level: b });
      else if (s != null && s >= 95) out.push({ r, reason: `Supply cap ${pct(s)} used`, level: s });
      else if (b != null && b >= 95) out.push({ r, reason: `Borrow cap ${pct(b)} used`, level: b });
      else if (u != null && u >= 85) out.push({ r, reason: `${pct(u)} of deposits lent out, so large withdrawals may have to wait`, level: u });
    }
    return out.sort((a, b) => b.level - a.level);
  }, [rows]);

  return (
    <Card title="Near their limits" subtitle="Markets at or close to a cap, or with most deposits lent out. Rates usually rise here.">
      {items.length === 0 ? (
        <div className="px-5 pb-5 text-[12px] text-muted-foreground">No market is close to a cap or heavily borrowed right now.</div>
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {items.map(({ r, reason, level }) => (
            <li key={r.market + r.asset} className="px-4 sm:px-5 py-2.5 grid grid-cols-1 sm:grid-cols-[230px_90px_1fr_auto] gap-x-4 gap-y-1.5 items-center">
              <span className="inline-flex items-center gap-2.5 min-w-0">
                <AssetLogo r={r} size={20} />
                <span className="num text-[13px] font-medium text-foreground">{r.asset}</span>
                <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground min-w-0">
                  <ProtocolDot id={r.protocol_id} size={14} />
                  <span className="truncate">{r.protocolName}</span>
                </span>
              </span>
              <span className="hidden sm:block h-1.5 rounded-sm bg-muted overflow-hidden" title={pct(level)} aria-hidden>
                <span className="block h-full rounded-sm bg-[#d4a017]" style={{ width: `${Math.min(100, level)}%` }} />
              </span>
              <span className="text-[12px] text-foreground/90">{reason}</span>
              <span className="num text-[11px] text-muted-foreground whitespace-nowrap sm:text-right">
                {apy(r.supply_apy_percent)} supply, {borrowApy(r)} borrow
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function CollateralCell({ r }: { r: Row }) {
  const c = collateralState(r);
  if (c.kind === 'none') return <span className="text-[12px] text-muted-foreground">Not collateral</span>;
  if (c.kind === 'unknown') return <span className="text-muted-foreground/50">—</span>;
  if (c.kind === 'paused') {
    return (
      <span className="inline-flex flex-col items-end leading-tight" title="New borrowing against this asset is switched off (LTV 0). Existing positions keep the liquidation threshold.">
        <span className="text-[12px] text-[#d4a017]">Paused{c.was != null ? ` (was ${pct(c.was)})` : ''}</span>
        {(c.liq != null || c.note) && (
          <span className="num text-[10px] text-muted-foreground">{[c.liq != null ? `liq. ${pct(c.liq)}` : null, c.note].filter(Boolean).join(', ')}</span>
        )}
      </span>
    );
  }
  return (
    <span className="inline-flex flex-col items-end leading-tight">
      <span className="num text-[12px] text-muted-foreground">{pct(c.ltv)} / {pct(c.liq)}</span>
      {c.note && <span className="num text-[10px] text-muted-foreground">{c.note}</span>}
    </span>
  );
}

type SortKey = 'supplied_usd' | 'borrowed_usd' | 'utilization_percent' | 'supply_apy_percent' | 'borrow_apy_percent';

function MarketsTable({ rows, protocols }: { rows: Row[]; protocols: LendingData['protocols'] }) {
  const [protocol, setProtocol] = useState<string>('all');
  const [sort, setSort] = useState<SortKey>('supplied_usd');
  const [desc, setDesc] = useState(true);

  const list = useMemo(() => {
    const filtered = rows.filter((r) => protocol === 'all' || r.protocol_id === protocol);
    return [...filtered].sort((a, b) => {
      // Winding-down markets always sink to the bottom.
      if (a.closed !== b.closed) return a.closed ? 1 : -1;
      const d = (a[sort] ?? -1) - (b[sort] ?? -1);
      return desc ? -d : d;
    });
  }, [rows, protocol, sort, desc]);

  const options = [{ value: 'all', label: 'All' }, ...protocols.map((p) => ({ value: p.id, label: p.name.replace(' Lending', '') }))];
  const head = (key: SortKey, label: string, title?: string) => (
    <th className="text-right font-normal px-3 py-2" title={title} aria-sort={sort === key ? (desc ? 'descending' : 'ascending') : undefined}>
      <button
        type="button"
        onClick={() => (sort === key ? setDesc((d) => !d) : (setSort(key), setDesc(true)))}
        className={`inline-flex items-center gap-1 hover:text-foreground ${sort === key ? 'text-foreground' : ''}`}
      >
        {label}
        {sort === key && (desc ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />)}
      </button>
    </th>
  );
  const capCell = (c: CapUse) =>
    c.kind === 'none' ? <span className="text-muted-foreground/50">—</span> : c.kind === 'closed' ? <span className="text-muted-foreground">Closed</span> : pct(c.value);

  return (
    <Card
      title="All markets"
      subtitle={`${rows.length} markets on ${protocols.length} protocols`}
      right={<SegmentedControl size="xs" value={protocol} options={options} onChange={setProtocol} ariaLabel="Protocol" />}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-[12px] whitespace-nowrap">
          <thead>
            <tr className="border-y border-border text-[11px] text-muted-foreground">
              <th className="text-left font-normal px-4 sm:px-5 py-2">Market</th>
              {head('supplied_usd', 'Supplied')}
              {head('borrowed_usd', 'Borrowed')}
              {head('utilization_percent', 'Used', 'Share of supplied that is borrowed')}
              {head('supply_apy_percent', 'Supply APY')}
              {head('borrow_apy_percent', 'Borrow APY')}
              <th className="text-right font-normal px-3 py-2" title="Share of the supply cap used">Supply cap</th>
              <th className="text-right font-normal px-3 py-2" title="Share of the borrow cap used">Borrow cap</th>
              <th className="text-right font-normal px-4 sm:px-5 py-2" title="Loan-to-value for new borrows / liquidation threshold. E-Mode is Aave's higher limit for related assets.">Collateral</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {list.map((r) => (
              <tr key={r.protocol_id + r.market + r.asset} className={r.closed ? 'opacity-55' : ''}>
                <td className="px-4 sm:px-5 py-2">
                  <span className="inline-flex items-center gap-2.5">
                    <AssetLogo r={r} />
                    <span className="num text-[13px] font-medium text-foreground">{r.asset}</span>
                    <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <ProtocolDot id={r.protocol_id} size={14} />
                      {r.protocolName}
                    </span>
                    {r.closed && <span className="text-[10px] text-muted-foreground border border-border rounded px-1">Winding down</span>}
                  </span>
                </td>
                <td className="num text-right px-3 py-2 text-foreground">{usd(r.supplied_usd)}</td>
                <td className="num text-right px-3 py-2 text-foreground">{usd(r.borrowed_usd)}</td>
                <td className="num text-right px-3 py-2 text-muted-foreground">
                  <span className="inline-flex items-center gap-2 justify-end">
                    {r.utilization_percent != null && (
                      <span className="w-10 h-1 rounded-sm bg-muted overflow-hidden hidden sm:inline-block" aria-hidden>
                        <span className="block h-full rounded-sm" style={{ width: `${Math.min(100, r.utilization_percent)}%`, background: SUPPLIED }} />
                      </span>
                    )}
                    {pct(r.utilization_percent)}
                  </span>
                </td>
                <td className="num text-right px-3 py-2 text-foreground">{apy(r.supply_apy_percent)}</td>
                <td className="num text-right px-3 py-2 text-foreground">{borrowApy(r)}</td>
                <td className="num text-right px-3 py-2 text-foreground">{capCell(r.supplyCap)}</td>
                <td className="num text-right px-3 py-2 text-foreground">{capCell(r.borrowCap)}</td>
                <td className="text-right px-4 sm:px-5 py-2">
                  <CollateralCell r={r} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ── Daily stacked bars, shared by the history and liquidation charts ────────

interface StackDay {
  date: string;
  total: number;
  parts: { id: string; value: number }[];
  /** Optional line drawn over the bars (borrowed, on the history chart). */
  line?: number;
  /** Days in a weekly bar; under 7 marks a partial week, drawn lighter. */
  daysIn?: number;
}

const STACK_M = { top: 10, right: 8, bottom: 22, left: 52 };

function DailyStack({ days, names, fill = false, height = 200, renderHover, lineLabel, fmt = usd, area = false, focus: focusProp, onFocus }: {
  days: StackDay[];
  /** The protocol picked in the legend, when the parent owns it. */
  focus?: string | null;
  onFocus?: (id: string | null) => void;
  /** Stacked areas, for levels like money supplied. Bars are for amounts per day. */
  area?: boolean;
  /** Formats values on the axis and in the legend; dollars unless given. */
  fmt?: (v: number) => string;
  names: Record<string, string>;
  /** Fill the parent's height instead of a fixed one. */
  fill?: boolean;
  height?: number;
  renderHover: (d: StackDay | null) => React.ReactNode;
  lineLabel?: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  // A protocol picked in the legend; its part of every bar is highlighted.
  // The parent can own it, so the page around the chart follows the pick.
  const [ownFocus, setOwnFocus] = useState<string | null>(null);
  const focus = focusProp !== undefined ? focusProp : ownFocus;
  const setFocus = (id: string | null) => (onFocus ? onFocus(id) : setOwnFocus(id));
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Drawn at the box's own width, so narrow phones never overflow sideways.
  const W = Math.max(box?.w ?? 0, 1);
  const H = fill ? Math.max(box?.h ?? 0, 160) : height;
  const idsMemo = useMemo(() => {
    const seen = new Set<string>();
    days.forEach((d) => d.parts.forEach((p) => p.value > 0 && seen.add(p.id)));
    const order = ['aave-v3', 'aave-v4', 'benqi'];
    return [...order.filter((id) => seen.has(id)), ...[...seen].filter((id) => !order.includes(id))];
  }, [days]);
  const ids = idsMemo;
  // A focus on a protocol this range doesn't have would dim every bar with no way to clear it.
  const activeFocus = focus && ids.includes(focus) ? focus : null;
  // The picked protocol is drawn at the bottom of the stack, so its own shape reads from zero.
  const stackIds = useMemo(() => (activeFocus ? [activeFocus, ...ids.filter((id) => id !== activeFocus)] : ids), [activeFocus, ids]);

  const geom = useMemo(() => {
    if (!days.length) return null;
    const peak = Math.max(...days.map((d) => Math.max(d.total, d.line ?? 0)), 1);
    const raw = peak / 4;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const tick = ([1, 2, 2.5, 5, 10].find((k) => k * mag >= raw) ?? 10) * mag;
    const maxY = Math.ceil(peak / tick) * tick;
    const ticks = Array.from({ length: Math.round(maxY / tick) + 1 }, (_, i) => i * tick);
    const iw = W - STACK_M.left - STACK_M.right;
    const ih = H - STACK_M.top - STACK_M.bottom;
    const slot = iw / days.length;
    const barW = Math.max(1, slot * (days.length > 120 ? 0.9 : 0.72));
    const x = (i: number) => STACK_M.left + slot * i + (slot - barW) / 2;
    const y = (v: number) => STACK_M.top + ih - (v / maxY) * ih;
    const cx = (i: number) => x(i) + barW / 2;
    return { x, cx, y, barW, slot, ticks, labelEvery: Math.ceil(days.length / (W < 600 ? 4 : 8)) };
  }, [days, W, H]);

  const move = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!geom) return;
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.floor((e.clientX - r.left - STACK_M.left) / geom.slot);
    setHover(i >= 0 && i < days.length ? i : null);
  };
  const active = hover != null ? days[hover] : null;
  // A day without a value breaks the line instead of dropping it to zero.
  const linePath = geom && days.some((d) => d.line != null)
    ? days
        .map((d, i) =>
          d.line == null ? '' : `${i === 0 || days[i - 1].line == null ? 'M' : 'L'}${geom.cx(i).toFixed(1)},${geom.y(d.line).toFixed(1)}`,
        )
        .join('')
    : null;
  // One closed band per protocol, stacked in legend order.
  const bands = useMemo(() => {
    if (!area || !geom) return [];
    const base = days.map(() => 0);
    return stackIds.map((id) => {
      const lower = [...base];
      days.forEach((d, i) => (base[i] += d.parts.find((p) => p.id === id)?.value ?? 0));
      const top = days.map((_, i) => `${geom.cx(i).toFixed(1)},${geom.y(base[i]).toFixed(1)}`);
      const bottom = days.map((_, i) => `${geom.cx(i).toFixed(1)},${geom.y(lower[i]).toFixed(1)}`).reverse();
      return { id, d: `M${top.join('L')}L${bottom.join('L')}Z` };
    });
  }, [area, geom, days, stackIds]);

  return (
    <div className={fill ? 'h-full flex flex-col' : ''}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 mb-2">
        <div>{renderHover(active)}</div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          {ids.map((id) => {
            const st = protocolStyle(id);
            const v = active?.parts.find((p) => p.id === id)?.value;
            const on = activeFocus === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setFocus(focus === id ? null : id)}
                aria-pressed={on}
                title={on ? 'Show all protocols' : `Highlight ${names[id] ?? id}`}
                className={`inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 -mx-1.5 transition-colors hover:bg-accent ${
                  on ? 'bg-accent text-foreground' : activeFocus ? 'opacity-50 hover:opacity-100' : ''
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: st.color, opacity: st.opacity }} />
                {names[id] ?? id}
                {active && <span className="num text-foreground">{fmt(v ?? 0)}</span>}
              </button>
            );
          })}
          {lineLabel && (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-foreground" />
              {lineLabel}
              {active?.line != null && <span className="num text-foreground">{fmt(active.line)}</span>}
            </span>
          )}
        </div>
      </div>
      <div ref={boxRef} className={`relative overflow-hidden ${fill ? 'flex-1 min-h-0' : ''}`} style={fill ? undefined : { height }}>
        {geom && box && (
          <svg width={W} height={H} className="absolute inset-0 block" {...chartPointerProps({ onMove: move, count: days.length, hover, setHover })} role="img" aria-label="Daily values by protocol">
            {geom.ticks.map((t) => (
              <g key={t}>
                <line x1={STACK_M.left} x2={W - STACK_M.right} y1={geom.y(t)} y2={geom.y(t)} stroke="currentColor" strokeOpacity={0.08} />
                <text x={STACK_M.left - 8} y={geom.y(t)} textAnchor="end" dominantBaseline="middle" className="fill-muted-foreground" fontSize={10}>
                  {t === 0 ? '0' : fmt(t)}
                </text>
              </g>
            ))}
            {bands.map((b) => {
              const st = protocolStyle(b.id);
              const dim = activeFocus != null && activeFocus !== b.id;
              return <path key={b.id} d={b.d} fill={st.color} fillOpacity={(dim ? 0.15 : 1) * st.opacity * 0.85} />;
            })}
            {area && hover != null && (
              <line x1={geom.cx(hover)} x2={geom.cx(hover)} y1={STACK_M.top} y2={H - STACK_M.bottom} stroke="currentColor" strokeOpacity={0.5} className="text-foreground" />
            )}
            {days.map((d, i) => {
              let run = 0;
              return (
                <g key={d.date} opacity={(!area && hover != null && hover !== i ? 0.45 : 1) * (!area && d.daysIn != null && d.daysIn < 7 ? 0.5 : 1)}>
                  {!area && stackIds.map((id) => {
                    const v = d.parts.find((p) => p.id === id)?.value ?? 0;
                    if (v <= 0) return null;
                    const y0 = geom.y(run);
                    run += v;
                    const y1 = geom.y(run);
                    const st = protocolStyle(id);
                    const dim = activeFocus != null && activeFocus !== id;
                    return <rect key={id} x={geom.x(i)} y={y1} width={geom.barW} height={Math.max(0, y0 - y1)} fill={st.color} fillOpacity={dim ? st.opacity * 0.15 : st.opacity} />;
                  })}
                  {i % geom.labelEvery === 0 && (
                    <text x={geom.x(i) + geom.barW / 2} y={H - 5} textAnchor="middle" className="fill-muted-foreground" fontSize={10}>
                      {format(parseISO(d.date), days.length > 120 ? 'MMM yyyy' : 'MMM d')}
                    </text>
                  )}
                </g>
              );
            })}
            {linePath && <path d={linePath} fill="none" stroke="currentColor" strokeWidth={1.5} className="text-foreground" />}
          </svg>
        )}
      </div>
    </div>
  );
}

/**
 * Loads on mount and whenever `key` changes. `loadedKey` is the key the current
 * `data` belongs to, so labels follow the data, not a selection still loading.
 */
function useLoadOnce<T, K = unknown>(load: () => Promise<T | null>, key: K) {
  const [data, setData] = useState<T | null>(null);
  const [loadedKey, setLoadedKey] = useState<K | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  useEffect(() => {
    let alive = true;
    setState('loading');
    load().then((r) => {
      if (!alive) return;
      setData(r);
      setLoadedKey(key);
      setState(r ? 'ready' : 'error');
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { data, state, loadedKey };
}

const dayKey = (d: Date) => d.toISOString().slice(0, 10);
/** Sums days into Sunday-start weeks, for flow charts over long ranges. */
function toWeeks(series: StackDay[]): StackDay[] {
  const out = new Map<string, StackDay>();
  for (const d of series) {
    const key = weekStart(d.date);
    const w = out.get(key) ?? { date: key, total: 0, parts: [], daysIn: 0 };
    w.daysIn = (w.daysIn ?? 0) + 1;
    w.total += d.total;
    for (const p of d.parts) {
      const e = w.parts.find((x) => x.id === p.id);
      if (e) e.value += p.value;
      else w.parts.push({ ...p });
    }
    out.set(key, w);
  }
  return [...out.values()];
}

/**
 * One entry per UTC day from `from` to `to`, so a day with nothing to report is
 * an empty slot instead of vanishing and squeezing the time axis.
 */
function fillDays(series: StackDay[], from: string, to: string): StackDay[] {
  const by = new Map(series.map((d) => [d.date, d]));
  const out: StackDay[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`), end = Date.parse(`${to}T00:00:00Z`); t <= end; t += 86_400_000) {
    const key = dayKey(new Date(t));
    out.push(by.get(key) ?? { date: key, total: 0, parts: [] });
  }
  return out;
}

// Supplied per protocol, stacked by day, with total borrowed as a line.
function HistoryChart({ days, names, focus, onFocus }: {
  days: number;
  names: Record<string, string>;
  /** A protocol picked in the legend: the headline number and borrowed line become its own. */
  focus: string | null;
  onFocus: (id: string | null) => void;
}) {
  const { data, state, loadedKey } = useLoadOnce<LendingTotalsDay[], number>(() => getLendingTotals(days), days);
  const loadedDays = loadedKey ?? days;
  const series: StackDay[] = useMemo(
    () =>
      (data ?? []).map((d) => ({
        date: d.date,
        total: d.supplied_usd,
        line: focus ? (d.by_protocol.find((p) => p.protocol_id === focus)?.borrowed_usd ?? 0) : d.borrowed_usd,
        parts: d.by_protocol.map((p) => ({ id: p.protocol_id, value: p.supplied_usd })),
      })),
    [data, focus],
  );
  // Markets with deposits but no oracle price that day sit outside the USD sum,
  // so a dip there is a gap in pricing, not money leaving.
  const unpriced = useMemo(() => new Map((data ?? []).filter((d) => d.unpriced_markets).map((d) => [d.date, d.unpriced_markets ?? 0])), [data]);
  if (state === 'loading' && !data) return <div className="h-full min-h-[240px] rounded bg-muted/50 animate-pulse" />;
  if (!series.length) return <div className="h-full min-h-[160px] flex items-center justify-center text-[12px] text-muted-foreground">Lending history couldn't be loaded. Try again in a minute.</div>;
  // With a protocol picked, every number here is that protocol's own.
  const shown = focus && series.some((d) => d.parts.some((p) => p.id === focus)) ? focus : null;
  const value = (d: StackDay) => (shown ? (d.parts.find((p) => p.id === shown)?.value ?? 0) : d.total);
  // A protocol that launched inside the range starts from its first day with deposits.
  const first = (shown && series.find((d) => value(d) > 0)) || series[0];
  const last = series[series.length - 1];
  const peak = series.reduce((m, d) => (value(d) > value(m) ? d : m), first);
  const growth = value(first) > 0 ? ((value(last) - value(first)) / value(first)) * 100 : null;
  const label = shown ? `${names[shown] ?? shown} supplied` : 'supplied';
  return (
    <div className={`h-[300px] md:h-full transition-opacity ${state === 'loading' ? 'opacity-50' : ''}`}>
      <DailyStack
        days={series}
        names={names}
        fill
        area
        lineLabel={shown ? `${names[shown] ?? shown} borrowed` : 'Borrowed'}
        focus={shown}
        onFocus={onFocus}
        renderHover={(d) => (
          <>
            <div className="num text-[22px] leading-7 font-medium text-foreground">{usd(value(d ?? last))}</div>
            <div className="text-[11px] text-muted-foreground">
              {d
                ? `${label} on ${format(parseISO(d.date), 'EEE, MMM d, yyyy')}, ${usd(d.line)} borrowed`
                : loadedDays === 3650
                  ? // On All the first day is launch day, near zero, so the peak says more.
                    `${label} now; peak ${usd(value(peak))} on ${format(parseISO(peak.date), 'MMM d, yyyy')}, history from ${format(parseISO(first.date), 'MMM yyyy')}`
                  : `${label} now; ${usd(value(first))} on ${format(parseISO(first.date), 'MMM d, yyyy')}${
                      growth != null && Math.abs(growth) >= 1 ? `, ${growth >= 0 ? 'up' : 'down'} ${Math.abs(growth).toFixed(0)}%` : ''
                    }`}
              {d && unpriced.get(d.date) ? `. ${unpriced.get(d.date)} ${unpriced.get(d.date) === 1 ? 'market' : 'markets'} had no price that day and aren't counted` : ''}
              {series.length < loadedDays && loadedDays !== 3650 && !d ? `. History so far starts ${format(parseISO(first.date), 'MMM d')}` : ''}
            </div>
          </>
        )}
      />
    </div>
  );
}

const ASSETS = [
  { value: 'avax', label: 'AVAX' },
  { value: 'savax', label: 'sAVAX' },
] as const;
const TOKEN_RANGES = [
  { value: '365', label: '1y' },
  { value: '3650', label: 'All' },
] as const;
// 18-decimal base units to whole tokens; exact enough for a chart.
const tokens = (v: string | null | undefined) => {
  try {
    return Number(BigInt(v || 0) / 10n ** 12n) / 1e6;
  } catch {
    return 0;
  }
};

// The dollar chart moves with the AVAX price; counted in tokens, deposits show
// whether people actually added or withdrew.
function AvaxDepositsCard({ names }: { names: Record<string, string> }) {
  const [asset, setAsset] = useState<'avax' | 'savax'>('avax');
  const [range, setRange] = useState<'365' | '3650'>('365');
  const key = `${asset}-${range}`;
  const { data, state, loadedKey } = useLoadOnce<LendingAssetDay[], string>(() => getLendingAsset(asset, Number(range)), key);
  const symbol = (loadedKey ?? key).startsWith('savax') ? 'sAVAX' : 'AVAX';
  const series: StackDay[] = useMemo(
    () =>
      (data ?? []).map((d) => ({
        date: d.date,
        total: tokens(d.supplied),
        line: tokens(d.borrowed),
        parts: d.by_protocol.map((p) => ({ id: p.protocol_id, value: tokens(p.supplied) })),
      })),
    [data],
  );
  const first = series[0];
  const last = series[series.length - 1];
  const change = first && last && first.total > 0 ? ((last.total - first.total) / first.total) * 100 : null;
  // sAVAX is collateral only on most markets, so a borrowed line near zero is noise.
  const showLine = symbol === 'AVAX';
  return (
    <Card
      title={`${symbol} deposits in tokens`}
      subtitle="Counted in tokens, not dollars, so price moves drop out. AVAX includes WAVAX."
      right={
        <div className="flex items-center gap-2">
          <SegmentedControl size="xs" value={asset} options={ASSETS} onChange={setAsset} ariaLabel="Asset" />
          <SegmentedControl size="xs" value={range} options={TOKEN_RANGES} onChange={setRange} ariaLabel="Deposit history range" />
        </div>
      }
    >
      <div className={`px-4 sm:px-5 pb-5 pt-1 transition-opacity ${state === 'loading' && data ? 'opacity-50' : ''}`}>
        {state === 'loading' && !data ? (
          <div className="h-[260px] rounded bg-muted/50 animate-pulse" />
        ) : !series.length ? (
          <p className="py-10 text-center text-[12px] text-muted-foreground">Deposit history couldn't be loaded. Try again in a minute.</p>
        ) : (
          <DailyStack
            days={showLine ? series : series.map((d) => ({ ...d, line: undefined }))}
            names={names}
            height={220}
            area
            fmt={compact}
            lineLabel={showLine ? 'Borrowed' : undefined}
            renderHover={(d) => (
              <>
                <div className="num text-[22px] leading-7 font-medium text-foreground">
                  {compact((d ?? last).total)} <span className="text-[13px] text-muted-foreground">{symbol}</span>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {d
                    ? `supplied on ${format(parseISO(d.date), 'EEE, MMM d, yyyy')}${showLine && d.line != null ? `, ${compact(d.line)} borrowed` : ''}`
                    : change != null && (loadedKey ?? key).endsWith('365')
                      ? `supplied now, ${change >= 0 ? 'up' : 'down'} ${Math.abs(change).toFixed(0)}% from ${compact(first.total)} on ${format(parseISO(first.date), 'MMM d, yyyy')}`
                      : first
                        ? `supplied now; ${compact(first.total)} when history starts, ${format(parseISO(first.date), 'MMM d, yyyy')}`
                        : 'supplied now'}
                </div>
              </>
            )}
          />
        )}
      </div>
    </Card>
  );
}

const LIQ_RANGES = [
  { value: '30', label: '30d' },
  { value: '90', label: '90d' },
  { value: '365', label: '1y' },
  { value: '3650', label: 'All' },
] as const;

function LiquidationsCard({ names }: { names: Record<string, string> }) {
  const [range, setRange] = useState<'30' | '90' | '365' | '3650'>('90');
  const daily = useLoadOnce<LiquidationsDay[], string>(() => getLiquidationsDaily(Number(range)), range);
  const top = useLoadOnce<Liquidation[], string>(() => getLiquidationsTop(Number(range), 8), range);
  const recent = useLoadOnce<Liquidation[], string>(() => getLiquidationsRecent(8), 'recent');

  const rows = useMemo(() => daily.data ?? [], [daily.data]);
  const loadedRange = daily.loadedKey ?? range;
  const series: StackDay[] = useMemo(() => {
    const raw = rows.map((d) => ({
      date: d.date,
      total: d.repaid_usd,
      parts: d.by_protocol.map((p) => ({ id: p.protocol_id, value: p.repaid_usd })),
    }));
    if (!raw.length) return raw;
    const last = raw[raw.length - 1].date;
    // "All" starts at the first liquidation; the others span their whole window.
    const from = loadedRange === '3650' ? raw[0].date : dayKey(new Date(Date.parse(`${last}T00:00:00Z`) - (Number(loadedRange) - 1) * 86_400_000));
    return fillDays(raw, from, last);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daily.data, loadedRange]);
  const weekly = series.length > WEEKLY_AFTER_DAYS;
  const bars = useMemo(() => (weekly ? toWeeks(series) : series), [series, weekly]);
  const countOn = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of rows) {
      const key = weekly ? weekStart(d.date) : d.date;
      m.set(key, (m.get(key) ?? 0) + d.count);
    }
    return m;
  }, [rows, weekly]);
  const total = series.reduce((s, d) => s + d.total, 0);
  const count = rows.reduce((s, d) => s + d.count, 0);
  const peak = series.reduce<StackDay | null>((m, d) => (!m || d.total > m.total ? d : m), null);
  // Labels describe the loaded data, so they never run ahead of a range still loading.
  const label =
    loadedRange === '3650'
      ? rows.length ? `since ${format(parseISO(rows[0].date), 'MMMM yyyy')}` : 'in all history'
      : loadedRange === '365' ? 'in the last year' : `in the last ${loadedRange} days`;
  const topLabel =
    (top.loadedKey ?? range) === '3650' ? 'Largest ever' : `Largest, ${label.replace('in the ', '')}`;

  return (
    <Card
      title="Liquidations"
      subtitle={`Loans closed by liquidators after the collateral fell below its liquidation threshold. Bars show the debt they repaid, per ${weekly ? 'week' : 'day'}.`}
      right={<SegmentedControl size="xs" value={range} options={LIQ_RANGES} onChange={setRange} ariaLabel="Liquidation range" />}
    >
      <div className="px-4 sm:px-5 pb-4">
        {daily.state === 'loading' && !daily.data ? (
          <div className="h-[260px] rounded bg-muted/50 animate-pulse" />
        ) : !series.length ? (
          <div className="h-[120px] flex items-center justify-center text-[12px] text-muted-foreground">
            {daily.state === 'error' ? "Liquidations couldn't be loaded. Try again in a minute." : 'No liquidations in this period.'}
          </div>
        ) : (
          <div className={daily.state === 'loading' ? 'opacity-60' : ''}>
            <DailyStack
              days={bars}
              names={names}
              height={220}
              renderHover={(d) => (
                <>
                  <div className="num text-[22px] leading-7 font-medium text-foreground">{usd(d ? d.total : total)}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {d
                      ? `repaid ${weekly ? `in the week of ${format(parseISO(d.date), 'MMM d, yyyy')}${d.daysIn != null && d.daysIn < 7 ? ` (partial, ${d.daysIn} ${d.daysIn === 1 ? 'day' : 'days'})` : ''}` : `on ${format(parseISO(d.date), 'EEE, MMM d, yyyy')}`}, ${(countOn.get(d.date) ?? 0).toLocaleString()} liquidations`
                      : `repaid across ${count.toLocaleString()} liquidations ${label}${peak && peak.total > 0 ? `; most in a day ${usd(peak.total)} on ${format(parseISO(peak.date), 'MMM d, yyyy')}` : ''}`}
                  </div>
                </>
              )}
            />
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 border-t border-border lg:divide-x divide-border">
        <LiquidationList title={topLabel} items={top.data} state={top.state} names={names} empty="None in this period." />
        <LiquidationList title="Latest" items={recent.data} state={recent.state} names={names} empty="No liquidations recorded yet." />
      </div>
    </Card>
  );
}

function LiquidationList({ title, items, state, names, empty }: {
  title: string;
  items: Liquidation[] | null;
  state: 'loading' | 'ready' | 'error';
  names: Record<string, string>;
  empty: string;
}) {
  return (
    <div className="min-w-0 border-t lg:border-t-0 border-border first:border-t-0">
      <div className="px-4 sm:px-5 pt-3 pb-1.5 text-[12px] font-medium text-foreground">{title}</div>
      {state === 'loading' && !items ? (
        <div className="px-4 sm:px-5 pb-4 space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-8 rounded bg-muted/50 animate-pulse" />)}</div>
      ) : state === 'error' && !items ? (
        <div className="px-4 sm:px-5 pb-4 text-[12px] text-muted-foreground">Liquidations couldn't be loaded. Try again in a minute.</div>
      ) : !items?.length ? (
        <div className="px-4 sm:px-5 pb-4 text-[12px] text-muted-foreground">{empty}</div>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((l) => (
            <li key={l.tx_hash + l.borrower} className="px-4 sm:px-5 py-2 flex items-center justify-between gap-3">
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-[12px] text-foreground">
                  <span className="inline-flex items-center shrink-0" aria-hidden>
                    <TokenLogo address={l.debt.address.toLowerCase() === ZERO ? WAVAX : l.debt.address} symbol={l.debt.symbol} size={16} />
                    <span className="-ml-1 rounded-full ring-2 ring-card inline-flex">
                      <TokenLogo address={l.collateral.address.toLowerCase() === ZERO ? WAVAX : l.collateral.address} symbol={l.collateral.symbol} size={16} />
                    </span>
                  </span>
                  <span className="truncate">
                    <span className="num">{l.debt.symbol}</span> debt repaid against <span className="num">{l.collateral.symbol}</span>
                  </span>
                </span>
                <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <ProtocolDot id={l.protocol_id} size={12} />
                  {/* UTC, like the daily bars: format the timestamp's own digits, not local time. */}
                  {(names[l.protocol_id] ?? l.protocol_id).replace(' Lending', '')}, {format(parseISO(l.block_time.slice(0, 19)), 'MMM d, yyyy HH:mm')} UTC
                </span>
              </span>
              <a
                href={`https://snowtrace.io/tx/${l.tx_hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="num shrink-0 text-[13px] text-foreground hover:underline underline-offset-2 decoration-border"
                title="Open the transaction"
              >
                {usd(l.debt.usd)}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
