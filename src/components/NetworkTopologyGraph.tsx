import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { usePolling } from '../hooks/usePolling';
import { getAllChainsTPSLatest, getChains, PLACEHOLDER_CHAIN_LOGO } from '../api';
import { Chain } from '../types';
import { RefreshCw, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { LoadingSpinner } from './LoadingSpinner';

/**
 * Radial map of the network: C-Chain in the middle, every L1 with validators
 * around it, with message "bullets" travelling along the spokes. Restored from
 * the pre-screener dashboard (commit 90b309a) and restyled to the instrument
 * tokens; the mechanics (layout, animation loop, hover) are unchanged.
 */

// Every active L1 is on the map: the Overview's "Active" count and this map
// should agree. Satellites are sorted by TPS so the busiest sit nearest the hub.

function isCChain(chain: Chain): boolean {
  const name = chain.chainName.toLowerCase();
  return name.includes('c-chain') || name.includes('c chain');
}

// The API layer substitutes the L1Beat icon when a chain has no logo. On the
// map that reads as 44 identical nodes, so those chains get a lettered disc.
function realLogo(chain: Chain): string | undefined {
  const uri = chain.chainLogoUri;
  if (!uri || uri.endsWith(PLACEHOLDER_CHAIN_LOGO)) return undefined;
  return uri;
}

function isLive(chain: Chain): boolean {
  return Boolean(chain.isActive) && (chain.validatorCount ?? 0) > 0;
}

function liveChains(all: Chain[]): Chain[] {
  const center = all.find(isCChain);
  const satellites = all
    .filter((chain) => !isCChain(chain) && isLive(chain))
    .sort(
      (a, b) =>
        (b.tps?.value ?? 0) - (a.tps?.value ?? 0) ||
        (b.validatorCount ?? 0) - (a.validatorCount ?? 0),
    )
    ;
  return center ? [center, ...satellites] : satellites;
}

interface NodePosition {
  x: number;
  y: number;
  angle?: number;
  distance?: number;
  /** 0 = hub, 1 = innermost ring, … */
  ring?: number;
  /** Node diameter chosen by the ring planner for this position. */
  size?: number;
}

// Node diameter per ring. The most active chains sit on the inner ring and
// get the largest nodes; outer rings shrink so every active L1 fits.
const HUB_SIZE = 52;
const RING_SIZES = [36, 30, 24, 20];
// Gap between the edges of nodes on neighbouring rings, and the ratio by
// which rings stretch horizontally to use the panel's width.
const RING_GAP = 20;
// Orbits stretch horizontally when the panel is wider than it is tall, within
// limits so the inner ring still reads as a ring.
const ringAspect = (maxRx: number, maxRy: number) => Math.min(1.9, Math.max(1.25, (maxRx / maxRy) * 0.55));

// The map fills what is left of the first screen after the top bar, the page
// header, the stat strip and the screener's tab bar, so the Overview reads
// without scrolling. Clamped so it never collapses or balloons.
const MAP_HEIGHT = 'clamp(360px, calc(100vh - 336px), 640px)';
const ringSize = (ring: number) => RING_SIZES[Math.min(ring, RING_SIZES.length - 1) - 1] ?? RING_SIZES[0];

// Ramanujan's approximation of an ellipse perimeter.
const ellipsePerimeter = (a: number, b: number) =>
  Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));

// Parametric angles that split an ellipse into `count` equal arc lengths.
// Equal parametric steps bunch nodes at the ends of the long axis; equal
// arc steps keep the gaps even all the way round.
function equalArcAngles(rx: number, ry: number, count: number, startAngle: number): number[] {
  const samples = 720;
  const cum: number[] = [0];
  let prevX = rx * Math.cos(startAngle);
  let prevY = ry * Math.sin(startAngle);
  for (let i = 1; i <= samples; i++) {
    const t = startAngle + (2 * Math.PI * i) / samples;
    const x = rx * Math.cos(t);
    const y = ry * Math.sin(t);
    cum.push(cum[i - 1] + Math.hypot(x - prevX, y - prevY));
    prevX = x;
    prevY = y;
  }
  const total = cum[samples];
  const angles: number[] = [];
  let j = 0;
  for (let k = 0; k < count; k++) {
    const target = (total * k) / count;
    while (j < samples && cum[j + 1] < target) j++;
    const seg = cum[j + 1] - cum[j] || 1;
    const frac = (target - cum[j]) / seg;
    angles.push(startAngle + (2 * Math.PI * (j + frac)) / samples);
  }
  return angles;
}

