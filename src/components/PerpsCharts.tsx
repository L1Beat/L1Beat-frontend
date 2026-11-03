import { useEffect, useMemo, useRef, useState } from 'react';
import { format, parseISO } from 'date-fns';
import type { PerpsDay, PerpsLiquidation, PerpsOpenInterestDay } from '../api';
import { WEEKLY_AFTER_DAYS, weekStart } from '../utils/weeks';
import { chartPointerProps } from '../utils/chartPointer';

// GMX's blue; V1, retired after the July 2025 exploit, is the same hue at half strength.
const VENUE_STYLE: Record<string, { color: string; opacity: number }> = {
  'gmx-v2': { color: '#3987e5', opacity: 1 },
  'gmx-v1': { color: '#3987e5', opacity: 0.45 },
};
export const venueStyle = (id: string) => VENUE_STYLE[id] ?? { color: '#6b7280', opacity: 1 };
export const ORDER = ['gmx-v2', 'gmx-v1'];
// Long and short: a pair, not good and bad, so neither is green or red.
export const LONG = '#3987e5';
export const SHORT = '#d95926';

export const PERPS_RANGES = [
  { value: '30', label: '30d' },
  { value: '90', label: '90d' },
  { value: '365', label: '1y' },
  { value: '3650', label: 'All' },
] as const;
export type PerpsRange = (typeof PERPS_RANGES)[number]['value'];

export function compact(v: number): string {
  const trim = (n: number) => n.toFixed(1).replace(/\.0$/, '');
  const a = Number(Math.abs(v).toPrecision(3));
  if (a >= 1e9) return `${trim(v / 1e9)}B`;
  if (a >= 1e6) return `${trim(v / 1e6)}M`;
  if (a >= 1e3) return `${trim(v / 1e3)}K`;
  return Math.round(v).toLocaleString();
}
export const usd = (v: number | null | undefined) => (v == null ? '—' : `$${compact(v)}`);
export const day = (d: string, f = 'MMM d') => format(parseISO(d), f);

