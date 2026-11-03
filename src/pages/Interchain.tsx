import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { SEO } from '../components/SEO';
import { PAGE_SEO } from '../utils/pageSeo';
import { L1Logo, SegmentedControl, StatStrip, TokenLogo } from '../components/instrument';
import type { StatItem } from '../components/instrument';
import { SectionErrorBoundary } from '../components/SectionErrorBoundary';
import { IcmByChain, ICM_RANGES, FROM_CCHAIN, TO_CCHAIN } from '../components/IcmByChain';
import type { RangeValue } from '../components/IcmByChain';
import { getChains, getIcmApps, getIcmMessages, getIcmSummary, getIcmTimeseries } from '../api';
import type { IcmApp, IcmDay, IcmMessage, IcmSummary, IcmToken } from '../api';
import { usePolling } from '../hooks/usePolling';
import type { Chain } from '../types';
import { WEEKLY_AFTER_DAYS, weekStart } from '../utils/weeks';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { chartPointerProps } from '../utils/chartPointer';

const C_CHAIN_ID = '2q9e4r6Mu3U68nU1fYjgbR6JvwrRx36CohpAX5UQxse55x1Q5';
const NEW_COLOR = '#199e70';

const VIEWS = [
  { value: 'map', label: 'Map' },
  { value: 'time', label: 'Over time' },
] as const;

const num = (n: number) => n.toLocaleString('en-US');
function compact(v: number): string {
  const trim = (n: number) => n.toFixed(1).replace(/\.0$/, '');
  if (v >= 1e6) return `${trim(v / 1e6)}M`;
  if (v >= 1e4) return `${trim(v / 1e3)}K`;
  return num(Math.round(v));
}
const day = (d: string, f = 'MMM d') => format(parseISO(d), f);
// Omnicoin's bridge sent one repeated transfer to the C-Chain about 258K times in this week.
const coversBurst = (from: string | undefined, to: string | undefined) => !!from && !!to && from <= '2026-09-11' && to >= '2026-09-04';

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

/** Size of an element that may mount after a loading state, so it's measured through a callback ref. */
function useBox<T extends HTMLElement>() {
  const [el, ref] = useState<T | null>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return { ref, box };
}

/** Chains by P-Chain blockchain ID, for names, logos and links. */
function useChainIndex() {
  const [chains, setChains] = useState<Chain[]>([]);
  useEffect(() => {
    getChains().then(setChains).catch(() => setChains([]));
  }, []);
  return useMemo(() => new Map(chains.filter((c) => c.platformChainId).map((c) => [c.platformChainId!, c])), [chains]);
}
type ChainIndex = ReturnType<typeof useChainIndex>;
const nameOf = (index: ChainIndex, id: string, fallback: string) => index.get(id)?.chainName || fallback || `${id.slice(0, 8)}…`;

export function Interchain() {
  const [range, setRange] = useState<RangeValue>('30');
  const [view, setView] = useState<'map' | 'time'>('map');
  const summary = useLoad(() => getIcmSummary(Number(range)), range);
  const series = useLoad(() => getIcmTimeseries(Number(range)), range);
  const history = useLoad(() => getIcmTimeseries(3650), 'all');
  const index = useChainIndex();
  const wide = useMediaQuery('(min-width: 768px)', true);
  const nodes = useHubNodes(summary.data, index, wide ? 16 : 9);
  const [hover, setHover] = useState<string | null>(null);

  const s = summary.data;
  const t = s?.totals;
  // The API counts from the C-Chain's side: "received" is what L1s sent to it.
  const toC = t?.received ?? 0;
  const fromC = t?.sent ?? 0;
  const active = (s?.by_chain ?? []).filter((c) => c.total > 0);
  const ever = useMemo(() => {
    const seen = new Set<string>();
    for (const d of history.data ?? []) for (const c of d.by_chain) if (c.total > 0) seen.add(c.blockchain_id);
    return seen.size;
  }, [history.data]);
  const rangeLabel = !s ? '' : s.days > 365 ? `since ${day(s.from, 'MMMM yyyy')}` : s.days === 365 ? 'in the last year' : `in the last ${s.days} days`;
  const lead = active[0];

  const stats: StatItem[] = t
    ? [
        { label: 'Messages', value: compact(t.total), sub: `${compact(t.total / Math.max(1, s!.days))} a day on average` },
        { label: 'To C-Chain', value: compact(toC), sub: 'sent by L1s' },
        { label: 'From C-Chain', value: compact(fromC), sub: 'sent to L1s' },
        { label: 'Active L1s', value: String(active.length), sub: ever ? `of ${ever} that have used ICM` : 'exchanged a message' },
      ]
    : ['Messages', 'To C-Chain', 'From C-Chain', 'Active L1s'].map((label) => ({ label, value: '—', sub: summary.state === 'error' ? 'Unavailable' : ' ' }));

  return (
    <div>
      <SEO {...PAGE_SEO.interchain} />

      <section
        className="relative border-b border-border bg-stage md:h-[min(calc(100vh-48px),1200px)] md:min-h-[640px]"
        aria-label="Interchain messages"
      >
        <div className="md:absolute md:inset-0 flex flex-col">
          <div className="max-w-7xl 2xl:max-w-screen-2xl w-full mx-auto px-4 sm:px-6 pt-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-[18px] leading-6 font-semibold text-foreground">Interchain</h1>
              {s && t ? (
                <>
                  <p className="mt-2 text-[26px] sm:text-[34px] leading-tight font-medium text-foreground max-w-4xl">
                    Avalanche L1s exchanged <span className="tabular-nums">{num(t.total)}</span> messages with the C‑Chain {rangeLabel}.
                  </p>
                  <p className="mt-1.5 text-[15px] sm:text-[17px] leading-snug text-foreground/80 max-w-3xl">
                    <span className="num">{num(toC)}</span> went to the C-Chain and <span className="num">{num(fromC)}</span> came back
                    {lead && t.total > 0 && (
                      <>
                        . {nameOf(index, lead.blockchain_id, lead.name)} carried <span className="num">{Math.round((lead.total / t.total) * 100)}%</span> of them
                      </>
                    )}
                    .
                  </p>
                </>
              ) : summary.state === 'error' ? (
                <p className="mt-3 text-[13px] text-muted-foreground">Message counts couldn't be loaded. Try again in a minute.</p>
              ) : (
                <div className="mt-3 h-9 w-[min(560px,80vw)] rounded bg-muted animate-pulse" />
              )}
            </div>
            <div className="self-start shrink-0 flex items-center gap-2">
              <SegmentedControl size="xs" value={view} options={VIEWS} onChange={setView} ariaLabel="Chart view" />
              <SegmentedControl size="xs" value={range} options={ICM_RANGES} onChange={setRange} ariaLabel="Range" />
            </div>
          </div>

          <div className="relative h-[460px] md:h-auto md:flex-1 md:min-h-0 mx-4 sm:mx-6 lg:mx-10 mt-4 mb-6 md:mb-[128px]">
            <SectionErrorBoundary label="the interchain chart">
              {view === 'map' ? (
                <div className="h-full grid grid-cols-1 grid-rows-[auto_minmax(0,1fr)] md:grid-rows-1 md:grid-cols-[minmax(0,1fr)_300px] gap-2 md:gap-8">
                  <div className="md:hidden flex items-center gap-4 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: TO_CCHAIN }} />To C-Chain</span>
                    <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: FROM_CCHAIN }} />From C-Chain</span>
                    <span>Rings: 10x each</span>
                  </div>
                  <HubMap nodes={nodes} summary={s} state={summary.state} index={index} hover={hover} setHover={setHover} />
                  <div className="hidden md:block min-h-0">
                    <RouteRail nodes={nodes} summary={s} hover={hover} setHover={setHover} />
                  </div>
                </div>
              ) : (
                <FlowChart days={series.data} state={series.state} />
              )}
            </SectionErrorBoundary>
            {coversBurst(s?.from, s?.as_of) && (
              <p className="absolute left-0 bottom-0 md:-bottom-6 text-[11px] text-muted-foreground">
                {view === 'map'
                  ? "Omnicoin's share comes from a one-off burst of repeated bridge transfers to the C-Chain on Sep 4 to 11, 2026."
                  : 'The Sep 4 to 11, 2026 spike is a one-off burst of repeated Omnicoin bridge transfers to the C-Chain.'}
              </p>
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

        <SectionErrorBoundary label="messages by chain">
          <IcmByChain range={range} limit={15} />
        </SectionErrorBoundary>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
          <div className="lg:col-span-2 min-w-0">
            <SectionErrorBoundary label="apps">
              <AppsCard range={range} index={index} />
            </SectionErrorBoundary>
          </div>
          <SectionErrorBoundary label="latest messages">
            <RecentMessages index={index} />
          </SectionErrorBoundary>
        </div>

        <SectionErrorBoundary label="adoption">
          <Adoption days={history.data} state={history.state} index={index} />
        </SectionErrorBoundary>

        <p className="text-[11px] leading-relaxed text-muted-foreground max-w-4xl">
          Counted from the TeleporterMessenger contract on the C-Chain (0x253b2784c75e510dD0fF1da844684a1aC0aa5fcf): every
          message it sends to an L1 and every message it receives from one, once each. Direct messages between two L1s that
          never touch the C-Chain, about 0.02% of all ICM traffic, aren't counted. Days are complete UTC days, starting Mar 5,
          2024, when the messenger went live on the C-Chain.
        </p>
      </div>
    </div>
  );
}

