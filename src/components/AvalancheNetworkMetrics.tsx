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
import { RefreshCw, MessageSquare, Clock, ChevronDown, BarChart3, Users, Activity, Fuel } from 'lucide-react';
import { getNetworkActiveAddressesHistory, getNetworkTxCountHistory, getNetworkMaxTPSHistory, getDailyMessageVolumeFromExternal, getNetworkGasUsedHistory, getTPSHistory } from '../api';
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

type MetricType = 'networkTPS' | 'dailyMessageVolume' | 'dailyActiveAddresses' | 'dailyTxCount' | 'maxTPS' | 'gasUsed';

const METRICS = [
  { 
    id: 'networkTPS' as const, 
    name: 'Network TPS',
    description: 'Average transactions per second across the entire network',
    icon: Activity,
    color: {
      light: 'rgb(239, 68, 68)',
      dark: 'rgb(239, 68, 68)',
      fill: {
        light: 'rgba(239, 68, 68, 0.1)',
        dark: 'rgba(239, 68, 68, 0.2)'
      }
    },
    valueFormatter: (value: number) => value.toFixed(2),
    unit: 'TPS'
  },
  { 
    id: 'dailyActiveAddresses' as const, 
    name: 'Daily Active Addresses',
    description: 'Total unique active addresses across all chains daily',
    icon: Users,
    color: {
      light: 'rgb(239, 68, 68)',
      dark: 'rgb(239, 68, 68)',
      fill: {
        light: 'rgba(239, 68, 68, 0.1)',
        dark: 'rgba(239, 68, 68, 0.2)'
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
    id: 'dailyTxCount' as const,
    name: 'Daily Transaction Count',
    description: 'Total transactions processed across the entire network daily',
    icon: BarChart3,
    color: {
      light: 'rgb(239, 68, 68)',
      dark: 'rgb(239, 68, 68)',
      fill: {
        light: 'rgba(239, 68, 68, 0.1)',
        dark: 'rgba(239, 68, 68, 0.2)'
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
  },
  {
    id: 'maxTPS' as const,
    name: 'Max TPS',
    description: 'Maximum transactions per second recorded daily',
    icon: Activity,
    color: {
      light: 'rgb(239, 68, 68)',
      dark: 'rgb(239, 68, 68)',
      fill: {
        light: 'rgba(239, 68, 68, 0.1)',
        dark: 'rgba(239, 68, 68, 0.2)'
      }
    },
    valueFormatter: (value: number) => value.toFixed(2),
    unit: 'TPS'
  },
  {
    id: 'gasUsed' as const,
    name: 'Daily Gas Used',
    description: 'Total gas consumed by transactions across the network',
    icon: Fuel,
    color: {
      light: 'rgb(239, 68, 68)',
      dark: 'rgb(239, 68, 68)',
      fill: {
        light: 'rgba(239, 68, 68, 0.1)',
        dark: 'rgba(239, 68, 68, 0.2)'
      }
    },
    valueFormatter: (value: number) => {
      if (value >= 1_000_000_000_000) {
        return `${(value / 1_000_000_000_000).toFixed(2)}T`;
      }
      if (value >= 1_000_000_000) {
        return `${(value / 1_000_000_000).toFixed(2)}B`;
      }
      if (value >= 1_000_000) {
        return `${(value / 1_000_000).toFixed(2)}M`;
      }
      return value.toLocaleString();
    },
    unit: 'gas'
  },
  { 
    id: 'dailyMessageVolume' as const, 
    name: 'Daily Message Volume',
    description: 'Total messages sent across the network daily',
    icon: MessageSquare,
    color: {
      light: 'rgb(239, 68, 68)',
      dark: 'rgb(239, 68, 68)',
      fill: {
        light: 'rgba(239, 68, 68, 0.1)',
        dark: 'rgba(239, 68, 68, 0.2)'
      }
    },
    valueFormatter: (value: number) => value.toLocaleString(),
    unit: 'messages'
  },
  /*
  { 
    id: 'dailyActiveAddresses' as const, 
    name: 'Daily Active Addresses',
    description: 'Total messages sent across the network daily',
    icon: MessageSquare,
    color: {
      light: 'rgb(239, 68, 68)',
      dark: 'rgb(239, 68, 68)',
      fill: {
        light: 'rgba(239, 68, 68, 0.1)',
        dark: 'rgba(239, 68, 68, 0.2)'
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
      light: 'rgb(239, 68, 68)',
      dark: 'rgb(239, 68, 68)',
      fill: {
        light: 'rgba(239, 68, 68, 0.1)',
        dark: 'rgba(239, 68, 68, 0.2)'
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
      light: 'rgb(239, 68, 68)',
      dark: 'rgb(239, 68, 68)',
      fill: {
        light: 'rgba(239, 68, 68, 0.1)',
        dark: 'rgba(239, 68, 68, 0.2)'
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
  */
];

export function AvalancheNetworkMetrics() {
  const { theme } = useTheme();
  const [data, setData] = useState<MetricData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [timeframe, setTimeframe] = useState<TimeframeOption>(7);
  const [selectedMetric, setSelectedMetric] = useState<MetricType>('networkTPS');
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
        case 'networkTPS':
          const tpsData = await getTPSHistory(daysToFetch);

          processedData = tpsData
            .filter(item => item && typeof item.timestamp === 'number' && typeof item.totalTps === 'number')
            .map(item => ({
              timestamp: item.timestamp,
              date: new Date(item.timestamp * 1000).toISOString(),
              value: item.totalTps,
              metadata: {
                chainCount: item.chainCount
              }
            }))
            .sort((a, b) => a.timestamp - b.timestamp);
          break;

        case 'dailyActiveAddresses':
          const activeAddressesData = await getNetworkActiveAddressesHistory(daysToFetch);
          
          processedData = activeAddressesData
            .filter(item => item && typeof item.timestamp === 'number' && typeof item.activeAddresses === 'number')
            .map(item => ({
              timestamp: item.timestamp,
              date: new Date(item.timestamp * 1000).toISOString(),
              value: item.activeAddresses,
              metadata: {
                // Network active addresses endpoint might not return chainCount yet
              }
            }))
            .sort((a, b) => a.timestamp - b.timestamp);
          break;

        case 'dailyTxCount':
          const txCountData = await getNetworkTxCountHistory(daysToFetch);
          
          processedData = txCountData
            .filter(item => item && typeof item.timestamp === 'number' && typeof item.value === 'number')
            .map(item => ({
              timestamp: item.timestamp,
              date: new Date(item.timestamp * 1000).toISOString(),
              value: item.value,
              metadata: {
                // Network tx count endpoint might not return chainCount yet
              }
            }))
            .sort((a, b) => a.timestamp - b.timestamp);
          break;

        case 'maxTPS':
          const maxTPSData = await getNetworkMaxTPSHistory(daysToFetch);
          
          processedData = maxTPSData
            .filter(item => item && typeof item.timestamp === 'number' && typeof item.value === 'number')
            .map(item => ({
              timestamp: item.timestamp,
              date: new Date(item.timestamp * 1000).toISOString(),
              value: item.value,
              metadata: {}
            }))
            .sort((a, b) => a.timestamp - b.timestamp);
          break;

        case 'gasUsed':
          const gasUsedData = await getNetworkGasUsedHistory(daysToFetch);
          
          processedData = gasUsedData
            .filter(item => item && typeof item.timestamp === 'number' && typeof item.value === 'number')
            .map(item => ({
              timestamp: item.timestamp,
              date: new Date(item.timestamp * 1000).toISOString(),
              value: item.value,
              metadata: {}
            }))
            .sort((a, b) => a.timestamp - b.timestamp);
          break;

        case 'dailyMessageVolume':
          // The external API doesn't support filtering by days effectively in all cases, 
          // so we fetch and slice the data manually to ensure the chart reflects the selected timeframe.
          // We request enough data (365 days) if the user asks for 1Y, otherwise we can request less but slicing is safer.
          // Actually the external API seems to respect 'days' now, but let's be robust.
          const requestedDays = daysToFetch === 360 ? 365 : daysToFetch;
          const messageVolumeData = await getDailyMessageVolumeFromExternal(requestedDays);
          
          // Ensure we sort by timestamp ascending
          const sortedData = messageVolumeData.sort((a, b) => a.timestamp - b.timestamp);
          
          // Slice the data to match the requested timeframe if the API returns more
          const slicedData = sortedData.slice(-daysToFetch);

          processedData = slicedData
            .map(item => ({
              timestamp: item.timestamp,
              date: new Date(item.timestamp * 1000).toISOString(),
              value: item.value,
              metadata: {}
            }));
          break;
      }

      if (processedData.length > 0) {
        setData(processedData);
      } else {
        // Backend has no data yet - show friendly message instead of error
        setError(`${currentMetric.name} data is not available yet. The backend is still collecting historical data.`);
      }
    } catch (err: any) {
      console.error(`Failed to fetch ${metricToFetch} data:`, err);
      // Handle 404 specifically
      if (err.message && err.message.includes('404')) {
        setError(`${currentMetric.name} data is coming soon`);
      } else if (err.message && err.message.includes('No data available')) {
        setError(`${currentMetric.name} data is not available yet. The backend is still collecting historical data.`);
      } else {
        setError(`Failed to load ${currentMetric.name.toLowerCase()} data`);
      }
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
  };

  const handleMetricChange = (metric: MetricType) => {
    setSelectedMetric(metric);
    setIsDropdownOpen(false);
  };

  if (loading && data.length === 0) {
    return (
      <div className="bg-white dark:bg-dark-800 rounded-lg shadow-md p-4 sm:p-6">
        <div className="h-[300px] sm:h-[400px] flex flex-col items-center justify-center">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-gray-600 dark:text-gray-300">Loading network metrics...</p>
        </div>
      </div>
    );
  }

  const chartData = !data.length ? null : {
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
            
            // Add additional info for Network TPS
            if (selectedMetric === 'networkTPS' && dataPoint.metadata?.chainCount) {
              lines.push(`Active Chains: ${dataPoint.metadata.chainCount}`);
            }
            
            // Add additional info for Daily Active Addresses
            if (selectedMetric === 'dailyActiveAddresses' && dataPoint.metadata?.chainCount) {
              lines.push(`Across ${dataPoint.metadata.chainCount} chains`);
            }
            
            // Add additional info for Daily Transaction Count
            if (selectedMetric === 'dailyTxCount' && dataPoint.metadata?.chainCount) {
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
                onClick={() => handleTimeframeChange(90)}
                className={`flex-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  timeframe === 90
                    ? 'bg-[#ef4444] text-white'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-dark-600'
                }`}
              >
                90D
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
        {data.length > 0 && (
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
        )}
      </div>

      <div className="h-[300px] sm:h-[400px]">
        {chartData ? (
          <Line data={chartData} options={options} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full">
            <p className="text-gray-600 dark:text-gray-300 text-center mb-4">
              {error || 'No data available for this metric'}
            </p>
            {!error?.includes('coming soon') && !error?.includes('not available yet') && (
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
            )}
          </div>
        )}
      </div>
    </div>
  );
}