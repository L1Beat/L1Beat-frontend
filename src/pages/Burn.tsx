import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Flame, Volume2, VolumeX } from 'lucide-react';
import { SEO } from '../components/SEO';
import { PAGE_SEO } from '../utils/pageSeo';
import { format, parseISO } from 'date-fns';
import { SegmentedControl, StatStrip } from '../components/instrument';
import type { StatItem } from '../components/instrument';
import { getBurnedTotal, getEvmFeesBurned, getEvmFeesBurnedSpan, getStakingSummary, getTreasuries, nAvaxToAvax } from '../api';
import type { FeeBurnPoint } from '../api';

// --- websocket types -------------------------------------------------------
interface WsBlock {
  chain_id: number;
  block_number: number;
  block_time: string; // ISO8601
  gas_used: number;
  base_fee_per_gas: number;
  tx_count: number;
  burned: { total: string; base_fee: string; priority_fee: string }; // nAVAX strings
}
type WsMessage = { type: 'initial'; data: WsBlock[] } | { type: 'new_block'; data: WsBlock };

// A block with its derived numbers computed once at ingest, so render-time
// (and the per-second feed tick) never re-parses BigInt/Date for every row.
interface FeedBlock extends WsBlock {
  avax: number; // burned.total in AVAX
  navaxNum: number; // burned.total as a plain number (nAVAX)
  tsMs: number; // block_time parsed to epoch ms
}

const WS_URL = 'wss://api.l1beat.io/ws/blocks/43114';
const FEED_CAP = 50; // internal buffer kept for the burn-rate stat
const FEED_VISIBLE = 10; // rows actually shown in the live feed
const NAVAX = 1e9; // 1 AVAX = 1e9 nAVAX

const navaxToAvax = (n: string | bigint): number => Number(typeof n === 'bigint' ? n : BigInt(n)) / NAVAX;

function toFeedBlock(b: WsBlock): FeedBlock {
  let navaxNum = 0;
  try { navaxNum = Number(BigInt(b.burned.total)); } catch { /* ignore */ }
  return { ...b, avax: navaxNum / NAVAX, navaxNum, tsMs: new Date(b.block_time).getTime() };
}

// --- reduced-motion --------------------------------------------------------
function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const handler = () => setReduced(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return reduced;
}

