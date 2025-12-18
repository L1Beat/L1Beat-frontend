import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJSInstance } from 'chart.js';
import { format, parseISO } from 'date-fns';
import { TimeframeOption } from '../types';
import { useTheme } from '../hooks/useTheme';
import { useMediaQuery, breakpoints } from '../hooks/useMediaQuery';
import { RefreshCw, Clock, BarChart3, Users, Activity, Fuel, Download, MessageSquare, Plus, X } from 'lucide-react';
import { getNetworkActiveAddressesHistory, getNetworkTxCountHistory, getNetworkMaxTPSHistory, getDailyMessageVolumeFromExternal, getNetworkGasUsedHistory, getTPSHistory } from '../api';
import { LoadingSpinner } from './LoadingSpinner';
import { TimeRangeSlider } from './TimeRangeSlider';
import { 
  crosshairPlugin, 
  watermarkPlugin,
  lineShadowPlugin,
  prefersReducedMotion
} from '../utils/chartConfig';

// Custom plugins are passed directly to the Line chart via the plugins prop
// NOT registered globally to avoid affecting other chart types (Pie, etc.)

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

// Distinct colors for each metric (for multi-metric comparison)
const METRIC_COLORS = {
  networkTPS: { main: 'rgb(239, 68, 68)', fill: 'rgba(239, 68, 68, 0.15)' },           // Red
  dailyActiveAddresses: { main: 'rgb(59, 130, 246)', fill: 'rgba(59, 130, 246, 0.15)' }, // Blue  
  dailyTxCount: { main: 'rgb(168, 85, 247)', fill: 'rgba(168, 85, 247, 0.15)' },        // Purple
  maxTPS: { main: 'rgb(34, 197, 94)', fill: 'rgba(34, 197, 94, 0.15)' },                // Green
  gasUsed: { main: 'rgb(249, 115, 22)', fill: 'rgba(249, 115, 22, 0.15)' },             // Orange
  dailyMessageVolume: { main: 'rgb(236, 72, 153)', fill: 'rgba(236, 72, 153, 0.15)' },  // Pink
};

const METRICS = [
  { 
    id: 'networkTPS' as const, 
    name: 'TPS',
    fullName: 'Network TPS',
    description: 'Average transactions per second across the entire network',
    icon: Activity,
    color: METRIC_COLORS.networkTPS,
    valueFormatter: (value: number) => value.toFixed(2),
    unit: 'TPS'
  },
  { 
    id: 'dailyActiveAddresses' as const, 
    name: 'Active Addresses',
    fullName: 'Daily Active Addresses',
    description: 'Total unique active addresses across all chains daily',
    icon: Users,
    color: METRIC_COLORS.dailyActiveAddresses,
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
    name: 'Tx Count',
    fullName: 'Daily Transaction Count',
    description: 'Total transactions processed across the entire network daily',
    icon: BarChart3,
    color: METRIC_COLORS.dailyTxCount,
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
    fullName: 'Maximum TPS',
    description: 'Maximum transactions per second recorded daily',
    icon: Activity,
    color: METRIC_COLORS.maxTPS,
    valueFormatter: (value: number) => value.toFixed(2),
    unit: 'TPS'
  },
  {
    id: 'gasUsed' as const,
    name: 'Gas Used',
    fullName: 'Daily Gas Used',
    description: 'Total gas consumed by transactions across the network',
    icon: Fuel,
    color: METRIC_COLORS.gasUsed,
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
    name: 'Messages',
    fullName: 'Daily Message Volume',
    description: 'Total messages sent across the network daily',
    icon: MessageSquare,
    color: METRIC_COLORS.dailyMessageVolume,
    valueFormatter: (value: number) => value.toLocaleString(),
    unit: 'messages'
  },
];

