import React, { useEffect, useState, useRef, useCallback } from 'react';
import * as d3 from 'd3';
import { sankey, sankeyLinkHorizontal } from 'd3-sankey';
import { format } from 'date-fns';
import { RefreshCw, AlertTriangle, MessageSquare, ArrowUpDown, Activity, Clock } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';
import { useNavigate } from 'react-router-dom';
import { LoadingSpinner } from './LoadingSpinner';

// Get API base URL from environment variables
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001';

interface TeleporterMessage {
  source: string;
  target: string;
  value: number;
}

interface TeleporterData {
  messages: TeleporterMessage[];
  metadata: {
    totalMessages: number;
    timeWindow?: number;
    timeWindowUnit?: string;
    startDate?: string;
    endDate?: string;
    updatedAt: string;
  };
}

interface SankeyNode extends d3.SankeyNode<SankeyNode, SankeyLink> {
  name: string;
  id: string;
  color?: string;
  displayName?: string;
  originalName?: string;
}

interface SankeyLink extends d3.SankeyLink<SankeyNode, SankeyLink> {
  source: SankeyNode;
  target: SankeyNode;
  value: number;
  gradient?: string;
}

// Function to format chain names for better readability
const formatChainName = (name: string) => {
  if (!name) return 'Unknown';
  
  // Special case for specific chains
  if (name === 'Avalanche (C-Chain)') return 'C-Chain';
  if (name === 'Dexalot L1') return 'Dexalot';
  if (name === 'zeroone Mainnet L1') return 'ZeroOne';
  if (name === 'Lamina1 L1') return 'Lamina1';
  if (name === 'PLYR PHI L1') return 'PLYR';
  
  // For other chains, just return the name
  return name;
};

// Function to find chain ID from chain name
const findChainId = (chainName: string) => {
  // Map of known chain names to their IDs
  const chainMap: Record<string, string> = {
    'Avalanche (C-Chain)': 'C',
    'C-Chain': 'C',
    'Dexalot L1': 'dexalot',
    'Dexalot': 'dexalot',
    'zeroone Mainnet L1': 'zeroone',
    'ZeroOne': 'zeroone',
    'Lamina1 L1': 'lamina1',
    'Lamina1': 'lamina1',
    'PLYR PHI L1': 'plyr',
    'PLYR': 'plyr',
  };
  
  return chainMap[chainName] || null;
};

