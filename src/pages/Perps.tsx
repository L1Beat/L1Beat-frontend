import { useEffect, useMemo, useRef, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { SEO } from '../components/SEO';
import { PAGE_SEO } from '../utils/pageSeo';
import { ProtocolLogo, SegmentedControl, Sparkline, StatStrip } from '../components/instrument';
import type { StatItem } from '../components/instrument';
import { SectionErrorBoundary } from '../components/SectionErrorBoundary';
import { getPerpsOpenInterest, getPerpsSummary, getPerpsTimeseries, getPerpsTopLiquidations } from '../api';
import type { PerpsDay, PerpsOpenInterestDay, PerpsSummary } from '../api';
import { LONG, Liquidations, OpenInterest, PERPS_RANGES, SHORT, VolumeBars, compact, day, usd, useLoad, venueStyle } from '../components/PerpsCharts';
import type { PerpsRange } from '../components/PerpsCharts';
import { chartPointerProps } from '../utils/chartPointer';

export function Perps() {
  const [range, setRange] = useState<PerpsRange>('30');
  const summary = useLoad(() => getPerpsSummary(Number(range)), range);
  const series = useLoad(() => getPerpsTimeseries(Number(range)), range);
  // Open interest is a level, read daily; long ranges come as fewer points over the same history.
  const oi = useLoad(() => getPerpsOpenInterest(Number(range)), range);
  const liq = useLoad(() => getPerpsTopLiquidations(Number(range), 8), range);

  const s = summary.data;
  const t = s?.totals;
  const label = !s
    ? ''
    : s.days > 365
      ? `since ${s.from ? format(parseISO(s.from), 'MMMM yyyy') : 'tracking began'}`
      : s.days === 365
        ? 'in the last year'
        : `in the last ${s.days} days`;
  const longShare = t && t.volume_usd > 0 ? Math.round((t.long_volume_usd / t.volume_usd) * 100) : null;
  const names = Object.fromEntries((s?.by_venue ?? []).map((v) => [v.id, v.name]));

  const stats: StatItem[] = t
    ? [
        { label: 'Volume', value: usd(t.volume_usd), sub: `${usd(t.long_volume_usd)} long, ${usd(t.short_volume_usd)} short` },
        { label: 'Traders', value: t.traders.toLocaleString(), sub: `${compact(t.trades)} trades` },
        {
          label: 'Fees',
          value: usd(t.fees_usd),
          sub: 'paid by traders',
          tooltip: 'Position, borrowing and liquidation fees. Funding is left out: it moves between traders rather than to GMX.',
        },
        { label: 'Liquidated', value: usd(t.liquidated_usd), sub: `${t.liquidations.toLocaleString()} positions` },
      ]
    : ['Volume', 'Traders', 'Fees', 'Liquidated'].map((l) => ({ label: l, value: '—', sub: summary.state === 'error' ? 'Unavailable' : ' ' }));

  return (
    <div>
      <SEO {...PAGE_SEO.perps} />

      {/* Hero in the shared page frame: the chart fills the stage and the KPIs
          float over its foot from md up. */}
      <section
        className="relative border-b border-border bg-stage md:h-[min(calc(100vh-48px),1200px)] md:min-h-[600px]"
        aria-label="Daily perpetuals volume"
      >
        <div className="md:absolute md:inset-0 flex flex-col">
          <div className="max-w-7xl 2xl:max-w-screen-2xl w-full mx-auto px-4 sm:px-6 pt-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-[18px] leading-6 font-semibold text-foreground">Perpetuals</h1>
              {t ? (
                <>
                  <p className="mt-2 text-[26px] sm:text-[34px] leading-tight font-medium text-foreground max-w-4xl">
                    Traders opened and closed <span className="tabular-nums">{usd(t.volume_usd)}</span> of leveraged positions on GMX {label}.
                  </p>
                  <p className="mt-1.5 text-[15px] sm:text-[17px] leading-snug text-foreground/80 max-w-3xl">
                    {longShare != null && (
                      <>
                        <span className="num">{longShare}%</span> of it was long, across{' '}
                      </>
                    )}
                    <span className="num">{t.traders.toLocaleString()}</span> traders, and <span className="num">{usd(t.liquidated_usd)}</span> of
                    positions were liquidated.
                  </p>
                </>
              ) : summary.state === 'error' ? (
                <p className="mt-3 text-[13px] text-muted-foreground">Perpetuals couldn't be loaded. Try again in a minute.</p>
              ) : (
                <div className="mt-3 h-9 w-[min(560px,80vw)] rounded bg-muted animate-pulse" />
              )}
            </div>
            <div className="self-start shrink-0">
              <SegmentedControl size="xs" value={range} options={PERPS_RANGES} onChange={setRange} ariaLabel="Range" />
            </div>
          </div>

          <div className="relative h-[360px] md:h-auto md:flex-1 md:min-h-0 mx-4 sm:mx-6 lg:mx-10 mt-5 mb-6 md:mt-4 md:mb-[128px]">
            <SectionErrorBoundary label="the volume chart">
              <div className={`h-full transition-opacity ${series.state === 'loading' && series.data ? 'opacity-50' : ''}`}>
                <VolumeBars days={series.data} state={series.state} loadedRange={series.loadedKey} names={names} fill />
              </div>
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

        <SectionErrorBoundary label="open interest">
          <section className="rounded-md border border-border bg-card">
            <header className="px-4 sm:px-5 pt-4">
              <h2 className="text-[14px] font-semibold text-foreground">Open interest</h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                The size of positions still open at the end of each day, long above the axis and short below.
              </p>
            </header>
            <div className={`px-4 sm:px-5 pt-3 pb-4 ${oi.state === 'loading' && oi.data ? 'opacity-50' : ''}`}>
              <OpenInterestChart data={oi.data} state={oi.state} />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 border-t border-border lg:divide-x divide-border">
              <OpenInterest data={oi.data} state={oi.state} />
              <Liquidations
                items={liq.data}
                state={liq.state}
                title={(liq.loadedKey ?? range) === '3650' ? 'Largest liquidations ever' : `Largest liquidations, ${label.replace('in the ', '')}`}
              />
            </div>
          </section>
        </SectionErrorBoundary>

        <SectionErrorBoundary label="daily activity">
          <ActivityPanels days={series.data} state={series.state} />
        </SectionErrorBoundary>

        <SectionErrorBoundary label="venues">
          <VenueTable summary={s} days={series.data} state={summary.state} />
        </SectionErrorBoundary>

        <p className="text-[11px] leading-relaxed text-muted-foreground max-w-4xl">
          Read from GMX's contracts on the C-Chain. Volume counts every position size change, opening and closing, which is
          how GMX reports it. Fees are position, borrowing and liquidation fees, valued at the collateral price in each event.
          GMX V1 stopped taking new positions after its July 2025 exploit; its history from December 2021 stays in the All
          view. Other perpetuals venues on Avalanche record their trades off-chain, so their volume can't be checked on the
          chain and isn't counted. Days are complete UTC days.
        </p>
      </div>
    </div>
  );
}

const OM = { top: 10, right: 8, bottom: 24, left: 52 };

// Open interest over time: long up, short down, from the daily totals.
function OpenInterestChart({ data, state }: { data: PerpsOpenInterestDay[] | null; state: 'loading' | 'ready' | 'error' }) {
  const [hover, setHover] = useState<number | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(0);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = 220;
  const rows = useMemo(() => data ?? [], [data]);
  useEffect(() => setHover(null), [rows]);
  const geom = useMemo(() => {
    if (rows.length < 2 || !W) return null;
    const peak = Math.max(...rows.map((d) => Math.max(d.long_usd, d.short_usd)), 1);
    const raw = peak / 2;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const tick = ([1, 2, 2.5, 5, 10].find((k) => k * mag >= raw) ?? 10) * mag;
    const maxY = Math.ceil(peak / tick) * tick;
    const ticks: number[] = [];
    for (let v = -maxY; v <= maxY + 1e-9; v += tick) ticks.push(v);
    const x = (i: number) => OM.left + ((W - OM.left - OM.right) * i) / (rows.length - 1);
    const y = (v: number) => OM.top + (H - OM.top - OM.bottom) / 2 - (v / maxY) * ((H - OM.top - OM.bottom) / 2);
    const area = (vals: number[]) => `M${x(0)},${y(0)}L${vals.map((v, i) => `${x(i)},${y(v)}`).join('L')}L${x(vals.length - 1)},${y(0)}Z`;
    return {
      x,
      y,
      ticks,
      longPath: area(rows.map((d) => d.long_usd)),
      shortPath: area(rows.map((d) => -d.short_usd)),
      labelEvery: Math.ceil(rows.length / (W < 600 ? 4 : 8)),
      slot: (W - OM.left - OM.right) / Math.max(1, rows.length - 1),
    };
  }, [rows, W]);
  const active = hover != null ? rows[hover] : rows[rows.length - 1];
  return (
    <div>
      <div className="mb-2">
        <div className="num text-[20px] leading-7 font-medium text-foreground">{active ? usd(active.long_usd + active.short_usd) : '—'}</div>
        <div className="text-[11px] text-muted-foreground">
          {active
            ? `open on ${day(active.date, 'EEE, MMM d, yyyy')}: ${usd(active.long_usd)} long, ${usd(active.short_usd)} short`
            : state === 'error'
              ? "Open interest couldn't be loaded. Try again in a minute."
              : ' '}
        </div>
      </div>
      <div ref={boxRef} className="relative" style={{ height: H }}>
        {!geom ? (
          <div className={`absolute inset-0 rounded ${state === 'loading' ? 'bg-muted/50 animate-pulse' : ''}`} />
        ) : (
          <svg
            width={W}
            height={H}
            className="absolute inset-0 block"
            role="img"
            aria-label="Open interest over time, long above the axis and short below"
            {...chartPointerProps<SVGSVGElement>({
              onMove: (e) => {
                const i = Math.round((e.clientX - e.currentTarget.getBoundingClientRect().left - OM.left) / geom.slot);
                setHover(i >= 0 && i < rows.length ? i : null);
              },
              count: rows.length,
              hover,
              setHover,
            })}
          >
            {geom.ticks.map((tk) => (
              <g key={tk}>
                <line x1={OM.left} x2={W - OM.right} y1={geom.y(tk)} y2={geom.y(tk)} stroke="currentColor" strokeOpacity={tk === 0 ? 0.3 : 0.08} />
                <text x={OM.left - 8} y={geom.y(tk)} textAnchor="end" dominantBaseline="middle" className="fill-muted-foreground" fontSize={10}>
                  {tk === 0 ? '0' : `${tk < 0 ? '−' : ''}$${compact(Math.abs(tk))}`}
                </text>
              </g>
            ))}
            <path d={geom.longPath} fill={LONG} fillOpacity={0.75} />
            <path d={geom.shortPath} fill={SHORT} fillOpacity={0.75} />
            {hover != null && (
              <line x1={geom.x(hover)} x2={geom.x(hover)} y1={OM.top} y2={H - OM.bottom} stroke="currentColor" strokeOpacity={0.5} className="text-foreground" />
            )}
            {rows.map((d, i) =>
              i % geom.labelEvery === 0 ? (
                <text key={d.date} x={geom.x(i)} y={H - 6} textAnchor="middle" className="fill-muted-foreground" fontSize={10}>
                  {day(d.date, rows.length > 120 ? 'MMM yyyy' : 'MMM d')}
                </text>
              ) : null,
            )}
          </svg>
        )}
      </div>
      <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: LONG }} />Long</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: SHORT }} />Short</span>
      </div>
    </div>
  );
}

