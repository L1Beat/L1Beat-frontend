import React, { useEffect, useState } from 'react';
import { Line } from 'react-chartjs-2';
import { format, parseISO } from 'date-fns';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { TimeframeOption } from '../types';
import { useTheme } from '../hooks/useTheme';
import { useMediaQuery, breakpoints } from '../hooks/useMediaQuery';
import { RefreshCw, MessageSquare, Clock, ChevronDown, BarChart3, Users } from 'lucide-react';
import { getChains } from '../api';
import { getCumulativeTxCount } from '../api';
import { LoadingSpinner } from './LoadingSpinner';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface MetricData {
  timestamp: number;
  date: string;
  value: number;
  metadata?: {
    chainCount?: number;
    chains?: Array<{
      chainId: string;
      chainName: string;
      value: number;
    }>;
  };
}

type MetricType = 'dailyMessageVolume' | 'dailyActiveAddresses' | 'cumulativeTransactions';

const METRICS = [
  { 
    id: 'dailyMessageVolume' as const, 
    name: 'Daily Message Volume',
    description: 'Total messages sent across the network daily',
    icon: MessageSquare,
    color: {
      light: 'rgb(99, 102, 241)',
      dark: 'rgb(129, 140, 248)',
      fill: {
        light: 'rgba(99, 102, 241, 0.1)',
        dark: 'rgba(129, 140, 248, 0.2)'
      }
    },
    valueFormatter: (value: number) => value.toLocaleString(),
    unit: 'messages'
  },
  { 
    id: 'dailyActiveAddresses' as const, 
    name: 'Daily Active Addresses',
    description: 'Total unique active addresses across all chains daily',
    icon: Users,
    color: {
      light: 'rgb(34, 197, 94)',
      dark: 'rgb(74, 222, 128)',
      fill: {
        light: 'rgba(34, 197, 94, 0.1)',
        dark: 'rgba(74, 222, 128, 0.2)'
      }
    },
    valueFormatter: (value: number) => {
      if (value >= 1_000_000) {
        return `${(value / 1_000_000).toFixed(2)}M`;
      }
      if (value >= 1_000) {
        return `${(value / 1_000).toFixed(1)}K`;
      }
      return value.toLocaleString();
    },
    unit: 'addresses'
  },
  { 
    id: 'cumulativeTransactions' as const, 
    name: 'Cumulative Transactions',
    description: 'Total transactions processed across all chains',
    icon: BarChart3,
    color: {
      light: 'rgb(168, 85, 247)',
      dark: 'rgb(196, 181, 253)',
      fill: {
        light: 'rgba(168, 85, 247, 0.1)',
        dark: 'rgba(196, 181, 253, 0.2)'
      }
    },
    valueFormatter: (value: number) => {
      if (value >= 1_000_000_000) {
        return `${(value / 1_000_000_000).toFixed(2)}B`;
      }
      if (value >= 1_000_000) {
        return `${(value / 1_000_000).toFixed(2)}M`;
      }
      if (value >= 1_000) {
        return `${(value / 1_000).toFixed(1)}K`;
      }
      return value.toLocaleString();
    },
    unit: 'transactions'
  }
];

