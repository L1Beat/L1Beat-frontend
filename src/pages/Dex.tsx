import { useEffect, useMemo, useRef, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { SEO } from '../components/SEO';
import { SegmentedControl, StatStrip } from '../components/instrument';
import type { StatItem } from '../components/instrument';
import { SectionErrorBoundary } from '../components/SectionErrorBoundary';
import { getDexPools, getDexSummary, getDexTimeseries } from '../api';
import type { DexDay, DexPool, DexSummary } from '../api';

// Categorical palette from DESIGN_SYSTEM.md. A protocol's versions share a hue.
const DEX_STYLE: Record<string, { color: string; opacity: number }> = {
  'pharaoh-v3': { color: '#3987e5', opacity: 1 },
  'pharaoh-dlmm': { color: '#3987e5', opacity: 0.5 },
  'uniswap-v3': { color: '#8b5cf6', opacity: 1 },
  'blackhole-clmm': { color: '#d4a017', opacity: 1 },
  lfj: { color: '#d95926', opacity: 1 },
  'pangolin-v3': { color: '#199e70', opacity: 1 },
};
const dexStyle = (id: string) => DEX_STYLE[id] ?? { color: '#6b7280', opacity: 1 };
// Stack order, bottom to top: largest venues sit on the baseline.
const STACK = ['pharaoh-v3', 'pharaoh-dlmm', 'uniswap-v3', 'blackhole-clmm', 'lfj', 'pangolin-v3'];

const RANGES = [
  { value: '30', label: '30d' },
  { value: '90', label: '90d' },
  { value: '365', label: '1y' },
] as const;
const WINDOWS = [
  { value: '1', label: '1d' },
  { value: '7', label: '7d' },
  { value: '30', label: '30d' },
] as const;

function compact(v: number): string {
  const trim = (n: number) => n.toFixed(1).replace(/\.0$/, '');
  const a = Math.abs(v);
  if (a >= 1e9) return `${trim(v / 1e9)}B`;
  if (a >= 1e6) return `${trim(v / 1e6)}M`;
  if (a >= 1e3) return `${trim(v / 1e3)}K`;
  return Math.round(v).toLocaleString();
}
const usd = (v: number | null | undefined) => (v == null ? '—' : `$${compact(v)}`);
const pct = (v: number, digits = 0) => `${v.toFixed(digits)}%`;
const day = (d: string | null | undefined, f = 'MMM d') => (d ? format(parseISO(d), f) : '—');

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
  const [range, setRange] = useState<'30' | '90' | '365'>('90');
  const [win, setWin] = useState<'1' | '7' | '30'>('30');
  const series = useLoad(() => getDexTimeseries(Number(range)), [range]);
  const summary = useLoad(() => getDexSummary(Number(win)), [win]);
  // The headline describes the chart's range.
  const month = useLoad(() => getDexSummary(Number(range)), [range]);

  const m = month.data;
  // From the loaded data, so the label never runs ahead of the numbers while a new range loads.
  const rangeLabel = !m ? '' : m.days >= 365 ? 'the last year' : `the last ${m.days} days`;
  const pharaohShare = m && m.totals.volume_usd > 0
    ? (m.dexes.filter((d) => d.protocol === 'pharaoh').reduce((s, d) => s + d.volume_usd, 0) / m.totals.volume_usd) * 100
    : null;

  const t = m?.totals;
  const stats: StatItem[] = t
    ? [
        { label: 'Volume', value: usd(t.volume_usd), sub: `${rangeLabel.replace('the ', '')}, to ${day(m?.as_of)}` },
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
      <SEO
        title="Avalanche DEX Volume"
        description="Daily trading volume, swaps and top pools on Avalanche C-Chain DEXes: Pharaoh, Uniswap, Blackhole, LFJ and Pangolin, indexed from the chain."
        url="/dex"
      />

      {/* Hero in the shared page frame: the chart fills the stage and the KPIs
          float over its foot from md up. */}
      <section
        className="relative border-b border-border bg-stage h-[600px] md:h-[min(calc(100vh-48px),820px)] md:min-h-[600px]"
        aria-label="Daily DEX volume"
      >
        <div className="absolute inset-0 flex flex-col">
          <div className="max-w-7xl 2xl:max-w-screen-2xl w-full mx-auto px-4 sm:px-6 pt-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-[18px] leading-6 font-semibold text-foreground">DEX volume</h1>
              {m ? (
                <>
                  <p className="mt-2 text-[26px] sm:text-[34px] leading-tight font-medium text-foreground max-w-4xl">
                    Avalanche's main DEXes traded <span className="tabular-nums">{usd(m.totals.volume_usd)}</span> in {rangeLabel}.
                  </p>
                  <p className="mt-1.5 text-[15px] sm:text-[17px] leading-snug text-foreground/80 max-w-3xl">
                    {pharaohShare != null && (
                      <>Pharaoh handled <span className="num">{pct(pharaohShare)}</span> of it, across </>
                    )}
                    <span className="num">{compact(m.totals.swaps)}</span> swaps from <span className="num">{compact(m.totals.unique_addresses)}</span> addresses.
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
              <VolumeChart days={series.data} state={series.state} names={Object.fromEntries((m?.dexes ?? []).map((d) => [d.id, d.name]))} />
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
            {win === '1' ? `${day(summary.data?.as_of, 'MMM d, yyyy')}` : `${day(summary.data?.from)} to ${day(summary.data?.as_of)}`}
          </h2>
          <SegmentedControl size="xs" value={win} options={WINDOWS} onChange={setWin} ariaLabel="Table window" />
        </div>

        <SectionErrorBoundary label="the DEX table">
          <VenueTable summary={summary.data} state={summary.state} />
        </SectionErrorBoundary>

        <SectionErrorBoundary label="the top pools">
          <PoolsTable days={win} />
        </SectionErrorBoundary>

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

function VolumeChart({ days, state, names }: { days: DexDay[] | null; state: 'loading' | 'ready' | 'error'; names: Record<string, string> }) {
  const [hover, setHover] = useState<number | null>(null);
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
  const ids = STACK.filter((id) => days?.some((d) => d.dexes.some((x) => x.id === id && x.volume_usd > 0)));

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
          <div className="num text-[22px] leading-7 font-medium text-foreground">{usd(active ? active.volume_usd : total / days.length)}</div>
          <div className="text-[11px] text-muted-foreground">
            {active ? `${day(active.date, 'EEE, MMM d, yyyy')}, ${active.swaps.toLocaleString()} swaps` : `a day on average, ${day(days[0].date)} to ${day(days[days.length - 1].date)}`}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          {ids.map((id) => {
            const st = dexStyle(id);
            return (
              <span key={id} className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: st.color, opacity: st.opacity }} />
                {names[id] ?? id}
                {active && <span className="num text-foreground">{usd(vol(active, id))}</span>}
              </span>
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
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label={`Daily volume on tracked Avalanche DEXes over ${days.length} days, stacked by DEX`}
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
            <g key={d.date} opacity={hover != null && hover !== i ? 0.45 : 1}>
              {ids.map((id) => {
                const v = vol(d, id);
                if (v <= 0) return null;
                const y0 = geom.y(run);
                run += v;
                const y1 = geom.y(run);
                const st = dexStyle(id);
                return <rect key={id} x={geom.x(i)} y={y1} width={geom.barW} height={Math.max(0, y0 - y1)} fill={st.color} fillOpacity={st.opacity} />;
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

function DexName({ id, name }: { id: string; name: string }) {
  const st = dexStyle(id);
  return (
    <span className="inline-flex items-center gap-2 text-[13px] font-medium text-foreground whitespace-nowrap">
      <span className="w-2 h-2 rounded-[2px] shrink-0" style={{ background: st.color, opacity: st.opacity }} aria-hidden />
      {name}
    </span>
  );
}

function VenueTable({ summary, state }: { summary: DexSummary | null; state: 'loading' | 'ready' | 'error' }) {
  const rows = [...(summary?.dexes ?? [])].sort((a, b) => b.volume_usd - a.volume_usd);
  const total = summary?.totals.volume_usd ?? 0;
  return (
    <section className="rounded-md border border-border bg-card">
      <header className="px-4 sm:px-5 pt-4 pb-3">
        <h2 className="text-[14px] font-semibold text-foreground">By DEX</h2>
        <p className="text-[11px] text-muted-foreground mt-0.5">Addresses are counted per DEX, so the same address can appear under several.</p>
      </header>
      {state === 'error' ? (
        <div className="px-5 py-10 text-center text-[12px] text-muted-foreground">DEX totals couldn't be loaded. Try again in a minute.</div>
      ) : !summary ? (
        <div className="px-5 pb-5 space-y-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-9 rounded bg-muted/50 animate-pulse" />)}</div>
      ) : (
        <div className={`overflow-x-auto ${state === 'loading' ? 'opacity-60' : ''}`}>
          <table className="w-full text-[12px] whitespace-nowrap">
            <thead>
              <tr className="border-y border-border text-[11px] text-muted-foreground">
                <th className="text-left font-normal px-4 sm:px-5 py-2">DEX</th>
                <th className="text-right font-normal px-3 py-2">Volume</th>
                <th className="text-left font-normal px-3 py-2 w-[30%] hidden md:table-cell">Share</th>
                <th className="text-right font-normal px-3 py-2">Swaps</th>
                <th className="text-right font-normal px-3 py-2 hidden sm:table-cell">Addresses</th>
                <th className="text-right font-normal px-4 sm:px-5 py-2 hidden sm:table-cell">Priced</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((d) => {
                const share = total > 0 ? (d.volume_usd / total) * 100 : 0;
                const st = dexStyle(d.id);
                return (
                  <tr key={d.id}>
                    <td className="px-4 sm:px-5 py-2.5"><DexName id={d.id} name={d.name} /></td>
                    <td className="num text-right px-3 py-2.5 text-foreground">{usd(d.volume_usd)}</td>
                    <td className="px-3 py-2.5 hidden md:table-cell">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-sm bg-muted overflow-hidden">
                          <div className="h-full rounded-sm" style={{ width: `${share}%`, background: st.color, opacity: st.opacity }} />
                        </div>
                        <span className="num w-12 text-right text-muted-foreground">{pct(share, 1)}</span>
                      </div>
                    </td>
                    <td className="num text-right px-3 py-2.5 text-foreground">{d.swaps.toLocaleString()}</td>
                    <td className="num text-right px-3 py-2.5 text-foreground hidden sm:table-cell">{d.unique_addresses.toLocaleString()}</td>
                    <td className="num text-right px-4 sm:px-5 py-2.5 text-muted-foreground hidden sm:table-cell">
                      {d.priced_share != null && d.swaps > 0 ? pct(d.priced_share * 100, 1) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function PoolsTable({ days }: { days: '1' | '7' | '30' }) {
  const { data, state } = useLoad(() => getDexPools(Number(days), 15), [days]);
  return (
    <section className="rounded-md border border-border bg-card">
      <header className="px-4 sm:px-5 pt-4 pb-3">
        <h2 className="text-[14px] font-semibold text-foreground">Top pools</h2>
        <p className="text-[11px] text-muted-foreground mt-0.5">Busiest pools by volume over the same days</p>
      </header>
      {state === 'error' ? (
        <div className="px-5 py-10 text-center text-[12px] text-muted-foreground">Pools couldn't be loaded. Try again in a minute.</div>
      ) : !data ? (
        <div className="px-5 pb-5 space-y-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-9 rounded bg-muted/50 animate-pulse" />)}</div>
      ) : (
        <div className={`overflow-x-auto ${state === 'loading' ? 'opacity-60' : ''}`}>
          <table className="w-full text-[12px] whitespace-nowrap">
            <thead>
              <tr className="border-y border-border text-[11px] text-muted-foreground">
                <th className="text-left font-normal px-4 sm:px-5 py-2">Pair</th>
                <th className="text-left font-normal px-3 py-2">DEX</th>
                <th className="text-right font-normal px-3 py-2">Volume</th>
                <th className="text-right font-normal px-4 sm:px-5 py-2">Swaps</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.map((p: DexPool) => (
                <tr key={p.pool}>
                  <td className="px-4 sm:px-5 py-2.5">
                    <a
                      href={`https://snowtrace.io/address/${p.pool}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="num text-foreground hover:underline underline-offset-2 decoration-border"
                      title={p.pool}
                    >
                      {p.token0.symbol || '?'}/{p.token1.symbol || '?'}
                    </a>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{DEX_LABEL[p.dex] ?? p.dex}</td>
                  <td className="num text-right px-3 py-2.5 text-foreground">{usd(p.volume_usd)}</td>
                  <td className="num text-right px-4 sm:px-5 py-2.5 text-foreground">{p.swaps.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

const DEX_LABEL: Record<string, string> = {
  'pharaoh-v3': 'Pharaoh V3',
  'pharaoh-dlmm': 'Pharaoh DLMM',
  'uniswap-v3': 'Uniswap V3',
  'blackhole-clmm': 'Blackhole',
  lfj: 'LFJ',
  'pangolin-v3': 'Pangolin V3',
};
