import React, { useEffect, useState, useRef, useMemo } from 'react';
import { getChains, getNetworkTPS } from '../api';
import { Chain, NetworkTPS } from '../types';
import { Server, AlertTriangle, RefreshCw, Zap, Activity } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { LoadingSpinner } from './LoadingSpinner';

interface NodePosition {
  x: number;
  y: number;
  angle?: number;
  distance?: number;
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

interface MaxTPSData {
  maxTps: number;
  timestamp: number;
  totalTxsInMinute: number;
}
export function NetworkTopologyGraph() {
  const navigate = useNavigate();
  const [chains, setChains] = useState<Chain[]>([]);
  const [networkTPS, setNetworkTPS] = useState<NetworkTPS | null>(null);
  const [maxTPSData, setMaxTPSData] = useState<MaxTPSData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [positions, setPositions] = useState<Map<string, NodePosition>>(new Map());
  const [hoveredChain, setHoveredChain] = useState<Chain | null>(null);
  const [selectedChain, setSelectedChain] = useState<Chain | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [bullets, setBullets] = useState<Bullet[]>([]);
  const animationRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const bulletIdCounter = useRef(0);

  // Bullet animation settings
  const BULLET_BASE_SPEED = 0.05;
  const MAX_BULLETS = 25;
  const BULLET_SPAWN_RATE = 0.94;

  // Fetch max TPS data
  const fetchMaxTPS = async () => {
    try {
      const response = await fetch('https://idx6.solokhin.com/api/global/overview/maxTpsObserved');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setMaxTPSData(data);
    } catch (err) {
      console.error('Failed to fetch max TPS data:', err);
      setMaxTPSData(null);
    }
  };
  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const [chainsData, networkTPSData] = await Promise.all([
          getChains(),
          getNetworkTPS()
        ]);
        
        // Fetch max TPS data separately (don't block main loading)
        fetchMaxTPS();
        
        if (chainsData && chainsData.length > 0) {
          // Filter chains to include those with validators OR Avalanche chains
          const validChains = chainsData.filter(chain => 
            (chain.validators && chain.validators.length > 0) ||
            chain.chainName.toLowerCase().includes('avalanche') ||
            chain.chainName.toLowerCase().includes('c-chain')
          );
          
          if (validChains.length > 0) {
            setChains(validChains);
            setNetworkTPS(networkTPSData);
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
    
    // Refresh data every 15 minutes
    const interval = setInterval(fetchData, 15 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, []);

  // Find C-Chain for highlighting
  const cChain = useMemo(() => chains.find(chain => 
    chain.chainName.toLowerCase().includes('c-chain') || 
    chain.chainName.toLowerCase().includes('c chain')
  ), [chains]);

  // Calculate node sizes based on TPS and importance
  const getNodeSize = (chain: Chain, isCenter: boolean) => {
    // Center node (C-Chain) is larger for prominence
    if (isCenter) {
      return 64; // Significantly larger than other nodes
    }
    
    // Base size for satellite nodes
    const baseSize = 40;
    
    if (chain.tps && typeof chain.tps.value === 'number') {
      const tpsValue = chain.tps.value;
      
      if (tpsValue <= 0.01) return baseSize * 0.8;
      if (tpsValue <= 0.1) return baseSize;
      if (tpsValue <= 1) return baseSize * 1.1;
      if (tpsValue <= 10) return baseSize * 1.2;
      
      return baseSize * 1.3;
    }
    
    return baseSize;
  };

  // Format TPS value as whole number without decimals or thousands separators
  const formatTPS = (tpsValue: number): string => {
    return Math.round(tpsValue).toString();
  };

  // Calculate radial positions around center
  const calculatePositions = () => {
    if (!containerRef.current || chains.length === 0) return;
    
    const container = containerRef.current;
    const rect = container.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    
    setDimensions({ width, height });
    
    const centerChain = cChain || chains[0];
    const centerX = width / 2;
    const centerY = height / 2;
    
    const newPositions = new Map<string, NodePosition>();
    
    // Place center chain
    newPositions.set(centerChain.chainId, { 
      x: centerX, 
      y: centerY,
      angle: 0,
      distance: 0
    });
    
    const otherChains = chains.filter(chain => chain.chainId !== centerChain.chainId);
    
    if (otherChains.length > 0) {
      // Calculate optimal radius based on container size and number of chains
      const minRadius = Math.min(width, height) * 0.25;
      const maxRadius = Math.min(width, height) * 0.42;
      
      // Use multiple rings if we have many chains
      const chainsPerRing = 8;
      const totalRings = Math.ceil(otherChains.length / chainsPerRing);
      
      otherChains.forEach((chain, index) => {
        const ringIndex = Math.floor(index / chainsPerRing);
        const positionInRing = index % chainsPerRing;
        const chainsInThisRing = Math.min(chainsPerRing, otherChains.length - ringIndex * chainsPerRing);
        
        // Calculate radius for this ring
        const radiusStep = (maxRadius - minRadius) / Math.max(1, totalRings - 1);
        const radius = minRadius + (ringIndex * radiusStep);
        
        // Calculate angle with some randomization to avoid perfect alignment
        const baseAngle = (2 * Math.PI * positionInRing) / chainsInThisRing;
        const angleOffset = (ringIndex % 2) * (Math.PI / chainsInThisRing); // Offset alternate rings
        const randomOffset = (Math.random() - 0.5) * 0.3; // Small random offset
        const angle = baseAngle + angleOffset + randomOffset;
        
        const x = centerX + radius * Math.cos(angle);
        const y = centerY + radius * Math.sin(angle);
        
        newPositions.set(chain.chainId, { 
          x, 
          y, 
          angle,
          distance: radius
        });
      });
    }
    
    setPositions(newPositions);
  };

  // Calculate initial positions
  useEffect(() => {
    calculatePositions();

    const handleResize = () => {
      calculatePositions();
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [chains, cChain]);

  // Bullet animation loop
  useEffect(() => {
    if (chains.length === 0 || positions.size === 0) return;

    const centerChainId = cChain?.chainId || chains[0].chainId;
    
    const animate = (timestamp: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = timestamp;
      const deltaTime = timestamp - lastTimeRef.current;
      lastTimeRef.current = timestamp;

      if (deltaTime > 100) {
        animationRef.current = requestAnimationFrame(animate);
        return;
      }

      setBullets(prevBullets => {
        const updatedBullets = prevBullets
          .map(bullet => {
            const newProgress = bullet.progress + (bullet.speed * deltaTime * 0.001);
            return { ...bullet, progress: newProgress };
          })
          .filter(bullet => bullet.progress < 1);
        
        if (updatedBullets.length < MAX_BULLETS && Math.random() < BULLET_SPAWN_RATE) {
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
              size: 2 + Math.random() * 2,
              color: getRandomBulletColor(),
              direction
            };
            
            return [...updatedBullets, newBullet];
          }
        }
        
        return updatedBullets;
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [chains, positions, cChain]);

  const getRandomBulletColor = () => {
    // Use brand red variations for bullets
    const colors = [
      '#ef4444', '#dc2626', '#f87171', // Brand red variations
      '#ef4444', '#dc2626', '#b91c1c', // More brand red
      '#fca5a5', '#ef4444', '#dc2626'  // Lighter and darker reds
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  };

  const handleChainClick = (chain: Chain) => {
    navigate(`/chain/${chain.chainId}`);
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-dark-800 rounded-lg shadow-md p-6 h-full">
        <div className="h-[400px] flex flex-col items-center justify-center">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-gray-600 dark:text-gray-300">Loading network topology...</p>
        </div>
      </div>
    );
  }

  if (error || chains.length === 0) {
    return (
      <div className="bg-white dark:bg-dark-800 rounded-lg shadow-md p-6 h-full">
        <div className="h-[400px] flex flex-col items-center justify-center">
          <AlertTriangle className="h-12 w-12 text-yellow-500 mb-4" />
          <p className="text-gray-600 dark:text-gray-300 text-center mb-4">
            {error || 'No network data available'}
          </p>
          <button 
            onClick={() => window.location.reload()}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-[#ef4444] hover:bg-[#dc2626] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#ef4444]"
          >
            <RefreshCw className="-ml-1 mr-2 h-4 w-4" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-dark-800 rounded-lg shadow-md p-6 h-full">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Network Topology
          </h3>
        </div>
        
        <div className="flex items-center gap-2">
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
              
              setBullets(newBullets);
            }}
            className="p-1.5 rounded-full bg-[#ef4444]/10 dark:bg-[#ef4444]/20 text-[#ef4444] dark:text-[#ef4444] hover:bg-[#ef4444]/20 dark:hover:bg-[#ef4444]/30 transition-colors"
            title="Animate network"
          >
            <Zap className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      <div 
        ref={containerRef} 
        className="relative bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 rounded-lg border border-gray-700 dark:border-gray-800 h-[400px] w-full overflow-hidden"
      >
        {/* Dark space background with subtle, slow twinkling stars */}
        <div className="absolute inset-0 overflow-hidden">
          {Array.from({ length: 80 }).map((_, i) => (
            <div 
              key={`star-${i}`}
              className="absolute rounded-full bg-white"
              style={{
                width: `${Math.random() * 1.5 + 0.5}px`,
                height: `${Math.random() * 1.5 + 0.5}px`,
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
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
              <stop offset="0%" stopColor="rgba(239, 68, 68, 0.4)" />
              <stop offset="50%" stopColor="rgba(239, 68, 68, 0.2)" />
              <stop offset="100%" stopColor="rgba(239, 68, 68, 0)" />
            </radialGradient>
            
            {/* Glow filter for bullets */}
            <filter id="bulletGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
            
            {/* Connection line gradient - brand red */}
            <linearGradient id="connectionGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(239, 68, 68, 0.4)" />
              <stop offset="50%" stopColor="rgba(239, 68, 68, 0.2)" />
              <stop offset="100%" stopColor="rgba(239, 68, 68, 0.4)" />
            </linearGradient>
            
            {/* Animated connection line gradient for active connections */}
            <linearGradient id="activeConnectionGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(239, 68, 68, 0.8)">
                <animate attributeName="stop-opacity" values="0.8;0.4;0.8" dur="2s" repeatCount="indefinite" />
              </stop>
              <stop offset="50%" stopColor="rgba(239, 68, 68, 0.6)">
                <animate attributeName="stop-opacity" values="0.6;0.3;0.6" dur="2s" repeatCount="indefinite" />
              </stop>
              <stop offset="100%" stopColor="rgba(239, 68, 68, 0.8)">
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
                strokeWidth={isHighlighted ? 2 : 1}
                strokeOpacity={isHighlighted ? 0.8 : 0.4}
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
          {bullets.map(bullet => {
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
          const nodeSize = getNodeSize(chain, isCenter);
          
          // TPS indicator
          let tpsIndicatorSize = 0;
          let tpsIndicatorColor = 'bg-gray-400';
          
          if (chain.tps && typeof chain.tps.value === 'number') {
            const tpsValue = chain.tps.value;
            
            if (tpsValue >= 1) {
              tpsIndicatorSize = 8;
              tpsIndicatorColor = 'bg-green-400';
            } else if (tpsValue >= 0.1) {
              tpsIndicatorSize = 6;
              tpsIndicatorColor = 'bg-yellow-400';
            } else if (tpsValue > 0) {
              tpsIndicatorSize = 4;
              tpsIndicatorColor = 'bg-red-400';
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
                bg-gradient-to-br from-gray-700 to-gray-800 border-gray-500 shadow-lg hover:border-[#ef4444]
                ${isHovered || isSelected 
                  ? 'shadow-2xl border-[#ef4444] animate-pulse' 
                  : ''}
              `}>
                {/* Ripple effect for interactions */}
                {(isHovered || isSelected) && (
                  <>
                    <div className="absolute -inset-4 rounded-full border-2 border-[#ef4444]/50 animate-ripple"></div>
                    {/* Subtle glow on hover */}
                    <div className="absolute -inset-2 rounded-full bg-[#ef4444]/20 animate-pulse"></div>
                  </>
                )}
                
                {/* Subtle glow effect for breathing nodes */}
                {!isHovered && !isSelected && (
                  <div className="absolute -inset-3 rounded-full bg-[#ef4444]/20 animate-node-glow-pulse" style={{ borderRadius: '50%' }}></div>
                )}
                
                {/* TPS indicator with pulse animation */}
                {tpsIndicatorSize > 0 && (
                  <div 
                    className={`absolute -top-1 -right-1 rounded-full ${tpsIndicatorColor} border-2 border-gray-800 shadow-sm animate-pulse`}
                    style={{
                      width: `${tpsIndicatorSize}px`,
                      height: `${tpsIndicatorSize}px`,
                      animationDuration: '2s',
                    }}
                  ></div>
                )}
                
                {/* Node content - same for all nodes */}
                <div className="w-full h-full flex items-center justify-center">
                  {chain.chainLogoUri ? (
                    <img
                      src={chain.chainLogoUri}
                      alt={chain.chainName}
                      className="w-2/3 h-2/3 object-contain rounded-full"
                      onError={(e) => {
                        e.currentTarget.src = "https://i.postimg.cc/gcq3RxBm/SAVE-20251114-181539.jpg";
                        e.currentTarget.onerror = null;
                      }}
                    />
                  ) : (
                    <img
                      src="https://i.postimg.cc/gcq3RxBm/SAVE-20251114-181539.jpg"
                      alt={chain.chainName}
                      className="w-2/3 h-2/3 object-contain rounded-full"
                    />
                  )}
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
            <div className="px-3 py-2 rounded-lg text-xs font-medium bg-gray-900 text-white shadow-xl border border-gray-700 animate-fade-in">
              <div className="flex flex-col items-center gap-1">
                <span className="font-semibold text-white">{hoveredChain.chainName}</span>
                {hoveredChain.tps && (
                  <span className={`text-xs ${
                    hoveredChain.tps.value >= 1 ? 'text-green-400' : 
                    hoveredChain.tps.value >= 0.1 ? 'text-yellow-400' : 'text-red-400'
                  }`}>
                    {formatTPS(hoveredChain.tps.value)} TPS
                  </span>
                )}
                <span className="text-xs text-gray-400">
                  {hoveredChain.validators?.length || 0} validators
                </span>
              </div>
              {/* Tooltip arrow */}
              <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 
                border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
            </div>
          </div>
        )}
      </div>
      
      {/* Updated legend with network TPS */}
      <div className="mt-4 flex justify-between items-center">
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <Server className="w-4 h-4" />
          <span>Active chains: <span className="font-semibold">{chains.length}</span></span>
        </div>
        
        {/* Network TPS display */}
        {networkTPS && (
          <div className="flex items-center gap-4">
            {/* Current Network TPS */}
            <div className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-[#ef4444] to-[#dc2626] rounded-lg shadow-sm">
              <Activity className="w-4 h-4 text-white" />
              <div className="flex flex-col">
                <span className="text-xs text-white/90 font-medium">Network TPS</span>
                <span className="text-sm font-bold text-white">
                  {formatTPS(networkTPS.totalTps)}
                </span>
              </div>
            </div>
            
            {/* Max TPS Observed */}
            {maxTPSData && (
              <div className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-emerald-500 to-green-600 rounded-lg shadow-sm">
                <Zap className="w-4 h-4 text-white" />
                <div className="flex flex-col">
                  <span className="text-xs text-emerald-100 font-medium">Max TPS (7d)</span>
                  <span className="text-sm font-bold text-white">
                    {formatTPS(maxTPSData.maxTps)}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* Fallback if only maxTPS is available */}
        {!networkTPS && maxTPSData && (
          <div className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-emerald-500 to-green-600 rounded-lg shadow-sm">
            <Activity className="w-4 h-4 text-white" />
            <div className="flex flex-col">
              <span className="text-xs text-emerald-100 font-medium">Max TPS (7d)</span>
              <span className="text-sm font-bold text-white">
                {formatTPS(maxTPSData.maxTps)}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}