export function useLoad<T>(load: () => Promise<T | null>, key: string) {
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

const M = { top: 10, right: 8, bottom: 24, left: 52 };

export function VolumeBars({ days, state, loadedRange, names, fill = false }: {
  days: PerpsDay[] | null;
  state: 'loading' | 'ready' | 'error';
  loadedRange: string | null;
  names: Record<string, string>;
  /** Fill the parent's height (the page hero) instead of a fixed 200px. */
  fill?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(0);
  const [boxH, setBoxH] = useState(0);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setW(el.clientWidth);
      setBoxH(el.clientHeight);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = fill ? Math.max(boxH, 180) : 200;

  // Every UTC day gets a slot (days without trades are left out by the API);
  // past about a year they're summed into Sunday-start weeks.
  const { rows, weekly } = useMemo(() => {
    if (!days?.length) return { rows: [] as (PerpsDay & { daysIn?: number })[], weekly: false };
    const by = new Map(days.map((d) => [d.date, d]));
    const last = Date.parse(`${days[days.length - 1].date}T00:00:00Z`);
    const span = loadedRange === '3650' ? Math.round((last - Date.parse(`${days[0].date}T00:00:00Z`)) / 86_400_000) + 1 : Number(loadedRange ?? days.length);
    const filled: PerpsDay[] = [];
    for (let i = span - 1; i >= 0; i--) {
      const key = new Date(last - i * 86_400_000).toISOString().slice(0, 10);
      filled.push(by.get(key) ?? { date: key, volume_usd: 0, trades: 0, fees_usd: 0, liquidated_usd: 0, venues: [] });
    }
    if (filled.length <= WEEKLY_AFTER_DAYS) return { rows: filled as (PerpsDay & { daysIn?: number })[], weekly: false };
    const weeks = new Map<string, PerpsDay & { daysIn: number }>();
    for (const d of filled) {
      const k = weekStart(d.date);
      const w = weeks.get(k) ?? { date: k, volume_usd: 0, trades: 0, fees_usd: 0, liquidated_usd: 0, venues: [], daysIn: 0 };
      w.daysIn += 1;
      w.volume_usd += d.volume_usd;
      w.trades += d.trades;
      w.fees_usd += d.fees_usd;
      w.liquidated_usd += d.liquidated_usd;
      for (const v of d.venues) {
        const e = w.venues.find((x) => x.id === v.id);
        if (e) {
          e.volume_usd += v.volume_usd;
          e.trades += v.trades;
        } else w.venues.push({ ...v });
      }
      weeks.set(k, w);
    }
    return { rows: [...weeks.values()], weekly: true };
  }, [days, loadedRange]);
  useEffect(() => setHover(null), [rows]);

  const ids = useMemo(() => {
    const seen = new Set<string>();
    rows.forEach((d) => d.venues.forEach((v) => v.volume_usd > 0 && seen.add(v.id)));
    return ORDER.filter((id) => seen.has(id));
  }, [rows]);

  const geom = useMemo(() => {
    if (!rows.length || !W) return null;
    const peak = Math.max(...rows.map((d) => d.volume_usd), 1);
    const raw = peak / 4;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const tick = ([1, 2, 2.5, 5, 10].find((k) => k * mag >= raw) ?? 10) * mag;
    const maxY = Math.ceil(peak / tick) * tick;
    const ticks = Array.from({ length: Math.round(maxY / tick) + 1 }, (_, i) => i * tick);
    const slot = (W - M.left - M.right) / rows.length;
    const barW = Math.max(1, slot * (rows.length > 120 ? 0.85 : 0.7));
    const x = (i: number) => M.left + slot * i + (slot - barW) / 2;
    const y = (v: number) => M.top + (H - M.top - M.bottom) * (1 - v / maxY);
    return { x, y, slot, barW, ticks, labelEvery: Math.ceil(rows.length / (W < 600 ? 4 : 8)) };
  }, [rows, W, H]);

  const active = hover != null ? rows[hover] : null;
  const total = rows.reduce((a, d) => a + d.volume_usd, 0);
  const partial = (d: { daysIn?: number }) => weekly && d.daysIn != null && d.daysIn < 7;
  const when = (d: PerpsDay & { daysIn?: number }) =>
    weekly
      ? `Week of ${day(d.date, 'MMM d, yyyy')}${partial(d) ? ` (partial, ${d.daysIn} ${d.daysIn === 1 ? 'day' : 'days'})` : ''}`
      : day(d.date, 'EEE, MMM d, yyyy');

  return (
    <div className={fill ? 'h-full flex flex-col' : ''}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 mb-2">
        <div>
          <div className="num text-[20px] leading-7 font-medium text-foreground">{rows.length ? usd(active ? active.volume_usd : total) : '—'}</div>
          <div className="text-[11px] text-muted-foreground">
            {active
              ? `${when(active)}, ${active.trades.toLocaleString()} trades${active.liquidated_usd > 0 ? `, ${usd(active.liquidated_usd)} liquidated` : ''}`
              : rows.length
                ? `volume, ${day(rows[0].date)} to ${day(rows[rows.length - 1].date, 'MMM d, yyyy')}${weekly ? '; bars are weeks' : ''}`
                : state === 'error'
                  ? "Daily volume couldn't be loaded. Try again in a minute."
                  : ' '}
          </div>
        </div>
        {ids.length > 1 && (
          <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
            {ids.map((id) => (
              <span key={id} className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: venueStyle(id).color, opacity: venueStyle(id).opacity }} />
                {names[id] ?? id}
              </span>
            ))}
          </div>
        )}
      </div>
      <div ref={boxRef} className={`relative ${fill ? 'flex-1 min-h-0' : ''}`} style={fill ? undefined : { height: H }}>
        {!geom ? (
          <div className={`absolute inset-0 rounded ${state === 'loading' ? 'bg-muted/50 animate-pulse' : ''}`} />
        ) : (
          <svg
            width={W}
            height={H}
            className="absolute inset-0 block"
            role="img"
            aria-label={`${weekly ? 'Weekly' : 'Daily'} perpetuals volume by venue`}
            {...chartPointerProps<SVGSVGElement>({
              onMove: (e) => {
                const i = Math.floor((e.clientX - e.currentTarget.getBoundingClientRect().left - M.left) / geom.slot);
                setHover(i >= 0 && i < rows.length ? i : null);
              },
              count: rows.length,
              hover,
              setHover,
            })}
          >
            {geom.ticks.map((tk) => (
              <g key={tk}>
                <line x1={M.left} x2={W - M.right} y1={geom.y(tk)} y2={geom.y(tk)} stroke="currentColor" strokeOpacity={0.08} />
                <text x={M.left - 8} y={geom.y(tk)} textAnchor="end" dominantBaseline="middle" className="fill-muted-foreground" fontSize={10}>
                  {tk === 0 ? '0' : `$${compact(tk)}`}
                </text>
              </g>
            ))}
            {rows.map((d, i) => {
              let run = 0;
              return (
                <g key={d.date} opacity={(hover != null && hover !== i ? 0.45 : 1) * (partial(d) ? 0.5 : 1)}>
                  {ORDER.map((id) => {
                    const v = d.venues.find((x) => x.id === id)?.volume_usd ?? 0;
                    if (v <= 0) return null;
                    const y0 = geom.y(run);
                    run += v;
                    const st = venueStyle(id);
                    return <rect key={id} x={geom.x(i)} y={geom.y(run)} width={geom.barW} height={Math.max(0, y0 - geom.y(run))} fill={st.color} fillOpacity={st.opacity} />;
                  })}
                  {i % geom.labelEvery === 0 && (
                    <text x={geom.x(i) + geom.barW / 2} y={H - 6} textAnchor="middle" className="fill-muted-foreground" fontSize={10}>
                      {day(d.date, rows.length > 120 || weekly ? 'MMM yyyy' : 'MMM d')}
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

// Open positions per market on the latest day, long against short.
export function OpenInterest({ data, state }: { data: PerpsOpenInterestDay[] | null; state: 'loading' | 'ready' | 'error' }) {
  const latest = data?.length ? data[data.length - 1] : null;
  const rows = (latest?.by_market ?? [])
    .filter((m) => m.long_usd + m.short_usd > 0)
    .sort((a, b) => b.long_usd + b.short_usd - (a.long_usd + a.short_usd))
    .slice(0, 6);
  const max = Math.max(...rows.map((m) => Math.max(m.long_usd, m.short_usd)), 1);
  return (
    <div className="min-w-0 px-4 sm:px-5 py-3">
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <span className="text-[12px] font-medium text-foreground">Open interest{latest ? `, ${day(latest.date)}` : ''}</span>
        {latest && (
          <span className="text-[11px] text-muted-foreground">
            <span className="num text-foreground">{usd(latest.long_usd)}</span> long, <span className="num text-foreground">{usd(latest.short_usd)}</span> short
          </span>
        )}
      </div>
      {state === 'loading' && !data ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-6 rounded bg-muted/50 animate-pulse" />)}</div>
      ) : !rows.length ? (
        <p className="text-[12px] text-muted-foreground">{state === 'error' ? "Couldn't be loaded. Try again in a minute." : 'No open positions.'}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((m) => (
            <li key={m.market} className="text-[12px]">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-foreground truncate">
                  {m.name}
                  {/* V1 positions still open from before it closed have no pool; say which venue. */}
                  <span className="ml-1.5 text-[11px] text-muted-foreground">{m.pool ?? (m.venue === 'gmx-v1' ? 'GMX V1' : '')}</span>
                </span>
                <span className="num text-muted-foreground shrink-0">
                  {usd(m.long_usd)} / {usd(m.short_usd)}
                </span>
              </div>
              <div className="mt-1 flex h-1.5 gap-px" aria-hidden>
                <span className="flex-1 flex justify-end">
                  <span className="h-full rounded-l-sm" style={{ width: `${(m.long_usd / max) * 100}%`, background: LONG }} />
                </span>
                <span className="flex-1">
                  <span className="block h-full rounded-r-sm" style={{ width: `${(m.short_usd / max) * 100}%`, background: SHORT }} />
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: LONG }} />Long</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: SHORT }} />Short</span>
      </div>
    </div>
  );
}

export function Liquidations({ items, state, title }: { items: PerpsLiquidation[] | null; state: 'loading' | 'ready' | 'error'; title: string }) {
  return (
    <div className="min-w-0 border-t lg:border-t-0 border-border py-3">
      <div className="px-4 sm:px-5 pb-1.5 text-[12px] font-medium text-foreground">{title}</div>
      {state === 'loading' && !items ? (
        <div className="px-4 sm:px-5 space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-8 rounded bg-muted/50 animate-pulse" />)}</div>
      ) : !items?.length ? (
        <p className="px-4 sm:px-5 text-[12px] text-muted-foreground">{state === 'error' ? "Couldn't be loaded. Try again in a minute." : 'None in this period.'}</p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((l, i) => (
            <li key={`${l.tx_hash}-${i}`} className="px-4 sm:px-5 py-2 flex items-center justify-between gap-3">
              <span className="min-w-0">
                <span className="block text-[12px] text-foreground truncate">
                  {l.is_long ? 'Long' : 'Short'} {l.market_name}
                  {l.pool && <span className="text-muted-foreground"> ({l.pool})</span>}
                </span>
                <span className="block text-[11px] text-muted-foreground">
                  {/* UTC, like the daily bars. */}
                  {l.venue === 'gmx-v1' ? 'GMX V1' : 'GMX V2'}, {format(parseISO(l.time.slice(0, 19)), 'MMM d, yyyy HH:mm')} UTC
                </span>
              </span>
              <a
                href={`https://snowtrace.io/tx/${l.tx_hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="num shrink-0 text-[13px] text-foreground hover:underline underline-offset-2 decoration-border"
                title="Open the transaction"
              >
                {usd(l.size_usd)}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