export function TeleporterSankeyDiagram() {
  const navigate = useNavigate();
  const [data, setData] = useState<TeleporterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredLink, setHoveredLink] = useState<SankeyLink | null>(null);
  const [hoveredNode, setHoveredNode] = useState<SankeyNode | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const [selectedChain, setSelectedChain] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<'daily' | 'weekly'>('daily');
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();
  
  // Force text colors to always be white for dark background
  const forceTextColors = useCallback(() => {
    // Always use white text since we have a dark background
    const textColor = '#ffffff';
    const secondaryTextColor = 'rgba(255, 255, 255, 0.7)';
    
    // Force direct DOM updates to ensure color consistency
    document.querySelectorAll('.node-label').forEach(el => {
    (el as HTMLElement).style.setProperty('fill', textColor, 'important');
    });
    
    document.querySelectorAll('.value-label, .diagram-title').forEach(el => {
      (el as HTMLElement).style.setProperty('fill', secondaryTextColor, 'important');
    });
  }, []);
  
  
  // Apply text colors when the diagram is first drawn or redrawn
  useEffect(() => {
    if (data && svgRef.current) {
      const timer = setTimeout(forceTextColors, 50);
      return () => clearTimeout(timer);
    }
  }, [data, forceTextColors, selectedChain]);
  
  

  // Generate a consistent color for a chain
  const getChainColor = useCallback((chainName: string) => {
    // Target strict brand colors
    // C-Chain: Primary Red (#ef4444)
    // Others: Neutral/Grayscale to highlight C-Chain's centrality
    
    const name = chainName.toLowerCase();
    
    if (name.includes('c-chain') || name.includes('avalanche')) {
      return '#ef4444'; // Brand Red
    }

    // Generate consistent neutral/slate colors for other chains
    // Use a deterministic hash to pick from a slate palette
    const hash = chainName.split('').reduce((acc, char) => {
      return char.charCodeAt(0) + ((acc << 5) - acc);
    }, 0);
    
    // Palette of neutral colors that look good on dark background
    // Ranging from Slate-400 to Slate-600 and Zinc-400 to Zinc-600
    const neutrals = [
      '#94a3b8', // slate-400
      '#64748b', // slate-500
      '#475569', // slate-600
      '#a1a1aa', // zinc-400
      '#71717a', // zinc-500
      '#52525b', // zinc-600
      '#9ca3af', // gray-400
      '#6b7280', // gray-500
    ];
    
    return neutrals[Math.abs(hash) % neutrals.length];
  }, []);


  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Use the appropriate endpoint based on the selected timeframe
      const endpoint = timeframe === 'daily' 
        ? `${API_BASE_URL}/api/teleporter/messages/daily-count`
        : `${API_BASE_URL}/api/teleporter/messages/weekly-count`;
      
      const response = await fetch(endpoint);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const rawData = await response.json();
      
      // Process the API response format
      if (!rawData || !rawData.data || !Array.isArray(rawData.data)) {
        throw new Error('Invalid data format: Missing data array');
      }
      
      // Transform the data to our expected format
      const messages = rawData.data.map((item: any) => ({
        source: item.sourceChain || 'Unknown',
        target: item.destinationChain || 'Unknown',
        value: Number(item.messageCount) || 0
      }));
      
      // Sort messages by value in descending order
      messages.sort((a, b) => b.value - a.value);
      
      const totalMessages = rawData.metadata?.totalMessages || 
        messages.reduce((sum, msg) => sum + msg.value, 0);
      
      const processedData: TeleporterData = {
        messages,
        metadata: {
          totalMessages,
          timeWindow: timeframe === 'daily' ? 24 : 7,
          timeWindowUnit: timeframe === 'daily' ? 'hours' : 'days',
          updatedAt: rawData.metadata?.updatedAt || new Date().toISOString()
        }
      };
      
      setData(processedData);
    } catch (err) {
      console.error(`Failed to fetch ${timeframe} Teleporter messages:`, err);
      
      // Use sample data for demonstration when there's an error
      const sampleData = generateSampleData();
      setData(sampleData);
      setError(`Using sample data - API connection failed for ${timeframe} data`);
    } finally {
      setLoading(false);
    }
  }, [timeframe]);

  // Generate sample data for demonstration
  const generateSampleData = (): TeleporterData => {
    // Different sample data based on timeframe
    const dailySampleMessages = [
      { source: 'Dexalot L1', target: 'Avalanche (C-Chain)', value: 408 },
      { source: 'Avalanche (C-Chain)', target: 'Dexalot L1', value: 362 },
      { source: 'Avalanche (C-Chain)', target: 'zeroone Mainnet L1', value: 24 },
      { source: 'Lamina1 L1', target: 'Avalanche (C-Chain)', value: 17 },
      { source: 'zeroone Mainnet L1', target: 'Avalanche (C-Chain)', value: 16 },
      { source: 'Avalanche (C-Chain)', target: '898b8aa8', value: 12 },
      { source: 'Avalanche (C-Chain)', target: 'PLYR PHI L1', value: 6 },
      { source: 'PLYR PHI L1', target: 'Avalanche (C-Chain)', value: 2 }
    ];
    
    const weeklySampleMessages = [
      { source: 'Dexalot L1', target: 'Avalanche (C-Chain)', value: 2845 },
      { source: 'Avalanche (C-Chain)', target: 'Dexalot L1', value: 2532 },
      { source: 'Avalanche (C-Chain)', target: 'zeroone Mainnet L1', value: 168 },
      { source: 'zeroone Mainnet L1', target: 'Avalanche (C-Chain)', value: 112 },
      { source: 'Lamina1 L1', target: 'Avalanche (C-Chain)', value: 119 },
      { source: 'Avalanche (C-Chain)', target: 'Lamina1 L1', value: 84 },
      { source: 'Avalanche (C-Chain)', target: '898b8aa8', value: 84 },
      { source: 'Avalanche (C-Chain)', target: 'PLYR PHI L1', value: 42 },
      { source: 'PLYR PHI L1', target: 'Avalanche (C-Chain)', value: 14 }
    ];
    
    const messages = timeframe === 'daily' ? dailySampleMessages : weeklySampleMessages;
    const totalMessages = messages.reduce((sum, msg) => sum + msg.value, 0);
    
    return {
      messages,
      metadata: {
        totalMessages,
        timeWindow: timeframe === 'daily' ? 24 : 7,
        timeWindowUnit: timeframe === 'daily' ? 'hours' : 'days',
        updatedAt: new Date().toISOString()
      }
    };
  };

  useEffect(() => {
    fetchData();
    
    // Reset selected chain when changing timeframe
    setSelectedChain(null);
    
    // Refresh data every 15 minutes
    const interval = setInterval(fetchData, 15 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, [fetchData, timeframe]);

  // Handle node click to focus on chain connections
  const handleNodeClick = useCallback((node: SankeyNode) => {
    // Toggle the selected chain to focus on its connections
    setSelectedChain(selectedChain === node.name ? null : node.name);
  }, [selectedChain]);

  // Draw the Sankey diagram
  useEffect(() => {
    if (!data || !svgRef.current || !containerRef.current) return;
    
    // Clear previous diagram
    d3.select(svgRef.current).selectAll('*').remove();
    
    const container = containerRef.current;
    const containerWidth = container.clientWidth;
    const containerHeight = Math.max(400, container.clientHeight);
    
    // Set up margins
    const margin = { top: 20, right: 30, bottom: 20, left: 30 };
    const width = containerWidth - margin.left - margin.right;
    const height = containerHeight - margin.top - margin.bottom;
    
    // Create SVG
    const svg = d3.select(svgRef.current)
      .attr('width', containerWidth)
      .attr('height', containerHeight)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);
    
    try {
      // Check if we have enough data to create a diagram
      if (data.messages.length === 0) {
        throw new Error('No message data available');
      }
      
      // Create a map of unique source and target nodes
      const nodesMap = new Map();
      
      // Add all sources and targets to the map with unique IDs
      data.messages.forEach((msg) => {
        const sourceKey = `source-${msg.source}`;
        const targetKey = `target-${msg.target}`;
        
        if (!nodesMap.has(sourceKey)) {
          nodesMap.set(sourceKey, {
            name: sourceKey,
            displayName: formatChainName(msg.source),
            originalName: msg.source,
            isSource: true,
            color: getChainColor(msg.source)
          });
        }
        
        if (!nodesMap.has(targetKey)) {
          nodesMap.set(targetKey, {
            name: targetKey,
            displayName: formatChainName(msg.target),
            originalName: msg.target,
            isSource: false,
            color: getChainColor(msg.target)
          });
        }
      });
      
      // Convert the map to an array of nodes
      const nodes = Array.from(nodesMap.values());
      
      // Create links with references to node indices
      const links = data.messages.map(msg => ({
        source: `source-${msg.source}`,
        target: `target-${msg.target}`,
        value: msg.value
      }));
      
      // Filter links and nodes based on selected chain
      let filteredLinks = links;
      let filteredNodes = nodes;
      
      if (selectedChain) {
        filteredLinks = links.filter(link => 
          link.source === selectedChain || link.target === selectedChain
        );
        
        const nodeNames = new Set();
        filteredLinks.forEach(link => {
          nodeNames.add(link.source);
          nodeNames.add(link.target);
        });
        
        filteredNodes = nodes.filter(node => nodeNames.has(node.name));
      }
      
      // Create the Sankey generator
      const sankeyGenerator = sankey<any, any>()
        .nodeId(d => d.name)
        .nodeWidth(25)
        .nodePadding(15)
        .extent([[0, 0], [width, height]]);
      
      // Generate the Sankey data
      const sankeyData = sankeyGenerator({
        nodes: filteredNodes,
        links: filteredLinks
      });
      
      // Add a subtle grid pattern
      const defs = svg.append('defs');
      
      defs.append('pattern')
        .attr('id', 'grid')
        .attr('width', 20)
        .attr('height', 20)
        .attr('patternUnits', 'userSpaceOnUse')
        .append('path')
        .attr('d', 'M 20 0 L 0 0 0 20')
        .attr('fill', 'none')
        .attr('stroke', 'rgba(255, 255, 255, 0.05)')
        .attr('stroke-width', 0.5);
      
      svg.append('rect')
        .attr('width', width)
        .attr('height', height)
        .attr('fill', 'url(#grid)')
        .attr('opacity', 0.5);
      
      // Create gradients for links
      sankeyData.links.forEach((link, i) => {
        const gradientId = `link-gradient-${i}`;
        const gradient = defs.append('linearGradient')
          .attr('id', gradientId)
          .attr('gradientUnits', 'userSpaceOnUse')
          .attr('x1', link.source.x1)
          .attr('x2', link.target.x0);
        
        gradient.append('stop').attr('offset', '0%').attr('stop-color', link.source.color);
        gradient.append('stop').attr('offset', '100%').attr('stop-color', link.target.color);
        link.gradient = gradientId;
      });
      
      // Draw the links with animations
      const linkPaths = svg.append('g')
        .attr('class', 'links')
        .attr('fill', 'none')
        // .attr('stroke-opacity', 0.4)
        .selectAll('path')
        .data(sankeyData.links)
        .enter()
        .append('path')
        .attr('d', sankeyLinkHorizontal())
        .attr('stroke', d => `url(#${d.gradient})`)
        .attr('stroke-width', d => Math.max(3, d.width))
        .attr('opacity', d => 
          selectedChain ? 
            (d.source.name === selectedChain || d.target.name === selectedChain ? 0.8 : 0.2) : 
            0.6
        )
        .style('transition', 'opacity 0.3s ease, stroke-width 0.3s ease')
        .style('cursor', 'pointer');
      
      // Particle animation logic...
      function animateParticle(particle, pathNode) {
        const pathLength = pathNode.getTotalLength();
        const duration = Math.random() * 3000 + 2000;
        const delay = Math.random() * 2000;
        
        function startAnimation() {
          particle
            .attr('opacity', 0)
            .transition()
            .delay(delay)
            .duration(duration)
            .ease(d3.easeLinear)
            .attrTween('transform', function() {
              return function(t) {
                const point = pathNode.getPointAtLength(t * pathLength);
                return `translate(${point.x},${point.y})`;
              };
            })
            .attr('opacity', t => t < 0.9 ? 0.7 : 0.7 * (1 - (t - 0.9) * 10))
            .on('end', startAnimation);
        }
        startAnimation();
      }

      linkPaths.each(function(d) {
        if (d.value > 50) {
          const numParticles = Math.min(5, Math.max(2, Math.floor(d.value / 100)));
          for (let j = 0; j < numParticles; j++) {
            const particle = svg.append('circle')
              .attr('r', 2)
              .attr('fill', d.source.color)
              .style('mix-blend-mode', 'screen');
            animateParticle(particle, this);
          }
        }
      });
      
      // Reset all links to normal state after creation
      linkPaths
        .attr('stroke-opacity', d => 
          selectedChain ? 
            (d.source.name === selectedChain || d.target.name === selectedChain ? 0.7 : 0.1) : 0.4)
        .attr('stroke-width', d => Math.max(3, d.width));
      
      // Draw the nodes
      const nodes_g = svg.append('g')
        .attr('class', 'nodes')
        .selectAll('g')
        .data(sankeyData.nodes)
        .enter()
        .append('g')
        .attr('class', 'node-group')
        .attr('transform', d => `translate(${d.x0},${d.y0})`)
        .style('cursor', 'pointer');
      
      // Add node rectangles
      nodes_g.append('rect')
        .attr('height', d => d.y1 - d.y0)
        .attr('width', d => d.x1 - d.x0)
        .attr('fill', d => d.color) // Simplified fill for clarity, gradients can be added back
        .attr('stroke', d => d3.color(d.color)?.darker(0.5)?.toString() || '#000')
        .attr('stroke-width', 1)
        .attr('rx', 4).attr('ry', 4)
        .attr('opacity', d => selectedChain ? (d.name === selectedChain ? 1 : 0.7) : 0.9);

      // Add expanded, invisible hover area for better UX on small nodes
      nodes_g.append('rect')
        .attr('class', 'hover-area')
        .attr('height', d => Math.max(15, d.y1 - d.y0))
        .attr('width', d => d.x1 - d.x0 + 10) // A bit wider
        .attr('x', -5) // Center it
        .attr('y', d => ( (d.y1 - d.y0) - Math.max(15, d.y1 - d.y0) ) / 2) // Center it
        .attr('fill', 'transparent');
        
      // Add labels for the nodes
      nodes_g.append('text')
        .attr('x', d => d.x0 < width / 2 ? d.x1 - d.x0 + 6 : -6)
        .attr('y', d => (d.y1 - d.y0) / 2)
        .attr('dy', '0.35em')
        .attr('text-anchor', d => d.x0 < width / 2 ? 'start' : 'end')
        .attr('class', 'node-label')
        .text(d => d.displayName)
        .attr('fill', '#ffffff')
        .attr('font-weight', 'bold')
        .attr('font-size', '12px')
        .attr('pointer-events', 'none');
      
      // Add value labels, hidden by default
      const valueLabels = nodes_g.append('text')
        .attr('x', d => d.x0 < width / 2 ? d.x1 - d.x0 + 6 : -6)
        .attr('y', d => (d.y1 - d.y0) / 2 + 16)
        .attr('dy', '0.35em')
        .attr('class', 'value-label')
        .attr('text-anchor', d => d.x0 < width / 2 ? 'start' : 'end')
        .text(d => `${d.value.toLocaleString()} msgs`)
        .attr('fill', 'rgba(255, 255, 255, 0.7)')
        .attr('font-size', '10px')
        .attr('pointer-events', 'none')
        .attr('opacity', 0) // Hide by default
        .style('transition', 'opacity 0.2s ease-in-out');
      
      // DO NOT TOUCH
      nodes_g
        .on('mouseover', function(event, d) {
          setHoveredNode(d);
          setTooltipPosition({ x: event.pageX, y: event.pageY });
          d3.select(this).select('.value-label').attr('opacity', 1);
        })
        .on('mousemove', function(event) {
          setTooltipPosition({ x: event.pageX, y: event.pageY });
        })
        .on('mouseout', function(event, d) {
          setHoveredNode(null);
          d3.select(this).select('.value-label').attr('opacity', 0);
        })
        .on('click', function(event, d) {
          handleNodeClick(d);
          event.stopPropagation(); 
        });
      // DO NOT TOUCH
      
      // Add a title
      svg.append('text')
        .attr('x', width / 2)
        .attr('y', -5)
        .attr('class', 'diagram-title')
        .attr('text-anchor', 'middle')
        .attr('font-size', '12px')
        .attr('font-weight', 'bold')
        .attr('fill', 'rgba(255, 255, 255, 0.7)')
        .text(`Total: ${data.metadata.totalMessages.toLocaleString()} messages`);
      
      svg.on('click', () => {
        if (selectedChain) {
          setSelectedChain(null);
        }
      });

    } catch (err) {
      console.error('Error rendering Sankey diagram:', err);
      // Error handling remains the same...
      const errorTextColor = '#ffffff';
      svg.append('text')
        .attr('x', width / 2).attr('y', height / 2)
        .attr('text-anchor', 'middle')
        .attr('fill', errorTextColor)
        .text('Error rendering diagram. Please try again.');
    }
  }, [data, getChainColor, selectedChain, navigate, handleNodeClick]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (data) {
        // Redraw the diagram on resize
        const timer = setTimeout(() => {
          if (svgRef.current && containerRef.current) {
            d3.select(svgRef.current).selectAll('*').remove();
            // This will trigger the useEffect that draws the diagram
            setData({...data});
          }
        }, 100);
        return () => clearTimeout(timer);
      }
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [data]);

  // Format large numbers with appropriate suffixes
  const formatNumber = (num: number): string => {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    } else {
      return num.toString();
    }
  };

  // Calculate time since last update
  const getTimeSinceUpdate = (): string => {
    if (!data?.metadata.updatedAt) return 'Unknown';
    
    const updateTime = new Date(data.metadata.updatedAt);
    const now = new Date();
    const diffMs = now.getTime() - updateTime.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min${diffMins === 1 ? '' : 's'} ago`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
    
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-dark-800 rounded-lg shadow-md p-6 h-full">
        <div className="h-[400px] flex flex-col items-center justify-center">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-gray-600 dark:text-gray-300">Loading message flow data...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-white dark:bg-dark-800 rounded-lg shadow-md p-6 h-full">
        <div className="h-[400px] flex flex-col items-center justify-center">
          <AlertTriangle className="h-12 w-12 text-yellow-500 mb-4" />
          <p className="text-gray-600 dark:text-gray-300 text-center mb-4">
            No Teleporter message data available
          </p>
          <button 
            onClick={fetchData}
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
            Avalanche Interchain Messages (ICM)
          </h3>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Toggle switch for daily/weekly data */}
          <div className="bg-gray-100 dark:bg-dark-700 rounded-full p-1 flex items-center">
            <button
              onClick={() => setTimeframe('daily')}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                timeframe === 'daily'
                  ? 'bg-[#ef4444] text-white'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-dark-600'
              }`}
            >
              Daily
            </button>
            <button
              onClick={() => setTimeframe('weekly')}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                timeframe === 'weekly'
                  ? 'bg-[#ef4444] text-white'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-dark-600'
              }`}
            >
              Weekly
            </button>
          </div>
          
          <button 
            onClick={fetchData}
            className="p-1.5 rounded-full bg-gray-100 dark:bg-dark-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-dark-600 transition-colors"
            title="Refresh data"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      {error && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-3 mb-4 flex items-start gap-2">
          <AlertTriangle className="w-5 h-5 text-yellow-500 dark:text-yellow-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm text-yellow-700 dark:text-yellow-300">
              {error}
            </p>
          </div>
        </div>
      )}
      
      <div 
        ref={containerRef} 
        className="relative bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 rounded-lg border border-gray-700 dark:border-gray-800 h-[400px] overflow-hidden"
      >
        {/* Dark space background with subtle, slow twinkling stars - matching network topology */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {Array.from({ length: 60 }).map((_, i) => (
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
        
        {/* SVG for the Sankey diagram */}
        <svg 
          ref={svgRef} 
          className="w-full h-full" 
        ></svg>
        
        {/* Tooltip for links */}
        {hoveredLink && (
          <div 
            className={`absolute z-10 p-4 rounded-lg shadow-lg border pointer-events-none ${
              hoveredLink.value < 100 ? 'bg-yellow-100 dark:bg-yellow-900 border-yellow-300 text-base font-bold' : 'bg-white dark:bg-dark-800 text-sm'
            }`}
          >
            <div className="font-medium text-gray-900 dark:text-white mb-1">
              {hoveredLink.source.displayName} → {hoveredLink.target.displayName}
            </div>
            <div className="text-gray-600 dark:text-gray-300">
              Messages: <span className="font-semibold">{hoveredLink.value.toLocaleString()}</span>
            </div>
            <div className="text-gray-600 dark:text-gray-300">
              {((hoveredLink.value / data.metadata.totalMessages) * 100).toFixed(1)}% of total
            </div>
          </div>
        )}
        
        {/* Tooltip for nodes */}
      </div>
      
      {/* Stats card at the bottom */}
      <div className="mt-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        {/* Message stats card */}
        <div className="flex items-center bg-gradient-to-r from-[#ef4444] to-[#dc2626] rounded-lg overflow-hidden shadow-lg">
          <div className="px-3 py-2 flex items-center gap-2">
            <div className="bg-white/20 rounded-full p-1.5">
              <MessageSquare className="w-4 h-4 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-white/90 font-medium">Total Messages</span>
              <span className="text-lg font-bold text-white">{formatNumber(data.metadata.totalMessages)}</span>
            </div>
          </div>
          <div className="h-full w-px bg-white/20"></div>
          <div className="px-3 py-2 flex items-center gap-2">
            <div className="bg-white/20 rounded-full p-1.5">
              <Activity className="w-4 h-4 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-white/90 font-medium">Timeframe</span>
              <span className="text-sm font-bold text-white">{timeframe === 'daily' ? 'Daily' : 'Weekly'}</span>
            </div>
          </div>
        </div>
        
        {/* Last updated badge - simplified version without time and refresh button */}
        <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-dark-700/50 rounded-full shadow-sm border border-gray-100 dark:border-dark-700/50">
          <Clock className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Last updated:</span>
              <span className="text-xs font-bold text-gray-900 dark:text-white">
                {format(new Date(data.metadata.updatedAt), 'MMM d, yyyy')}
              </span>
            </div>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {getTimeSinceUpdate()}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}