// Animate a number toward `target` with an easeOut tween (rAF). Reduced motion → instant.
function useTween(target: number, duration = 700, reduced = false) {
  const [val, setVal] = useState(target);
  const fromRef = useRef(target);
  const rafRef = useRef<number>();
  useEffect(() => {
    if (reduced) {
      fromRef.current = target;
      setVal(target);
      return;
    }
    const from = fromRef.current;
    if (Math.abs(target - from) < 1e-12) return;
    let start: number | null = null;
    const step = (ts: number) => {
      if (start == null) start = ts;
      const p = Math.min(1, (ts - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const cur = from + (target - from) * eased;
      fromRef.current = cur;
      setVal(cur);
      if (p < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, duration, reduced]);
  return reduced ? target : val;
}

// --- fireplace sound (real looped recording) -------------------------------
// Plays a real fireplace loop behind an off-by-default toggle. The audio file
// is only fetched when the user enables it (not on page load).
const FIRE_SRC = '/sounds/king_of_the_christmas-fireplace-loop-original-noise-178209.mp3';
const FIRE_VOLUME = 0.55;

function useFireplaceSound() {
  const [enabled, setEnabled] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fadeRef = useRef<ReturnType<typeof setInterval>>();
  const watchdogRef = useRef<ReturnType<typeof setInterval>>();
  const wantPlayingRef = useRef(false);

  const ensureAudio = () => {
    if (!audioRef.current) {
      const audio = new Audio(FIRE_SRC);
      audio.loop = true;
      audio.preload = 'auto';
      // Some browsers don't honor `loop` for every encoding and let the clip end
      // once. Restart it ourselves as a fallback.
      audio.addEventListener('ended', () => {
        if (wantPlayingRef.current) {
          audio.currentTime = 0;
          void audio.play().catch(() => {});
        }
      });
      audioRef.current = audio;
    }
    return audioRef.current;
  };

  const fadeTo = (target: number, onDone?: () => void) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (fadeRef.current) clearInterval(fadeRef.current);
    fadeRef.current = setInterval(() => {
      const step = 0.06;
      if (Math.abs(audio.volume - target) <= step) {
        audio.volume = target;
        if (fadeRef.current) clearInterval(fadeRef.current);
        onDone?.();
      } else {
        audio.volume = Math.min(1, Math.max(0, audio.volume + (audio.volume < target ? step : -step)));
      }
    }, 45);
  };

  const start = () => {
    const audio = ensureAudio();
    wantPlayingRef.current = true;
    audio.volume = 0;
    void audio.play().catch(() => {});
    fadeTo(FIRE_VOLUME);
    // Watchdog: if the clip ever stalls or stops while we want it on, nudge it back.
    if (watchdogRef.current) clearInterval(watchdogRef.current);
    watchdogRef.current = setInterval(() => {
      const a = audioRef.current;
      if (wantPlayingRef.current && a && a.paused) void a.play().catch(() => {});
    }, 2000);
  };

  const stop = () => {
    wantPlayingRef.current = false;
    if (watchdogRef.current) clearInterval(watchdogRef.current);
    const audio = audioRef.current;
    if (!audio) return;
    fadeTo(0, () => audio.pause());
  };

  const toggle = () => setEnabled((e) => { e ? stop() : start(); return !e; });

  useEffect(() => () => {
    wantPlayingRef.current = false;
    if (fadeRef.current) clearInterval(fadeRef.current);
    if (watchdogRef.current) clearInterval(watchdogRef.current);
    audioRef.current?.pause();
  }, []);

  return { enabled, toggle };
}

// --- live stream hook ------------------------------------------------------
function useBurnStream() {
  const [blocks, setBlocks] = useState<FeedBlock[]>([]);
  const [totalNavax, setTotalNavax] = useState<bigint | null>(null); // REST seed + new-block deltas
  const [sessionNavax, setSessionNavax] = useState<bigint>(0n);
  const [connected, setConnected] = useState(false);
  const [lastBlock, setLastBlock] = useState<FeedBlock | null>(null);

  const seedRef = useRef<bigint | null>(null);
  const deltaRef = useRef<bigint>(0n);
  const seenRef = useRef<Set<number>>(new Set());

  // Seed the authoritative cumulative from REST.
  useEffect(() => {
    let alive = true;
    getBurnedTotal().then((t) => {
      if (!alive || !t) return;
      try {
        seedRef.current = BigInt(t.total_burned);
        setTotalNavax(seedRef.current + deltaRef.current);
      } catch { /* ignore */ }
    });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let stopped = false;
    let ws: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;

    const ingest = (incoming: WsBlock[], isNew: boolean) => {
      // De-dup by block_number; only new_block events advance the counter.
      const fresh: FeedBlock[] = [];
      for (const b of incoming) {
        if (seenRef.current.has(b.block_number)) continue;
        seenRef.current.add(b.block_number);
        fresh.push(toFeedBlock(b));
        if (isNew) {
          try {
            const v = BigInt(b.burned.total);
            deltaRef.current += v;
            setSessionNavax((s) => s + v);
          } catch { /* ignore */ }
        }
      }
      if (fresh.length === 0) return;
      // Keep the seen-set from growing unbounded.
      if (seenRef.current.size > 4000) {
        seenRef.current = new Set([...seenRef.current].slice(-2000));
      }
      setBlocks((prev) => fresh.concat(prev).sort((a, b) => b.block_number - a.block_number).slice(0, FEED_CAP));
      if (isNew) {
        setLastBlock(fresh[fresh.length - 1]);
        if (seedRef.current != null) setTotalNavax(seedRef.current + deltaRef.current);
      }
    };

    const connect = () => {
      ws = new WebSocket(WS_URL);
      ws.onopen = () => { setConnected(true); attempt = 0; };
      ws.onmessage = (ev) => {
        let msg: WsMessage;
        try { msg = JSON.parse(ev.data as string); } catch { return; }
        if (msg.type === 'initial') ingest(msg.data, false);
        else if (msg.type === 'new_block') ingest([msg.data], true);
      };
      ws.onclose = () => {
        setConnected(false);
        if (stopped) return;
        const delay = Math.min(1000 * 2 ** attempt, 15000);
        attempt += 1;
        retryTimer = setTimeout(connect, delay);
      };
      ws.onerror = () => { ws?.close(); };
    };

    connect();
    return () => {
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (ws) { ws.onclose = null; ws.close(); }
    };
  }, []);

  return { blocks, totalNavax, sessionNavax, connected, lastBlock };
}

// --- ember particle canvas -------------------------------------------------
interface Ember { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; bucket: number; }

// Pre-rendered glow sprites, one per hue bucket. Baking the soft glow into an
// offscreen canvas once lets the loop draw each ember with a single drawImage
// instead of a per-frame shadowBlur + radial gradient (both very expensive).
const SPRITE_SIZE = 32;
const HUE_MIN = 12;
const HUE_SPAN = 32;
const HUE_BUCKETS = 8;
let emberSprites: HTMLCanvasElement[] | null = null;
function getEmberSprites(): HTMLCanvasElement[] {
  if (emberSprites) return emberSprites;
  emberSprites = Array.from({ length: HUE_BUCKETS }, (_, i) => {
    const hue = HUE_MIN + (HUE_SPAN * i) / (HUE_BUCKETS - 1);
    const c = document.createElement('canvas');
    c.width = c.height = SPRITE_SIZE;
    const g = c.getContext('2d')!;
    const r = SPRITE_SIZE / 2;
    const grad = g.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0, `hsla(${hue}, 100%, 65%, 1)`);
    grad.addColorStop(0.4, `hsla(${hue}, 100%, 55%, 0.55)`);
    grad.addColorStop(1, `hsla(${hue}, 100%, 50%, 0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
    return c;
  });
  return emberSprites;
}

function EmberCanvas({ burst, reduced }: { burst: FeedBlock | null; reduced: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const embers = useRef<Ember[]>([]);
  const size = useRef({ w: 0, h: 0, dpr: 1 });

  const spawn = (n: number) => {
    const { w, h } = size.current;
    if (!w) return;
    for (let i = 0; i < n; i++) {
      const max = 1400 + Math.random() * 1600;
      embers.current.push({
        x: w * (0.15 + Math.random() * 0.7),
        y: h + Math.random() * 20,
        vx: (Math.random() - 0.5) * 0.25,
        vy: -(0.25 + Math.random() * 0.7),
        life: 0,
        max,
        size: 1 + Math.random() * 2.5,
        bucket: Math.floor(Math.random() * HUE_BUCKETS),
      });
    }
    if (embers.current.length > 240) embers.current = embers.current.slice(-240);
  };

  // Burst on each new block, sized by burn magnitude (log scale — burns are tiny).
  useEffect(() => {
    if (reduced || !burst) return;
    const n = 6 + Math.min(34, Math.round(Math.log10(burst.navaxNum + 10) * 5));
    spawn(n);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [burst?.block_number, reduced]);

  useEffect(() => {
    if (reduced) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const sprites = getEmberSprites();

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      size.current = { w: rect.width, h: rect.height, dpr };
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let raf = 0;
    let running = false;
    let last = performance.now();
    let spawnAcc = 0;
    const loop = (now: number) => {
      const dt = Math.min(48, now - last);
      last = now;
      const { w, h } = size.current;
      ctx.clearRect(0, 0, w, h);
      // Gentle baseline embers so it always smolders.
      spawnAcc += dt;
      if (spawnAcc > 140) { spawnAcc = 0; spawn(1); }
      // Additive glow only reads on the dark stage; on light it would wash out to white.
      ctx.globalCompositeOperation = document.documentElement.classList.contains('dark') ? 'lighter' : 'source-over';
      const arr = embers.current;
      for (let i = arr.length - 1; i >= 0; i--) {
        const e = arr[i];
        e.life += dt;
        if (e.life >= e.max || e.y < -10) { arr.splice(i, 1); continue; }
        const t = e.life / e.max;
        e.vy -= 0.0006 * dt; // buoyancy
        e.x += e.vx * dt * 0.06;
        e.y += e.vy * dt * 0.06;
        ctx.globalAlpha = (1 - t) * 0.85;
        const d = e.size * (1 + t * 0.6) * 6; // glow diameter
        ctx.drawImage(sprites[e.bucket], e.x - d / 2, e.y - d / 2, d, d);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      raf = requestAnimationFrame(loop);
    };

    // Only burn CPU while the hero is on-screen and the tab is visible.
    const startLoop = () => { if (running) return; running = true; last = performance.now(); raf = requestAnimationFrame(loop); };
    const stopLoop = () => { running = false; cancelAnimationFrame(raf); };
    const sync = (onScreen: boolean) => {
      if (onScreen && !document.hidden) startLoop();
      else stopLoop();
    };

    let visible = true;
    const io = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(visible); }, { threshold: 0 });
    io.observe(canvas);
    const onVisibility = () => sync(visible);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stopLoop();
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [reduced]);

  if (reduced) return null;
  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden />;
}

// --- big counter -----------------------------------------------------------
function BurnCounter({ avax, reduced }: { avax: number; reduced: boolean }) {
  const v = useTween(avax, 900, reduced);
  const intPart = Math.floor(v).toLocaleString('en-US');
  const frac = (v - Math.floor(v)).toFixed(6).slice(1); // ".520617"
  return (
    <div className="flex items-baseline justify-center leading-none">
      <span
        className="num text-5xl sm:text-7xl lg:text-8xl font-medium bg-gradient-to-b from-orange-400 via-orange-500 to-orange-700 dark:from-orange-200 dark:via-orange-400 dark:to-orange-600 bg-clip-text text-transparent"
      >
        {intPart}
      </span>
      <span className="num text-xl sm:text-3xl lg:text-4xl text-orange-600/70 dark:text-orange-400/70 ml-0.5">{frac}</span>
    </div>
  );
}

// --- live feed -------------------------------------------------------------
function timeAgo(tsMs: number, now: number): string {
  const s = Math.max(0, Math.floor((now - tsMs) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

// memo: with the clock isolated to LiveFeed, a per-second tick only re-renders
// rows whose `now` bucket actually changed the label (props are otherwise stable).
const BlockRow = memo(function BlockRow({
  block,
  now,
  reduced,
  isNewest,
  maxAvax,
}: {
  block: FeedBlock;
  now: number;
  reduced: boolean;
  isNewest: boolean;
  maxAvax: number;
}) {
  const pct = maxAvax > 0 ? Math.max(1, (block.avax / maxAvax) * 100) : 0;
  return (
    <tr
      className="h-10 border-b border-border/50"
      style={!reduced && isNewest ? { animation: 'burnIgnite 900ms ease-out' } : undefined}
    >
      <td className="num text-[12px] text-foreground">{block.block_number.toLocaleString('en-US')}</td>
      <td className="num text-[12px] text-muted-foreground">{timeAgo(block.tsMs, now)}</td>
      <td className="num text-[12px] text-muted-foreground text-right">{block.tx_count}</td>
      <td className="text-right">
        <span className="inline-flex items-center justify-end gap-2.5">
          <span aria-hidden className="hidden sm:block w-24 h-[3px] rounded-sm bg-muted/60 overflow-hidden">
            <span className="block h-full rounded-sm bg-orange-400/80" style={{ width: `${pct}%` }} />
          </span>
          <span className="num text-[12px] text-foreground w-28 inline-block">{block.avax.toFixed(8)}</span>
        </span>
      </td>
    </tr>
  );
});

// Owns the 1s clock so the "Xs ago" labels stay live without re-rendering the
// hero, counter, ember canvas or stat cards every second.
function LiveFeed({ blocks, reduced }: { blocks: FeedBlock[]; reduced: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const shown = blocks.slice(0, FEED_VISIBLE);
  const maxAvax = shown.reduce((m, b) => Math.max(m, b.avax), 0);

  return (
    <section>
      <div className="flex items-baseline justify-between gap-3 py-2">
        <h2 className="text-[13px] font-medium text-foreground">Live C-Chain block burns</h2>
        <span className="text-[11px] text-muted-foreground">
          Last <span className="num">{FEED_VISIBLE}</span> blocks
        </span>
      </div>
      <table className="w-full text-[12px] border-t border-border">
        <thead>
          <tr className="h-9 border-b border-border text-[11px] font-medium text-muted-foreground">
            <th className="text-left font-medium">Block</th>
            <th className="text-left font-medium">Age</th>
            <th className="text-right font-medium">Txs</th>
            <th className="text-right font-medium">Burned, AVAX</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0
            ? Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="h-10 border-b border-border/50">
                  <td><div className="h-3 w-24 rounded bg-muted animate-pulse" /></td>
                  <td><div className="h-3 w-12 rounded bg-muted animate-pulse" /></td>
                  <td className="text-right"><div className="ml-auto h-3 w-8 rounded bg-muted animate-pulse" /></td>
                  <td className="text-right"><div className="ml-auto h-3 w-28 rounded bg-muted animate-pulse" /></td>
                </tr>
              ))
            : shown.map((b, i) => (
                <BlockRow key={b.block_number} block={b} now={now} reduced={reduced} isNewest={i === 0} maxAvax={maxAvax} />
              ))}
        </tbody>
      </table>
    </section>
  );
}

// --- context: totals over days and months -----------------------------------
function compact(v: number): string {
  const trim = (n: number) => n.toFixed(1).replace(/\.0$/, '');
  const a = Math.abs(v);
  if (a >= 1e9) return `${trim(v / 1e9)}B`;
  if (a >= 1e6) return `${trim(v / 1e6)}M`;
  if (a >= 1e3) return `${trim(v / 1e3)}K`;
  return a >= 100 ? v.toFixed(0) : trim(v);
}
const sumBurned = (pts: FeeBurnPoint[]) => pts.reduce((s, p) => s + nAvaxToAvax(p.total_burned), 0);

interface BurnFacts {
  last24h: number | null;
  last30d: number | null;
  prior30d: number | null;
  busiestMonth: { period: string; avax: number } | null;
  /** Total AVAX supply, for the share already burned. */
  supplyAvax: number | null;
  price: number | null;
}

// Loaded once: the rolling totals, the busiest month, supply and price.
function useBurnFacts(): BurnFacts {
  const [facts, setFacts] = useState<BurnFacts>({ last24h: null, last30d: null, prior30d: null, busiestMonth: null, supplyAvax: null, price: null });
  useEffect(() => {
    let alive = true;
    Promise.all([
      getEvmFeesBurned(43114, { granularity: 'hour', limit: 24 }),
      getEvmFeesBurned(43114, { granularity: 'day', limit: 60 }),
      getEvmFeesBurned(43114, { granularity: 'month', limit: 100 }),
      getStakingSummary(),
      getTreasuries(),
    ]).then(([hours, days, months, staking, treasuries]) => {
      if (!alive) return;
      const d = days?.series ?? [];
      const busiest = (months?.series ?? []).reduce<FeeBurnPoint | null>(
        (m, p) => (!m || nAvaxToAvax(p.total_burned) > nAvaxToAvax(m.total_burned) ? p : m),
        null,
      );
      setFacts({
        last24h: hours?.series.length ? sumBurned(hours.series) : null,
        last30d: d.length >= 30 ? sumBurned(d.slice(-30)) : null,
        prior30d: d.length >= 60 ? sumBurned(d.slice(-60, -30)) : null,
        busiestMonth: busiest ? { period: busiest.period, avax: nAvaxToAvax(busiest.total_burned) } : null,
        supplyAvax: staking ? nAvaxToAvax(staking.total_supply) : null,
        price: treasuries?.totals.avax_price_usd ?? null,
      });
    });
    return () => {
      alive = false;
    };
  }, []);
  return facts;
}

const BURN_RANGES = [
  { value: '30', label: '30d' },
  { value: '90', label: '90d' },
  { value: '365', label: '1y' },
  { value: 'all', label: 'All' },
] as const;
type BurnRange = (typeof BURN_RANGES)[number]['value'];
// Base fee and priority tip, the two parts of every C-Chain fee.
const PARTS = [
  { key: 'base_fee_burned', label: 'Base fee', color: '#d95926' },
  { key: 'priority_fee_burned', label: 'Priority tip', color: '#d4a017' },
] as const;
const HM = { top: 10, right: 8, bottom: 24, left: 48 };

// Burned per day, split into base fee and priority tip. All history comes as
// weeks, where daily bars would be thinner than a pixel.
function BurnHistory() {
  const [range, setRange] = useState<BurnRange>('90');
  const [data, setData] = useState<{ range: BurnRange; points: FeeBurnPoint[] } | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
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
  useEffect(() => {
    let alive = true;
    setState('loading');
    const yesterday = new Date(Date.now() - 86_400_000);
    const load =
      range === 'all'
        ? getEvmFeesBurnedSpan(43114, 'week', new Date('2020-09-01T00:00:00Z'), yesterday)
        : getEvmFeesBurnedSpan(43114, 'day', new Date(yesterday.getTime() - (Number(range) - 1) * 86_400_000), yesterday);
    load.then((points) => {
      if (!alive) return;
      // On failure, drop the old range too, so the chart never shows data the control no longer describes.
      setData(points ? { range, points } : null);
      setState(points ? 'ready' : 'error');
    });
    return () => {
      alive = false;
    };
  }, [range]);

  const weekly = data?.range === 'all';
  const points = useMemo(() => data?.points ?? [], [data]);
  const H = 240;
  const geom = useMemo(() => {
    if (!points.length || !W) return null;
    const peak = Math.max(...points.map((p) => nAvaxToAvax(p.total_burned)), 1);
    const raw = peak / 4;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const tick = ([1, 2, 2.5, 5, 10].find((k) => k * mag >= raw) ?? 10) * mag;
    const maxY = Math.ceil(peak / tick) * tick;
    const ticks = Array.from({ length: Math.round(maxY / tick) + 1 }, (_, i) => i * tick);
    const slot = (W - HM.left - HM.right) / points.length;
    const barW = Math.max(1, slot * (points.length > 120 ? 0.85 : 0.7));
    const x = (i: number) => HM.left + slot * i + (slot - barW) / 2;
    const y = (v: number) => HM.top + (H - HM.top - HM.bottom) * (1 - v / maxY);
    return { x, y, slot, barW, ticks, labelEvery: Math.ceil(points.length / (W < 600 ? 4 : 8)) };
  }, [points, W]);
  const active = hover != null ? points[hover] : null;
  const total = sumBurned(points);
  const when = (p: FeeBurnPoint) =>
    weekly ? `Week of ${format(parseISO(p.period), 'MMM d, yyyy')}` : format(parseISO(p.period), 'EEE, MMM d, yyyy');

  return (
    <section className="rounded-md border border-border bg-card">
      <header className="flex flex-wrap items-start justify-between gap-3 px-4 sm:px-5 pt-4">
        <div>
          <h2 className="text-[14px] font-semibold text-foreground">Burned over time</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            AVAX burned per {weekly ? 'week' : 'day'} on the C-Chain, split into the base fee and the priority tip.
          </p>
        </div>
        <SegmentedControl size="xs" value={range} options={BURN_RANGES} onChange={setRange} ariaLabel="Burn history range" />
      </header>
      <div className={`px-4 sm:px-5 pb-5 pt-3 transition-opacity ${state === 'loading' && data ? 'opacity-50' : ''}`}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 mb-2">
          <div>
            <div className="num text-[22px] leading-7 font-medium text-foreground">
              {points.length ? `${compact(active ? nAvaxToAvax(active.total_burned) : total)} AVAX` : '—'}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {active
                ? when(active)
                : points.length
                  ? `burned ${format(parseISO(points[0].period), 'MMM d, yyyy')} to ${format(parseISO(points[points.length - 1].period), 'MMM d, yyyy')}${weekly ? '; bars are weeks' : ''}`
                  : state === 'error'
                    ? "Burn history couldn't be loaded. Try again in a minute."
                    : ' '}
            </div>
          </div>
          <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
            {PARTS.map((part) => (
              <span key={part.key} className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: part.color }} />
                {part.label}
                {active && <span className="num text-foreground">{compact(nAvaxToAvax(active[part.key]))}</span>}
              </span>
            ))}
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
              onMouseMove={(e) => {
                const i = Math.floor((e.clientX - e.currentTarget.getBoundingClientRect().left - HM.left) / geom.slot);
                setHover(i >= 0 && i < points.length ? i : null);
              }}
              onMouseLeave={() => setHover(null)}
              role="img"
              aria-label={`AVAX burned per ${weekly ? 'week' : 'day'}, base fee and priority tip`}
            >
              {geom.ticks.map((t) => (
                <g key={t}>
                  <line x1={HM.left} x2={W - HM.right} y1={geom.y(t)} y2={geom.y(t)} stroke="currentColor" strokeOpacity={0.08} />
                  <text x={HM.left - 8} y={geom.y(t)} textAnchor="end" dominantBaseline="middle" className="fill-muted-foreground" fontSize={10}>
                    {t === 0 ? '0' : compact(t)}
                  </text>
                </g>
              ))}
              {points.map((p, i) => {
                let run = 0;
                return (
                  <g key={p.period} opacity={hover != null && hover !== i ? 0.45 : 1}>
                    {PARTS.map((part) => {
                      const v = nAvaxToAvax(p[part.key]);
                      if (v <= 0) return null;
                      const y0 = geom.y(run);
                      run += v;
                      return <rect key={part.key} x={geom.x(i)} y={geom.y(run)} width={geom.barW} height={Math.max(0, y0 - geom.y(run))} fill={part.color} />;
                    })}
                    {i % geom.labelEvery === 0 && (
                      <text x={geom.x(i) + geom.barW / 2} y={H - 6} textAnchor="middle" className="fill-muted-foreground" fontSize={10}>
                        {format(parseISO(p.period), points.length > 120 ? 'MMM yyyy' : 'MMM d')}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          )}
        </div>
      </div>
    </section>
  );
}

// --- page ------------------------------------------------------------------
export function Burn() {
  const reduced = usePrefersReducedMotion();
  const { blocks, totalNavax, connected, lastBlock } = useBurnStream();
  const sound = useFireplaceSound();
  const facts = useBurnFacts();

  const totalAvax = totalNavax != null ? navaxToAvax(totalNavax) : 0;

  const usdAbout = (avax: number | null) =>
    avax != null && facts.price != null ? `about $${compact(avax * facts.price)}` : 'AVAX';
  const change30d =
    facts.last30d != null && facts.prior30d ? ((facts.last30d - facts.prior30d) / facts.prior30d) * 100 : null;
  const burnedShare = facts.supplyAvax && totalAvax ? (totalAvax / facts.supplyAvax) * 100 : null;
  const stats: StatItem[] = [
    {
      label: 'Burned, 24h',
      value: facts.last24h != null ? `${compact(facts.last24h)} AVAX` : '—',
      sub: usdAbout(facts.last24h),
      tooltip: 'AVAX burned on the C-Chain over the last 24 full hours.',
    },
    {
      label: 'Burned, 30d',
      value: facts.last30d != null ? `${compact(facts.last30d)} AVAX` : '—',
      delta: change30d,
      deltaLabel: 'vs prior 30d',
      sub: change30d == null ? usdAbout(facts.last30d) : undefined,
      tooltip: 'AVAX burned over the last 30 complete UTC days, against the 30 days before.',
    },
    {
      label: 'Share of supply',
      value: burnedShare != null ? `${burnedShare.toFixed(2)}%` : '—',
      sub: 'burned so far',
      tooltip: 'All AVAX burned on the C-Chain as a share of the total AVAX supply.',
    },
    {
      label: 'Busiest month',
      value: facts.busiestMonth ? format(parseISO(facts.busiestMonth.period), 'MMM yyyy') : '—',
      sub: facts.busiestMonth ? `${compact(facts.busiestMonth.avax)} AVAX burned` : ' ',
      tooltip: 'The calendar month with the most AVAX burned on the C-Chain.',
    },
  ];

  return (
    <div>
      <SEO {...PAGE_SEO.burn} />
      <style>{`
        @keyframes burnIgnite {
          0% { background-color: rgba(249,115,22,0.22); transform: translateY(-6px); opacity: 0; }
          40% { opacity: 1; }
          100% { background-color: transparent; transform: translateY(0); opacity: 1; }
        }
        @keyframes flameFlicker { 0%,100% { transform: scale(1) rotate(-1deg); opacity: .9 } 50% { transform: scale(1.12) rotate(1deg); opacity: 1 } }
      `}</style>

      {/* Hero: the running total fills the first screen, embers rise behind it. */}
      <section className="relative overflow-hidden border-b border-border bg-stage h-[520px] md:h-[min(calc(100vh-48px),1200px)] md:min-h-[560px]">
        <div
          className="absolute inset-x-0 bottom-0 h-2/3 pointer-events-none"
          style={{ background: 'radial-gradient(60% 100% at 50% 100%, rgba(249,115,22,0.16), transparent 70%)' }}
          aria-hidden
        />
        <EmberCanvas burst={lastBlock} reduced={reduced} />

        <div className="absolute top-3 left-4 sm:left-6 right-4 sm:right-6 z-30 flex items-center justify-between gap-3 pointer-events-none [&>*]:pointer-events-auto">
          <div className="flex items-baseline gap-3 min-w-0">
            <h1 className="text-[15px] leading-6 font-semibold text-foreground shrink-0">AVAX burn</h1>
            <p className="hidden lg:block text-[12px] text-muted-foreground truncate">
              Every C-Chain fee, base fee and priority tip, is burned and removed from circulating supply.
            </p>
          </div>
          <button
            type="button"
            onClick={sound.toggle}
            aria-pressed={sound.enabled}
            title={sound.enabled ? 'Mute fireplace' : 'Play fireplace sound'}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded border border-border bg-background/70 text-[12px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            {sound.enabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{sound.enabled ? 'Sound on' : 'Fireplace'}</span>
          </button>
        </div>

        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4 pb-16 pointer-events-none">
          <div className="inline-flex items-center gap-2 text-[13px] font-medium text-orange-700 dark:text-orange-200/90">
            <Flame className="w-4 h-4 text-orange-500 dark:text-orange-400" style={!reduced ? { animation: 'flameFlicker 1.4s ease-in-out infinite' } : undefined} />
            Total AVAX burned on the C-Chain
          </div>
          <div className="mt-6 mb-3">
            {totalNavax == null ? (
              <div className="h-16 sm:h-24 w-72 sm:w-[28rem] mx-auto rounded-md bg-muted animate-pulse" />
            ) : (
              <BurnCounter avax={totalAvax} reduced={reduced} />
            )}
          </div>
          <div className="text-[12px] text-muted-foreground">AVAX</div>
          {burnedShare != null && (
            <p className="mt-4 text-[14px] sm:text-[15px] text-foreground/80 max-w-xl">
              That is <span className="num">{burnedShare.toFixed(2)}%</span> of all AVAX, removed from circulating supply
              {facts.price != null && (
                <>
                  , worth about <span className="num">${compact(totalAvax * facts.price)}</span> at today's price
                </>
              )}
              .
            </p>
          )}
          <div className="mt-6 flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
            <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-up' : 'bg-amber-500'} ${connected && !reduced ? 'animate-pulse' : ''}`} />
            {connected ? 'Live, streaming C-Chain blocks' : 'Reconnecting'}
          </div>
        </div>

        <div className="hidden md:block absolute bottom-4 left-1/2 -translate-x-1/2 z-30 w-[min(960px,calc(100%-3rem))]">
          <StatStrip items={stats} floating />
        </div>
      </section>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 space-y-4">
        <div className="md:hidden">
          <StatStrip items={stats} />
        </div>
        <BurnHistory />
        <LiveFeed blocks={blocks} reduced={reduced} />
      </div>
    </div>
  );
}

export default Burn;