type HubNode = { id: string; name: string; chain?: Chain; toC: number; fromC: number; total: number; other: number };

/** The busiest L1s plus one "others" entry, from the C-Chain's counts flipped to each L1's side. */
function useHubNodes(summary: IcmSummary | null, index: ChainIndex, n: number): HubNode[] {
  return useMemo(() => {
    const all = (summary?.by_chain ?? []).filter((c) => c.total > 0);
    const top: HubNode[] = all.slice(0, n).map((c) => ({ id: c.blockchain_id, name: nameOf(index, c.blockchain_id, c.name), chain: index.get(c.blockchain_id), toC: c.received, fromC: c.sent, total: c.total, other: 0 }));
    const rest = all.slice(n);
    if (rest.length) {
      top.push({
        id: 'other',
        name: `${rest.length} other ${rest.length === 1 ? 'L1' : 'L1s'}`,
        toC: rest.reduce((a, c) => a + c.received, 0),
        fromC: rest.reduce((a, c) => a + c.sent, 0),
        total: rest.reduce((a, c) => a + c.total, 0),
        other: rest.length,
      });
    }
    return top;
  }, [summary, index, n]);
}

/**
 * The C-Chain at the center and L1s on rings by magnitude: each ring is ten
 * times the messages of the one outside it, so distance reads as a scale.
 * Around the circle, chains run from mostly sending to the C-Chain (left) to
 * mostly receiving from it (right). Two straight lanes join each to the hub.
 */