export function AvalancheNetworkMetrics() {
  const { theme } = useTheme();
  // Multi-metric data storage: { metricId: MetricData[] }
  const [metricsData, setMetricsData] = useState<Record<string, MetricData[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [timeframe, setTimeframe] = useState<TimeframeOption>(7);
  // Multiple selected metrics
  const [selectedMetrics, setSelectedMetrics] = useState<MetricType[]>(['networkTPS']);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const chartRef = useRef<ChartJSInstance<'line'>>(null);
  const reducedMotion = prefersReducedMotion();
  
  // Range selection state
  const [rangeStart, setRangeStart] = useState(0);
  const [rangeEnd, setRangeEnd] = useState(0);

  const isDark = theme === 'dark';
  const isMobile = useMediaQuery(breakpoints.sm);

  // Get the primary metric (first selected) for date labels
  const primaryMetric = METRICS.find(m => m.id === selectedMetrics[0]) || METRICS[0];
  
  // Get primary data - fallback to any metric that has data if primary is empty
  const primaryData = useMemo(() => {
    const firstMetricData = metricsData[selectedMetrics[0]];
    if (firstMetricData && firstMetricData.length > 0) {
      return firstMetricData;
    }
    // Fallback: find any metric with data
    for (const metricId of selectedMetrics) {
      const data = metricsData[metricId];
      if (data && data.length > 0) {
        return data;
      }
    }
    return [];
  }, [metricsData, selectedMetrics]);
  
  // Reset range when data changes
  useEffect(() => {
    if (primaryData.length > 0) {
      setRangeStart(0);
      setRangeEnd(primaryData.length - 1);
    }
  }, [primaryData.length, timeframe]);

  // Handler for range slider changes
  const handleRangeChange = useCallback((start: number, end: number) => {
    setRangeStart(start);
    setRangeEnd(end);
  }, []);

  // Get filtered data based on range selection (for primary metric - used for labels)
  const filteredPrimaryData = useMemo(() => {
    if (primaryData.length === 0) return [];
    const start = Math.max(0, rangeStart);
    const end = Math.min(primaryData.length - 1, rangeEnd);
    return primaryData.slice(start, end + 1);
  }, [primaryData, rangeStart, rangeEnd]);

  // Add a metric
  const handleAddMetric = useCallback((metricId: MetricType) => {
    if (!selectedMetrics.includes(metricId)) {
      setSelectedMetrics(prev => [...prev, metricId]);
    }
    setIsDropdownOpen(false);
  }, [selectedMetrics]);

  // Remove a metric
  const handleRemoveMetric = useCallback((metricId: MetricType) => {
    if (selectedMetrics.length > 1) {
      setSelectedMetrics(prev => prev.filter(m => m !== metricId));
    }
  }, [selectedMetrics]);

  // Export chart as PNG
  // Export dropdown state
  const [isExportDropdownOpen, setIsExportDropdownOpen] = useState(false);

  const handleExportPNG = useCallback(() => {
    if (chartRef.current) {
      const link = document.createElement('a');
      const metricNames = selectedMetrics.join('-');
      link.download = `l1beat-${metricNames}-${timeframe}d.png`;
      link.href = chartRef.current.toBase64Image('image/png', 1);
      link.click();
      setIsExportDropdownOpen(false);
    }
  }, [selectedMetrics, timeframe]);

  const handleExportCSV = useCallback(() => {
    if (!filteredPrimaryData.length) return;

    const headers = ['Date', ...selectedMetrics.map(id => {
      const metric = METRICS.find(m => m.id === id);
      return metric?.name || id;
    })];

    const rows = filteredPrimaryData.map((item, index) => {
      const values = selectedMetrics.map(metricId => {
        const metricData = metricsData[metricId] || [];
        const start = Math.max(0, rangeStart);
        const filteredMetricData = metricData.slice(start, rangeEnd + 1);
        const dataPoint = filteredMetricData[index];
        if (!dataPoint) return '';
        // Return raw value instead of formatted to avoid comma/space issues
        return dataPoint.value;
      });
      return [item.date, ...values];
    });

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const metricNames = selectedMetrics.join('-');
    a.download = `l1beat-${metricNames}-${timeframe}d.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setIsExportDropdownOpen(false);
  }, [selectedMetrics, timeframe, filteredPrimaryData, metricsData, rangeStart, rangeEnd]);

  // Fetch data for a single metric
  const fetchSingleMetric = async (metricId: MetricType, daysToFetch: number): Promise<MetricData[]> => {
    let processedData: MetricData[] = [];

    switch (metricId) {
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

    return processedData;
  };

  // Fetch data for all selected metrics
  const fetchAllMetrics = async (selectedTimeframe?: TimeframeOption, skipLoading?: boolean) => {
    const daysToFetch = selectedTimeframe || timeframe;
    
    try {
      if (!skipLoading) {
        setLoading(true);
      }
      setError(null);
      setRetrying(true);

      const results: Record<string, MetricData[]> = {};
      
      // Fetch all selected metrics in parallel
      await Promise.all(
        selectedMetrics.map(async (metricId) => {
          try {
            const data = await fetchSingleMetric(metricId, daysToFetch);
            results[metricId] = data;
          } catch (err) {
            console.error(`Failed to fetch ${metricId}:`, err);
            results[metricId] = [];
          }
        })
      );

      setMetricsData(results);

      // Check if any metric has data
      const hasData = Object.values(results).some(arr => arr.length > 0);
      if (!hasData) {
        setError('No data available yet. The backend is still collecting historical data.');
      }
    } catch (err: any) {
      console.error('Failed to fetch metrics:', err);
      setError('Failed to load metrics data');
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
      await fetchAllMetrics();
    };

    loadData();
    const interval = setInterval(loadData, 15 * 60 * 1000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [timeframe, selectedMetrics.join(',')]); // Re-fetch when metrics change

  const handleTimeframeChange = (newTimeframe: TimeframeOption) => {
    setTimeframe(newTimeframe);
  };

  // Calculate average for primary metric - MUST be before any conditional returns
  const averageValue = useMemo(() => {
    if (filteredPrimaryData.length === 0) return 0;
    return filteredPrimaryData.reduce((sum, item) => sum + item.value, 0) / filteredPrimaryData.length;
  }, [filteredPrimaryData]);

  // Calculate percentage change from previous point for tooltips - MUST be before any conditional returns
  const getPercentChange = useCallback((metricId: MetricType, index: number) => {
    const data = metricsData[metricId] || [];
    const start = Math.max(0, rangeStart);
    const filteredData = data.slice(start, rangeEnd + 1);
    if (index === 0 || filteredData.length < 2) return null;
    const current = filteredData[index]?.value;
    const previous = filteredData[index - 1]?.value;
    if (!current || !previous || previous === 0) return null;
    return ((current - previous) / previous) * 100;
  }, [metricsData, rangeStart, rangeEnd]);

  // Memoized chart data with multiple datasets for each selected metric
  const chartData = useMemo(() => {
    if (!filteredPrimaryData.length) return null;
    
    // Create datasets for each selected metric
    const datasets = selectedMetrics.map((metricId, index) => {
      const metric = METRICS.find(m => m.id === metricId);
      if (!metric) return null;
      
      const metricData = metricsData[metricId] || [];
      const start = Math.max(0, rangeStart);
      const end = Math.min(metricData.length - 1, rangeEnd);
      const filteredMetricData = metricData.slice(start, end + 1);
      
      // For multi-metric, only fill the first dataset
      const shouldFill = index === 0;
      
      return {
        label: metric.name,
        data: filteredMetricData.map(item => item.value),
        fill: shouldFill,
        borderColor: metric.color.main,
        backgroundColor: shouldFill ? (context: any) => {
          const chart = context.chart;
          const { ctx, chartArea } = chart;
          if (!chartArea) return metric.color.fill;
          const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          const baseColor = metric.color.main;
          gradient.addColorStop(0, baseColor.replace('rgb', 'rgba').replace(')', ', 0.35)'));
          gradient.addColorStop(0.4, baseColor.replace('rgb', 'rgba').replace(')', ', 0.15)'));
          gradient.addColorStop(1, baseColor.replace('rgb', 'rgba').replace(')', ', 0.02)'));
          return gradient;
        } : 'transparent',
        borderWidth: isDark ? 2.5 : 2,
        tension: 0.35,
        pointRadius: 0,
        pointHoverRadius: isMobile ? 5 : 7,
        pointHoverBackgroundColor: isDark ? '#1e293b' : '#ffffff',
        pointHoverBorderColor: metric.color.main,
        pointHoverBorderWidth: 2.5,
        // Use different Y axis for metrics with very different scales
        yAxisID: index === 0 ? 'y' : 'y1',
      };
    }).filter(Boolean);

    return {
      labels: filteredPrimaryData.map(item => {
        const [year, month, day] = item.date.split('-');
        return format(new Date(parseInt(year), parseInt(month) - 1, parseInt(day)), isMobile ? 'd MMM' : 'MMM d');
      }),
      datasets,
    };
  }, [filteredPrimaryData, selectedMetrics, metricsData, rangeStart, rangeEnd, isMobile, isDark]);

  // Check if we have multiple metrics selected
  const hasMultipleMetrics = selectedMetrics.length > 1;

  // Memoized chart options with reduced motion support
  const options = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: reducedMotion ? 0 : 750,
      easing: 'easeInOutQuart' as const,
    },
    transitions: {
      active: {
        animation: {
          duration: reducedMotion ? 0 : 400,
        },
      },
    },
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    plugins: {
      legend: {
        display: false, // We use our own legend with pills
      },
      tooltip: {
        enabled: true,
        backgroundColor: isDark ? 'rgba(15, 23, 42, 0.97)' : 'rgba(255, 255, 255, 0.98)',
        titleColor: isDark ? '#f1f5f9' : '#0f172a',
        bodyColor: isDark ? '#cbd5e1' : '#334155',
        borderColor: isDark ? 'rgba(148, 163, 184, 0.3)' : 'rgba(0, 0, 0, 0.1)',
        borderWidth: 1,
        padding: isMobile ? 12 : 16,
        boxPadding: 8,
        cornerRadius: 12,
        titleFont: {
          size: isMobile ? 13 : 15,
          weight: 'bold' as const,
        },
        bodyFont: {
          size: isMobile ? 12 : 14,
        },
        bodySpacing: 6,
        titleMarginBottom: 10,
        displayColors: hasMultipleMetrics, // Show colors when multiple metrics
        usePointStyle: true,
        caretSize: 8,
        caretPadding: 12,
        callbacks: {
          title: (items: any[]) => {
            if (items.length === 0) return '';
            const dataIndex = items[0].dataIndex;
            const dataPoint = filteredPrimaryData[dataIndex];
            if (!dataPoint) return '';
            return format(parseISO(dataPoint.date), 'MMMM d, yyyy');
          },
          label: (context: any) => {
            const datasetIndex = context.datasetIndex;
            const metricId = selectedMetrics[datasetIndex];
            const metric = METRICS.find(m => m.id === metricId);
            if (!metric) return '';
            
            const value = context.parsed.y;
            return `${metric.name}: ${metric.valueFormatter(value)} ${metric.unit}`;
          },
          // Use metric color for tooltip color box
          labelColor: (context: any) => {
            const datasetIndex = context.datasetIndex;
            const metricId = selectedMetrics[datasetIndex];
            const metric = METRICS.find(m => m.id === metricId);
            const color = metric?.color.main || '#ef4444';
            return {
              borderColor: color,
              backgroundColor: color,
              borderWidth: 2,
              borderRadius: 2,
            };
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
        type: 'linear' as const,
        display: true,
        position: 'left' as const,
        beginAtZero: true,
        grid: {
          color: isDark ? 'rgba(148, 163, 184, 0.1)' : 'rgba(0, 0, 0, 0.05)',
        },
        ticks: {
          color: selectedMetrics[0] ? METRICS.find(m => m.id === selectedMetrics[0])?.color.main : (isDark ? '#94a3b8' : '#64748b'),
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
      // Second Y-axis for additional metrics (right side)
      y1: {
        type: 'linear' as const,
        display: hasMultipleMetrics,
        position: 'right' as const,
        beginAtZero: true,
        grid: {
          drawOnChartArea: false, // Don't draw grid lines for second axis
        },
        ticks: {
          color: selectedMetrics[1] ? METRICS.find(m => m.id === selectedMetrics[1])?.color.main : (isDark ? '#94a3b8' : '#64748b'),
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
  }), [isDark, isMobile, reducedMotion, filteredPrimaryData, selectedMetrics, hasMultipleMetrics, getPercentChange, averageValue]);

  const latestData = filteredPrimaryData[filteredPrimaryData.length - 1];

  // Loading state - must be AFTER all hooks
  if (loading && Object.keys(metricsData).length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="h-[300px] sm:h-[400px] flex flex-col items-center justify-center">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-muted-foreground">Loading network metrics...</p>
        </div>
      </div>
    );
  }

  // Get available metrics (not already selected)
  const availableMetrics = METRICS.filter(m => !selectedMetrics.includes(m.id));

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
              Compare multiple metrics across the Avalanche network
            </p>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            {/* Timeframe Selector */}
            <div className="flex flex-wrap gap-2">
              {[7, 30, 90, 360].map((days) => (
                <button
                  key={days}
                  onClick={() => handleTimeframeChange(days)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    timeframe === days
                      ? 'bg-[#ef4444] text-white shadow-sm'
                      : 'bg-muted/40 text-foreground border border-border hover:bg-muted/70 hover:border-[#ef4444]/20'
                  }`}
                >
                  {days === 360 ? '1Y' : `${days}D`}
                </button>
              ))}
            </div>

            {/* Export Dropdown */}
            <div className="relative">
              <button
                onClick={() => setIsExportDropdownOpen(!isExportDropdownOpen)}
                disabled={!chartData}
                className="p-2 rounded-lg bg-muted/40 border border-border hover:bg-muted/70 hover:border-[#ef4444]/20 hover:text-[#ef4444] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Export chart"
              >
                <Download className="w-4 h-4" />
              </button>
              {isExportDropdownOpen && chartData && (
                <div className="absolute right-0 mt-2 w-40 bg-card border border-border rounded-lg shadow-lg z-10">
                  <button
                    onClick={handleExportPNG}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-muted/30 transition-colors rounded-t-lg flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Export as PNG
                  </button>
                  <button
                    onClick={handleExportCSV}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-muted/30 transition-colors rounded-b-lg flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Export as CSV
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Metric Pills and Add Button */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Selected Metrics as Pills */}
          {selectedMetrics.map((metricId) => {
            const metric = METRICS.find(m => m.id === metricId);
            if (!metric) return null;
            const Icon = metric.icon;
            const metricData = metricsData[metricId] || [];
            const latestValue = metricData[metricData.length - 1]?.value;
            
            return (
              <div
                key={metricId}
                className="inline-flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-full border-2 transition-colors"
                style={{ 
                  borderColor: metric.color.main,
                  backgroundColor: `${metric.color.main}15`
                }}
              >
                <Icon className="w-4 h-4" style={{ color: metric.color.main }} />
                <span className="text-sm font-medium" style={{ color: metric.color.main }}>
                  {metric.name}
                </span>
                {latestValue !== undefined && (
                  <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: metric.color.main, color: 'white' }}>
                    {metric.valueFormatter(latestValue)}
                  </span>
                )}
                {selectedMetrics.length > 1 && (
                  <button
                    onClick={() => handleRemoveMetric(metricId)}
                    className="p-0.5 rounded-full hover:bg-muted/40 transition-colors"
                    title={`Remove ${metric.name}`}
                  >
                    <X className="w-3.5 h-3.5" style={{ color: metric.color.main }} />
                  </button>
                )}
              </div>
            );
          })}

          {/* Add Metrics Button - max 3 metrics allowed */}
          {availableMetrics.length > 0 && selectedMetrics.length < 3 && (
            <div className="relative">
              <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border-2 border-dashed border-border bg-muted/20 text-muted-foreground hover:bg-muted/40 hover:border-[#ef4444]/20 hover:text-[#ef4444] transition-colors text-sm font-medium"
              >
                <Plus className="w-4 h-4" />
                Add Metric
              </button>
              
              {isDropdownOpen && (
                <div className="absolute left-0 mt-2 w-72 bg-card rounded-lg shadow-xl border border-border py-2 z-20">
                  <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Available Metrics
                  </div>
                  {availableMetrics.map(metric => {
                    const Icon = metric.icon;
                    return (
                      <button
                        key={metric.id}
                        onClick={() => handleAddMetric(metric.id)}
                        className="w-full text-left px-3 py-2.5 hover:bg-accent transition-colors flex items-center gap-3"
                      >
                        <div 
                          className="w-8 h-8 rounded-lg flex items-center justify-center"
                          style={{ backgroundColor: `${metric.color.main}20` }}
                        >
                          <Icon className="w-4 h-4" style={{ color: metric.color.main }} />
                        </div>
                        <div className="flex-1">
                          <div className="font-medium text-sm">{metric.fullName}</div>
                          <div className="text-xs text-muted-foreground">{metric.description}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Last Updated */}
          {latestData && (
            <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="w-3.5 h-3.5" />
              <span>{format(parseISO(latestData.date), 'MMM d, yyyy')}</span>
            </div>
          )}
        </div>
      </div>

      <div className="h-[300px] sm:h-[400px]">
        {chartData ? (
          <Line 
            ref={chartRef} 
            data={chartData} 
            options={options} 
            plugins={[lineShadowPlugin, crosshairPlugin, watermarkPlugin]}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full">
            <p className="text-muted-foreground text-center mb-4">
              {error || 'No data available for this metric'}
            </p>
            {!error?.includes('coming soon') && !error?.includes('not available yet') && (
              <button
                onClick={() => fetchAllMetrics()}
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

      {/* Time Range Slider - show if any selected metric has enough data */}
      {primaryData.length > 3 && (
        <TimeRangeSlider
          data={primaryData}
          startIndex={rangeStart}
          endIndex={rangeEnd}
          onChange={handleRangeChange}
          color={primaryMetric.color.main}
        />
      )}
    </div>
  );
}