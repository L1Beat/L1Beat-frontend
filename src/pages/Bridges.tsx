import { useEffect, useMemo, useRef, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { SEO } from '../components/SEO';
import { PAGE_SEO } from '../utils/pageSeo';
import { SegmentedControl, StatStrip } from '../components/instrument';
import type { StatItem } from '../components/instrument';
import { SectionErrorBoundary } from '../components/SectionErrorBoundary';
import { getBridgeRecentTransfers, getBridgeSummary, getBridgeTimeseries, getBridgeTopTransfers } from '../api';
import type { BridgeDay, BridgeSummary, BridgeTransfer } from '../api';
import { WEEKLY_AFTER_DAYS, weekStart } from '../utils/weeks';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { chartPointerProps } from '../utils/chartPointer';

// Circle's blue for CCTP; the rest from the categorical palette. Red stays for
// drops, so outflows are drawn below the axis in the same colour, not in red.
const BRIDGE_STYLE: Record<string, string> = {
  cctp: '#3987e5',
  layerzero: '#6b7280',
  stargate: '#8b5cf6',
  'avalanche-bridge': '#d95926',
  ccip: '#d4a017',
  aeb: '#199e70',
};
const bridgeColor = (id: string) => BRIDGE_STYLE[id] ?? '#6b7280';
// Display names, so the legend reads right before the summary has loaded.
const BRIDGE_NAME: Record<string, string> = {
  cctp: 'Circle CCTP',
  layerzero: 'LayerZero OFT',
  stargate: 'Stargate',
  'avalanche-bridge': 'Avalanche Bridge',
  ccip: 'Chainlink CCIP',
  aeb: 'Avalanche-Ethereum Bridge',
};
const ORDER = ['cctp', 'layerzero', 'stargate', 'avalanche-bridge', 'ccip', 'aeb'];

const VIEWS = [
  { value: 'flows', label: 'Flows' },
  { value: 'time', label: 'Over time' },
] as const;

const RANGES = [
  { value: '30', label: '30d' },
  { value: '90', label: '90d' },
  { value: '365', label: '1y' },
  { value: '3650', label: 'All' },
] as const;
type Range = (typeof RANGES)[number]['value'];

function compact(v: number): string {
  const trim = (n: number) => n.toFixed(1).replace(/\.0$/, '');
  const a = Number(Math.abs(v).toPrecision(3));
  if (a >= 1e9) return `${trim(v / 1e9)}B`;
  if (a >= 1e6) return `${trim(v / 1e6)}M`;
  if (a >= 1e3) return `${trim(v / 1e3)}K`;
  return Math.round(v).toLocaleString();
}
const usd = (v: number | null | undefined) => (v == null ? '—' : `${v < 0 ? '−' : ''}$${compact(Math.abs(v))}`);
const signedUsd = (v: number) => `${v >= 0 ? '+' : '−'}$${compact(Math.abs(v))}`;
const day = (d: string | null | undefined, f = 'MMM d') => (d ? format(parseISO(d), f) : '—');

function useLoad<T>(load: () => Promise<T | null>, key: string) {
  const [data, setData] = useState<T | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
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

export function Bridges() {
  const [range, setRange] = useState<Range>('30');
  // Flows (the Sankey) leads on wider screens; phones start on the bars, where a Sankey is too cramped.
  const wide = useMediaQuery('(min-width: 768px)', true);
  const [view, setView] = useState<'flows' | 'time' | null>(null);
  const shownView = view ?? (wide ? 'flows' : 'time');
  const summary = useLoad(() => getBridgeSummary(Number(range)), range);
  const series = useLoad(() => getBridgeTimeseries(Number(range)), range);
  const top = useLoad(() => getBridgeTopTransfers(Number(range), 8), range);
  const recent = useLoad(() => getBridgeRecentTransfers(8), 'recent');

  // Until the first rollup lands, the API answers with an empty summary; treat it as not ready.
  const filling = summary.data != null && !summary.data.as_of;
  const s = filling ? null : summary.data;
  const t = s?.totals;
  const names = { ...BRIDGE_NAME, ...Object.fromEntries((s?.by_bridge ?? []).map((b) => [b.id, b.name])) };
  // From the loaded data, so labels never run ahead of a range still loading.
  const rangeLabel = !s
    ? ''
    : s.days > 365
      ? `since ${s.from ? format(parseISO(s.from), 'MMMM yyyy') : 'tracking began'}`
      : s.days === 365
        ? 'in the last year'
        : `in the last ${s.days} days`;
  const moved = t ? t.inflow_usd + t.outflow_usd : 0;
  const lead = s?.by_bridge.length
    ? [...s.by_bridge].sort((a, b) => b.inflow_usd + b.outflow_usd - (a.inflow_usd + a.outflow_usd))[0]
    : null;

  const stats: StatItem[] = t
    ? [
        { label: 'Inflow', value: usd(t.inflow_usd), sub: 'bridged in' },
        { label: 'Outflow', value: usd(t.outflow_usd), sub: 'bridged away' },
        {
          label: 'Net',
          value: signedUsd(t.net_usd),
          sub: t.net_usd >= 0 ? 'more came in than left' : 'more left than came in',
          tooltip: 'Inflow minus outflow. A few large transfers can move it a lot, so check the largest transfers below.',
        },
        {
          label: 'Transfers',
          value: compact(t.transfers),
          sub: t.priced_share != null ? `${(t.priced_share * 100).toFixed(1)}% valued in USD` : ' ',
          tooltip: 'Transfers in tokens without a price are counted but add no dollars.',
        },
      ]
    : ['Inflow', 'Outflow', 'Net', 'Transfers'].map((label) => ({ label, value: '—', sub: summary.state === 'error' ? 'Unavailable' : ' ' }));

  return (
    <div>
      <SEO {...PAGE_SEO.bridges} />

      {/* Hero in the shared page frame: the chart fills the stage and the KPIs
          float over its foot from md up. */}
      <section
        className="relative border-b border-border bg-stage md:h-[min(calc(100vh-48px),1200px)] md:min-h-[600px]"
        aria-label="Daily bridge flows"
      >
        <div className="md:absolute md:inset-0 flex flex-col">
          <div className="max-w-7xl 2xl:max-w-screen-2xl w-full mx-auto px-4 sm:px-6 pt-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-[18px] leading-6 font-semibold text-foreground">Bridges</h1>
              {s && t ? (
                <>
                  <p className="mt-2 text-[26px] sm:text-[34px] leading-tight font-medium text-foreground max-w-4xl">
                    Bridges moved <span className="tabular-nums">{usd(moved)}</span> to and from Avalanche {rangeLabel}.
                  </p>
                  <p className="mt-1.5 text-[15px] sm:text-[17px] leading-snug text-foreground/80 max-w-3xl">
                    <span className="num">{usd(t.inflow_usd)}</span> came in and <span className="num">{usd(t.outflow_usd)}</span> went out
                    {lead && moved > 0 && (
                      <>
                        . {lead.name} carried <span className="num">{Math.round(((lead.inflow_usd + lead.outflow_usd) / moved) * 100)}%</span> of it
                      </>
                    )}
                    .
                  </p>
                </>
              ) : filling ? (
                <p className="mt-3 text-[13px] text-muted-foreground">Bridge history is still being filled in. Check back in a few hours.</p>
              ) : summary.state === 'error' ? (
                <p className="mt-3 text-[13px] text-muted-foreground">Bridge flows couldn't be loaded. Try again in a minute.</p>
              ) : (
                <div className="mt-3 h-9 w-[min(560px,80vw)] rounded bg-muted animate-pulse" />
              )}
            </div>
            <div className="self-start shrink-0">
              <div className="flex items-center gap-2">
                <SegmentedControl size="xs" value={shownView} options={VIEWS} onChange={setView} ariaLabel="Chart view" />
                <SegmentedControl size="xs" value={range} options={RANGES} onChange={setRange} ariaLabel="Chart range" />
              </div>
            </div>
          </div>

          <div className="relative h-[420px] md:h-auto md:flex-1 md:min-h-0 mx-4 sm:mx-6 lg:mx-10 mt-5 mb-6 md:mt-4 md:mb-[128px]">
            <SectionErrorBoundary label="the bridge flow chart">
              {filling ? (
                <div className="h-full min-h-[200px] flex items-center justify-center rounded border border-dashed border-border text-[12px] text-muted-foreground">
                  The chart appears once the history reaches today.
                </div>
              ) : (
                shownView === 'flows' ? (
                  wide ? (
                    <FlowSankey summary={s} state={summary.state} names={names} />
                  ) : (
                    <FlowLists summary={s} />
                  )
                ) : (
                  <FlowChart days={series.data} state={series.state} loadedRange={series.loadedKey} names={names} asOf={s?.as_of ?? null} />
                )
              )}
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

        <div className={`grid grid-cols-1 lg:grid-cols-2 gap-5 items-start ${summary.state === 'loading' && s ? 'opacity-60' : ''}`}>
          <SectionErrorBoundary label="flows by chain">
            <ChainTable summary={s} state={summary.state} />
          </SectionErrorBoundary>
          <div className="space-y-5">
            <SectionErrorBoundary label="flows by bridge">
              <BridgeTable summary={s} state={summary.state} />
            </SectionErrorBoundary>
            <SectionErrorBoundary label="flows by token">
              <TokenTable summary={s} state={summary.state} />
            </SectionErrorBoundary>
          </div>
        </div>

        <SectionErrorBoundary label="transfers">
          <section className="rounded-md border border-border bg-card">
            <header className="px-4 sm:px-5 pt-4 pb-2">
              <h2 className="text-[14px] font-semibold text-foreground">Transfers</h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                A few large transfers can move the totals a lot. Amounts are valued at the hour they moved.
              </p>
            </header>
            <div className="grid grid-cols-1 lg:grid-cols-2 border-t border-border lg:divide-x divide-border">
              <TransferList
                title={(() => {
                  const k = top.loadedKey ?? range;
                  return k === '3650' ? 'Largest ever' : k === '365' ? 'Largest, last year' : `Largest, last ${k} days`;
                })()}
                items={top.data}
                state={top.state}
                names={names}
                empty="None in this period."
              />
              <TransferList title="Latest" items={recent.data} state={recent.state} names={names} empty="No transfers recorded yet." />
            </div>
          </section>
        </SectionErrorBoundary>

        <p className="text-[11px] leading-relaxed text-muted-foreground max-w-4xl">
          Read from bridge contracts on the C-Chain: Circle CCTP, LayerZero OFT tokens, Stargate pools, the Avalanche Bridge
          (.e tokens to Ethereum and BTC.b to Bitcoin), its 2021 predecessor the Avalanche-Ethereum Bridge, and Chainlink CCIP. Each transfer counts once; USDC sent over CCIP that
          settles through CCTP counts as CCTP.
          {t && t.passthrough_count > 0 && ` ${t.passthrough_count.toLocaleString()} transactions that bridged in and straight back out are left out.`}{' '}
          Some LayerZero transfers go to Avalanche L1s like Dexalot and Beam; they're marked in the chain list. Wormhole, Axelar,
          intent-based bridges and exchange deposits aren't counted. Days are complete UTC days.
        </p>
      </div>
    </div>
  );
}

// Inflow above the axis and outflow below, both stacked by bridge, with net as a line.
const M = { top: 12, right: 8, bottom: 24, left: 56 };

function FlowChart({ days, state, loadedRange, names, asOf }: {
  days: BridgeDay[] | null;
  /** The last complete day; the window ends here even if that day had no transfers. */
  asOf: string | null;
  state: 'loading' | 'ready' | 'error';
  loadedRange: string | null;
  names: Record<string, string>;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const W = Math.max(box?.w ?? 0, 1);
  const H = Math.max(box?.h ?? 0, 160);

  // Every UTC day gets a slot (the API leaves out days without transfers); past
  // about a year they are summed into weeks, where days would be under a pixel.
  const { rows, weekly } = useMemo(() => {
    if (!days?.length) return { rows: [] as (BridgeDay & { daysIn?: number })[], weekly: false };
    const by = new Map(days.map((d) => [d.date, d]));
    const lastApi = days[days.length - 1].date;
    const last = Date.parse(`${asOf && asOf > lastApi ? asOf : lastApi}T00:00:00Z`);
    const span = loadedRange === '3650' ? Math.round((last - Date.parse(`${days[0].date}T00:00:00Z`)) / 86_400_000) + 1 : Number(loadedRange ?? days.length);
    const filled: BridgeDay[] = [];
    for (let i = span - 1; i >= 0; i--) {
      const key = new Date(last - i * 86_400_000).toISOString().slice(0, 10);
      filled.push(by.get(key) ?? { date: key, inflow_usd: 0, outflow_usd: 0, net_usd: 0, transfers: 0, bridges: [] });
    }
    if (filled.length <= WEEKLY_AFTER_DAYS) return { rows: filled as (BridgeDay & { daysIn?: number })[], weekly: false };
    const weeks = new Map<string, BridgeDay & { daysIn: number }>();
    for (const d of filled) {
      const k = weekStart(d.date);
      const w = weeks.get(k) ?? { date: k, inflow_usd: 0, outflow_usd: 0, net_usd: 0, transfers: 0, bridges: [], daysIn: 0 };
      w.daysIn += 1;
      w.inflow_usd += d.inflow_usd;
      w.outflow_usd += d.outflow_usd;
      w.net_usd += d.net_usd;
      w.transfers += d.transfers;
      for (const b of d.bridges) {
        const e = w.bridges.find((x) => x.id === b.id);
        if (e) {
          e.inflow_usd += b.inflow_usd;
          e.outflow_usd += b.outflow_usd;
          e.transfers += b.transfers;
        } else w.bridges.push({ ...b });
      }
      weeks.set(k, w);
    }
    return { rows: [...weeks.values()], weekly: true };
  }, [days, loadedRange, asOf]);
  useEffect(() => setHover(null), [rows]);

  const ids = useMemo(() => {
    const seen = new Set<string>();
    rows.forEach((d) => d.bridges.forEach((b) => (b.inflow_usd > 0 || b.outflow_usd > 0) && seen.add(b.id)));
    return [...ORDER.filter((id) => seen.has(id)), ...[...seen].filter((id) => !ORDER.includes(id))];
  }, [rows]);

  const geom = useMemo(() => {
    if (!rows.length || !box) return null;
    const peak = Math.max(...rows.map((d) => Math.max(d.inflow_usd, d.outflow_usd)), 1);
    const raw = peak / 2;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const tick = ([1, 2, 2.5, 5, 10].find((k) => k * mag >= raw) ?? 10) * mag;
    const maxY = Math.ceil(peak / tick) * tick;
    const ticks: number[] = [];
    for (let v = -maxY; v <= maxY + 1e-9; v += tick) ticks.push(v);
    const iw = W - M.left - M.right;
    const ih = H - M.top - M.bottom;
    const slot = iw / rows.length;
    const barW = Math.max(1, slot * (rows.length > 120 ? 0.85 : 0.7));
    const x = (i: number) => M.left + slot * i + (slot - barW) / 2;
    const y = (v: number) => M.top + ih / 2 - (v / maxY) * (ih / 2);
    return { x, y, slot, barW, ticks, labelEvery: Math.ceil(rows.length / (W < 600 ? 4 : 8)) };
  }, [rows, box, W, H]);

  const active = hover != null ? rows[hover] : null;
  const totalIn = rows.reduce((a, d) => a + d.inflow_usd, 0);
  const totalOut = rows.reduce((a, d) => a + d.outflow_usd, 0);
  const net = active ? active.inflow_usd - active.outflow_usd : totalIn - totalOut;
  const bridgeOf = (d: BridgeDay, id: string) => d.bridges.find((b) => b.id === id);
  const linePath = geom
    ? rows.map((d, i) => `${i === 0 ? 'M' : 'L'}${(geom.x(i) + geom.barW / 2).toFixed(1)},${geom.y(d.inflow_usd - d.outflow_usd).toFixed(1)}`).join('')
    : '';

  return (
    <div className="h-full flex flex-col">
      {rows.length > 0 && (
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 mb-2">
          <div>
            <div className="num text-[22px] leading-7 font-medium text-foreground">{signedUsd(net)} net</div>
            <div className="text-[11px] text-muted-foreground">
              {active
                ? `${weekly ? `Week of ${day(active.date, 'MMM d, yyyy')}${(active.daysIn ?? 7) < 7 ? ` (partial, ${active.daysIn} ${active.daysIn === 1 ? 'day' : 'days'})` : ''}` : day(active.date, 'EEE, MMM d, yyyy')}: ${usd(active.inflow_usd)} in, ${usd(active.outflow_usd)} out`
                : `${usd(totalIn)} in, ${usd(totalOut)} out, ${day(rows[0].date)} to ${day(rows[rows.length - 1].date)}${weekly ? '; bars are weeks' : ''}`}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            {ids.map((id) => (
              <span key={id} className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: bridgeColor(id) }} />
                {names[id] ?? id}
                {active && (
                  <span className="num text-foreground">
                    {usd((bridgeOf(active, id)?.inflow_usd ?? 0) - (bridgeOf(active, id)?.outflow_usd ?? 0))}
                  </span>
                )}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-foreground" />
              Net
            </span>
          </div>
        </div>
      )}
      <div ref={boxRef} className="relative flex-1 min-h-0 overflow-hidden">
        {state === 'loading' && !rows.length ? (
          <div className="absolute inset-0 rounded bg-muted/50 animate-pulse" />
        ) : !geom ? (
          <div className="absolute inset-0 flex items-center justify-center text-[12px] text-muted-foreground">
            {state === 'error' ? "Daily flows couldn't be loaded. Try again in a minute." : ''}
          </div>
        ) : (
          <svg
            width={W}
            height={H}
            className={`absolute inset-0 block ${state === 'loading' ? 'opacity-50' : ''}`}
            {...chartPointerProps<SVGSVGElement>({
              onMove: (e) => {
                const i = Math.floor((e.clientX - e.currentTarget.getBoundingClientRect().left - M.left) / geom.slot);
                setHover(i >= 0 && i < rows.length ? i : null);
              },
              count: rows.length,
              hover,
              setHover,
            })}
            role="img"
            aria-label={`${weekly ? 'Weekly' : 'Daily'} bridge inflow above the axis and outflow below, stacked by bridge, with net flow as a line`}
          >
            {geom.ticks.map((tk) => (
              <g key={tk}>
                <line x1={M.left} x2={W - M.right} y1={geom.y(tk)} y2={geom.y(tk)} stroke="currentColor" strokeOpacity={tk === 0 ? 0.3 : 0.08} />
                <text x={M.left - 8} y={geom.y(tk)} textAnchor="end" dominantBaseline="middle" className="fill-muted-foreground" fontSize={10}>
                  {tk === 0 ? '0' : `${tk < 0 ? '−' : ''}$${compact(Math.abs(tk))}`}
                </text>
              </g>
            ))}
            <text x={M.left + 4} y={M.top + 10} className="fill-muted-foreground" fontSize={10}>In</text>
            <text x={M.left + 4} y={H - M.bottom - 4} className="fill-muted-foreground" fontSize={10}>Out</text>
            {rows.map((d, i) => {
              let up = 0;
              let down = 0;
              return (
                <g key={d.date} opacity={(hover != null && hover !== i ? 0.45 : 1) * (weekly && (d.daysIn ?? 7) < 7 ? 0.5 : 1)}>
                  {ids.map((id) => {
                    const b = bridgeOf(d, id);
                    if (!b) return null;
                    const parts: JSX.Element[] = [];
                    if (b.inflow_usd > 0) {
                      const y0 = geom.y(up);
                      up += b.inflow_usd;
                      parts.push(<rect key={`${id}-in`} x={geom.x(i)} y={geom.y(up)} width={geom.barW} height={Math.max(0, y0 - geom.y(up))} fill={bridgeColor(id)} />);
                    }
                    if (b.outflow_usd > 0) {
                      const y0 = geom.y(-down);
                      down += b.outflow_usd;
                      parts.push(<rect key={`${id}-out`} x={geom.x(i)} y={y0} width={geom.barW} height={Math.max(0, geom.y(-down) - y0)} fill={bridgeColor(id)} fillOpacity={0.55} />);
                    }
                    return parts;
                  })}
                  {i % geom.labelEvery === 0 && (
                    <text x={geom.x(i) + geom.barW / 2} y={H - 6} textAnchor="middle" className="fill-muted-foreground" fontSize={10}>
                      {day(d.date, rows.length > 120 || weekly ? 'MMM yyyy' : 'MMM d')}
                    </text>
                  )}
                </g>
              );
            })}
            <path d={linePath} fill="none" stroke="currentColor" strokeWidth={1.5} className="text-foreground" />
          </svg>
        )}
      </div>
    </div>
  );
}

// Where money came from (left) and went to (right), through Avalanche in the middle.
// Band widths are dollars; the top chains each side are named and the rest grouped.
const SANKEY_TOP = 8;
type SideNode = { key: string; name: string; value: number; l1: boolean; bridges: { id: string; value: number }[] };

function sideNodes(summary: BridgeSummary, side: 'in' | 'out'): SideNode[] {
  const pick = (c: { inflow_usd: number; outflow_usd: number }) => (side === 'in' ? c.inflow_usd : c.outflow_usd);
  const rows = summary.by_chain.filter((c) => pick(c) > 0).sort((a, b) => pick(b) - pick(a));
  const node = (c: BridgeSummary['by_chain'][number]): SideNode => ({
    key: c.chain,
    name: c.name,
    value: pick(c),
    l1: c.avalanche_l1,
    bridges: (c.bridges ?? [])
      .map((b) => ({ id: b.id, value: side === 'in' ? b.inflow_usd : b.outflow_usd }))
      .filter((b) => b.value > 0)
      .sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id)),
  });
  const top = rows.slice(0, SANKEY_TOP).map(node);
  const rest = rows.slice(SANKEY_TOP);
  if (rest.length) {
    top.push({ key: `others-${side}`, name: rest.length === 1 ? `1 other` : `${rest.length} others`, value: rest.reduce((a, c) => a + pick(c), 0), l1: false, bridges: [] });
  }
  return top;
}

// Brand colours for the chains that bridge the most; the rest get neutral greys,
// as on the Overview flows. Avalanche keeps its red, the one place it appears.
const CHAIN_COLOR: Record<string, string> = {
  ethereum: '#627eea',
  base: '#2f6bff',
  solana: '#9945ff',
  arbitrum: '#28a0f0',
  polygon: '#8247e5',
  monad: '#836ef9',
  bitcoin: '#f7931a',
  hyperliquid: '#5fd8c6',
  sui: '#4da2ff',
  bsc: '#f0b90b',
  optimism: '#d0d4dc',
  aptos: '#c9c9c9',
};
const NEUTRALS = ['#94a3b8', '#64748b', '#a1a1aa', '#71717a', '#9ca3af', '#6b7280'];
const AVALANCHE_RED = '#e84142';
function chainColor(key: string): string {
  if (CHAIN_COLOR[key]) return CHAIN_COLOR[key];
  const hash = key.split('').reduce((a, c) => c.charCodeAt(0) + ((a << 5) - a), 0);
  return NEUTRALS[Math.abs(hash) % NEUTRALS.length];
}

function FlowSankey({ summary, state, names }: { summary: BridgeSummary | null; state: 'loading' | 'ready' | 'error'; names: Record<string, string> }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)', false);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const layout = useMemo(() => {
    if (!summary || !box) return null;
    const left = sideNodes(summary, 'in');
    const right = sideNodes(summary, 'out');
    const totalIn = left.reduce((a, n) => a + n.value, 0);
    const totalOut = right.reduce((a, n) => a + n.value, 0);
    if (totalIn + totalOut <= 0) return null;
    const W = box.w;
    const H = Math.max(box.h, 240);
    const pad = { top: 24, bottom: 8 };
    const labelW = Math.min(170, W * 0.18);
    const nodeW = 12;
    const gap = 8;
    const xL = labelW;
    const xR = W - labelW - nodeW;
    const midW = 22;
    const xM = W / 2 - midW / 2;
    // One scale for both sides, so the larger side fills the height and band widths compare.
    const maxN = Math.max(left.length, right.length);
    const scale = (H - pad.top - pad.bottom - gap * (maxN - 1)) / Math.max(totalIn, totalOut);
    const stack = (nodes: SideNode[]) => {
      const used = nodes.reduce((a, n) => a + Math.max(1.5, n.value * scale), 0) + gap * (nodes.length - 1);
      let y = pad.top + (H - pad.top - pad.bottom - used) / 2;
      return nodes.map((n) => {
        const h = Math.max(1.5, n.value * scale);
        const out = { ...n, y, h, color: n.key.startsWith('others') ? '#6b7280' : chainColor(n.key) };
        y += h + gap;
        return out;
      });
    };
    const L = stack(left);
    const R = stack(right);
    const midH = Math.max(totalIn, totalOut) * scale;
    const midY = pad.top + (H - pad.top - pad.bottom - midH) / 2;
    // Each link is a stroked centre line, wide as its dollars, entering and leaving
    // the middle in the same order as the chains.
    let inY = midY + (midH - totalIn * scale) / 2;
    let outY = midY + (midH - totalOut * scale) / 2;
    const curve = (x0: number, y0: number, x1: number, y1: number) => {
      const cx = (x0 + x1) / 2;
      return `M${x0},${y0} C${cx},${y0} ${cx},${y1} ${x1},${y1}`;
    };
    const links = [
      ...L.map((n) => {
        const w = n.value * scale;
        const l = { id: `in-${n.key.replace(/[^\w-]/g, '_')}`, chain: n.key, d: curve(xL + nodeW, n.y + w / 2, xM, inY + w / 2), w, x0: xL + nodeW, x1: xM, from: n.color, to: AVALANCHE_RED, value: n.value };
        inY += w;
        return l;
      }),
      ...R.map((n) => {
        const w = n.value * scale;
        const l = { id: `out-${n.key.replace(/[^\w-]/g, '_')}`, chain: n.key, d: curve(xM + midW, outY + w / 2, xR, n.y + w / 2), w, x0: xM + midW, x1: xR, from: AVALANCHE_RED, to: n.color, value: n.value };
        outY += w;
        return l;
      }),
    ];
    const total = totalIn + totalOut;
    const byChain = new Map(summary.by_chain.map((c) => [c.chain, c]));
    return { W, H, L, R, links, xL, xR, xM, midW, midY, midH, nodeW, totalIn, totalOut, total, byChain };
  }, [summary, box]);

  const focus = hover ? layout?.byChain.get(hover) : null;
  const split = (focus?.bridges ?? []).filter((b) => b.inflow_usd + b.outflow_usd > 0);
  return (
    <div className="h-full flex flex-col">
      {layout && (
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 mb-2">
          <div>
            <div className="num text-[22px] leading-7 font-medium text-foreground">
              {focus ? `${signedUsd(focus.net_usd)} net` : `${signedUsd(layout.totalIn - layout.totalOut)} net`}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {focus
                ? `${focus.name}: ${usd(focus.inflow_usd)} came from it, ${usd(focus.outflow_usd)} went to it`
                : `${usd(layout.totalIn)} came in from the chains on the left, ${usd(layout.totalOut)} went out to those on the right`}
            </div>
          </div>
          {split.length > 0 ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
              {split.map((b) => (
                <span key={b.id} className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ background: bridgeColor(b.id) }} />
                  {names[b.id] ?? b.id}
                  <span className="num text-foreground">
                    {usd(b.inflow_usd)} / {usd(b.outflow_usd)}
                  </span>
                </span>
              ))}
            </div>
          ) : (
            <div className="text-[11px] text-muted-foreground">Hover a chain to see its net flow{summary?.by_chain.some((c) => c.bridges) ? ' and bridges' : ''}</div>
          )}
        </div>
      )}
      <div ref={boxRef} className={`relative flex-1 min-h-0 overflow-hidden ${state === 'loading' && summary ? 'opacity-50' : ''}`}>
        {!layout ? (
          <div className={`absolute inset-0 rounded flex items-center justify-center text-[12px] text-muted-foreground ${state === 'loading' ? 'bg-muted/50 animate-pulse' : ''}`}>
            {state === 'error' ? "Bridge flows couldn't be loaded. Try again in a minute." : summary && box ? 'No priced bridge transfers in this period.' : ''}
          </div>
        ) : (
          <svg width={layout.W} height={layout.H} className="absolute inset-0 block" role="img" aria-label="Bridge flows by chain: inflow sources on the left, outflow destinations on the right">
            <defs>
              {layout.links.map((l) => (
                <linearGradient key={l.id} id={`bf-${l.id}`} gradientUnits="userSpaceOnUse" x1={l.x0} x2={l.x1} y1={0} y2={0}>
                  <stop offset="0%" stopColor={l.from} />
                  <stop offset="100%" stopColor={l.to} />
                </linearGradient>
              ))}
            </defs>
            {layout.links.map((l) => {
              const on = hover === l.chain;
              const dim = hover != null && !on;
              return (
                <path
                  key={l.id}
                  d={l.d}
                  fill="none"
                  stroke={`url(#bf-${l.id})`}
                  strokeWidth={Math.max(1.5, l.w)}
                  strokeOpacity={on ? 0.75 : dim ? 0.08 : 0.42}
                  style={{ transition: 'stroke-opacity 0.25s ease' }}
                  onPointerEnter={(e) => e.pointerType === 'mouse' && !l.chain.startsWith('others') && setHover(l.chain)}
                  onPointerLeave={(e) => e.pointerType === 'mouse' && setHover(null)}
                  onClick={() => !l.chain.startsWith('others') && setHover((h) => (h === l.chain ? null : l.chain))}
                />
              );
            })}
            {/* Particles travel each link, more of them on the larger ones, like the Overview flows. */}
            {!reduced &&
              layout.links.map((l) => {
                const n = Math.min(6, Math.max(1, Math.round((l.value / layout.total) * 24)));
                const dim = hover != null && hover !== l.chain;
                return Array.from({ length: n }, (_, k) => {
                  const dur = 3.2 + ((k * 7 + l.id.length) % 5) * 0.45;
                  return (
                    <circle key={`${l.id}-p${k}`} r={2.4} className="fill-foreground" opacity={dim ? 0.15 : 0.9} pointerEvents="none">
                      <animateMotion dur={`${dur}s`} begin={`${-(k * dur) / n}s`} repeatCount="indefinite" path={l.d} />
                    </circle>
                  );
                });
              })}
            {/* Avalanche in the middle, in its red */}
            <rect x={layout.xM} y={layout.midY} width={layout.midW} height={layout.midH} rx={3} fill={AVALANCHE_RED} />
            <text x={layout.xM + layout.midW / 2} y={layout.midY - 10} textAnchor="middle" className="fill-foreground" fontSize={12} fontWeight={600}>
              Avalanche C-Chain
            </text>
            {[...layout.L.map((n) => ({ ...n, side: 'in' as const })), ...layout.R.map((n) => ({ ...n, side: 'out' as const }))].map((n) => {
              const x = n.side === 'in' ? layout.xL : layout.xR;
              const dim = hover != null && hover !== n.key;
              return (
                <g
                  key={`${n.side}-${n.key}`}
                  opacity={dim ? 0.35 : 1}
                  style={{ transition: 'opacity 0.25s ease', cursor: n.key.startsWith('others') ? 'default' : 'pointer' }}
                  onPointerEnter={(e) => e.pointerType === 'mouse' && !n.key.startsWith('others') && setHover(n.key)}
                  onPointerLeave={(e) => e.pointerType === 'mouse' && setHover(null)}
                  // Tap to select on touch, tap again to clear; Tab moves through chains with the keyboard.
                  onClick={() => !n.key.startsWith('others') && setHover((h) => (h === n.key ? null : n.key))}
                  {...(n.key.startsWith('others')
                    ? {}
                    : {
                        tabIndex: 0,
                        role: 'button',
                        'aria-label': `${n.name}: ${usd(n.value)} ${n.side === 'in' ? 'came from it' : 'went to it'}`,
                        onFocus: () => setHover(n.key),
                        onBlur: () => setHover(null),
                      })}
                >
                  <rect x={x} y={n.y} width={layout.nodeW} height={n.h} rx={2} fill={n.color} />
                  {n.h + 8 >= 12 && <text
                    x={n.side === 'in' ? x - 8 : x + layout.nodeW + 8}
                    y={n.y + n.h / 2}
                    textAnchor={n.side === 'in' ? 'end' : 'start'}
                    dominantBaseline="middle"
                    fontSize={11}
                  >
                    <tspan className="fill-foreground">{n.name}</tspan>
                    <tspan className="num fill-muted-foreground" dx={6}>{usd(n.value)}</tspan>
                    {n.l1 && <tspan className="fill-muted-foreground" dx={6} fontSize={9}>L1</tspan>}
                  </text>}
                </g>
              );
            })}
          </svg>
        )}
      </div>
    </div>
  );
}