function HubMap({ nodes, summary, state, index, hover, setHover }: {
  nodes: HubNode[];
  summary: IcmSummary | null;
  state: 'loading' | 'ready' | 'error';
  index: ChainIndex;
  hover: string | null;
  setHover: (id: string | null) => void;
}) {
  const navigate = useNavigate();
  const wide = useMediaQuery('(min-width: 768px)', true);
  const still = useMediaQuery('(prefers-reduced-motion: reduce)', false);
  const { ref, box } = useBox<HTMLDivElement>();

  const layout = useMemo(() => {
    if (!box || !nodes.length) return null;
    const W = box.w;
    const H = box.h;
    const cx = W / 2;
    const cy = H / 2 + 6;
    const hubR = wide ? 28 : 20;
    // Rings at powers of ten covering every chain shown.
    const totals = nodes.map((d) => Math.max(1, d.total));
    const lo = Math.floor(Math.log10(Math.min(...totals)));
    const hi = Math.max(lo + 1, Math.ceil(Math.log10(Math.max(...totals))));
    const ry = H / 2 - (wide ? 34 : 26);
    const rx = Math.min(W / 2 - (wide ? 80 : 40), ry * 1.45);
    const inner = (hubR + (wide ? 40 : 28)) / ry; // the top ring sits just outside the hub
    const frac = (v: number) => 1 - ((Math.log10(Math.max(1, v)) - lo) / (hi - lo)) * (1 - inner);
    const rings = Array.from({ length: hi - lo + 1 }, (_, k) => lo + k).map((p) => ({ value: 10 ** p, f: frac(10 ** p) }));
    const maxTotal = Math.max(...totals);
    const maxLeg = Math.max(...nodes.flatMap((d) => [d.toC, d.fromC]), 1);
    const size = (v: number) => (wide ? 7 : 5) + (wide ? 15 : 10) * Math.sqrt(v / maxTotal);
    // Order by direction: mostly to the C-Chain first (down the left), mostly back last (up the right).
    const order = [...nodes].sort((a, b) => b.toC / Math.max(1, b.total) - a.toC / Math.max(1, a.total));
    const n = order.length;
    const pts = order.map((d, i) => ({ d, r: size(d.total), f: frac(d.total), a: -Math.PI / 2 - ((i + 0.5) / n) * Math.PI * 2 }));
    const pos = (p: { f: number; a: number }) => ({ x: cx + Math.cos(p.a) * p.f * rx, y: cy + Math.sin(p.a) * p.f * ry });
    // Distance carries the value, so overlaps are fixed by nudging angles only.
    for (let k = 0; k < 80; k++) {
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          if (i === j) continue;
          const p = pts[i], q = pts[j];
          const P = pos(p), Q = pos(q);
          const dd = Math.hypot(Q.x - P.x, Q.y - P.y);
          const need = p.r + q.r + (wide ? 26 : 16);
          if (dd < need) {
            let da = p.a - q.a;
            while (da > Math.PI) da -= 2 * Math.PI;
            while (da < -Math.PI) da += 2 * Math.PI;
            p.a += (da >= 0 ? 1 : -1) * 0.012;
          }
        }
      }
    }
    const placed = pts.map((p) => ({ ...p, ...pos(p) }));
    return { W, H, cx, cy, rx, ry, hubR, rings, placed, maxLeg };
  }, [box, nodes, wide]);

  const cLogo = index.get(C_CHAIN_ID)?.chainLogoUri;
  const total = summary?.totals.total ?? 0;

  return (
    <div ref={ref} className={`relative h-full w-full ${state === 'loading' ? 'opacity-60' : ''}`}>
      {!summary ? (
        state === 'error' ? (
          <div className="h-full flex items-center justify-center text-[12px] text-muted-foreground">The map couldn't be loaded. Try again in a minute.</div>
        ) : (
          <div className="h-full rounded bg-muted/40 animate-pulse" />
        )
      ) : layout && (
        <svg width={layout.W} height={layout.H} className="absolute inset-0 block overflow-visible" role="img" aria-label="The C-Chain at the center with L1s on rings by number of messages, each ring ten times the one outside it">
          <defs>
            <radialGradient id="icm-halo">
              <stop offset="0" stopColor="currentColor" stopOpacity={0.12} />
              <stop offset="1" stopColor="currentColor" stopOpacity={0} />
            </radialGradient>
            <clipPath id="icm-hub-clip"><circle cx={layout.cx} cy={layout.cy} r={layout.hubR - 3} /></clipPath>
            <filter id="icm-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation={wide ? 5 : 3.5} />
            </filter>
            {layout.placed.map((p, i) => (
              <clipPath key={p.d.id} id={`icm-clip-${i}`}><circle cx={p.x} cy={p.y} r={p.r - 3} /></clipPath>
            ))}
          </defs>

          {/* The scale: one ring per power of ten, labelled at the top. */}
          <g className="text-foreground">
            <circle cx={layout.cx} cy={layout.cy} r={layout.hubR * 3} fill="url(#icm-halo)" />
            {layout.rings.map((g) => (
              <g key={g.value}>
                {/* Rings brighten toward the hub, where the busiest chains sit. */}
                <ellipse
                  cx={layout.cx}
                  cy={layout.cy}
                  rx={g.f * layout.rx}
                  ry={g.f * layout.ry}
                  fill="none"
                  stroke="currentColor"
                  strokeOpacity={0.06 + 0.16 * ((1 - g.f) / Math.max(0.01, 1 - layout.rings[layout.rings.length - 1].f))}
                  strokeDasharray="2 5"
                />
                <text
                  x={layout.cx}
                  y={layout.cy - g.f * layout.ry - 4}
                  textAnchor="middle"
                  className="fill-muted-foreground num"
                  fontSize={10}
                  style={{ paintOrder: 'stroke', stroke: 'rgb(var(--stage-rgb))', strokeWidth: 4 }}
                >
                  {g.value >= 1e6 ? `${g.value / 1e6}M` : g.value >= 1e3 ? `${g.value / 1e3}K` : g.value}
                </text>
              </g>
            ))}
            {wide && (
              <>
                <text x={layout.cx - layout.rx - 8} y={layout.cy} textAnchor="end" dominantBaseline="middle" className="fill-muted-foreground" fontSize={11}>
                  Mostly to C-Chain
                </text>
                <text x={layout.cx + layout.rx + 8} y={layout.cy} textAnchor="start" dominantBaseline="middle" className="fill-muted-foreground" fontSize={11}>
                  Mostly from C-Chain
                </text>
              </>
            )}
          </g>

          {layout.placed.map((p) => {
            const d = p.d;
            const dx = layout.cx - p.x, dy = layout.cy - p.y;
            const len = Math.hypot(dx, dy) || 1;
            const nx = -dy / len, ny = dx / len;
            const width = (v: number) => (v > 0 ? 1.2 + (wide ? 8 : 5) * Math.sqrt(v / layout.maxLeg) : 0);
            const wIn = width(d.toC);
            const wOut = width(d.fromC);
            // Side by side: to the C-Chain on one side of the line, back on the other.
            const lane = (w: number, side: number, inward: boolean) => {
              const o = side * (w / 2 + 0.8);
              const a = { x: p.x + nx * o, y: p.y + ny * o };
              const b = { x: layout.cx + nx * o, y: layout.cy + ny * o };
              const [s, e] = inward ? [a, b] : [b, a];
              return `M${s.x},${s.y} L${e.x},${e.y}`;
            };
            const on = hover == null || hover === d.id;
            const dots = (v: number) => (v / layout.maxLeg > 0.25 ? 3 : v / layout.maxLeg > 0.03 ? 2 : 1);
            return (
              <g key={d.id} className="transition-opacity duration-200" opacity={on ? 1 : 0.12}>
                {[
                  { w: wIn, v: d.toC, path: lane(wIn, 1, true), color: TO_CCHAIN },
                  { w: wOut, v: d.fromC, path: lane(wOut, -1, false), color: FROM_CCHAIN },
                ].map((l, k) =>
                  l.w > 0 ? (
                    <g key={k}>
                      {/* A soft glow under the busiest lanes. */}
                      {l.v / layout.maxLeg > 0.15 && (
                        <path d={l.path} stroke={l.color} strokeWidth={l.w * 3} strokeOpacity={0.35} strokeLinecap="round" fill="none" filter="url(#icm-glow)" />
                      )}
                      <path d={l.path} stroke={l.color} strokeWidth={l.w} strokeOpacity={hover === d.id ? 0.85 : 0.45} strokeLinecap="round" fill="none" />
                      {!still &&
                        Array.from({ length: dots(l.v) }, (_, m) => (
                          <circle key={m} r={Math.max(1.4, Math.min(2.6, l.w / 2.5))} fill={l.color}>
                            <animateMotion dur={`${(len / 55).toFixed(1)}s`} begin={`${((m * len) / 55 / dots(l.v)).toFixed(1)}s`} repeatCount="indefinite" path={l.path} />
                          </circle>
                        ))}
                    </g>
                  ) : null,
                )}
              </g>
            );
          })}

          <circle cx={layout.cx} cy={layout.cy} r={layout.hubR} className="fill-card stroke-border" strokeWidth={1.5} />
          {cLogo ? (
            <image href={cLogo} x={layout.cx - layout.hubR + 3} y={layout.cy - layout.hubR + 3} width={(layout.hubR - 3) * 2} height={(layout.hubR - 3) * 2} clipPath="url(#icm-hub-clip)" preserveAspectRatio="xMidYMid slice" />
          ) : (
            <text x={layout.cx} y={layout.cy} textAnchor="middle" dominantBaseline="central" className="fill-foreground" fontSize={14} fontWeight={600}>C</text>
          )}

          {layout.placed.map((p, i) => {
            const d = p.d;
            const on = hover == null || hover === d.id;
            const share = d.total > 0 ? d.toC / d.total : 0;
            const ring = 2 * Math.PI * (p.r - 1);
            const cos = Math.cos(p.a);
            const sin = Math.sin(p.a);
            // Labels sit outward from the hub, on the side the chain is on.
            const anchor = Math.abs(cos) < 0.3 ? 'middle' : cos > 0 ? 'start' : 'end';
            const lx = anchor === 'middle' ? p.x : p.x + (cos > 0 ? p.r + 6 : -p.r - 6);
            const ly = anchor === 'middle' ? (sin < 0 ? p.y - p.r - 20 : p.y + p.r + 11) : p.y - 3;
            const labelled = wide || hover === d.id || d.total / Math.max(1, total) >= 0.01;
            const go = d.chain ? () => navigate(`/chain/${d.chain!.chainId}`) : undefined;
            const shortName = !wide && d.name.length > 11 ? `${d.name.slice(0, 10)}…` : d.name;
            return (
              <g
                key={d.id}
                opacity={on ? 1 : 0.3}
                className={`transition-opacity duration-200 ${go ? 'cursor-pointer' : ''} focus:outline-none`}
                onMouseEnter={() => setHover(d.id)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(d.id)}
                onBlur={() => setHover(null)}
                onClick={go}
                onKeyDown={(e) => { if (e.key === 'Enter' && go) go(); }}
                tabIndex={0}
                role={go ? 'link' : undefined}
                aria-label={`${d.name}: ${num(d.toC)} messages to the C-Chain, ${num(d.fromC)} from it`}
              >
                <circle cx={p.x} cy={p.y} r={p.r} className="fill-card" />
                <circle cx={p.x} cy={p.y} r={p.r - 1} fill="none" stroke={FROM_CCHAIN} strokeWidth={2} />
                <circle cx={p.x} cy={p.y} r={p.r - 1} fill="none" stroke={TO_CCHAIN} strokeWidth={2} strokeDasharray={`${ring * share} ${ring}`} transform={`rotate(-90 ${p.x} ${p.y})`} />
                {d.chain?.chainLogoUri ? (
                  <image href={d.chain.chainLogoUri} x={p.x - p.r + 3} y={p.y - p.r + 3} width={(p.r - 3) * 2} height={(p.r - 3) * 2} clipPath={`url(#icm-clip-${i})`} preserveAspectRatio="xMidYMid slice" />
                ) : (
                  <text x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central" className="fill-muted-foreground" fontSize={Math.max(8, p.r * 0.7)} fontWeight={600}>
                    {d.other ? '+' : d.name.charAt(0).toUpperCase()}
                  </text>
                )}
                {labelled && (
                  <>
                    <text x={lx} y={ly} textAnchor={anchor} dominantBaseline="middle" className="fill-foreground" fontSize={wide ? 11.5 : 10} fontWeight={500}>
                      {shortName}
                    </text>
                    <text x={lx} y={ly + 12} textAnchor={anchor} dominantBaseline="middle" className="fill-muted-foreground num" fontSize={wide ? 10.5 : 9.5}>
                      {compact(d.total)}
                    </text>
                  </>
                )}
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

/** Beside the map: the same chains as a ranked list, linked to it by hover. */
function RouteRail({ nodes, summary, hover, setHover }: { nodes: HubNode[]; summary: IcmSummary | null; hover: string | null; setHover: (id: string | null) => void }) {
  const total = summary?.totals.total ?? 0;
  const max = Math.max(...nodes.map((d) => d.total), 1);
  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: TO_CCHAIN }} />To C-Chain</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: FROM_CCHAIN }} />From C-Chain</span>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">Each ring inward is ten times the messages. Left leans to the C-Chain, right leans back.</p>
      <ul className="mt-3 flex-1 min-h-0 overflow-y-auto divide-y divide-border/60 border-y border-border/60">
        {summary
          ? nodes.map((d, i) => {
              const row = (
                <div className={`py-2 transition-opacity ${hover != null && hover !== d.id ? 'opacity-40' : ''}`}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="num w-4 text-right text-[10px] text-muted-foreground shrink-0">{d.other ? '' : i + 1}</span>
                      {d.other ? (
                        <span className="w-[18px] h-[18px] rounded-full bg-accent text-[10px] flex items-center justify-center shrink-0">+</span>
                      ) : (
                        <L1Logo src={d.chain?.chainLogoUri} name={d.name} size={18} />
                      )}
                      <span className="truncate text-[12.5px] font-medium text-foreground">{d.name}</span>
                    </span>
                    <span className="num text-[12px] text-foreground shrink-0">
                      {compact(d.total)} <span className="text-[10px] text-muted-foreground">{total > 0 ? (d.total / total < 0.001 ? '<0.1%' : `${((d.total / total) * 100).toFixed(d.total / total >= 0.1 ? 0 : 1)}%`) : ''}</span>
                    </span>
                  </div>
                  <div className="mt-1.5 ml-6 flex h-1.5 rounded-sm overflow-hidden" style={{ width: `calc(${Math.max(3, (d.total / max) * 100)}% - 1.5rem)` }}>
                    <span style={{ width: `${(d.toC / Math.max(1, d.total)) * 100}%`, background: TO_CCHAIN }} />
                    <span style={{ width: `${(d.fromC / Math.max(1, d.total)) * 100}%`, background: FROM_CCHAIN }} />
                  </div>
                </div>
              );
              return (
                <li key={d.id} onMouseEnter={() => setHover(d.id)} onMouseLeave={() => setHover(null)}>
                  {d.chain ? (
                    <Link to={`/chain/${d.chain.chainId}`} onFocus={() => setHover(d.id)} onBlur={() => setHover(null)} className="block focus:outline-none focus-visible:bg-accent/40">
                      {row}
                    </Link>
                  ) : (
                    row
                  )}
                </li>
              );
            })
          : Array.from({ length: 8 }, (_, i) => <li key={i} className="py-2"><div className="h-7 rounded bg-muted/50 animate-pulse" /></li>)}
      </ul>
    </div>
  );
}

const M = { top: 12, right: 8, bottom: 24, left: 52 };

/** Messages to the C-Chain above the axis and from it below, per day (weeks past about a year). */
function FlowChart({ days, state }: { days: IcmDay[] | null; state: 'loading' | 'ready' | 'error' }) {
  const [hover, setHover] = useState<number | null>(null);
  const { ref, box } = useBox<HTMLDivElement>();
  const W = Math.max(box?.w ?? 0, 1);
  const H = Math.max(box?.h ?? 0, 160);

  const { rows, weekly } = useMemo(() => {
    const list = (days ?? []).map((d) => ({ date: d.date, toC: d.received, fromC: d.sent, daysIn: 1 }));
    if (list.length <= WEEKLY_AFTER_DAYS) return { rows: list, weekly: false };
    const weeks = new Map<string, { date: string; toC: number; fromC: number; daysIn: number }>();
    for (const d of list) {
      const k = weekStart(d.date);
      const w = weeks.get(k) ?? { date: k, toC: 0, fromC: 0, daysIn: 0 };
      w.toC += d.toC;
      w.fromC += d.fromC;
      w.daysIn += 1;
      weeks.set(k, w);
    }
    return { rows: [...weeks.values()], weekly: true };
  }, [days]);
  useEffect(() => setHover(null), [rows]);

  const geom = useMemo(() => {
    if (!rows.length || !box) return null;
    const peak = Math.max(...rows.map((d) => Math.max(d.toC, d.fromC)), 1);
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

  const at = hover != null ? rows[hover] : null;
  const sumTo = rows.reduce((a, d) => a + d.toC, 0);
  const sumFrom = rows.reduce((a, d) => a + d.fromC, 0);

  return (
    <div className="h-full flex flex-col">
      {rows.length > 0 && (
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 mb-2">
          <div>
            <div className="num text-[22px] leading-7 font-medium text-foreground">{num(at ? at.toC + at.fromC : sumTo + sumFrom)} messages</div>
            <div className="text-[11px] text-muted-foreground">
              {at
                ? `${weekly ? `Week of ${day(at.date, 'MMM d, yyyy')}${at.daysIn < 7 ? ` (partial, ${at.daysIn} ${at.daysIn === 1 ? 'day' : 'days'})` : ''}` : day(at.date, 'EEE, MMM d, yyyy')}: ${num(at.toC)} to the C-Chain, ${num(at.fromC)} from it`
                : `${num(sumTo)} to the C-Chain, ${num(sumFrom)} from it, ${day(rows[0].date)} to ${day(rows[rows.length - 1].date)}${weekly ? '; bars are weeks' : ''}`}
            </div>
          </div>
          <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: TO_CCHAIN }} />To C-Chain, above</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: FROM_CCHAIN }} />From C-Chain, below</span>
          </div>
        </div>
      )}
      <div ref={ref} className="relative flex-1 min-h-0 overflow-hidden">
        {state === 'loading' && !rows.length ? (
          <div className="absolute inset-0 rounded bg-muted/50 animate-pulse" />
        ) : !geom ? (
          <div className="absolute inset-0 flex items-center justify-center text-[12px] text-muted-foreground">
            {state === 'error' ? "Daily messages couldn't be loaded. Try again in a minute." : ''}
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
            aria-label={`${weekly ? 'Weekly' : 'Daily'} interchain messages to the C-Chain above the axis and from it below`}
          >
            {geom.ticks.map((tk) => (
              <g key={tk}>
                <line x1={M.left} x2={W - M.right} y1={geom.y(tk)} y2={geom.y(tk)} stroke="currentColor" strokeOpacity={tk === 0 ? 0.3 : 0.08} />
                <text x={M.left - 8} y={geom.y(tk)} textAnchor="end" dominantBaseline="middle" className="fill-muted-foreground num" fontSize={10}>
                  {compact(Math.abs(tk))}
                </text>
              </g>
            ))}
            {rows.map((d, i) => (
              <g key={d.date} opacity={hover == null || hover === i ? 1 : 0.45}>
                {d.toC > 0 && <rect x={geom.x(i)} y={geom.y(d.toC)} width={geom.barW} height={geom.y(0) - geom.y(d.toC)} fill={TO_CCHAIN} />}
                {d.fromC > 0 && <rect x={geom.x(i)} y={geom.y(0)} width={geom.barW} height={geom.y(-d.fromC) - geom.y(0)} fill={FROM_CCHAIN} />}
              </g>
            ))}
            {rows.map((d, i) =>
              i % geom.labelEvery === 0 ? (
                <text key={`l${d.date}`} x={geom.x(i) + geom.barW / 2} y={H - 6} textAnchor="middle" className="fill-muted-foreground num" fontSize={10}>
                  {day(d.date, rows.length > 400 || weekly ? 'MMM yyyy' : 'MMM d')}
                </text>
              ) : null,
            )}
          </svg>
        )}
      </div>
    </div>
  );
}

