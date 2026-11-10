import { useEffect, useMemo, useRef, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { SEO } from '../components/SEO';
import { PAGE_SEO } from '../utils/pageSeo';
import { Delta, PairLogos, ProtocolLogo, SegmentedControl, Sparkline, StatStrip } from '../components/instrument';
import type { StatItem } from '../components/instrument';
import { SectionErrorBoundary } from '../components/SectionErrorBoundary';
import { getDexPools, getDexSummary, getDexTimeseries } from '../api';
import type { DexDay, DexPool, DexSummary } from '../api';
import { WEEKLY_AFTER_DAYS, weekStart } from '../utils/weeks';
import { chartPointerProps } from '../utils/chartPointer';

// Close to each DEX's brand so it's recognised without the legend. Pharaoh's red
// is toned to orange, because red means a drop on L1Beat; its two versions share
// the hue. Pangolin's gold would clash with Blackhole's, so it is grey. Older
// versions of a DEX share its hue at half strength.
const DEX_STYLE: Record<string, { color: string; opacity: number }> = {
  'pharaoh-v3': { color: '#d95926', opacity: 1 },
  'pharaoh-dlmm': { color: '#d95926', opacity: 0.5 },
  'uniswap-v3': { color: '#e8508f', opacity: 1 },
  'blackhole-clmm': { color: '#d4a017', opacity: 1 },
  lfj: { color: '#6366f1', opacity: 1 },
  'lfj-v1': { color: '#6366f1', opacity: 0.5 },
  'pangolin-v3': { color: '#6b7280', opacity: 1 },
  'pangolin-v2': { color: '#6b7280', opacity: 0.5 },
  'sushiswap-v2': { color: '#8b5cf6', opacity: 1 },
};
const dexStyle = (id: string) => DEX_STYLE[id] ?? { color: '#6b7280', opacity: 1 };
// Stack order, bottom to top: largest venues sit on the baseline.
const STACK = ['pharaoh-v3', 'pharaoh-dlmm', 'uniswap-v3', 'blackhole-clmm', 'lfj', 'lfj-v1', 'pangolin-v3', 'pangolin-v2', 'sushiswap-v2'];

// Each protocol in its lead version's color, for views that merge versions.
const PROTOCOL_COLOR: Record<string, string> = {
  pharaoh: '#d95926',
  uniswap: '#e8508f',
  blackhole: '#d4a017',
  lfj: '#6366f1',
  pangolin: '#6b7280',
  sushiswap: '#8b5cf6',
};

const PROTOCOL_LABEL: Record<string, string> = {
  pharaoh: 'Pharaoh',
  uniswap: 'Uniswap',
  blackhole: 'Blackhole',
  lfj: 'LFJ',
  pangolin: 'Pangolin',
  sushiswap: 'SushiSwap',
};

const RANGES = [
  { value: '30', label: '30d' },
  { value: '90', label: '90d' },
  { value: '365', label: '1y' },
  { value: '3650', label: 'All' },
] as const;
const WINDOWS = [
  { value: '1', label: '1d' },
  { value: '7', label: '7d' },
  { value: '30', label: '30d' },
] as const;

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
const pct = (v: number, digits = 0) => `${v.toFixed(digits)}%`;
const day = (d: string | null | undefined, f = 'MMM d') => (d ? format(parseISO(d), f) : '—');
// "Aug 12 to Nov 9", with years once the range crosses into a new year.
const span = (from: string, to: string) =>
  from.slice(0, 4) === to.slice(0, 4) ? `${day(from)} to ${day(to)}` : `${day(from, 'MMM d, yyyy')} to ${day(to, 'MMM d, yyyy')}`;

function useLoad<T>(load: () => Promise<T | null>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  useEffect(() => {
    let alive = true;
    setState('loading');
    load().then((r) => {
      if (!alive) return;
      setData(r);
      setState(r ? 'ready' : 'error');
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, state };
}

export function Dex() {
  const [range, setRange] = useState<'30' | '90' | '365' | '3650'>('90');
  const [win, setWin] = useState<'1' | '7' | '30'>('30');
  // A DEX picked in the legend or the table; its part of every bar is highlighted.
  const [focus, setFocus] = useState<string | null>(null);
  const toggleFocus = (id: string) => setFocus((f) => (f === id ? null : id));
  const series = useLoad(() => getDexTimeseries(Number(range)), [range]);
  const summary = useLoad(() => getDexSummary(Number(win)), [win]);
  // The headline describes the chart's range.
  // The server clamps "All" (3650 days) to the first tracked day.
  const month = useLoad(() => getDexSummary(Number(range)), [range]);
  // Twice the table window, so each DEX's previous window is the difference.
  const doubled = useLoad(() => getDexSummary(Number(win) * 2), [win]);
  // Thirty days of daily volume for the table's trend lines, whatever the window.
  const trend = useLoad(() => getDexTimeseries(30), []);

  const m = month.data;
  // From the loaded data, so the label never runs ahead of the numbers while a new range loads.
  // Reads after "traded $X": "since June 2023", "in the last year", "in the last 90 days".
  const rangeLabel = !m
    ? ''
    : m.days > 365
      ? `since ${m.from ? format(parseISO(m.from), 'MMMM yyyy') : 'tracking began'}`
      : m.days === 365
        ? 'in the last year'
        : `in the last ${m.days} days`;
  // The protocol with the most volume in the window, all its versions together.
  const lead = (() => {
    if (!m || m.totals.volume_usd <= 0) return null;
    const byProtocol = new Map<string, number>();
    for (const d of m.dexes) byProtocol.set(d.protocol, (byProtocol.get(d.protocol) ?? 0) + d.volume_usd);
    const [protocol, volume] = [...byProtocol].sort((a, b) => b[1] - a[1])[0] ?? [];
    if (!protocol || !volume) return null;
    return { name: PROTOCOL_LABEL[protocol] ?? protocol, share: (volume / m.totals.volume_usd) * 100 };
  })();

  const t = m?.totals;
  const stats: StatItem[] = t
    ? [
        { label: 'Volume', value: usd(t.volume_usd), sub: `${rangeLabel.replace('in the ', '')}, to ${day(m?.as_of)}` },
        { label: 'Swaps', value: compact(t.swaps), sub: t.volume_usd > 0 ? `$${compact(t.volume_usd / Math.max(1, t.swaps))} average` : ' ' },
        {
          label: 'Addresses trading',
          value: compact(t.unique_addresses),
          sub: 'bots included',
          tooltip: 'Distinct addresses that sent a swap transaction, counted once across all DEXes. Arbitrage and MEV bots are included and make many of the swaps.',
        },
        {
          label: 'Priced',
          value: t.priced_share != null ? pct(t.priced_share * 100, 1) : '—',
          sub: 'of swaps valued in USD',
          tooltip: 'A swap is valued when one side is a USD stablecoin, at $1, or WAVAX, at that hour’s AVAX price. Other swaps are counted but add no volume.',
        },
      ]
    : ['Volume', 'Swaps', 'Addresses trading', 'Priced'].map((label) => ({ label, value: '—', sub: month.state === 'error' ? 'Unavailable' : ' ' }));

  return (
    <div>
      <SEO {...PAGE_SEO.trading} />

      {/* Hero in the shared page frame: the chart fills the stage and the KPIs
          float over its foot from md up. */}
      <section
        className="relative border-b border-border bg-stage h-[600px] md:h-[min(calc(100vh-48px),1200px)] md:min-h-[600px]"
        aria-label="Daily DEX volume"
      >
        <div className="absolute inset-0 flex flex-col">
          <div className="max-w-7xl 2xl:max-w-screen-2xl w-full mx-auto px-4 sm:px-6 pt-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-[18px] leading-6 font-semibold text-foreground">Trading</h1>
              {m ? (
                <>
                  <p className="mt-2 text-[26px] sm:text-[34px] leading-tight font-medium text-foreground max-w-4xl">
                    Avalanche's main DEXes traded <span className="tabular-nums">{usd(m.totals.volume_usd)}</span> {rangeLabel}.
                  </p>
                  <p className="mt-1.5 text-[15px] sm:text-[17px] leading-snug text-foreground/80 max-w-3xl">
                    {lead && (
                      <>{lead.name} handled <span className="num">{pct(lead.share)}</span> of it, across </>
                    )}
                    <span className="num">{compact(m.totals.swaps)}</span> swaps from <span className="num">{compact(m.totals.unique_addresses)}</span> addresses.
                  </p>
                  <p className="mt-1.5 text-[12px] text-muted-foreground max-w-2xl">
                    Counts LFJ, Pharaoh, Blackhole, Uniswap V3, Pangolin and SushiSwap, including their older versions. Smaller
                    venues, about 5% of the volume, aren't tracked yet.
                  </p>
                </>
              ) : month.state === 'error' && !m ? (
                <p className="mt-3 text-[13px] text-muted-foreground">DEX volume couldn't be loaded. Try again in a minute.</p>
              ) : (
                <div className="mt-3 h-9 w-[min(560px,80vw)] rounded bg-muted animate-pulse" />
              )}
            </div>
            <div className="self-start shrink-0">
              <SegmentedControl size="xs" value={range} options={RANGES} onChange={setRange} ariaLabel="Chart range" />
            </div>
          </div>

          <div className="relative flex-1 min-h-0 mx-4 sm:mx-6 lg:mx-10 mt-4 mb-4 md:mb-[128px]">
            <SectionErrorBoundary label="the daily volume chart">
              <VolumeChart days={series.data} state={series.state} names={Object.fromEntries((m?.dexes ?? []).map((d) => [d.id, d.name]))} focus={focus} onFocus={toggleFocus} />
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
        <div className="flex items-center justify-between gap-3 pt-1">
          <h2 className="text-[14px] font-semibold text-foreground">
            {summary.data?.days === 1 ? `${day(summary.data?.as_of, 'MMM d, yyyy')}` : `${day(summary.data?.from)} to ${day(summary.data?.as_of)}`}
          </h2>
          <SegmentedControl size="xs" value={win} options={WINDOWS} onChange={setWin} ariaLabel="Table window" />
        </div>

        <SectionErrorBoundary label="the DEX table">
          <VenueTable
            summary={summary.data}
            doubled={doubled.data}
            trend={trend.data}
            state={summary.state}
            focus={focus}
            onFocus={toggleFocus}
          />
        </SectionErrorBoundary>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
          <div className="lg:col-span-2 min-w-0">
            <SectionErrorBoundary label="the top pools">
              <PoolsTable days={win} total={summary.data?.totals.volume_usd ?? 0} />
            </SectionErrorBoundary>
          </div>
          <div className="space-y-5 min-w-0">
            <SectionErrorBoundary label="the protocol shares">
              <ProtocolShare summary={summary.data} state={summary.state} />
            </SectionErrorBoundary>
            <SectionErrorBoundary label="the swap sizes">
              <SwapSize summary={summary.data} state={summary.state} />
            </SectionErrorBoundary>
          </div>
        </div>

        <p className="text-[11px] leading-relaxed text-muted-foreground max-w-4xl">
          Indexed from every swap on the C-Chain, counting only pools created by each DEX's own factory. Each swap counts once,
          valued by its stablecoin or WAVAX side. Days are complete UTC days. Uniswap V4, WOOFi, DODO and a few smaller venues,
          about 5% of Avalanche DEX volume, aren't tracked yet.
        </p>
      </div>
    </div>
  );
}

const M = { top: 10, right: 8, bottom: 24, left: 48 };

/**
 * Sums days into Sunday-start weeks; each week is dated by its Sunday. `daysIn`
 * counts the days a week holds, so the first and last can be marked as partial.
 */
function toWeeks(days: DexDay[]): (DexDay & { daysIn: number })[] {
  const out = new Map<string, DexDay & { daysIn: number }>();
  for (const d of days) {
    const key = weekStart(d.date);
    const w = out.get(key) ?? { date: key, volume_usd: 0, swaps: 0, dexes: [], daysIn: 0 };
    w.daysIn += 1;
    w.volume_usd += d.volume_usd;
    w.swaps += d.swaps;
    for (const x of d.dexes) {
      const e = w.dexes.find((y) => y.id === x.id);
      if (e) {
        e.volume_usd += x.volume_usd;
        e.swaps += x.swaps;
      } else w.dexes.push({ ...x });
    }
    out.set(key, w);
  }
  return [...out.values()];
}

function VolumeChart({ days: dailyDays, state, names, focus, onFocus }: {
  days: DexDay[] | null;
  state: 'loading' | 'ready' | 'error';
  names: Record<string, string>;
  focus: string | null;
  onFocus: (id: string) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const weekly = (dailyDays?.length ?? 0) > WEEKLY_AFTER_DAYS;
  const days: (DexDay & { daysIn?: number })[] | null = useMemo(() => (dailyDays && weekly ? toWeeks(dailyDays) : dailyDays), [dailyDays, weekly]);
  const partial = (d: { daysIn?: number }) => weekly && d.daysIn != null && d.daysIn < 7;
  // Averages stay per day, whichever way the bars are grouped.
  const dayCount = Math.max(dailyDays?.length ?? 1, 1);
  const when = (d: { date: string; daysIn?: number }) =>
    weekly
      ? `Week of ${day(d.date, 'MMM d, yyyy')}${partial(d) ? ` (partial, ${d.daysIn} ${d.daysIn === 1 ? 'day' : 'days'})` : ''}`
      : day(d.date, 'EEE, MMM d, yyyy');
  const svgRef = useRef<SVGSVGElement>(null);
  // Drawn at the stage's own pixel size, so text stays crisp at any width or height.
  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const W = Math.max(box?.w ?? 0, 300);
  const H = Math.max(box?.h ?? 0, 160);

  const geom = useMemo(() => {
    if (!days?.length) return null;
    const peak = Math.max(...days.map((d) => d.volume_usd), 1);
    const raw = peak / 4;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const tick = ([1, 2, 2.5, 5, 10].find((k) => k * mag >= raw) ?? 10) * mag;
    const maxY = Math.ceil(peak / tick) * tick;
    const ticks = Array.from({ length: Math.round(maxY / tick) + 1 }, (_, i) => i * tick);
    const iw = W - M.left - M.right;
    const ih = H - M.top - M.bottom;
    const slot = iw / days.length;
    const barW = Math.max(1, slot * (days.length > 120 ? 0.9 : 0.72));
    const x = (i: number) => M.left + slot * i + (slot - barW) / 2;
    const y = (v: number) => M.top + ih - (v / maxY) * ih;
    const labelEvery = Math.ceil(days.length / (W < 600 ? 4 : 8));
    return { x, y, barW, slot, floor: M.top + ih, ticks, labelEvery };
  }, [days, W, H]);

  const total = days?.reduce((s, d) => s + d.volume_usd, 0) ?? 0;
  const active = hover != null && days ? days[hover] : null;
  // Known venues in a fixed order, then any new ones the API adds, so bars always sum to the day's total.
  const seen = [...new Set((days ?? []).flatMap((d) => d.dexes.filter((x) => x.volume_usd > 0).map((x) => x.id)))];
  const ids = [...STACK.filter((id) => seen.includes(id)), ...seen.filter((id) => !STACK.includes(id))];
  // The table can pick a DEX this range has no volume for; then show everything as normal.
  const fx = focus && ids.includes(focus) ? focus : null;

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!geom || !svgRef.current || !days) return;
    const rect = svgRef.current.getBoundingClientRect();
    const vx = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.floor((vx - M.left) / geom.slot);
    setHover(i >= 0 && i < days.length ? i : null);
  };

  const vol = (d: DexDay, id: string) => d.dexes.find((x) => x.id === id)?.volume_usd ?? 0;

  return (
    <div className="h-full flex flex-col">
      {days && days.length > 0 && (
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 mb-2">
        <div>
          {fx ? (
            <>
              <div className="num text-[22px] leading-7 font-medium text-foreground">
                {usd(active ? vol(active, fx) : days.reduce((sum, d) => sum + vol(d, fx), 0))}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {names[fx] ?? fx}
                {active
                  ? `, ${when(active)}, ${pct(active.volume_usd > 0 ? (vol(active, fx) / active.volume_usd) * 100 : 0)} of the ${weekly ? 'week' : 'day'}`
                  : `, in total, ${pct(total > 0 ? (days.reduce((sum, d) => sum + vol(d, fx), 0) / total) * 100 : 0)} of all volume; ${usd(days.reduce((sum, d) => sum + vol(d, fx), 0) / dayCount)} a day on average`}
              </div>
            </>
          ) : (
            <>
              <div className="num text-[22px] leading-7 font-medium text-foreground">{usd(active ? active.volume_usd : total)}</div>
              <div className="text-[11px] text-muted-foreground">
                {active ? `${when(active)}, ${active.swaps.toLocaleString()} swaps` : `in total, ${span(dailyDays![0].date, dailyDays![dailyDays!.length - 1].date)}; ${usd(total / dayCount)} a day on average${weekly ? '; bars are weeks' : ''}`}
              </div>
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          {ids.map((id) => {
            const st = dexStyle(id);
            const on = fx === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onFocus(id)}
                aria-pressed={on}
                title={on ? 'Show all DEXes' : `Highlight ${names[id] ?? id}`}
                className={`inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 -mx-1.5 transition-colors hover:bg-accent ${
                  on ? 'bg-accent text-foreground' : fx ? 'opacity-50 hover:opacity-100' : ''
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: st.color, opacity: st.opacity }} />
                {names[id] ?? id}
                {active && <span className="num text-foreground">{usd(vol(active, id))}</span>}
              </button>
            );
          })}
        </div>
      </div>
      )}
      <div ref={boxRef} className="relative flex-1 min-h-0">
      {state === 'loading' && !geom ? (
        <div className="absolute inset-0 rounded bg-muted/50 animate-pulse" />
      ) : !geom || !days || !box ? (
        <div className="absolute inset-0 flex items-center justify-center text-[12px] text-muted-foreground">
          {state === 'error' ? "Daily volume couldn't be loaded. Try again in a minute." : ''}
        </div>
      ) : (
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        className={`absolute inset-0 block ${state === 'loading' ? 'opacity-50' : ''}`}
        {...chartPointerProps({ onMove: handleMove, count: days?.length ?? 0, hover, setHover })}
        role="img"
        aria-label={`${weekly ? 'Weekly' : 'Daily'} volume on tracked Avalanche DEXes over ${dayCount} days, stacked by DEX`}
      >
        {geom.ticks.map((tk) => (
          <g key={tk}>
            <line x1={M.left} x2={W - M.right} y1={geom.y(tk)} y2={geom.y(tk)} stroke="currentColor" strokeOpacity={0.08} />
            <text x={M.left - 8} y={geom.y(tk)} textAnchor="end" dominantBaseline="middle" className="fill-muted-foreground" fontSize={10}>
              {tk === 0 ? '0' : `$${compact(tk)}`}
            </text>
          </g>
        ))}
        {days.map((d, i) => {
          let run = 0;
          return (
            <g key={d.date} opacity={(hover != null && hover !== i ? 0.45 : 1) * (partial(d) ? 0.5 : 1)}>
              {ids.map((id) => {
                const v = vol(d, id);
                if (v <= 0) return null;
                const y0 = geom.y(run);
                run += v;
                const y1 = geom.y(run);
                const st = dexStyle(id);
                const dim = fx != null && fx !== id;
                return <rect key={id} x={geom.x(i)} y={y1} width={geom.barW} height={Math.max(0, y0 - y1)} fill={st.color} fillOpacity={dim ? st.opacity * 0.15 : st.opacity} />;
              })}
              {i % geom.labelEvery === 0 && (
                <text x={geom.x(i) + geom.barW / 2} y={H - 6} textAnchor="middle" className="fill-muted-foreground" fontSize={10}>
                  {day(d.date, days.length > 120 ? 'MMM yyyy' : 'MMM d')}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      )}
      </div>
    </div>
  );
}

function DexName({ id, name, protocol }: { id: string; name: string; protocol: string }) {
  const st = dexStyle(id);
  return (
    <span className="inline-flex items-center gap-2.5 text-[13px] font-medium text-foreground whitespace-nowrap">
      <span className="relative inline-flex">
        <ProtocolLogo protocol={protocol} name={name} size={20} />
        {/* The chart color, so a row can be matched to its band. */}
        <span
          className="absolute -right-1 -bottom-1 w-2 h-2 rounded-[2px] ring-2 ring-card"
          style={{ background: st.color, opacity: st.opacity }}
          aria-hidden
        />
      </span>
      {name}
    </span>
  );
}

function Card({ title, sub, aside, children }: { title: string; sub?: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-border bg-card">
      <header className="px-4 sm:px-5 pt-4 pb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[14px] font-semibold text-foreground">{title}</h2>
          {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
        </div>
        {aside}
      </header>
      {children}
    </section>
  );
}

const Skeleton = ({ rows = 4 }: { rows?: number }) => (
  <div className="px-5 pb-5 space-y-2">{Array.from({ length: rows }, (_, i) => <div key={i} className="h-9 rounded bg-muted/50 animate-pulse" />)}</div>
);
const Failed = ({ what }: { what: string }) => (
  <div className="px-5 py-10 text-center text-[12px] text-muted-foreground">{what} couldn't be loaded. Try again in a minute.</div>
);

function VenueTable({ summary, doubled, trend, state, focus, onFocus }: {
  summary: DexSummary | null;
  doubled: DexSummary | null;
  trend: DexDay[] | null;
  state: 'loading' | 'ready' | 'error';
  focus: string | null;
  onFocus: (id: string) => void;
}) {
  const rows = [...(summary?.dexes ?? [])].sort((a, b) => b.volume_usd - a.volume_usd);
  const total = summary?.totals.volume_usd ?? 0;
  // The doubled window only lines up once both answers are for the same window.
  const prevOk = !!summary && !!doubled && doubled.days === summary.days * 2;
  const prevOf = (id: string, current: number) => {
    if (!prevOk) return null;
    const before = (doubled!.dexes.find((d) => d.id === id)?.volume_usd ?? 0) - current;
    return before > 0 ? ((current - before) / before) * 100 : null;
  };
  const series = (id: string) => (trend ?? []).map((d) => d.dexes.find((x) => x.id === id)?.volume_usd ?? 0);
  const prevLabel = summary?.days === 1 ? 'vs the day before' : `vs the ${summary?.days ?? ''} days before`;
  return (
    <Card title="By DEX" sub="Click a DEX to highlight it on the chart. Addresses are counted per DEX, so the same address can appear under several.">
      {state === 'error' ? (
        <Failed what="DEX totals" />
      ) : !summary ? (
        <Skeleton rows={6} />
      ) : (
        <div className={`overflow-x-auto ${state === 'loading' ? 'opacity-60' : ''}`}>
          <table className="w-full text-[12px] whitespace-nowrap">
            <thead>
              <tr className="border-y border-border text-[11px] text-muted-foreground">
                <th className="text-left font-normal px-4 sm:px-5 py-2">DEX</th>
                <th className="text-right font-normal px-3 py-2">Volume</th>
                <th className="text-right font-normal px-3 py-2" title={prevLabel}>Change</th>
                <th className="text-left font-normal px-3 py-2 w-[26%] hidden md:table-cell">Share</th>
                <th className="text-left font-normal px-3 py-2 hidden sm:table-cell">30 days</th>
                <th className="text-right font-normal px-3 py-2">Swaps</th>
                <th className="text-right font-normal px-3 py-2 hidden lg:table-cell">Addresses</th>
                <th className="text-right font-normal px-4 sm:px-5 py-2 hidden lg:table-cell">Priced</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((d) => {
                const share = total > 0 ? (d.volume_usd / total) * 100 : 0;
                const st = dexStyle(d.id);
                const change = prevOf(d.id, d.volume_usd);
                return (
                  <tr
                    key={d.id}
                    onClick={() => onFocus(d.id)}
                    className={`cursor-pointer transition-colors hover:bg-muted/30 ${focus === d.id ? 'bg-accent/60' : focus ? 'opacity-60' : ''}`}
                    title={focus === d.id ? 'Show all DEXes on the chart' : 'Highlight on the chart'}
                  >
                    <td className="px-4 sm:px-5 py-2.5">
                      <button type="button" aria-pressed={focus === d.id} className="flex text-left" onClick={(e) => { e.stopPropagation(); onFocus(d.id); }}>
                        <DexName id={d.id} name={d.name} protocol={d.protocol} />
                      </button>
                    </td>
                    <td className="num text-right px-3 py-2.5 text-foreground">{usd(d.volume_usd)}</td>
                    <td className="text-right px-3 py-2.5">
                      {change != null ? <Delta value={change} /> : <span className="num text-[11px] text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-2.5 hidden md:table-cell">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-sm bg-muted overflow-hidden">
                          <div className="h-full rounded-sm" style={{ width: `${share}%`, background: st.color, opacity: st.opacity }} />
                        </div>
                        <span className="num w-11 text-right text-muted-foreground">{pct(share, 1)}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 hidden sm:table-cell">
                      <Sparkline data={series(d.id)} width={120} height={22} color={st.color} fill />
                    </td>
                    <td className="num text-right px-3 py-2.5 text-foreground">{compact(d.swaps)}</td>
                    <td className="num text-right px-3 py-2.5 text-foreground hidden lg:table-cell">{compact(d.unique_addresses)}</td>
                    <td className="num text-right px-4 sm:px-5 py-2.5 text-muted-foreground hidden lg:table-cell">
                      {d.priced_share != null && d.swaps > 0 ? pct(d.priced_share * 100, 1) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="px-4 sm:px-5 py-2.5 border-t border-border text-[11px] text-muted-foreground">Change is volume {prevLabel}.</p>
        </div>
      )}
    </Card>
  );
}

/** Every DEX's versions merged into its protocol, as one bar of shares. */
function ProtocolShare({ summary, state }: { summary: DexSummary | null; state: 'loading' | 'ready' | 'error' }) {
  const total = summary?.totals.volume_usd ?? 0;
  const byProtocol = new Map<string, number>();
  for (const d of summary?.dexes ?? []) byProtocol.set(d.protocol, (byProtocol.get(d.protocol) ?? 0) + d.volume_usd);
  const rows = [...byProtocol].map(([id, v]) => ({ id, v, share: total > 0 ? (v / total) * 100 : 0 })).sort((a, b) => b.v - a.v);
  const top = rows[0];
  return (
    <Card title="By protocol" sub="All versions of each DEX together">
      {state === 'error' ? (
        <Failed what="Protocol shares" />
      ) : !summary ? (
        <Skeleton rows={3} />
      ) : (
        <div className={`px-4 sm:px-5 pb-4 ${state === 'loading' ? 'opacity-60' : ''}`}>
          {top && (
            <p className="text-[12px] text-muted-foreground">
              <span className="num text-[22px] leading-7 font-medium text-foreground mr-1.5">{pct(top.share)}</span>
              went through {PROTOCOL_LABEL[top.id] ?? top.id}
            </p>
          )}
          <div className="mt-3 flex h-3 rounded-sm overflow-hidden gap-px bg-muted" role="img" aria-label="Volume share by protocol">
            {rows.map((r) => (
              <div key={r.id} title={`${PROTOCOL_LABEL[r.id] ?? r.id} ${pct(r.share, 1)}`} style={{ width: `${r.share}%`, background: PROTOCOL_COLOR[r.id] ?? '#6b7280' }} />
            ))}
          </div>
          <ul className="mt-3 space-y-2">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center gap-2.5 text-[12px]">
                <ProtocolLogo protocol={r.id} name={PROTOCOL_LABEL[r.id] ?? r.id} size={18} />
                <span className="text-foreground flex-1 truncate">{PROTOCOL_LABEL[r.id] ?? r.id}</span>
                <span className="num text-muted-foreground">{usd(r.v)}</span>
                <span className="num w-12 text-right text-foreground">{pct(r.share, 1)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

/** USD volume per priced swap: where the large orders go and where the small ones do. */
function SwapSize({ summary, state }: { summary: DexSummary | null; state: 'loading' | 'ready' | 'error' }) {
  const rows = (summary?.dexes ?? [])
    .map((d) => {
      const priced = d.swaps * (d.priced_share ?? 0);
      return { ...d, avg: priced >= 50 ? d.volume_usd / priced : null };
    })
    .filter((d): d is typeof d & { avg: number } => d.avg != null)
    .sort((a, b) => b.avg - a.avg);
  const max = rows[0]?.avg ?? 1;
  return (
    <Card title="Average swap" sub="USD volume divided by the swaps that could be priced">
      {state === 'error' ? (
        <Failed what="Swap sizes" />
      ) : !summary ? (
        <Skeleton rows={3} />
      ) : (
        <ul className={`px-4 sm:px-5 pb-4 space-y-2.5 ${state === 'loading' ? 'opacity-60' : ''}`}>
          {rows.map((d) => {
            const st = dexStyle(d.id);
            return (
              <li key={d.id} className="text-[12px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-foreground truncate">{d.name}</span>
                  <span className="num text-foreground">${compact(d.avg)}</span>
                </div>
                <div className="mt-1 h-1.5 rounded-sm bg-muted overflow-hidden">
                  <div className="h-full rounded-sm" style={{ width: `${(d.avg / max) * 100}%`, background: st.color, opacity: st.opacity }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function PoolsTable({ days, total }: { days: '1' | '7' | '30'; total: number }) {
  const { data, state } = useLoad(() => getDexPools(Number(days), 15), [days]);
  const max = data?.[0]?.volume_usd ?? 0;
  return (
    <Card title="Top pools" sub="Busiest pools by volume over the same days">
      {state === 'error' ? (
        <Failed what="Pools" />
      ) : !data ? (
        <Skeleton />
      ) : (
        <div className={`overflow-x-auto ${state === 'loading' ? 'opacity-60' : ''}`}>
          <table className="w-full text-[12px] whitespace-nowrap">
            <thead>
              <tr className="border-y border-border text-[11px] text-muted-foreground">
                <th className="text-left font-normal px-4 sm:px-5 py-2 w-10">#</th>
                <th className="text-left font-normal px-3 py-2">Pair</th>
                <th className="text-left font-normal px-3 py-2 hidden sm:table-cell">DEX</th>
                <th className="text-right font-normal px-3 py-2">Volume</th>
                <th className="text-left font-normal px-3 py-2 w-[22%] hidden md:table-cell">Of all volume</th>
                <th className="text-right font-normal px-4 sm:px-5 py-2">Swaps</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.map((p: DexPool, i) => {
                const share = total > 0 ? (p.volume_usd / total) * 100 : 0;
                const st = dexStyle(p.dex);
                return (
                  <tr key={p.pool} className="hover:bg-muted/30 transition-colors">
                    <td className="num px-4 sm:px-5 py-2.5 text-muted-foreground">{i + 1}</td>
                    <td className="px-3 py-2.5">
                      <a
                        href={`https://snowtrace.io/address/${p.pool}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2.5 text-foreground hover:underline underline-offset-2 decoration-border"
                        title={p.pool}
                      >
                        <PairLogos a={p.token0} b={p.token1} />
                        <span className="num">{p.token0.symbol || '?'}/{p.token1.symbol || '?'}</span>
                      </a>
                    </td>
                    <td className="px-3 py-2.5 hidden sm:table-cell">
                      <span className="inline-flex items-center gap-2 text-muted-foreground">
                        <ProtocolLogo protocol={p.protocol} name={DEX_LABEL[p.dex] ?? p.dex} size={16} />
                        {DEX_LABEL[p.dex] ?? p.dex}
                      </span>
                    </td>
                    <td className="num text-right px-3 py-2.5 text-foreground">{usd(p.volume_usd)}</td>
                    <td className="px-3 py-2.5 hidden md:table-cell">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-sm bg-muted overflow-hidden">
                          {/* Scaled to the busiest pool, so the smaller rows stay readable. */}
                          <div className="h-full rounded-sm" style={{ width: `${max > 0 ? (p.volume_usd / max) * 100 : 0}%`, background: st.color, opacity: st.opacity }} />
                        </div>
                        <span className="num w-11 text-right text-muted-foreground">{total > 0 ? pct(share, 1) : '—'}</span>
                      </div>
                    </td>
                    <td className="num text-right px-4 sm:px-5 py-2.5 text-foreground">{compact(p.swaps)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

const DEX_LABEL: Record<string, string> = {
  'pharaoh-v3': 'Pharaoh V3',
  'pharaoh-dlmm': 'Pharaoh DLMM',
  'uniswap-v3': 'Uniswap V3',
  'blackhole-clmm': 'Blackhole',
  lfj: 'LFJ',
  'lfj-v1': 'LFJ V1',
  'pangolin-v3': 'Pangolin V3',
  'pangolin-v2': 'Pangolin V2',
  'sushiswap-v2': 'SushiSwap V2',
};