// Long series are summed into about 120 buckets, so a trend line keeps its shape.
function buckets(values: number[], n = 120): number[] {
  if (values.length <= n) return values;
  const size = values.length / n;
  return Array.from({ length: n }, (_, i) => values.slice(Math.floor(i * size), Math.floor((i + 1) * size)).reduce((a, b) => a + b, 0));
}

/** Trades, fees and liquidations per day as three small panels, each with its total and busiest day. */
function ActivityPanels({ days, state }: { days: PerpsDay[] | null; state: 'loading' | 'ready' | 'error' }) {
  const panels: { key: 'trades' | 'fees_usd' | 'liquidated_usd'; label: string; color: string; fmt: (v: number) => string }[] = [
    { key: 'trades', label: 'Trades', color: '#8b5cf6', fmt: (v) => compact(v) },
    { key: 'fees_usd', label: 'Fees paid', color: '#199e70', fmt: usd },
    { key: 'liquidated_usd', label: 'Liquidated', color: '#d4a017', fmt: usd },
  ];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
      {panels.map((p) => {
        const values = (days ?? []).map((d) => d[p.key]);
        const total = values.reduce((a, b) => a + b, 0);
        const peakIdx = values.length ? values.indexOf(Math.max(...values)) : -1;
        const peak = peakIdx >= 0 ? days![peakIdx] : null;
        return (
          <section key={p.key} className="rounded-md border border-border bg-card px-4 sm:px-5 pt-4 pb-3 min-w-0">
            <h2 className="text-[12px] text-muted-foreground">{p.label}</h2>
            {!days ? (
              <div className={`mt-2 h-[92px] rounded bg-muted/50 ${state === 'loading' ? 'animate-pulse' : ''}`} />
            ) : (
              <div className={state === 'loading' ? 'opacity-50' : ''}>
                <div className="mt-1 num text-[22px] leading-7 font-medium text-foreground">{p.fmt(total)}</div>
                <div className="text-[11px] text-muted-foreground leading-4">
                  {peak && values[peakIdx] > 0 ? (
                    <>
                      busiest day <span className="num text-foreground">{p.fmt(values[peakIdx])}</span> on {day(peak.date, days.length > 365 ? 'MMM d, yyyy' : 'MMM d')}
                    </>
                  ) : (
                    'none in this period'
                  )}
                </div>
                <Sparkline data={buckets(values)} width={300} height={44} color={p.color} fill className="mt-2 w-full h-11" />
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function VenueTable({ summary, days, state }: { summary: PerpsSummary | null; days: PerpsDay[] | null; state: 'loading' | 'ready' | 'error' }) {
  const rows = (summary?.by_venue ?? []).filter((v) => v.volume_usd > 0 || v.trades > 0);
  const trend = (id: string) => buckets((days ?? []).map((d) => d.venues.find((x) => x.id === id)?.volume_usd ?? 0));
  return (
    <section className="rounded-md border border-border bg-card">
      <header className="px-4 sm:px-5 pt-4 pb-3">
        <h2 className="text-[14px] font-semibold text-foreground">By venue</h2>
      </header>
      {state === 'error' && !summary ? (
        <p className="px-5 pb-5 text-[12px] text-muted-foreground">Venues couldn't be loaded. Try again in a minute.</p>
      ) : !summary ? (
        <div className="px-5 pb-5 space-y-2">{[0, 1].map((i) => <div key={i} className="h-8 rounded bg-muted/50 animate-pulse" />)}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px] whitespace-nowrap">
            <thead>
              <tr className="border-y border-border text-[11px] text-muted-foreground">
                <th className="text-left font-normal px-4 sm:px-5 py-2">Venue</th>
                <th className="text-right font-normal px-3 py-2">Volume</th>
                <th className="text-left font-normal px-3 py-2 w-[24%] hidden md:table-cell">Long / short</th>
                <th className="text-left font-normal px-3 py-2 hidden sm:table-cell">Trend</th>
                <th className="text-right font-normal px-3 py-2">Traders</th>
                <th className="text-right font-normal px-3 py-2 hidden sm:table-cell">Fees</th>
                <th className="text-right font-normal px-4 sm:px-5 py-2 hidden sm:table-cell">Liquidated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((v) => {
                const long = v.volume_usd > 0 ? (v.long_volume_usd / v.volume_usd) * 100 : 0;
                const st = venueStyle(v.id);
                return (
                  <tr key={v.id}>
                    <td className="px-4 sm:px-5 py-2.5">
                      <span className="inline-flex items-center gap-2.5 text-[13px] font-medium text-foreground">
                        <span style={{ opacity: st.opacity }} className="inline-flex">
                          <ProtocolLogo protocol="gmx" name={v.name} size={20} />
                        </span>
                        {v.name}
                        {v.id === 'gmx-v1' && <span className="text-[10px] font-normal text-muted-foreground">closed July 2025</span>}
                      </span>
                    </td>
                    <td className="num text-right px-3 py-2.5 text-foreground">{usd(v.volume_usd)}</td>
                    <td className="px-3 py-2.5 hidden md:table-cell">
                      {v.volume_usd > 0 ? (
                        <div className="flex items-center gap-2">
                          <span className="num w-8 text-right text-[11px]" style={{ color: LONG }}>{Math.round(long)}%</span>
                          <div className="flex-1 flex h-1.5 rounded-sm overflow-hidden gap-px" aria-label={`${Math.round(long)}% long`}>
                            <div style={{ width: `${long}%`, background: LONG }} />
                            <div style={{ width: `${100 - long}%`, background: SHORT }} />
                          </div>
                          <span className="num w-8 text-[11px]" style={{ color: SHORT }}>{Math.round(100 - long)}%</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 hidden sm:table-cell">
                      <Sparkline data={trend(v.id)} width={120} height={22} color={st.color} fill />
                    </td>
                    <td className="num text-right px-3 py-2.5 text-foreground">{v.traders.toLocaleString()}</td>
                    <td className="num text-right px-3 py-2.5 text-foreground hidden sm:table-cell">{usd(v.fees_usd)}</td>
                    <td className="num text-right px-4 sm:px-5 py-2.5 text-foreground hidden sm:table-cell">{usd(v.liquidated_usd)}</td>
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