/** How many L1s use ICM each month, and which started most recently. */
function Adoption({ days, state, index }: { days: IcmDay[] | null; state: 'loading' | 'ready' | 'error'; index: ChainIndex }) {
  const [hover, setHover] = useState<number | null>(null);
  const data = useMemo(() => {
    if (!days?.length) return null;
    const first = new Map<string, { date: string; name: string }>();
    const totals = new Map<string, number>();
    const months = new Map<string, { active: Set<string>; fresh: number }>();
    for (const d of days) {
      const m = d.date.slice(0, 7);
      const e = months.get(m) ?? { active: new Set<string>(), fresh: 0 };
      for (const c of d.by_chain) {
        if (c.total <= 0) continue;
        e.active.add(c.blockchain_id);
        totals.set(c.blockchain_id, (totals.get(c.blockchain_id) ?? 0) + c.total);
        if (!first.has(c.blockchain_id)) {
          first.set(c.blockchain_id, { date: d.date, name: c.name });
          e.fresh += 1;
        }
      }
      months.set(m, e);
    }
    // Start at the first month with traffic: the messenger's first months were nearly silent.
    const list = [...months.entries()].map(([m, e]) => ({ month: m, active: e.active.size, fresh: e.fresh }));
    const start = list.findIndex((x) => x.active > 0);
    const series = list.slice(Math.max(0, start));
    const newest = [...first.entries()]
      .sort((a, b) => b[1].date.localeCompare(a[1].date))
      .slice(0, 8)
      .map(([id, f]) => ({ id, date: f.date, name: nameOf(index, id, f.name), chain: index.get(id), total: totals.get(id) ?? 0 }));
    const year = days[days.length - 1].date.slice(0, 4);
    const thisYear = [...first.values()].filter((f) => f.date.startsWith(year)).length;
    return { series, newest, ever: first.size, year, thisYear };
  }, [days, index]);

  if (!data) {
    return (
      <section className="rounded-md border border-border bg-card p-5">
        {state === 'error' ? <p className="text-[12px] text-muted-foreground">Adoption history couldn't be loaded.</p> : <div className="h-40 rounded bg-muted/50 animate-pulse" />}
      </section>
    );
  }

  const max = Math.max(...data.series.map((m) => m.active), 1);
  const last = data.series[data.series.length - 1];
  const shown = hover != null ? data.series[hover] : null;
  const monthName = (m: string) => format(parseISO(`${m}-01`), 'MMMM yyyy');

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-stretch">
      <section className="lg:col-span-2 rounded-md border border-border bg-card">
        <header className="px-4 sm:px-5 pt-4 pb-3">
          <h2 className="text-[14px] font-semibold text-foreground">L1s using ICM</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">L1s that sent or received at least one message each month, with first-timers in green.</p>
        </header>
        <div className="px-4 sm:px-5 pb-4">
          <p className="text-[13px] text-foreground min-h-5">
            {shown ? (
              <>
                {monthName(shown.month)}: <span className="num">{shown.active}</span> L1s
                {shown.fresh > 0 && <span className="text-muted-foreground">, <span className="num text-foreground">{shown.fresh}</span> of them for the first time</span>}.
              </>
            ) : (
              <>
                <span className="num">{last.active}</span> L1s exchanged messages in {monthName(last.month)}
                <span className="text-muted-foreground">
                  {' '}(so far). <span className="num text-foreground">{data.ever}</span> have used ICM since March 2024,{' '}
                  <span className="num text-foreground">{data.thisYear}</span> of them new in {data.year}.
                </span>
              </>
            )}
          </p>
          <div className="mt-3 flex items-end gap-[3px] h-56" onMouseLeave={() => setHover(null)} role="img" aria-label="L1s using ICM each month">
            {data.series.map((m, i) => (
              <div
                key={m.month}
                className="flex-1 min-w-0 h-full flex flex-col justify-end"
                onMouseEnter={() => setHover(i)}
                title={`${monthName(m.month)}: ${m.active} L1s, ${m.fresh} new`}
              >
                <div className="w-full flex flex-col rounded-t-sm overflow-hidden" style={{ height: `${(m.active / max) * 100}%`, opacity: hover == null || hover === i ? 1 : 0.5 }}>
                  <div style={{ height: `${m.active ? (m.fresh / m.active) * 100 : 0}%`, background: NEW_COLOR }} />
                  <div className="flex-1" style={{ background: TO_CCHAIN }} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground num">
            <span>{format(parseISO(`${data.series[0].month}-01`), 'MMM yyyy')}</span>
            <span>{format(parseISO(`${last.month}-01`), 'MMM yyyy')}</span>
          </div>
        </div>
      </section>

      <section className="rounded-md border border-border bg-card">
        <header className="px-4 sm:px-5 pt-4 pb-3">
          <h2 className="text-[14px] font-semibold text-foreground">Newest to ICM</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">L1s by the day of their first message with the C-Chain.</p>
        </header>
        <ul className="divide-y divide-border border-t border-border">
          {data.newest.map((c) => {
            const row = (
              <span className="flex items-center gap-2.5 min-w-0">
                <L1Logo src={c.chain?.chainLogoUri} name={c.name} size={20} />
                <span className="truncate text-[13px] font-medium text-foreground">{c.name}</span>
              </span>
            );
            return (
              <li key={c.id} className="px-4 sm:px-5 py-2.5 flex items-center justify-between gap-3">
                {c.chain ? <Link to={`/chain/${c.chain.chainId}`} className="hover:underline underline-offset-2 min-w-0">{row}</Link> : row}
                <span className="text-right shrink-0">
                  <span className="block num text-[12px] text-foreground">{day(c.date, 'MMM d, yyyy')}</span>
                  <span className="block num text-[11px] text-muted-foreground">{num(c.total)} since</span>
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

// Tokens whose symbol is often reused by lookalikes; an ICTT app moving a token with
// one of these symbols at another address gets marked.
const CANONICAL: Record<string, string> = {
  WAVAX: '0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7',
  USDC: '0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e',
  USDT: '0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7',
  'BTC.B': '0x152b9d0fdc40c096757f570a51e494bd4b943e50',
  'WETH.E': '0x49d5c2bdffac6ce2bfdb6640f4f80f226bc10bab',
};
const lookalike = (t: IcmToken | null | undefined) => {
  if (!t) return false;
  const main = CANONICAL[t.symbol.toUpperCase()];
  return !!main && main !== t.address.toLowerCase();
};
const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const KIND: Record<IcmApp['kind'], { chip: string; title: string } | null> = {
  'ictt-home': { chip: 'ICTT home', title: 'Token bridge (ICTT): holds the original token on the C-Chain and sends it to L1s' },
  'ictt-remote': { chip: 'ICTT remote', title: "Token bridge (ICTT): the C-Chain copy of a token whose home is on an L1" },
  other: null,
};
const appName = (a: { name: string; label: { name: string } | null } | null, address: string, withAddress = true) =>
  a?.name || a?.label?.name || (withAddress ? `Unlabeled ${shortAddr(address)}` : 'Unlabeled contract');

function TokenTag({ token }: { token: IcmToken }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
      <TokenLogo address={token.address} symbol={token.symbol} size={13} />
      <span className="num">{token.symbol}</span>
      {lookalike(token) && (
        <span className="text-[10px] text-muted-foreground/80" title={`This token calls itself ${token.symbol} but isn't the main ${token.symbol} at ${shortAddr(CANONICAL[token.symbol.toUpperCase()])}`}>
          (not the main {token.symbol})
        </span>
      )}
    </span>
  );
}

/** The contracts on the C-Chain that send and receive ICM, busiest first. */
function AppsCard({ range, index }: { range: RangeValue; index: ChainIndex }) {
  const apps = useLoad(() => getIcmApps(Number(range), 50), range);
  const [showAll, setShowAll] = useState(false);
  const rows = (apps.data?.apps ?? []).filter((a) => a.total > 0);
  const total = rows.reduce((a, r) => a + r.total, 0);
  const max = Math.max(...rows.map((r) => r.total), 1);
  const ictt = rows.filter((r) => r.kind !== 'other').reduce((a, r) => a + r.total, 0);
  const shown = showAll ? rows : rows.slice(0, 10);
  const d = apps.data;
  const windowText = !d ? '' : d.days > 365 ? `since ${day(d.from, 'MMMM yyyy')}` : d.days === 365 ? 'in the last year' : `in the last ${d.days} days`;

  return (
    <section className="rounded-md border border-border bg-card min-w-0">
      <header className="px-4 sm:px-5 pt-4 pb-3">
        <h2 className="text-[14px] font-semibold text-foreground">Apps</h2>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          The C-Chain contracts sending and receiving messages. ICTT is Avalanche's token bridge standard: a home contract holds the original token, a remote one its copy.
        </p>
      </header>
      {apps.state === 'error' && !d ? (
        <p className="px-5 pb-5 text-[12px] text-muted-foreground">Apps couldn't be loaded. Try again in a minute.</p>
      ) : !d ? (
        <div className="px-5 pb-5 space-y-2">{Array.from({ length: 6 }, (_, i) => <div key={i} className="h-9 rounded bg-muted/50 animate-pulse" />)}</div>
      ) : (
        <div className={apps.state === 'loading' ? 'opacity-60' : ''}>
          <p className="px-4 sm:px-5 pb-3 text-[13px] text-foreground">
            <span className="num">{rows.length}</span> {rows.length === 1 ? 'app' : 'apps'} exchanged messages {windowText}.
            {total > 0 && (
              <span className="text-muted-foreground">
                {' '}Token bridges carried <span className="num text-foreground">{Math.round((ictt / total) * 100)}%</span>
                {rows[0] && <>, {appName(rows[0], rows[0].address)} alone <span className="num text-foreground">{Math.round((rows[0].total / total) * 100)}%</span></>}.
              </span>
            )}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px] whitespace-nowrap">
              <thead>
                <tr className="border-y border-border text-[11px] text-muted-foreground">
                  <th className="text-left font-normal px-4 sm:px-5 py-2">App</th>
                  <th className="text-left font-normal px-3 py-2 hidden sm:table-cell">With</th>
                  <th className="text-right font-normal px-3 py-2 hidden sm:table-cell">To C-Chain</th>
                  <th className="text-right font-normal px-3 py-2 hidden sm:table-cell">From C-Chain</th>
                  <th className="text-right font-normal px-4 py-2 sm:hidden">Messages</th>
                  <th className="text-left font-normal px-3 py-2 hidden md:table-cell w-[18%]">Messages</th>
                  <th className="text-right font-normal px-4 sm:px-5 py-2 hidden lg:table-cell">Since</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {shown.map((a) => {
                  const kind = KIND[a.kind];
                  return (
                    <tr key={a.address}>
                      <td className="px-4 sm:px-5 py-2.5 max-w-[16rem]">
                        <a href={`https://snowtrace.io/address/${a.address}`} target="_blank" rel="noopener noreferrer" className="block truncate text-[13px] font-medium text-foreground hover:underline underline-offset-2" title={a.address}>
                          {appName(a, a.address, false)}
                        </a>
                        <span className="mt-0.5 flex items-center gap-2">
                          {kind && <span className="text-[10px] px-1.5 py-px rounded-sm bg-accent text-foreground/80" title={kind.title}>{kind.chip}</span>}
                          {a.token ? <TokenTag token={a.token} /> : !kind && <span className="num text-[10px] text-muted-foreground">{shortAddr(a.address)}</span>}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 hidden sm:table-cell">
                        <span className="flex items-center -space-x-1.5" title={a.top_chains.map((c) => `${nameOf(index, c.blockchain_id, c.name)} ${num(c.total)}`).join(', ')}>
                          {a.top_chains.slice(0, 4).map((c) => (
                            <span key={c.blockchain_id} className="rounded-full ring-2 ring-card inline-flex">
                              <L1Logo src={index.get(c.blockchain_id)?.chainLogoUri} name={nameOf(index, c.blockchain_id, c.name)} size={18} />
                            </span>
                          ))}
                          {a.top_chains.length === 1 && <span className="pl-3 text-[11px] text-muted-foreground">{nameOf(index, a.top_chains[0].blockchain_id, a.top_chains[0].name)}</span>}
                        </span>
                      </td>
                      <td className="num text-right px-3 py-2.5 text-foreground hidden sm:table-cell">{num(a.received)}</td>
                      <td className="num text-right px-3 py-2.5 text-foreground hidden sm:table-cell">{num(a.sent)}</td>
                      <td className="num text-right px-4 py-2.5 text-foreground sm:hidden">{num(a.total)}</td>
                      <td className="px-3 py-2.5 hidden md:table-cell">
                        <span className="flex h-2 rounded-sm overflow-hidden" style={{ width: `${Math.max(2, (a.total / max) * 100)}%` }}>
                          <span style={{ width: `${(a.received / a.total) * 100}%`, background: TO_CCHAIN }} />
                          <span style={{ width: `${(a.sent / a.total) * 100}%`, background: FROM_CCHAIN }} />
                        </span>
                      </td>
                      <td className="num text-right px-4 sm:px-5 py-2.5 text-muted-foreground hidden lg:table-cell">{day(a.first_seen.slice(0, 10), 'MMM yyyy')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {rows.length > 10 && (
            <button type="button" onClick={() => setShowAll((v) => !v)} className="w-full px-4 sm:px-5 py-2.5 text-left text-[12px] text-muted-foreground hover:text-foreground border-t border-border">
              {showAll ? 'Show the top 10' : `Show all ${rows.length} apps`}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/** The latest messages, refreshed every minute while the page is open. */
function RecentMessages({ index }: { index: ChainIndex }) {
  const [items, setItems] = useState<IcmMessage[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [more, setMore] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const pagedRef = useRef(false);
  usePolling((alive) => {
    getIcmMessages(12).then((r) => {
      if (!alive()) return;
      setNow(Date.now());
      if (!r) return setFailed(true);
      setFailed(false);
      // Before "Show older" the newest page simply replaces the list; after it,
      // new messages go on top and the older pages stay.
      if (!pagedRef.current) {
        setItems(r.data);
        setNext(r.next);
        return;
      }
      setItems((prev) => {
        const key = (m: IcmMessage) => `${m.message_id}-${m.direction}`;
        const have = new Set((prev ?? []).map(key));
        return [...r.data.filter((m) => !have.has(key(m))), ...(prev ?? [])];
      });
    });
  }, 60_000);
  const loadMore = () => {
    if (!next) return;
    pagedRef.current = true;
    setMore(true);
    getIcmMessages(12, next).then((r) => {
      setMore(false);
      if (!r) return;
      setItems((prev) => [...(prev ?? []), ...r.data]);
      setNext(r.next);
    });
  };
  const ago = (t: string) => {
    const s = Math.max(0, Math.round((now - Date.parse(t)) / 1000));
    return s < 60 ? 'just now' : s < 3600 ? `${Math.floor(s / 60)} min ago` : s < 86400 ? `${Math.floor(s / 3600)} h ago` : `${Math.floor(s / 86400)} d ago`;
  };

  return (
    <section className="rounded-md border border-border bg-card min-w-0 flex flex-col">
      <header className="px-4 sm:px-5 pt-4 pb-3">
        <h2 className="text-[14px] font-semibold text-foreground">Latest messages</h2>
        <p className="text-[11px] text-muted-foreground mt-0.5">Newest first, refreshed every minute. Open one for its transaction.</p>
      </header>
      {failed && !items ? (
        <p className="px-5 pb-5 text-[12px] text-muted-foreground">Messages couldn't be loaded. Try again in a minute.</p>
      ) : !items ? (
        <div className="px-5 pb-5 space-y-2">{Array.from({ length: 8 }, (_, i) => <div key={i} className="h-9 rounded bg-muted/50 animate-pulse" />)}</div>
      ) : (
        <>
          <ul className="divide-y divide-border border-t border-border">
            {items.map((m) => {
              const toC = m.direction === 'received';
              const chain = index.get(m.counterparty.blockchain_id);
              const cname = nameOf(index, m.counterparty.blockchain_id, m.counterparty.name);
              const token = m.ictt?.token;
              return (
                <li key={`${m.message_id}-${m.direction}`}>
                  <a href={`https://snowtrace.io/tx/${m.tx_hash}`} target="_blank" rel="noopener noreferrer" className="px-4 sm:px-5 py-2 flex items-center gap-3 hover:bg-accent/40" title="Open the transaction">
                    <span className="relative inline-flex shrink-0">
                      <L1Logo src={chain?.chainLogoUri} name={cname} size={22} />
                      <span className="absolute -right-1 -bottom-1 w-3 h-3 rounded-full ring-2 ring-card" style={{ background: toC ? TO_CCHAIN : FROM_CCHAIN }} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] text-foreground">
                        {toC ? `${cname} to C-Chain` : `C-Chain to ${cname}`}
                      </span>
                      <span className="flex items-center gap-2 text-[11px] text-muted-foreground min-w-0">
                        <span className="truncate">{appName(m.app, m.local_address)}</span>
                        {token && <TokenTag token={token} />}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-[11px] text-muted-foreground" title={`${m.block_time.slice(0, 19).replace('T', ' ')} UTC`}>{ago(m.block_time)}</span>
                      <span className="block num text-[10px] text-muted-foreground/80">{m.tx_hash.slice(0, 8)}…</span>
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
          {next && (
            <button type="button" onClick={loadMore} disabled={more} className="mt-auto w-full px-4 sm:px-5 py-2.5 text-left text-[12px] text-muted-foreground hover:text-foreground border-t border-border disabled:opacity-60">
              {more ? 'Loading…' : 'Show older messages'}
            </button>
          )}
        </>
      )}
    </section>
  );
}