export function AvalancheNetworkMetrics() {
  const { theme } = useTheme();
  const [data, setData] = useState<MetricData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [timeframe, setTimeframe] = useState<TimeframeOption>(7);
  const [selectedMetric, setSelectedMetric] = useState<MetricType>('dailyMessageVolume');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const isDark = theme === 'dark';
  const isMobile = useMediaQuery(breakpoints.sm);

  const currentMetric = METRICS.find(m => m.id === selectedMetric) || METRICS[0];

  const fetchData = async (selectedTimeframe?: TimeframeOption, metric?: MetricType, skipLoading?: boolean) => {
    const daysToFetch = selectedTimeframe || timeframe;
    const metricToFetch = metric || selectedMetric;
    
    try {
      if (!skipLoading) {
        setLoading(true);
      }
      setError(null);
      setRetrying(true);

      let processedData: MetricData[] = [];
      
      // Route to different endpoints based on selected metric
      switch (metricToFetch) {
        case 'dailyMessageVolume':
          const messageResponse = await fetch(`https://idx6.solokhin.com/api/global/metrics/dailyMessageVolume?days=${daysToFetch}`);
          if (!messageResponse.ok) {
            throw new Error(`HTTP error! status: ${messageResponse.status}`);
          }
          
          const messageData = await messageResponse.json();
          if (!Array.isArray(messageData)) {
            throw new Error('Expected array response from message volume API');
          }
          
          processedData = messageData
            .filter(item => item && typeof item.date === 'string' && typeof item.timestamp === 'number')
            .map(item => ({
              timestamp: item.timestamp,
              date: item.date,
              value: item.messageCount || 0
            }))
            .sort((a, b) => a.timestamp - b.timestamp);
          break;
          
        case 'dailyActiveAddresses':
          // First, get all chains to know which EVM chain IDs to query
          const chains = await getChains();
          
          // Filter chains that have EVM chain IDs (numeric chain IDs)
          const evmChains = chains.filter(chain => {
            const numericChainId = parseInt(chain.chainId);
            return !isNaN(numericChainId) && numericChainId > 0;
          });
          
          console.log(`Found ${evmChains.length} EVM chains to query for active addresses`);
          
          // Fetch active addresses data for each EVM chain
          const addressPromises = evmChains.map(async (chain) => {
            try {
              const response = await fetch(`https://idx6.solokhin.com/api/${chain.chainId}/stats/daily-active-addresses?days=${daysToFetch}`);
              if (!response.ok) {
                console.warn(`Failed to fetch active addresses for chain ${chain.chainId}: ${response.status}`);
                return { chainId: chain.chainId, chainName: chain.chainName, data: [] };
              }
              
              const data = await response.json();
              if (!Array.isArray(data)) {
                console.warn(`Invalid data format for chain ${chain.chainId}`);
                return { chainId: chain.chainId, chainName: chain.chainName, data: [] };
              }
              
              return { 
                chainId: chain.chainId, 
                chainName: chain.chainName, 
                data: data.filter(item => item && typeof item.timestamp === 'number' && typeof item.activeAddresses === 'number')
              };
            } catch (error) {
              console.warn(`Error fetching active addresses for chain ${chain.chainId}:`, error);
              return { chainId: chain.chainId, chainName: chain.chainName, data: [] };
            }
          });
          
          const chainResults = await Promise.all(addressPromises);
          
          // Aggregate data by date
          const dateMap = new Map<string, { timestamp: number; totalAddresses: number; chains: Array<{chainId: string; chainName: string; value: number}> }>();
          
          chainResults.forEach(({ chainId, chainName, data }) => {
            data.forEach(item => {
              const dateKey = new Date(item.timestamp * 1000).toISOString().split('T')[0];
              
              if (!dateMap.has(dateKey)) {
                dateMap.set(dateKey, {
                  timestamp: item.timestamp,
                  totalAddresses: 0,
                  chains: []
                });
              }
              
              const existing = dateMap.get(dateKey)!;
              existing.totalAddresses += item.activeAddresses;
              existing.chains.push({
                chainId,
                chainName,
                value: item.activeAddresses
              });
            });
          });
          
          // Convert to array and sort
          processedData = Array.from(dateMap.entries())
            .map(([date, data]) => ({
              timestamp: data.timestamp,
              date,
              value: data.totalAddresses,
              metadata: {
                chainCount: data.chains.length,
                chains: data.chains
              }
            }))
            .sort((a, b) => a.timestamp - b.timestamp);
          
          console.log(`Aggregated active addresses data: ${processedData.length} days, ${evmChains.length} chains`);
          break;
          
        case 'cumulativeTransactions':
          // Get all chains to know which chain IDs to query
          const chainsForTx = await getChains();
          
          // Include ALL chains, not just numeric ones - some might have string IDs
          const validChainsForTx = chainsForTx.filter(chain => {
            // Include all chains that have a chainId
            return chain.chainId && chain.chainId.trim() !== '';
          });
          
          console.log(`Found ${validChainsForTx.length} chains to query for cumulative transactions`);
          console.log('All chains to query:', validChainsForTx.map(c => `${c.chainName} (${c.chainId})`));
          
          // Generate timestamps for each day in the timeframe
          const timestamps: number[] = [];
          const now = Math.floor(Date.now() / 1000);
          const oneDayInSeconds = 24 * 60 * 60;
          
          for (let i = daysToFetch - 1; i >= 0; i--) {
            timestamps.push(now - (i * oneDayInSeconds));
          }
          
          // Fetch current cumulative transaction count for each chain at each timestamp
          const txPromises = validChainsForTx.map(async (chain) => {
            try {
              // Fetch the current cumulative count for this chain
              console.log(`Fetching cumulative transactions for chain ${chain.chainId} (${chain.chainName})`);
              const url = `https://idx6.solokhin.com/api/${chain.chainId}/stats/cumulative-txs?timestamp=${now}`;
              console.log(`Request URL: ${url}`);
              
              const response = await fetch(url);
              console.log(`Response status for ${chain.chainId}:`, response.status);
              
              if (!response.ok) {
                console.warn(`Failed to fetch cumulative transactions for chain ${chain.chainName} (${chain.chainId}): ${response.status}`);
                return { chainId: chain.chainId, chainName: chain.chainName, currentCount: 0 };
              }
              
              const data = await response.json();
              console.log(`Raw response data for ${chain.chainId}:`, data);
              
              // Extract the cumulativeTxs field specifically
              const currentCount = data.cumulativeTxs || 0;
              
              console.log(`Extracted count for ${chain.chainName} (${chain.chainId}): ${currentCount.toLocaleString()}`);
              
              if (currentCount === 0) {
                console.warn(`Zero transactions found for ${chain.chainName} (${chain.chainId}) - this might indicate an API issue`);
              }
              
              return { 
                chainId: chain.chainId, 
                chainName: chain.chainName, 
                currentCount: currentCount
              };
            } catch (error) {
              console.error(`Error fetching cumulative transactions for chain ${chain.chainName} (${chain.chainId}):`, error);
              return { chainId: chain.chainId, chainName: chain.chainName, currentCount: 0 };
            }
          });
          
          const txResults = await Promise.all(txPromises);
          console.log('All transaction results:');
          txResults.forEach(result => {
            console.log(`  ${result.chainName} (${result.chainId}): ${result.currentCount.toLocaleString()}`);
          });
          
          // Calculate total current cumulative transactions
          const totalCurrentTransactions = txResults.reduce((sum, result) => sum + result.currentCount, 0);
          
          console.log(`Total cumulative transactions across all chains: ${totalCurrentTransactions.toLocaleString()}`);
          console.log('Top contributing chains:', 
            txResults
              .filter(r => r.currentCount > 0)
              .sort((a, b) => b.currentCount - a.currentCount)
              .slice(0, 10)
              .map(r => `${r.chainName}: ${r.currentCount.toLocaleString()}`)
          );
          
          if (totalCurrentTransactions === 0) {
            console.error('No transaction data found for any chain. Details:');
            console.error('- Total chains queried:', validChainsForTx.length);
            console.error('- Chains with data:', txResults.filter(r => r.currentCount > 0).length);
            console.error('- Failed chains:', txResults.filter(r => r.currentCount === 0).map(r => r.chainName));
            throw new Error(`No transaction data available from any of the ${validChainsForTx.length} chains queried`);
          }
          
          // For cumulative transactions, we'll show the current total for each day
          // (since cumulative means it only goes up, the current value represents the total)
          processedData = timestamps.map(timestamp => ({
            timestamp,
            date: new Date(timestamp * 1000).toISOString().split('T')[0],
            value: totalCurrentTransactions,
            metadata: {
              chainCount: txResults.filter(r => r.currentCount > 0).length,
              chains: txResults
                .filter(r => r.currentCount > 0)
                .map(r => ({
                  chainId: r.chainId,
                  chainName: r.chainName,
                  value: r.currentCount
                }))
            }
          }));
          
          console.log(`Generated cumulative transactions data: ${processedData.length} days, total: ${totalCurrentTransactions.toLocaleString()}`);
          break;
          
        default:
          throw new Error(`Unknown metric: ${metricToFetch}`);
      }
      
      if (processedData.length > 0) {
        setData(processedData);
      } else {
        throw new Error('No data available for selected metric');
      }
    } catch (err) {
      console.error(`Failed to fetch ${metricToFetch} data:`, err);
      setError(`Failed to load ${currentMetric.name.toLowerCase()} data`);
    } finally {
      if (!skipLoading) {
        setLoading(false);
      }
      setRetrying(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    const loadData = async () => {
      if (!mounted) return;
      await fetchData();
    };

    loadData();
    const interval = setInterval(loadData, 15 * 60 * 1000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [timeframe, selectedMetric]);

  const handleTimeframeChange = (newTimeframe: TimeframeOption) => {
    setTimeframe(newTimeframe);
    // Don't show loading spinner for timeframe changes to maintain smooth transitions
    fetchData(newTimeframe, selectedMetric, true);
  };

  const handleMetricChange = (metric: MetricType) => {
    setSelectedMetric(metric);
    setIsDropdownOpen(false);
    // Show loading for metric changes since it's a different data type
    fetchData(timeframe, metric, false);
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-dark-800 rounded-lg shadow-md p-4 sm:p-6">
        <div className="h-[300px] sm:h-[400px] flex flex-col items-center justify-center">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-gray-600 dark:text-gray-300">Loading network metrics...</p>
        </div>
      </div>
    );
  }

  if (!data.length) {
    return (
      <div className="bg-card rounded-xl border border-border p-6">
        <div className="flex items-center gap-2 mb-6">
          <BarChart3 className="w-5 h-5 text-[#ef4444]" />
          <h2 className="text-2xl font-semibold">Avalanche Network Metrics</h2>
        </div>
        <div className="h-[300px] sm:h-[400px] flex flex-col items-center justify-center">
          <p className="text-gray-600 dark:text-gray-300 text-center mb-4">
            {error || 'No network metrics data available'}
          </p>
          <button 
            onClick={() => fetchData()}
            disabled={retrying}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-[#ef4444] hover:bg-[#dc2626] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#ef4444] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {retrying ? (
              <>
                <RefreshCw className="animate-spin -ml-1 mr-2 h-4 w-4" />
                Retrying...
              </>
            ) : (
              <>
                <RefreshCw className="-ml-1 mr-2 h-4 w-4" />
                Retry
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  const chartData = {
    labels: data.map(item => {
      const [year, month, day] = item.date.split('-');
      return format(new Date(parseInt(year), parseInt(month) - 1, parseInt(day)), isMobile ? 'd MMM' : 'MMM d');
    }),
    datasets: [
      {
        label: currentMetric.name,
        data: data.map(item => item.value),
        fill: true,
        borderColor: isDark ? currentMetric.color.dark : currentMetric.color.light,
        backgroundColor: isDark ? currentMetric.color.fill.dark : currentMetric.color.fill.light,
        borderWidth: isDark ? 2 : 1.5,
        tension: 0.4,
        pointRadius: isMobile ? 2 : 4,
        pointHoverRadius: isMobile ? 4 : 6,
        pointBackgroundColor: isDark ? '#1e293b' : '#ffffff',
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 750,
      easing: 'easeInOutQuart' as const,
    },
    transitions: {
      active: {
        animation: {
          duration: 400,
        },
      },
    },
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        backgroundColor: isDark ? 'rgba(30, 41, 59, 0.95)' : 'rgba(255, 255, 255, 0.95)',
        titleColor: isDark ? '#e2e8f0' : '#1e293b',
        bodyColor: isDark ? '#e2e8f0' : '#1e293b',
        borderColor: isDark ? 'rgba(148, 163, 184, 0.2)' : 'rgba(0, 0, 0, 0.1)',
        borderWidth: 1,
        padding: isMobile ? 8 : 12,
        boxPadding: 4,
        titleFont: {
          size: isMobile ? 12 : 14,
        },
        bodyFont: {
          size: isMobile ? 11 : 13,
        },
        callbacks: {
          label: (context: any) => {
            const dataPoint = data[context.dataIndex];
            const lines = [`${currentMetric.name}: ${currentMetric.valueFormatter(context.parsed.y)} ${currentMetric.unit}`];
            
            // Add additional info for Daily Active Addresses
            if (selectedMetric === 'dailyActiveAddresses' && dataPoint.metadata?.chainCount) {
              lines.push(`Across ${dataPoint.metadata.chainCount} chains`);
            }
            
            // Add additional info for Cumulative Transactions
            if (selectedMetric === 'cumulativeTransactions' && dataPoint.metadata?.chainCount) {
              lines.push(`Across ${dataPoint.metadata.chainCount} chains`);
            }
            
            return lines;
          },
        },
      },
    },
    scales: {
      x: {
        grid: {
          display: false,
        },
        ticks: {
          color: isDark ? '#94a3b8' : '#64748b',
          font: {
            size: isMobile ? 10 : 11,
          },
          maxRotation: isMobile ? 45 : 0,
          autoSkip: true,
          autoSkipPadding: isMobile ? 20 : 30,
          maxTicksLimit: isMobile ? 7 : undefined,
        },
      },
      y: {
        beginAtZero: true,
        grid: {
          color: isDark ? 'rgba(148, 163, 184, 0.1)' : 'rgba(0, 0, 0, 0.05)',
          drawBorder: false,
        },
        ticks: {
          color: isDark ? '#94a3b8' : '#64748b',
          font: {
            size: isMobile ? 10 : 11,
          },
          callback: (value: any) => {
            if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
            if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
            return value;
          },
          maxTicksLimit: isMobile ? 5 : 8,
        },
      },
    },
  };

  const latestData = data[data.length - 1];

  return (
    <div className="bg-card rounded-xl border border-border p-6">
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="w-5 h-5 text-[#ef4444]" />
              <h2 className="text-2xl font-semibold">Avalanche Network Metrics</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              {currentMetric.description}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            {/* Metric Selector */}
            <div className="relative">
              <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-muted hover:bg-accent rounded-lg text-sm font-medium transition-colors min-w-[180px] justify-between"
              >
                <div className="flex items-center gap-2">
                  <currentMetric.icon className="w-4 h-4" />
                  {currentMetric.name}
                </div>
                <ChevronDown className={`w-4 h-4 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
              </button>
              
              {isDropdownOpen && (
                <div className="absolute right-0 mt-1 w-64 bg-card rounded-lg shadow-lg border border-border py-1 z-10">
                  {METRICS.map(metric => {
                    const Icon = metric.icon;
                    return (
                      <button
                        key={metric.id}
                        onClick={() => handleMetricChange(metric.id)}
                        className={`w-full text-left px-4 py-3 text-sm hover:bg-accent transition-colors ${
                          selectedMetric === metric.id
                            ? 'bg-[#ef4444]/10 text-[#ef4444]'
                            : ''
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Icon className="w-4 h-4" />
                          <div>
                            <div className="font-medium">{metric.name}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">{metric.description}</div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Timeframe Selector */}
            <div className="bg-gray-100 dark:bg-dark-700 rounded-full p-1 flex">
              <button
                onClick={() => handleTimeframeChange(7)}
                className={`flex-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  timeframe === 7
                    ? 'bg-[#ef4444] text-white'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-dark-600'
                }`}
              >
                7D
              </button>
              <button
                onClick={() => handleTimeframeChange(14)}
                className={`flex-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  timeframe === 14
                    ? 'bg-[#ef4444] text-white'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-dark-600'
                }`}
              >
                14D
              </button>
              <button
                onClick={() => handleTimeframeChange(30)}
                className={`flex-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  timeframe === 30
                    ? 'bg-[#ef4444] text-white'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-dark-600'
                }`}
              >
                30D
              </button>
              <button
                onClick={() => handleTimeframeChange(360)}
                className={`flex-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  timeframe === 360
                    ? 'bg-[#ef4444] text-white'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-dark-600'
                }`}
              >
                1Y
              </button>
            </div>
          </div>
        </div>

        {/* Current Value Display */}
        <div className="bg-gradient-to-r from-[#ef4444]/10 to-[#dc2626]/10 dark:from-[#ef4444]/20 dark:to-[#dc2626]/20 rounded-lg p-4 border border-[#ef4444]/20 dark:border-[#ef4444]/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#ef4444] rounded-lg flex items-center justify-center">
                <currentMetric.icon className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-medium text-[#ef4444] dark:text-[#ef4444]">
                  Current {currentMetric.name}
                </p>
                <p className="text-2xl font-bold text-[#ef4444] dark:text-[#ef4444]">
                  {latestData ? currentMetric.valueFormatter(latestData.value) : '0'} {currentMetric.unit}
                </p>
              </div>
            </div>
            {latestData && (
              <div className="text-right">
                <div className="flex items-center gap-1 text-[#ef4444] dark:text-[#ef4444] text-sm">
                  <Clock className="w-4 h-4" />
                  <span>
                    {format(parseISO(latestData.date), 'MMM d, yyyy')}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="h-[300px] sm:h-[400px]">
        <Line data={chartData} options={options} />
      </div>
    </div>
  );
}