interface Bullet {
  id: string;
  fromChainId: string;
  toChainId: string;
  progress: number;
  speed: number;
  size: number;
  color: string;
  direction: 'outgoing' | 'incoming';
}

export function NetworkTopologyGraph({
  chains: providedChains,
  fill = false,
  padTop = 0,
  padBottom = 0,
}: {
  chains?: Chain[];
  /** Fill the parent (used by the Overview hero) instead of sizing to the viewport. */
  fill?: boolean;
  /** Space to keep clear for overlays (title row, floating stats), in px. */
  padTop?: number;
  padBottom?: number;
} = {}) {
  const navigate = useNavigate();
  const [fetchedChains, setFetchedChains] = useState<Chain[]>([]);
  const [loading, setLoading] = useState(!providedChains);
  // When the parent already has the chain list (the Overview does), reuse it
  // instead of fetching a second copy.
  const chains = useMemo(
    () => (providedChains ? liveChains(providedChains) : fetchedChains),
    [providedChains, fetchedChains],
  );
  const [error, setError] = useState<string | null>(null);
  const [positions, setPositions] = useState<Map<string, NodePosition>>(new Map());
  const [hoveredChain, setHoveredChain] = useState<Chain | null>(null);
  const [selectedChain] = useState<Chain | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Performance optimization: Use refs for bullet animation to avoid re-renders on every frame
  const bulletsRef = useRef<Bullet[]>([]);
  const [, setRenderTrigger] = useState(0);
  const frameCountRef = useRef(0);
  const animationRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const bulletIdCounter = useRef(0);
  const isVisibleRef = useRef(true);

  // Bullet animation settings
  const BULLET_BASE_SPEED = 0.05;
  const MAX_BULLETS = 24;
  const BULLET_SPAWN_RATE = 0.94;

  usePolling(() => {
    if (providedChains) return;
    async function fetchData() {
      try {
        setLoading(true);
        const [chainsData, tpsMap] = await Promise.all([
          getChains(),
          getAllChainsTPSLatest()
        ]);

        const chainsWithLatestTps = chainsData.map((chain) => {
          const lookupId =
            (chain.evmChainId ? String(chain.evmChainId) : undefined) ||
            chain.originalChainId ||
            chain.chainId;

          const latest = lookupId ? tpsMap[lookupId] : undefined;
          if (!latest) return chain;

          return {
            ...chain,
            tps: {
              value: Number(latest.value),
              timestamp: Number(latest.timestamp)
            }
          };
        });
        
        if (chainsWithLatestTps && chainsWithLatestTps.length > 0) {
          const validChains = liveChains(chainsWithLatestTps);
          
          if (validChains.length > 0) {
            setFetchedChains(validChains);
            setError(null);
          } else {
            setError('No chains with validators available');
          }
        } else {
          setError('No chain data available');
        }
      } catch (err) {
        console.error('Failed to fetch data for topology graph:', err);
        setError('Failed to load network data');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, 15 * 60 * 1000);

  // Find C-Chain for highlighting
  const cChain = useMemo(() => chains.find(chain => 
    chain.chainName.toLowerCase().includes('c-chain') || 
    chain.chainName.toLowerCase().includes('c chain')
  ), [chains]);

  // Calculate node sizes based on TPS and importance
  // Hub is fixed; satellites are sized by ring (see RING_SIZES).
  const getNodeSize = (_chain: Chain, isCenter: boolean, ring = 1) => {
    if (isCenter) return HUB_SIZE;
    return ringSize(ring);
  };

  // Format TPS value for UI (avoid rounding <1 to 0)
  const formatTPS = (tpsValue: number): string => {
    if (!Number.isFinite(tpsValue)) return 'N/A';
    if (tpsValue < 1) return '< 1.0';
    // whole numbers for readability in dense UI
    return Math.round(tpsValue).toString();
  };

  // Lay satellites out on concentric ellipses that use the panel's full width.
  // Each ring takes as many nodes as its perimeter fits at that ring's node
  // size, so the count of rings follows the count of chains.
  const calculatePositions = () => {
    if (!containerRef.current || chains.length === 0) return;
    
    const container = containerRef.current;
    const rect = container.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    
    const centerChain = cChain || chains[0];
    // Orbits are centred in the area left after overlays are kept clear.
    const usableHeight = Math.max(200, height - padTop - padBottom);
    const centerX = width / 2;
    const centerY = padTop + usableHeight / 2;
    
    const newPositions = new Map<string, NodePosition>();
    newPositions.set(centerChain.chainId, { x: centerX, y: centerY, angle: 0, distance: 0, ring: 0, size: HUB_SIZE });
    
    const otherChains = chains.filter(chain => chain.chainId !== centerChain.chainId);
    if (otherChains.length === 0) {
      setPositions(newPositions);
      return;
    }

    const maxRx = width / 2 - RING_SIZES[0] / 2 - 8;
    const maxRy = usableHeight / 2 - RING_SIZES[0] / 2 - 8;

    // Rings step outward by a constant edge gap, so the map reads as evenly
    // spaced orbits rather than a cluster plus a halo. Each ring takes as many
    // nodes as its perimeter fits at that ring's node size. If the panel is
    // too short for every chain at full size, nodes and gaps shrink together
    // until everyone has a seat.
    type Ring = { ry: number; rx: number; cap: number; count: number; size: number };
    const aspect = ringAspect(maxRx, maxRy);
    const plan = (scale: number): { rings: Ring[]; remaining: number; hub: number } => {
      const hub = HUB_SIZE * Math.min(1.15, Math.max(0.75, scale));
      const sizeAt = (ring: number) => Math.round(ringSize(ring) * scale);
      const gap = RING_GAP * scale;
      const rings: Ring[] = [];
      let capacity = 0;
      let ry = hub / 2 + sizeAt(1) / 2 + 26 * scale;
      // Add rings until they could seat every chain, or the panel runs out of height.
      for (let ringNo = 1; capacity < otherChains.length && ringNo <= 8; ringNo++) {
        if (ry > maxRy && rings.length > 0) break;
        const rx = Math.min(ry * aspect, maxRx);
        const cap = Math.max(6, Math.floor(ellipsePerimeter(rx, Math.min(ry, maxRy)) / (sizeAt(ringNo) * 1.35)));
        rings.push({ ry: Math.min(ry, maxRy), rx, cap, count: 0, size: sizeAt(ringNo) });
        capacity += cap;
        ry += sizeAt(ringNo) / 2 + sizeAt(ringNo + 1) / 2 + gap;
      }
      // Fill every ring to the same fraction of its capacity, so no ring ends
      // up with two lonely nodes while the one inside it is packed.
      const total = Math.min(otherChains.length, capacity);
      let assigned = 0;
      rings.forEach((r, i) => {
        r.count = i === rings.length - 1 ? total - assigned : Math.round((r.cap / capacity) * total);
        assigned += r.count;
      });
      return { rings, remaining: otherChains.length - total, hub };
    };

    // Largest scale at which every chain gets a seat: bigger nodes when the
    // hero has room, smaller ones when a short panel does not.
    let chosen = plan(1.3);
    for (const scale of [1.15, 1, 0.92, 0.84, 0.76, 0.68, 0.6, 0.52]) {
      if (chosen.remaining === 0) break;
      chosen = plan(scale);
    }
    const { rings } = chosen;
    // Whatever still does not fit joins the outer ring; it will be tight but present.
    if (chosen.remaining > 0) rings[rings.length - 1].count += chosen.remaining;
    newPositions.set(centerChain.chainId, { x: centerX, y: centerY, angle: 0, distance: 0, ring: 0, size: chosen.hub });

    // Stretch the orbits so the outermost ring reaches the panel edge instead
    // of leaving a dead margin around a small cluster.
    const outer = rings[rings.length - 1];
    if (outer && outer.ry < maxRy) {
      const innerRy = rings[0].ry;
      const scale = rings.length === 1 ? 1 : (maxRy - innerRy) / (outer.ry - innerRy);
      rings.forEach((r, i) => {
        if (i === 0) return;
        r.ry = innerRy + (r.ry - innerRy) * scale;
        r.rx = Math.min(r.ry * aspect, maxRx);
      });
    }

    let index = 0;
    rings.forEach(({ rx, ry: ringRy, count, size }, ringIdx) => {
      const ringNo = ringIdx + 1;
      // Offset alternate rings by half a step so spokes don't line up.
      const offset = (ringIdx % 2) * (Math.PI / count) - Math.PI / 2;
      const angles = equalArcAngles(rx, ringRy, count, offset);
      for (let i = 0; i < count; i++) {
        const chain = otherChains[index++];
        if (!chain) break;
        const angle = angles[i];
        newPositions.set(chain.chainId, {
          x: centerX + rx * Math.cos(angle),
          y: centerY + ringRy * Math.sin(angle),
          angle,
          distance: Math.hypot(rx * Math.cos(angle), ringRy * Math.sin(angle)),
          ring: ringNo,
          size,
        });
      }
    });
    
    setPositions(newPositions);
  };

  // Calculate initial positions
  useEffect(() => {
    calculatePositions();

    // The map's height follows the viewport, so watch the container itself
    // rather than the window: it also catches the first layout settling.
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', calculatePositions);
      return () => window.removeEventListener('resize', calculatePositions);
    }
    const observer = new ResizeObserver(() => calculatePositions());
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chains, cChain, padTop, padBottom]);

  // Memoized function to get random bullet color
  const getRandomBulletColor = useCallback(() => {
    // Brand red family. This is the one place red means "activity": the map is
    // a picture of the network, not a chart, so up/down semantics don't apply.
    const colors = ['#e84142', '#d23536', '#f0706f', '#e84142', '#d23536', '#f7a3a2'];
    return colors[Math.floor(Math.random() * colors.length)];
  }, []);

  // Visibility detection - pause animations when tab is hidden
  useEffect(() => {
    const handleVisibilityChange = () => {
      isVisibleRef.current = !document.hidden;
      if (!document.hidden) {
        // Reset timing when becoming visible to avoid large deltaTime
        lastTimeRef.current = 0;
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // Bullet animation loop - optimized to use refs instead of state
  useEffect(() => {
    if (chains.length === 0 || positions.size === 0) return;

    const centerChainId = cChain?.chainId || chains[0].chainId;
    
    const animate = (timestamp: number) => {
      // Skip animation if tab is not visible
      if (!isVisibleRef.current) {
        animationRef.current = requestAnimationFrame(animate);
        return;
      }

      if (!lastTimeRef.current) lastTimeRef.current = timestamp;
      const deltaTime = timestamp - lastTimeRef.current;
      lastTimeRef.current = timestamp;

      // Skip frame if too much time has passed (tab was inactive)
      if (deltaTime > 100) {
        animationRef.current = requestAnimationFrame(animate);
        return;
      }

      // Update bullets directly in ref (no re-render)
      bulletsRef.current = bulletsRef.current
        .map(bullet => ({
          ...bullet,
          progress: bullet.progress + (bullet.speed * deltaTime * 0.001)
        }))
        .filter(bullet => bullet.progress < 1);
      
      // Spawn new bullets
      if (bulletsRef.current.length < MAX_BULLETS && Math.random() < BULLET_SPAWN_RATE) {
        const otherChains = chains.filter(chain => chain.chainId !== centerChainId);
        
        if (otherChains.length > 0) {
          const randomChain = otherChains[Math.floor(Math.random() * otherChains.length)];
          const direction = Math.random() > 0.5 ? 'outgoing' : 'incoming';
          
          const newBullet: Bullet = {
            id: `bullet-${bulletIdCounter.current++}`,
            fromChainId: direction === 'outgoing' ? centerChainId : randomChain.chainId,
            toChainId: direction === 'outgoing' ? randomChain.chainId : centerChainId,
            progress: 0,
            speed: BULLET_BASE_SPEED * (0.8 + Math.random() * 0.4),
            size: 1.5 + Math.random() * 1.25,
            color: getRandomBulletColor(),
            direction
          };
          
          bulletsRef.current = [...bulletsRef.current, newBullet];
        }
      }

      // Only trigger React re-render every 3rd frame (~20fps for DOM updates)
      frameCountRef.current++;
      if (frameCountRef.current % 3 === 0) {
        setRenderTrigger(n => n + 1);
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [chains, positions, cChain, getRandomBulletColor]);


  const handleChainClick = (chain: Chain) => {
    navigate(`/chain/${chain.chainId}`);
  };

  if (loading) {
    return (
      <div className={fill ? 'bg-stage h-full' : 'bg-stage rounded-md border border-border h-full'}>
        <div className="flex flex-col items-center justify-center" style={{ height: fill ? '100%' : MAP_HEIGHT }}>
          <LoadingSpinner size="lg" />
          <p className="mt-3 text-[12px] text-muted-foreground">Loading network map</p>
        </div>
      </div>
    );
  }

  if (error || chains.length === 0) {
    return (
      <div className={fill ? 'bg-stage h-full' : 'bg-stage rounded-md border border-border h-full'}>
        <div className="flex flex-col items-center justify-center" style={{ height: fill ? '100%' : MAP_HEIGHT }}>
          <p className="text-[12px] text-muted-foreground text-center mb-3 px-4">
            {error || 'No network data yet.'}
          </p>
          <button 
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-1.5 h-7 px-3 text-[12px] font-medium rounded bg-foreground text-background hover:bg-foreground/90 transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={fill ? 'relative h-full w-full overflow-hidden' : 'relative rounded-md border border-border overflow-hidden'} aria-label="Network map">
          <button 
            onClick={() => {
              bulletIdCounter.current = 0;
              const centerChainId = cChain?.chainId || chains[0].chainId;
              const otherChains = chains.filter(chain => chain.chainId !== centerChainId);
              
              const newBullets: Bullet[] = [];
              
              // Create a burst of bullets
              otherChains.slice(0, 8).forEach(chain => {
                ['outgoing', 'incoming'].forEach(direction => {
                  newBullets.push({
                    id: `bullet-${bulletIdCounter.current++}`,
                    fromChainId: direction === 'outgoing' ? centerChainId : chain.chainId,
                    toChainId: direction === 'outgoing' ? chain.chainId : centerChainId,
                    progress: 0,
                    speed: BULLET_BASE_SPEED * (0.8 + Math.random() * 0.4),
                    size: 2 + Math.random() * 2,
                    color: getRandomBulletColor(),
                    direction: direction as 'outgoing' | 'incoming'
                  });
                });
              });
              
              bulletsRef.current = newBullets;
              setRenderTrigger(n => n + 1);
            }}
            className={`absolute right-3 z-30 inline-flex items-center justify-center w-7 h-7 rounded border border-border/60 bg-stage/70 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors ${fill ? 'top-3' : 'top-2'}`}
            title="Pulse the network"
            aria-label="Pulse the network"
          >
            <Zap className="w-4 h-4" />
          </button>
      <div 
        ref={containerRef} 
        className="relative bg-stage w-full overflow-hidden"
        style={{ height: fill ? '100%' : MAP_HEIGHT }}
      >
        {/* Dark space background with subtle, slow twinkling stars - reduced for performance */}
        <div className="absolute inset-0 overflow-hidden">
          {Array.from({ length: 25 }).map((_, i) => (
            <div 
              key={`star-${i}`}
              className="absolute rounded-full bg-foreground/40 dark:bg-white"
              style={{
                width: `${Math.random() * 1.5 + 0.5}px`,
                height: `${Math.random() * 1.5 + 0.5}px`,
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                willChange: 'opacity',
                animation: `twinkle ${Math.random() * 8 + 6}s ease-in-out infinite`,
                animationDelay: `-${Math.random() * 8}s`,
              }}
            />
          ))}
        </div>
        
        {/* SVG for connections and bullets */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          <defs>
            {/* Radial gradient for center glow */}
            <radialGradient id="centerGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(232, 65, 66, 0.4)" />
              <stop offset="50%" stopColor="rgba(232, 65, 66, 0.2)" />
              <stop offset="100%" stopColor="rgba(232, 65, 66, 0)" />
            </radialGradient>
            
            {/* Glow filter for bullets */}
            <filter id="bulletGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
            
            {/* Connection line gradient - brand red */}
            <linearGradient id="connectionGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(232, 65, 66, 0.4)" />
              <stop offset="50%" stopColor="rgba(232, 65, 66, 0.2)" />
              <stop offset="100%" stopColor="rgba(232, 65, 66, 0.4)" />
            </linearGradient>
            
            {/* Animated connection line gradient for active connections */}
            <linearGradient id="activeConnectionGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(232, 65, 66, 0.8)">
                <animate attributeName="stop-opacity" values="0.8;0.4;0.8" dur="2s" repeatCount="indefinite" />
              </stop>
              <stop offset="50%" stopColor="rgba(232, 65, 66, 0.6)">
                <animate attributeName="stop-opacity" values="0.6;0.3;0.6" dur="2s" repeatCount="indefinite" />
              </stop>
              <stop offset="100%" stopColor="rgba(232, 65, 66, 0.8)">
                <animate attributeName="stop-opacity" values="0.8;0.4;0.8" dur="2s" repeatCount="indefinite" />
              </stop>
            </linearGradient>
          </defs>
          
          {/* Center glow effect removed - nodes are now uniform */}
          
          {/* Radial connections from center to all other chains */}
          {chains.map(chain => {
            const position = positions.get(chain.chainId);
            if (!position || chain.chainId === cChain?.chainId) return null;
            
            const centerPosition = positions.get(cChain?.chainId || chains[0].chainId);
            if (!centerPosition) return null;
            
            const isHighlighted = hoveredChain?.chainId === chain.chainId || selectedChain?.chainId === chain.chainId;
            
            return (
              <line 
                key={`connection-${chain.chainId}`}
                x1={centerPosition.x}
                y1={centerPosition.y}
                x2={position.x}
                y2={position.y}
                stroke={isHighlighted ? 'url(#activeConnectionGradient)' : 'url(#connectionGradient)'}
                strokeWidth={isHighlighted ? 1.5 : 0.75}
                strokeOpacity={isHighlighted ? 0.9 : 0.35}
                className="transition-all duration-300"
              >
                {isHighlighted && (
                  <animate
                    attributeName="stroke-opacity"
                    values="0.4;0.8;0.4"
                    dur="2s"
                    repeatCount="indefinite"
                  />
                )}
              </line>
            );
          })}
          
          {/* Animated bullets */}
          {bulletsRef.current.map(bullet => {
            const fromPosition = positions.get(bullet.fromChainId);
            const toPosition = positions.get(bullet.toChainId);
            
            if (!fromPosition || !toPosition) return null;
            
            const x = fromPosition.x + (toPosition.x - fromPosition.x) * bullet.progress;
            const y = fromPosition.y + (toPosition.y - fromPosition.y) * bullet.progress;
            
            return (
              <circle
                key={bullet.id}
                cx={x}
                cy={y}
                r={bullet.size}
                fill={bullet.color}
                filter="url(#bulletGlow)"
                opacity={0.9}
              />
            );
          })}
        </svg>
        
        {/* Chain nodes */}
        {chains.map(chain => {
          const position = positions.get(chain.chainId);
          if (!position) return null;
          
          const isCenter = chain.chainId === cChain?.chainId;
          const isHovered = chain.chainId === hoveredChain?.chainId;
          const isSelected = chain.chainId === selectedChain?.chainId;
          const nodeSize = position.size ?? getNodeSize(chain, isCenter, position.ring ?? 1);
          const outerRing = (position.ring ?? 1) >= 3;
          const logo = realLogo(chain);
          
          // TPS indicator
          let tpsIndicatorSize = 0;
          let tpsIndicatorColor = 'bg-[#6b7280]';
          
          if (chain.tps && typeof chain.tps.value === 'number') {
            const tpsValue = chain.tps.value;
            
            if (tpsValue >= 1) {
              tpsIndicatorSize = outerRing ? 6 : 8;
              tpsIndicatorColor = 'bg-[#3dbe7a]';
            } else if (tpsValue >= 0) {
              tpsIndicatorSize = outerRing ? 5 : 6;
              tpsIndicatorColor = 'bg-[#d4a017]';
            }
          }
          
          return (
            <div
              key={chain.chainId}
              className={`absolute transform -translate-x-1/2 -translate-y-1/2 transition-all duration-300 cursor-pointer
                ${isHovered || isSelected ? 'scale-110 z-20' : 'scale-100 z-10'}
                ${!isHovered && !isSelected ? 'animate-node-pulse' : ''}
                hover:scale-105
              `}
              style={{
                left: `${position.x}px`,
                top: `${position.y}px`,
                width: `${nodeSize}px`,
                height: `${nodeSize}px`,
              }}
              onMouseEnter={() => setHoveredChain(chain)}
              onMouseLeave={() => setHoveredChain(null)}
              onClick={() => handleChainClick(chain)}
            >
              {/* Center node - no special styling, same as other nodes */}
              
              {/* Node container */}
              <div className={`
                relative w-full h-full rounded-full flex items-center justify-center transition-all duration-300 border-2
                bg-card border-border hover:border-[#e84142]
                ${isHovered || isSelected 
                  ? 'border-[#e84142]' 
                  : ''}
              `}>
                {/* Ripple effect for interactions */}
                {(isHovered || isSelected) && (
                  <>
                    <div className="absolute -inset-4 rounded-full border border-[#e84142]/50 animate-ripple"></div>
                  </>
                )}
                
                {/* Subtle glow effect for breathing nodes */}
                {!isHovered && !isSelected && !outerRing && (
                  <div className="absolute -inset-3 rounded-full bg-[#e84142]/15 animate-node-glow-pulse" style={{ borderRadius: '50%' }}></div>
                )}
                
                {/* TPS indicator with pulse animation */}
                {tpsIndicatorSize > 0 && (
                  <div 
                    className={`absolute -top-1 -right-1 rounded-full ${tpsIndicatorColor} border-2 border-stage`}
                    style={{
                      width: `${tpsIndicatorSize}px`,
                      height: `${tpsIndicatorSize}px`,
                      animationDuration: '2s',
                    }}
                  ></div>
                )}
                
                {/* Node content - same for all nodes */}
                <div className="w-full h-full flex items-center justify-center relative">
                  {logo ? (
                    <img
                      src={logo}
                      alt={chain.chainName}
                      className="w-2/3 h-2/3 object-contain rounded-full"
                      onError={(e) => {
                        // Swap the broken image for the lettered disc.
                        e.currentTarget.style.display = 'none';
                        e.currentTarget.nextElementSibling?.classList.remove('hidden');
                        e.currentTarget.onerror = null;
                      }}
                    />
                  ) : null}
                  <span
                    aria-hidden
                    className={`num font-medium text-muted-foreground select-none ${logo ? 'hidden' : ''}`}
                    style={{ fontSize: Math.max(10, Math.round(nodeSize * 0.4)) }}
                  >
                    {chain.chainName.charAt(0).toUpperCase()}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
        
        {/* Tooltips - positioned outside the main container to ensure proper z-index */}
        {hoveredChain && (
          <div className="fixed pointer-events-none z-[9999]" style={{
            left: `${(positions.get(hoveredChain.chainId)?.x || 0) + (containerRef.current?.getBoundingClientRect().left || 0)}px`,
            top: `${(positions.get(hoveredChain.chainId)?.y || 0) + (containerRef.current?.getBoundingClientRect().top || 0) - 70}px`,
            transform: 'translateX(-50%)'
          }}>
            <div className="px-2.5 py-1.5 rounded text-[11px] bg-popover text-foreground shadow-lg border border-border animate-fade-in">
              <div className="flex flex-col items-center gap-0.5">
                <span className="font-medium">{hoveredChain.chainName}</span>
                <span className="num text-muted-foreground">
                  {hoveredChain.tps ? `${formatTPS(hoveredChain.tps.value)} TPS` : 'TPS n/a'}
                  {', '}
                  {hoveredChain.validatorCount || hoveredChain.validators?.length || 0} validators
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}