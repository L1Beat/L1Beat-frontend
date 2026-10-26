import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Flame, Volume2, VolumeX } from 'lucide-react';
import { SEO } from '../components/SEO';
import { StatStrip } from '../components/instrument';
import type { StatItem } from '../components/instrument';
import { getBurnedTotal } from '../api';

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

// Isolated so its 60fps tween only re-renders this text, not the whole strip.
function SessionValue({ navax, reduced }: { navax: bigint; reduced: boolean }) {
  const v = useTween(navaxToAvax(navax), 700, reduced);
  return <>{v.toFixed(8)}</>;
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

// --- page ------------------------------------------------------------------
export function Burn() {
  const reduced = usePrefersReducedMotion();
  const { blocks, totalNavax, sessionNavax, connected, lastBlock } = useBurnStream();
  const sound = useFireplaceSound();

  const totalAvax = totalNavax != null ? navaxToAvax(totalNavax) : 0;

  // Burn rate over blocks in the last 60s → AVAX/min. Recomputed when blocks
  // change (new C-Chain block every ~2s), not on a separate 1s clock.
  const ratePerMin = useMemo(() => {
    const cutoff = Date.now() - 60_000;
    let sum = 0;
    for (const b of blocks) {
      if (b.tsMs >= cutoff) sum += b.avax;
    }
    return sum; // already a per-minute window
  }, [blocks]);

  // Average burn per block across the blocks shown in the feed.
  const avgPerBlock = useMemo(() => {
    const shown = blocks.slice(0, FEED_VISIBLE);
    if (shown.length === 0) return 0;
    let sum = 0;
    for (const b of shown) sum += b.avax;
    return sum / shown.length;
  }, [blocks]);

  const latest = blocks[0];
  const stats: StatItem[] = [
    { label: 'Burn rate', value: ratePerMin.toFixed(6), sub: 'AVAX per minute, last 60s' },
    { label: 'Burned this session', value: <SessionValue navax={sessionNavax} reduced={reduced} />, sub: 'AVAX since you opened the page' },
    {
      label: 'Avg burn per block',
      value: avgPerBlock > 0 ? avgPerBlock.toFixed(8) : '—',
      sub: blocks.length ? `AVAX, last ${Math.min(blocks.length, FEED_VISIBLE)} blocks` : 'Waiting for blocks',
    },
    {
      label: 'Latest block',
      value: latest ? latest.block_number.toLocaleString('en-US') : '—',
      sub: latest ? `${latest.tx_count} tx, ${latest.avax.toFixed(6)} AVAX burned` : 'Waiting for blocks',
    },
  ];

  return (
    <div>
      <SEO title="AVAX Burn: Live Avalanche Fee Burn" description="Live AVAX burned on Avalanche, streamed block by block. Every C-Chain fee, base fee and priority tip, is burned." />
      <style>{`
        @keyframes burnIgnite {
          0% { background-color: rgba(249,115,22,0.22); transform: translateY(-6px); opacity: 0; }
          40% { opacity: 1; }
          100% { background-color: transparent; transform: translateY(0); opacity: 1; }
        }
        @keyframes flameFlicker { 0%,100% { transform: scale(1) rotate(-1deg); opacity: .9 } 50% { transform: scale(1.12) rotate(1deg); opacity: 1 } }
      `}</style>

      {/* Hero: the running total fills the first screen, embers rise behind it. */}
      <section className="relative overflow-hidden border-b border-border bg-stage h-[520px] md:h-[min(calc(100vh-48px),900px)] md:min-h-[560px]">
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
        <LiveFeed blocks={blocks} reduced={reduced} />
      </div>
    </div>
  );
}

export default Burn;