// The Sankey's two sides as ranked lists, for phones.
function FlowLists({ summary }: { summary: BridgeSummary | null }) {
  if (!summary) return <div className="h-full rounded bg-muted/50 animate-pulse" />;
  const sides = [
    { title: 'Came from', nodes: sideNodes(summary, 'in') },
    { title: 'Went to', nodes: sideNodes(summary, 'out') },
  ];
  return (
    <div className="h-full overflow-y-auto grid grid-cols-1 gap-4">
      {sides.map((side) => {
        const max = Math.max(...side.nodes.map((n) => n.value), 1);
        return (
          <div key={side.title}>
            <div className="text-[12px] font-medium text-foreground mb-1.5">{side.title}</div>
            <ul className="space-y-1.5">
              {side.nodes.map((n) => (
                <li key={n.key} className="text-[12px]">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-foreground truncate">{n.name}</span>
                    <span className="num text-muted-foreground">{usd(n.value)}</span>
                  </div>
                  <div className="h-1.5 mt-1 rounded-sm bg-muted overflow-hidden">
                    <div className="h-full bg-foreground/60" style={{ width: `${(n.value / max) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-border bg-card">
      <header className="px-4 sm:px-5 pt-4 pb-3">
        <h2 className="text-[14px] font-semibold text-foreground">{title}</h2>
        {subtitle && <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>}
      </header>
      {children}
    </section>
  );
}

function Skeleton({ rows = 4 }: { rows?: number }) {
  return <div className="px-5 pb-5 space-y-2">{Array.from({ length: rows }, (_, i) => <div key={i} className="h-8 rounded bg-muted/50 animate-pulse" />)}</div>;
}

// A pair of bars on one scale: inflow to the right of the centre, outflow to the left.
function FlowBars({ inflow, outflow, max }: { inflow: number; outflow: number; max: number }) {
  const w = (v: number) => `${max > 0 ? Math.max(v > 0 ? 2 : 0, (v / max) * 100) : 0}%`;
  return (
    <span className="flex w-28 h-2" aria-hidden>
      <span className="flex-1 flex justify-end">
        <span className="h-full rounded-l-sm bg-foreground/35" style={{ width: w(outflow) }} />
      </span>
      <span className="w-px h-3 -mt-0.5 bg-border" />
      <span className="flex-1">
        <span className="block h-full rounded-r-sm bg-foreground/70" style={{ width: w(inflow) }} />
      </span>
    </span>
  );
}

const netClass = (v: number) => (Math.abs(v) < 1 ? 'text-muted-foreground' : v > 0 ? 'text-up' : 'text-down');

function ChainTable({ summary, state }: { summary: BridgeSummary | null; state: 'loading' | 'ready' | 'error' }) {
  const rows = (summary?.by_chain ?? []).filter((c) => c.inflow_usd + c.outflow_usd > 0).slice(0, 14);
  const max = Math.max(...rows.map((c) => Math.max(c.inflow_usd, c.outflow_usd)), 1);
  return (
    <Card title="By chain" subtitle="Where money came from and went to. The bar shows outflow on the left and inflow on the right.">
      {state === 'error' && !summary ? (
        <p className="px-5 pb-5 text-[12px] text-muted-foreground">Couldn't be loaded. Try again in a minute.</p>
      ) : !summary ? (
        <Skeleton rows={6} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px] whitespace-nowrap">
            <thead>
              <tr className="border-y border-border text-[11px] text-muted-foreground">
                <th className="text-left font-normal px-4 sm:px-5 py-2">Chain</th>
                <th className="text-right font-normal px-3 py-2">In</th>
                <th className="text-right font-normal px-3 py-2">Out</th>
                <th className="text-right font-normal px-3 py-2">Net</th>
                <th className="hidden sm:table-cell px-4 sm:px-5 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((c) => (
                <tr key={c.chain}>
                  <td className="px-4 sm:px-5 py-2.5 text-[13px] font-medium text-foreground">
                    {c.name}
                    {c.avalanche_l1 && <span className="ml-2 text-[10px] font-normal text-muted-foreground">Avalanche L1</span>}
                  </td>
                  <td className="num text-right px-3 py-2.5 text-foreground">{usd(c.inflow_usd)}</td>
                  <td className="num text-right px-3 py-2.5 text-foreground">{usd(c.outflow_usd)}</td>
                  <td className={`num text-right px-3 py-2.5 ${netClass(c.net_usd)}`}>{signedUsd(c.net_usd)}</td>
                  <td className="hidden sm:table-cell px-4 sm:px-5 py-2.5">
                    <FlowBars inflow={c.inflow_usd} outflow={c.outflow_usd} max={max} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function BridgeTable({ summary, state }: { summary: BridgeSummary | null; state: 'loading' | 'ready' | 'error' }) {
  const rows = [...(summary?.by_bridge ?? [])].sort((a, b) => b.inflow_usd + b.outflow_usd - (a.inflow_usd + a.outflow_usd));
  return (
    <Card title="By bridge">
      {state === 'error' && !summary ? (
        <p className="px-5 pb-5 text-[12px] text-muted-foreground">Couldn't be loaded. Try again in a minute.</p>
      ) : !summary ? (
        <Skeleton />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px] whitespace-nowrap">
            <thead>
              <tr className="border-y border-border text-[11px] text-muted-foreground">
                <th className="text-left font-normal px-4 sm:px-5 py-2">Bridge</th>
                <th className="text-right font-normal px-3 py-2">In</th>
                <th className="text-right font-normal px-3 py-2">Out</th>
                <th className="text-right font-normal px-3 py-2">Net</th>
                <th className="text-right font-normal px-4 sm:px-5 py-2">Transfers</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((b) => (
                <tr key={b.id}>
                  <td className="px-4 sm:px-5 py-2.5">
                    <span className="inline-flex items-center gap-2 text-[13px] font-medium text-foreground">
                      <span className="w-2 h-2 rounded-[2px]" style={{ background: bridgeColor(b.id) }} aria-hidden />
                      {b.name}
                    </span>
                  </td>
                  <td className="num text-right px-3 py-2.5 text-foreground">{usd(b.inflow_usd)}</td>
                  <td className="num text-right px-3 py-2.5 text-foreground">{usd(b.outflow_usd)}</td>
                  <td className={`num text-right px-3 py-2.5 ${netClass(b.net_usd)}`}>{signedUsd(b.net_usd)}</td>
                  <td className="num text-right px-4 sm:px-5 py-2.5 text-muted-foreground">{b.transfers.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function TokenTable({ summary, state }: { summary: BridgeSummary | null; state: 'loading' | 'ready' | 'error' }) {
  const rows = (summary?.by_token ?? []).filter((x) => x.priced && x.inflow_usd + x.outflow_usd > 0).slice(0, 8);
  return (
    <Card title="By token" subtitle="Tokens with a price. Others are counted in transfers but add no dollars.">
      {state === 'error' && !summary ? (
        <p className="px-5 pb-5 text-[12px] text-muted-foreground">Couldn't be loaded. Try again in a minute.</p>
      ) : !summary ? (
        <Skeleton />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px] whitespace-nowrap">
            <thead>
              <tr className="border-y border-border text-[11px] text-muted-foreground">
                <th className="text-left font-normal px-4 sm:px-5 py-2">Token</th>
                <th className="text-right font-normal px-3 py-2">In</th>
                <th className="text-right font-normal px-3 py-2">Out</th>
                <th className="text-right font-normal px-4 sm:px-5 py-2">Net</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((x) => (
                <tr key={x.token}>
                  <td className="num px-4 sm:px-5 py-2.5 text-[13px] text-foreground">{x.symbol}</td>
                  <td className="num text-right px-3 py-2.5 text-foreground">{usd(x.inflow_usd)}</td>
                  <td className="num text-right px-3 py-2.5 text-foreground">{usd(x.outflow_usd)}</td>
                  <td className={`num text-right px-4 sm:px-5 py-2.5 ${netClass(x.net_usd)}`}>{signedUsd(x.net_usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// A base-unit amount in whole tokens, compact; without decimals there's no honest number.
function tokenAmount(amount: string, decimals: number | null): string {
  if (decimals == null) return '';
  try {
    const big = BigInt(amount);
    const scale = 10n ** BigInt(Math.max(0, decimals - 2));
    return compact(Number(big / scale) / 100);
  } catch {
    return '';
  }
}

function TransferList({ title, items, state, names, empty }: {
  title: string;
  items: BridgeTransfer[] | null;
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
        <div className="px-4 sm:px-5 pb-4 text-[12px] text-muted-foreground">Couldn't be loaded. Try again in a minute.</div>
      ) : !items?.length ? (
        <div className="px-4 sm:px-5 pb-4 text-[12px] text-muted-foreground">{empty}</div>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((x, i) => (
            <li key={`${x.tx_hash}-${x.direction}-${x.token}-${i}`} className="px-4 sm:px-5 py-2 flex items-center justify-between gap-3">
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-[12px] text-foreground">
                  <span className="w-2 h-2 rounded-[2px] shrink-0" style={{ background: bridgeColor(x.bridge) }} aria-hidden />
                  <span className="truncate">
                    <span className="num">{x.symbol}</span> {x.direction === 'in' ? `from ${x.chain_name}` : `to ${x.chain_name}`}
                    {x.passthrough && <span className="text-muted-foreground"> (passed straight through)</span>}
                  </span>
                </span>
                <span className="block text-[11px] text-muted-foreground">
                  {/* UTC, like the daily bars: format the timestamp's own digits, not local time. */}
                  {names[x.bridge] ?? x.bridge}
                  {x.via ? ` via ${x.via.toUpperCase()}` : ''}, {format(parseISO(x.time.slice(0, 19)), 'MMM d, yyyy HH:mm')} UTC
                </span>
              </span>
              <a
                href={`https://snowtrace.io/tx/${x.tx_hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className={`num shrink-0 text-[13px] hover:underline underline-offset-2 decoration-border ${x.direction === 'in' ? 'text-foreground' : 'text-muted-foreground'}`}
                title="Open the transaction"
              >
                {x.direction === 'in' ? '+' : '−'}
                {x.usd != null ? `$${compact(x.usd)}` : `${tokenAmount(x.amount, x.decimals)} ${x.symbol}`}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
