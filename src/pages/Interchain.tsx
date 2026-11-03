import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { SEO } from '../components/SEO';
import { PAGE_SEO } from '../utils/pageSeo';
import { L1Logo, SegmentedControl, StatStrip } from '../components/instrument';
import type { StatItem } from '../components/instrument';
import { SectionErrorBoundary } from '../components/SectionErrorBoundary';
import { IcmByChain, ICM_RANGES, FROM_CCHAIN, TO_CCHAIN } from '../components/IcmByChain';
import type { RangeValue } from '../components/IcmByChain';
import { getChains, getIcmSummary, getIcmTimeseries } from '../api';
import type { IcmDay, IcmSummary } from '../api';
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
  const nodes = useHubNodes(summary.data, index, wide ? 12 : 8);
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
                    <span>Tap a circle</span>
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
 * The C-Chain at the center and the busiest L1s around it. Busier chains sit
 * closer, on a spiral by rank; each is joined by two curved lanes, messages to
 * the C-Chain on one side and back on the other, with dots moving along them.
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
    const cy = H / 2;
    const maxTotal = Math.max(...nodes.map((d) => d.total), 1);
    const maxLeg = Math.max(...nodes.flatMap((d) => [d.toC, d.fromC]), 1);
    const hubR = wide ? 30 : 22;
    const size = (v: number) => (wide ? 8 : 6) + (wide ? 22 : 14) * Math.sqrt(v / maxTotal);
    // Spread over an ellipse that uses the wider side, leaving room for labels.
    const ry = H / 2 - (wide ? 40 : 30);
    const rx = Math.min(W / 2 - (wide ? 90 : 50), ry * 1.5);
    const inner = 0.42;
    const pts = nodes.map((d, i) => {
      const r = size(d.total);
      const t = nodes.length > 1 ? i / (nodes.length - 1) : 0;
      const dist = inner + (1 - inner) * Math.sqrt(t);
      const a = -Math.PI / 2 + i * 2.39996; // golden angle
      return { d, r, x: cx + Math.cos(a) * dist * rx, y: cy + Math.sin(a) * dist * ry };
    });
    // Push overlapping circles apart, keeping them off the hub and inside the box.
    for (let k = 0; k < 60; k++) {
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const p = pts[i], q = pts[j];
          const dx = q.x - p.x, dy = q.y - p.y;
          const dd = Math.hypot(dx, dy) || 1;
          const need = p.r + q.r + (wide ? 30 : 18);
          if (dd < need) {
            const m = (need - dd) / 2;
            p.x -= (dx / dd) * m; p.y -= (dy / dd) * m;
            q.x += (dx / dd) * m; q.y += (dy / dd) * m;
          }
        }
        const p = pts[i];
        const hx = p.x - cx, hy = p.y - cy;
        const hd = Math.hypot(hx, hy) || 1;
        const min = hubR + p.r + (wide ? 46 : 30);
        if (hd < min) { p.x = cx + (hx / hd) * min; p.y = cy + (hy / hd) * min; }
        p.x = Math.min(W - p.r - 4, Math.max(p.r + 4, p.x));
        p.y = Math.min(H - p.r - 16, Math.max(p.r + 4, p.y));
      }
    }
    const lanes = pts.map((p) => {
      const dx = cx - p.x, dy = cy - p.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      const bow = Math.min(60, len * 0.2);
      const mx = (p.x + cx) / 2, my = (p.y + cy) / 2;
      const width = (v: number) => (v > 0 ? 1.2 + (wide ? 9 : 6) * Math.sqrt(v / maxLeg) : 0);
      return {
        // To the C-Chain bows one way, back bows the other: together they read as a lens.
        toC: { d: `M${p.x},${p.y} Q${mx + nx * bow},${my + ny * bow} ${cx},${cy}`, w: width(p.d.toC), v: p.d.toC },
        fromC: { d: `M${cx},${cy} Q${mx - nx * bow},${my - ny * bow} ${p.x},${p.y}`, w: width(p.d.fromC), v: p.d.fromC },
        len: len * 1.1,
      };
    });
    return { W, H, cx, cy, hubR, pts, lanes, maxLeg };
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
        <svg width={layout.W} height={layout.H} className="absolute inset-0 block overflow-visible" role="img" aria-label="The C-Chain at the center with the busiest L1s around it, closer and larger the more messages they exchanged">
          <defs>
            <radialGradient id="icm-halo">
              <stop offset="0" stopColor="currentColor" stopOpacity={0.14} />
              <stop offset="1" stopColor="currentColor" stopOpacity={0} />
            </radialGradient>
            <clipPath id="icm-hub-clip"><circle cx={layout.cx} cy={layout.cy} r={layout.hubR - 3} /></clipPath>
            {layout.pts.map((p, i) => (
              <clipPath key={p.d.id} id={`icm-clip-${i}`}><circle cx={p.x} cy={p.y} r={p.r - 3} /></clipPath>
            ))}
          </defs>

          <g className="text-foreground">
            <circle cx={layout.cx} cy={layout.cy} r={layout.hubR * 3.2} fill="url(#icm-halo)" />
            {[0.55, 1].map((k) => (
              <ellipse
                key={k}
                cx={layout.cx}
                cy={layout.cy}
                rx={(layout.W / 2 - (wide ? 90 : 50)) * k}
                ry={(layout.H / 2 - (wide ? 40 : 30)) * k}
                fill="none"
                stroke="currentColor"
                strokeOpacity={0.05}
                strokeDasharray="2 6"
              />
            ))}
          </g>

          {layout.pts.map((p, i) => {
            const lane = layout.lanes[i];
            const on = hover == null || hover === p.d.id;
            return (
              <g key={p.d.id} className="transition-opacity duration-200" opacity={on ? 1 : 0.15}>
                {[
                  { ...lane.toC, color: TO_CCHAIN },
                  { ...lane.fromC, color: FROM_CCHAIN },
                ].map((l, k) =>
                  l.w > 0 ? (
                    <g key={k}>
                      <path d={l.d} fill="none" stroke={l.color} strokeWidth={l.w} strokeOpacity={hover === p.d.id ? 0.85 : 0.45} strokeLinecap="round" />
                      {!still &&
                        Array.from({ length: l.v / layout.maxLeg > 0.25 ? 3 : l.v / layout.maxLeg > 0.03 ? 2 : 1 }, (_, n, ) => (
                          <circle key={n} r={Math.max(1.5, Math.min(3, l.w / 2.5))} fill={l.color}>
                            <animateMotion dur={`${(lane.len / 60).toFixed(1)}s`} begin={`${((n * lane.len) / 60 / 3).toFixed(1)}s`} repeatCount="indefinite" path={l.d} />
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
          <text x={layout.cx} y={layout.cy + layout.hubR + 14} textAnchor="middle" className="fill-foreground" fontSize={11} fontWeight={600}>C-Chain</text>

          {layout.pts.map((p, i) => {
            const d = p.d;
            const on = hover == null || hover === d.id;
            const share = d.total > 0 ? d.toC / d.total : 0;
            const ring = 2 * Math.PI * (p.r - 1);
            const dx = p.x - layout.cx;
            const anchor = Math.abs(dx) < p.r ? 'middle' : dx > 0 ? 'start' : 'end';
            const lx = anchor === 'middle' ? p.x : p.x + (dx > 0 ? p.r + 7 : -p.r - 7);
            // A centered label goes on the side away from the hub, so it never sits between them.
            const ly = anchor === 'middle' ? (p.y < layout.cy ? p.y - p.r - 24 : p.y + p.r + 12) : p.y - 2;
            const labelled = wide ? i < 9 || hover === d.id || d.other > 0 : i < 6 || hover === d.id;
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
                {/* Ring split by direction: blue for messages to the C-Chain, orange for messages back. */}
                <circle cx={p.x} cy={p.y} r={p.r - 1} fill="none" stroke={FROM_CCHAIN} strokeWidth={2} />
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={p.r - 1}
                  fill="none"
                  stroke={TO_CCHAIN}
                  strokeWidth={2}
                  strokeDasharray={`${ring * share} ${ring}`}
                  transform={`rotate(-90 ${p.x} ${p.y})`}
                />
                {d.chain?.chainLogoUri ? (
                  <image href={d.chain.chainLogoUri} x={p.x - p.r + 3} y={p.y - p.r + 3} width={(p.r - 3) * 2} height={(p.r - 3) * 2} clipPath={`url(#icm-clip-${i})`} preserveAspectRatio="xMidYMid slice" />
                ) : (
                  <text x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central" className="fill-muted-foreground" fontSize={Math.max(9, p.r * 0.7)} fontWeight={600}>
                    {d.other ? '+' : d.name.charAt(0).toUpperCase()}
                  </text>
                )}
                {labelled && (
                  <>
                    <text x={lx} y={ly} textAnchor={anchor} dominantBaseline="middle" className="fill-foreground" fontSize={wide ? 12 : 10} fontWeight={500}>
                      {shortName}
                    </text>
                    <text x={lx} y={ly + 13} textAnchor={anchor} dominantBaseline="middle" className="fill-muted-foreground num" fontSize={wide ? 11 : 9.5}>
                      {compact(d.total)}{total > 0 && ` · ${((d.total / total) * 100).toFixed(d.total / total >= 0.1 ? 0 : 1)}%`}
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
      <p className="mt-1 text-[11px] text-muted-foreground">Closer and larger means more messages.</p>
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
                      {compact(d.total)} <span className="text-[10px] text-muted-foreground">{total > 0 ? `${((d.total / total) * 100).toFixed(d.total / total >= 0.1 ? 0 : 1)}%` : ''}</span>
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
