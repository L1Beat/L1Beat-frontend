import { useEffect, useMemo, useRef, useState } from 'react';
import { Flame, Zap, Activity, Gauge, Volume2, VolumeX } from 'lucide-react';
import { SEO } from '../components/SEO';
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

const WS_URL = 'wss://api.l1beat.io/ws/blocks/43114';
const FEED_CAP = 50;
const NAVAX = 1e9; // 1 AVAX = 1e9 nAVAX

const navaxToAvax = (n: string | bigint): number => Number(typeof n === 'bigint' ? n : BigInt(n)) / NAVAX;

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
    let audio = audioRef.current;
    if (!audio) {
      audio = new Audio(FIRE_SRC);
      audio.loop = true;
      audioRef.current = audio;
    }
    audio.volume = 0;
    void audio.play().catch(() => {});
    fadeTo(FIRE_VOLUME);
  };

  const stop = () => {
    const audio = audioRef.current;
    if (!audio) return;
    fadeTo(0, () => audio.pause());
  };

  const toggle = () => setEnabled((e) => { e ? stop() : start(); return !e; });

  useEffect(() => () => {
    if (fadeRef.current) clearInterval(fadeRef.current);
    audioRef.current?.pause();
  }, []);

  return { enabled, toggle };
}

// --- live stream hook ------------------------------------------------------
function useBurnStream() {
  const [blocks, setBlocks] = useState<WsBlock[]>([]);
  const [totalNavax, setTotalNavax] = useState<bigint | null>(null); // REST seed + new-block deltas
  const [sessionNavax, setSessionNavax] = useState<bigint>(0n);
  const [connected, setConnected] = useState(false);
  const [lastBlock, setLastBlock] = useState<WsBlock | null>(null);

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
      const fresh: WsBlock[] = [];
      for (const b of incoming) {
        if (seenRef.current.has(b.block_number)) continue;
        seenRef.current.add(b.block_number);
        fresh.push(b);
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
      setBlocks((prev) => [...fresh].concat(prev).sort((a, b) => b.block_number - a.block_number).slice(0, FEED_CAP));
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
interface Ember { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; hue: number; }

function EmberCanvas({ burst, reduced }: { burst: WsBlock | null; reduced: boolean }) {
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
        hue: 12 + Math.random() * 32,
      });
    }
    if (embers.current.length > 320) embers.current = embers.current.slice(-320);
  };

  // Burst on each new block, sized by burn magnitude (log scale — burns are tiny).
  useEffect(() => {
    if (reduced || !burst) return;
    const navax = Number(BigInt(burst.burned.total)) || 0;
    const n = 6 + Math.min(34, Math.round(Math.log10(navax + 10) * 5));
    spawn(n);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [burst?.block_number, reduced]);

  useEffect(() => {
    if (reduced) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

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
      ctx.globalCompositeOperation = 'lighter';
      const arr = embers.current;
      for (let i = arr.length - 1; i >= 0; i--) {
        const e = arr[i];
        e.life += dt;
        if (e.life >= e.max || e.y < -10) { arr.splice(i, 1); continue; }
        const t = e.life / e.max;
        e.vy -= 0.0006 * dt; // buoyancy
        e.x += e.vx * dt * 0.06;
        e.y += e.vy * dt * 0.06;
        const alpha = (1 - t) * 0.85;
        const r = e.size * (1 + t * 0.6);
        ctx.shadowBlur = 8;
        ctx.shadowColor = `hsla(${e.hue}, 100%, 55%, ${alpha})`;
        ctx.fillStyle = `hsla(${e.hue}, 100%, ${60 - t * 20}%, ${alpha})`;
        ctx.beginPath();
        ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.shadowBlur = 0;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
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
    <div className="flex items-baseline justify-center font-bold tabular-nums leading-none">
      <span
        className="text-5xl sm:text-7xl lg:text-8xl bg-gradient-to-b from-orange-300 via-[#ef4444] to-orange-600 bg-clip-text text-transparent"
        style={{ filter: 'drop-shadow(0 0 24px rgba(239,68,68,0.45))' }}
      >
        {intPart}
      </span>
      <span className="text-xl sm:text-3xl lg:text-4xl text-orange-400/70 ml-0.5">{frac}</span>
    </div>
  );
}

// Isolated so its 60fps tween only re-renders itself, not the whole page/feed.
function SessionStat({ navax, reduced }: { navax: bigint; reduced: boolean }) {
  const v = useTween(navaxToAvax(navax), 700, reduced);
  return <StatCard icon={Activity} label="Burned this session" value={v.toFixed(8)} sub="since you opened" />;
}

function StatCard({ icon: Icon, label, value, sub }: { icon: typeof Flame; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card/60 backdrop-blur px-4 py-3.5">
      <div className="flex items-center gap-2 text-[11px] font-semibold tracking-wide uppercase text-muted-foreground">
        <Icon className="w-3.5 h-3.5 text-[#ef4444]" />
        {label}
      </div>
      <div className="mt-1.5 text-xl sm:text-2xl font-bold text-foreground tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

// --- live feed -------------------------------------------------------------
function timeAgo(iso: string, now: number): string {
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function BlockRow({ block, now, reduced, isNewest }: { block: WsBlock; now: number; reduced: boolean; isNewest: boolean }) {
  const avax = navaxToAvax(block.burned.total);
  // Flash intensity scales (log) with burn size; newest row gets the ignite flash.
  const navax = Number(BigInt(block.burned.total)) || 0;
  const heat = Math.min(1, Math.log10(navax + 10) / 7);
  return (
    <div
      className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-border/50 last:border-0"
      style={!reduced && isNewest ? { animation: 'burnIgnite 900ms ease-out' } : undefined}
    >
      <div className="min-w-0">
        <div className="text-sm font-semibold text-foreground tabular-nums">Block {block.block_number.toLocaleString('en-US')}</div>
        <div className="text-[11px] text-muted-foreground">
          {timeAgo(block.block_time, now)} · {block.tx_count} tx
        </div>
      </div>
      <div
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-bold tabular-nums text-orange-300 border border-orange-500/30"
        style={{ background: `rgba(239,68,68,${0.08 + heat * 0.22})` }}
      >
        <Flame className="w-3.5 h-3.5 text-[#ef4444]" />
        {avax.toFixed(8)}
      </div>
    </div>
  );
}

// --- page ------------------------------------------------------------------
export function Burn() {
  const reduced = usePrefersReducedMotion();
  const { blocks, totalNavax, sessionNavax, connected, lastBlock } = useBurnStream();
  const sound = useFireplaceSound();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const totalAvax = totalNavax != null ? navaxToAvax(totalNavax) : 0;

  // Burn rate over blocks in the last 60s → AVAX/min.
  const ratePerMin = useMemo(() => {
    const cutoff = now - 60_000;
    let sum = 0;
    for (const b of blocks) {
      if (new Date(b.block_time).getTime() >= cutoff) sum += navaxToAvax(b.burned.total);
    }
    return sum; // already a per-minute window
  }, [blocks, now]);

  // Average burn per block across the blocks currently in the feed.
  const avgPerBlock = useMemo(() => {
    if (blocks.length === 0) return 0;
    let sum = 0n;
    for (const b of blocks) {
      try { sum += BigInt(b.burned.total); } catch { /* ignore */ }
    }
    return Number(sum) / NAVAX / blocks.length;
  }, [blocks]);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <SEO title="AVAX Burn: Live Avalanche Fee Burn" description="Live AVAX burned on Avalanche, streamed block by block. Every C-Chain fee, base fee and priority tip, is burned." />
      <style>{`
        @keyframes burnIgnite {
          0% { background-color: rgba(239,68,68,0.28); transform: translateY(-6px); opacity: 0; }
          40% { opacity: 1; }
          100% { background-color: transparent; transform: translateY(0); opacity: 1; }
        }
        @keyframes flameFlicker { 0%,100% { transform: scale(1) rotate(-1deg); opacity: .9 } 50% { transform: scale(1.12) rotate(1deg); opacity: 1 } }
      `}</style>

      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-b from-[#1a1410] to-card px-6 py-12 sm:py-16 text-center">
        <div
          className="absolute inset-x-0 bottom-0 h-2/3 pointer-events-none"
          style={{ background: 'radial-gradient(60% 100% at 50% 100%, rgba(239,68,68,0.18), transparent 70%)' }}
          aria-hidden
        />
        <EmberCanvas burst={lastBlock} reduced={reduced} />

        <button
          type="button"
          onClick={sound.toggle}
          aria-pressed={sound.enabled}
          title={sound.enabled ? 'Mute fireplace' : 'Play fireplace sound'}
          className="absolute top-4 right-4 z-10 inline-flex items-center gap-1.5 rounded-full border border-orange-500/30 bg-black/30 px-3 py-1.5 text-[11px] font-semibold text-orange-200/90 backdrop-blur hover:bg-black/50 transition-colors"
        >
          {sound.enabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">{sound.enabled ? 'Sound on' : 'Fireplace'}</span>
        </button>

        <div className="relative">
          <div className="inline-flex items-center gap-2 text-sm font-bold tracking-widest uppercase text-orange-300/90">
            <Flame className="w-4 h-4 text-[#ef4444]" style={!reduced ? { animation: 'flameFlicker 1.4s ease-in-out infinite' } : undefined} />
            Total AVAX Burned on C-Chain
          </div>

          <div className="mt-6 mb-3">
            {totalNavax == null ? (
              <div className="h-16 sm:h-24 w-72 sm:w-[28rem] mx-auto rounded-xl bg-muted animate-pulse" />
            ) : (
              <BurnCounter avax={totalAvax} reduced={reduced} />
            )}
          </div>

          <div className="text-sm font-semibold tracking-wide text-muted-foreground">AVAX</div>

          <div className="mt-7 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-amber-500'} ${connected && !reduced ? 'animate-pulse' : ''}`} />
            {connected ? 'Live · streaming C-Chain blocks' : 'Reconnecting…'}
          </div>
        </div>
      </section>

      {/* Blurb */}
      <p className="mt-6 text-center text-sm text-muted-foreground leading-relaxed max-w-2xl mx-auto">
        AVAX is the hard-capped native token of Avalanche. On the C-Chain the{' '}
        <span className="text-foreground font-medium">entire transaction fee</span> (base fee and priority tip) is{' '}
        <span className="text-[#ef4444] font-medium">burned</span>, removed from circulating supply.
      </p>

      {/* Stats */}
      <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
        <StatCard icon={Zap} label="Burn rate" value={`${ratePerMin.toFixed(6)}`} sub="AVAX / min" />
        <SessionStat navax={sessionNavax} reduced={reduced} />
        <StatCard icon={Gauge} label="Avg burn / block" value={avgPerBlock > 0 ? avgPerBlock.toFixed(8) : '—'} sub={blocks.length ? `last ${blocks.length} blocks` : 'AVAX'} />
      </div>

      {/* Live feed */}
      <section className="mt-8 rounded-2xl border border-border bg-card overflow-hidden">
        <header className="flex items-center gap-2 px-4 sm:px-5 py-3.5 border-b border-border">
          <Flame className="w-4 h-4 text-[#ef4444]" />
          <h2 className="text-sm font-bold tracking-wide uppercase text-foreground">Live C-Chain Block Burns</h2>
        </header>
        {blocks.length === 0 ? (
          <div className="divide-y divide-border/50">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between px-4 sm:px-5 py-3">
                <div className="space-y-1.5">
                  <div className="h-3.5 w-28 rounded bg-muted animate-pulse" />
                  <div className="h-2.5 w-20 rounded bg-muted animate-pulse" />
                </div>
                <div className="h-6 w-24 rounded-full bg-muted animate-pulse" />
              </div>
            ))}
          </div>
        ) : (
          <div>
            {blocks.map((b, i) => (
              <BlockRow key={b.block_number} block={b} now={now} reduced={reduced} isNewest={i === 0} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default Burn;
