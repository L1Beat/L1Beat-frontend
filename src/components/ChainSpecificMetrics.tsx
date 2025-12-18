import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJSInstance } from 'chart.js';
import { format, parseISO } from 'date-fns';
import { getAllChainsCumulativeTxCountLatest, getChains, getChainTxCountHistory, getChainMaxTPSHistory, getChainGasUsedHistory, getChainAvgGasPriceHistory, getChainFeesPaidHistory, getDailyActiveAddresses } from '../api';
import { Chain, DailyTxCount, MaxTPSHistory, GasUsedHistory, AvgGasPriceHistory, FeesPaidHistory, DailyActiveAddresses } from '../types';
import { ChevronDown, BarChart3, Users, Activity, Fuel, Download } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';
import { useMediaQuery, breakpoints } from '../hooks/useMediaQuery';
import { TimeRangeSlider } from './TimeRangeSlider';
import { LoadingSpinner } from './LoadingSpinner';
import {
  crosshairPlugin,
  watermarkPlugin,
  lineShadowPlugin,
  prefersReducedMotion
} from '../utils/chartConfig';

type TimeframeOption = 7 | 14 | 30 | 90 | 360;

interface MetricData {
  timestamp: number;
  date: string;
  value: number;
}

type MetricType = 'dailyActiveAddresses' | 'dailyTxCount' | 'maxTPS' | 'gasUsed' | 'avgGasPrice' | 'feesPaid';

// Colors for each metric
const METRIC_COLORS = {
  dailyActiveAddresses: { main: 'rgb(59, 130, 246)', fill: 'rgba(59, 130, 246, 0.15)' },
  dailyTxCount: { main: 'rgb(168, 85, 247)', fill: 'rgba(168, 85, 247, 0.15)' },
  maxTPS: { main: 'rgb(34, 197, 94)', fill: 'rgba(34, 197, 94, 0.15)' },
  gasUsed: { main: 'rgb(249, 115, 22)', fill: 'rgba(249, 115, 22, 0.15)' },
  avgGasPrice: { main: 'rgb(239, 68, 68)', fill: 'rgba(239, 68, 68, 0.15)' },
  feesPaid: { main: 'rgb(236, 72, 153)', fill: 'rgba(236, 72, 153, 0.15)' },
};

const METRICS = [
  {
    id: 'dailyActiveAddresses' as const,
    name: 'Daily Active Addresses',
    icon: Users,
    color: METRIC_COLORS.dailyActiveAddresses,
    valueFormatter: (value: number) => {
      if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
      if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
      return value.toLocaleString();
    },
    unit: 'addresses'
  },
  {
    id: 'dailyTxCount' as const,
    name: 'Daily Transaction Count',
    icon: BarChart3,
    color: METRIC_COLORS.dailyTxCount,
    valueFormatter: (value: number) => {
      if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
      if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
      if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
      return value.toLocaleString();
    },
    unit: 'transactions'
  },
  {
    id: 'maxTPS' as const,
    name: 'Daily Max TPS',
    icon: Activity,
    color: METRIC_COLORS.maxTPS,
    valueFormatter: (value: number) => value.toFixed(2),
    unit: 'TPS'
  },
  {
    id: 'gasUsed' as const,
    name: 'Daily Gas Used',
    icon: Fuel,
    color: METRIC_COLORS.gasUsed,
    valueFormatter: (value: number) => {
      if (value >= 1_000_000_000_000) return `${(value / 1_000_000_000_000).toFixed(2)}T`;
      if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
      if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
      return value.toLocaleString();
    },
    unit: 'gas'
  },
  {
    id: 'avgGasPrice' as const,
    name: 'Daily Avg Gas Price',
    icon: Fuel,
    color: METRIC_COLORS.avgGasPrice,
    valueFormatter: (value: number) => {
      if (value < 0.001) return `${(value * 1e9).toFixed(2)}`;
      return `${value.toFixed(6)}`;
    },
    unit: ''
  },
  {
    id: 'feesPaid' as const,
    name: 'Daily Fees Paid',
    icon: Activity,
    color: METRIC_COLORS.feesPaid,
    valueFormatter: (value: number) => {
      if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
      if (value >= 1e3) return `${(value / 1e3).toFixed(2)}K`;
      return `${value.toFixed(2)}`;
    },
    unit: ''
  },
];

export function ChainSpecificMetrics() {
  const { theme } = useTheme();
  const [chains, setChains] = useState<Chain[]>([]);
  const [selectedChain, setSelectedChain] = useState<Chain | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [timeframe, setTimeframe] = useState<TimeframeOption>(7);
  const [loading, setLoading] = useState(true);
  const [metricsData, setMetricsData] = useState<Record<string, MetricData[]>>({});
  const chartRefs = useRef<Record<string, ChartJSInstance<'line'> | null>>({});
  const reducedMotion = prefersReducedMotion();

  // Range selection states for each metric
  const [rangeStates, setRangeStates] = useState<Record<string, { start: number; end: number }>>({});
  // Export dropdown states for each metric
  const [exportDropdownStates, setExportDropdownStates] = useState<Record<string, boolean>>({});

  const isDark = theme === 'dark';
  const isMobile = useMediaQuery(breakpoints.sm);

  // Load chains on mount
  useEffect(() => {
    async function fetchChains() {
      try {
        const [chainsData, cumulativeMap] = await Promise.all([
          getChains(),
          getAllChainsCumulativeTxCountLatest()
        ]);

        // Merge latest cumulative tx into chain objects (backend no longer includes it on /chains)
        const chainsWithCumulative = chainsData.map((chain) => {
          const lookupId =
            (chain.evmChainId ? String(chain.evmChainId) : undefined) ||
            chain.originalChainId ||
            chain.chainId;

          const latest = lookupId ? cumulativeMap[lookupId] : undefined;
          if (!latest) return chain;

          return {
            ...chain,
            cumulativeTxCount: {
              value: Number(latest.value),
              timestamp: Number(latest.timestamp)
            }
          };
        });

        // Filter chains with validators and sort by cumulative transactions
        const chainsWithValidators = chainsWithCumulative.filter(chain => {
          const hasValidators = (chain.validators && chain.validators.length > 0) ||
                               (chain.validatorCount && chain.validatorCount > 0);
          return hasValidators;
        });
        const isCChain = (chain: Chain) => {
          // Prefer numeric IDs if present (routing chainId is a slug in this app)
          if (chain.evmChainId === 43114) return true;
          if (chain.originalChainId === '43114') return true;
          const name = (chain.chainName || '').toLowerCase();
          return name === 'c-chain' || name.includes('avalanche c-chain') || name.includes('c-chain');
        };

        // Sort: C-Chain first, then by cumulative tx count desc
        const sortedChains = [...chainsWithValidators].sort((a, b) => {
          const aIsC = isCChain(a);
          const bIsC = isCChain(b);
          if (aIsC && !bIsC) return -1;
          if (!aIsC && bIsC) return 1;

          const aTxCount = Number(a.cumulativeTxCount?.value ?? 0);
          const bTxCount = Number(b.cumulativeTxCount?.value ?? 0);
          if (bTxCount !== aTxCount) return bTxCount - aTxCount;
          // Stable tie-breaker (prevents “random” feeling when many are 0)
          return a.chainName.localeCompare(b.chainName);
        });
        setChains(sortedChains);
        const cChain = sortedChains.find(isCChain);
        setSelectedChain(cChain || sortedChains[0]);
      } catch (err) {
        console.error('Failed to fetch chains:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchChains();
  }, []);

  // Load metrics when chain or timeframe changes
  useEffect(() => {
    if (!selectedChain) return;

    async function fetchMetrics() {
      const chainId = selectedChain.originalChainId || selectedChain.chainId;
      const evmChainIdStr = selectedChain.evmChainId ? String(selectedChain.evmChainId) : chainId;

      try {
        const [
          activeAddresses,
          dailyTxCount,
          maxTPS,
          gasUsed,
          avgGasPrice,
          feesPaid
        ] = await Promise.all([
          getDailyActiveAddresses(evmChainIdStr, timeframe).catch(() => []),
          getChainTxCountHistory(chainId, timeframe).catch(() => []),
          getChainMaxTPSHistory(chainId, timeframe).catch(() => []),
          getChainGasUsedHistory(chainId, timeframe).catch(() => []),
          getChainAvgGasPriceHistory(chainId, timeframe).catch(() => []),
          getChainFeesPaidHistory(chainId, timeframe).catch(() => [])
        ]);

        // Transform all data to MetricData format
        const transformData = (data: any[]): MetricData[] => {
          return data.map(item => {
            const timestamp = item.timestamp;
            const date = format(new Date(timestamp * 1000), 'yyyy-MM-dd');
            const value = item.value !== undefined ? item.value : (item.activeAddresses || 0);
            return { timestamp, date, value };
          });
        };

        const newMetricsData: Record<string, MetricData[]> = {
          dailyActiveAddresses: transformData(activeAddresses),
          dailyTxCount: transformData(dailyTxCount),
          maxTPS: transformData(maxTPS),
          gasUsed: transformData(gasUsed),
          avgGasPrice: transformData(avgGasPrice),
          feesPaid: transformData(feesPaid),
        };

        setMetricsData(newMetricsData);

        // Initialize range states for each metric
        const newRangeStates: Record<string, { start: number; end: number }> = {};
        Object.keys(newMetricsData).forEach(metricId => {
          const data = newMetricsData[metricId];
          if (data.length > 0) {
            newRangeStates[metricId] = { start: 0, end: data.length - 1 };
          }
        });
        setRangeStates(newRangeStates);
      } catch (err) {
        console.error('Failed to fetch metrics:', err);
      }
    }

    fetchMetrics();
  }, [selectedChain, timeframe]);

  // Handler for range changes
  const handleRangeChange = useCallback((metricId: string, start: number, end: number) => {
    setRangeStates(prev => ({
      ...prev,
      [metricId]: { start, end }
    }));
  }, []);

  // Toggle export dropdown for a specific metric
  const toggleExportDropdown = useCallback((metricId: string) => {
    setExportDropdownStates(prev => ({
      ...prev,
      [metricId]: !prev[metricId]
    }));
  }, []);

  // Download CSV handler for a specific metric
  const handleDownloadCSV = useCallback((metricId: MetricType) => {
    const metric = METRICS.find(m => m.id === metricId);
    if (!metric || !selectedChain) return;

    const data = metricsData[metricId] || [];
    const rangeState = rangeStates[metricId];
    if (!rangeState) return;

    const { start, end } = rangeState;
    const filteredData = data.slice(start, end + 1);

    const csv = [
      ['Date', metric.name].join(','),
      ...filteredData.map(item => {
        // Use raw value instead of formatted to avoid comma/space issues
        return [item.date, item.value].join(',');
      })
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedChain.chainName}-${metric.name.replace(/\s+/g, '-')}-${timeframe}d.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setExportDropdownStates(prev => ({ ...prev, [metricId]: false }));
  }, [metricsData, selectedChain, timeframe, rangeStates]);

  // Download PNG handler for a specific metric
  const handleDownloadPNG = useCallback((metricId: MetricType) => {
    const chartRef = chartRefs.current[metricId];
    if (!chartRef || !selectedChain) return;

    const metric = METRICS.find(m => m.id === metricId);
    if (!metric) return;

    const link = document.createElement('a');
    link.download = `${selectedChain.chainName}-${metric.name.replace(/\s+/g, '-')}-${timeframe}d.png`;
    link.href = chartRef.toBase64Image('image/png', 1);
    link.click();
    setExportDropdownStates(prev => ({ ...prev, [metricId]: false }));
  }, [selectedChain, timeframe]);

  // Create chart component for each metric
  const renderMetricChart = (metricId: MetricType) => {
    const metric = METRICS.find(m => m.id === metricId);
    if (!metric) return null;

    const data = metricsData[metricId] || [];
    const rangeState = rangeStates[metricId];
    if (!rangeState || data.length === 0) return null;

    const { start, end } = rangeState;
    const filteredData = data.slice(start, end + 1);

    const chartData = {
      labels: filteredData.map(item => {
        const [year, month, day] = item.date.split('-');
        return format(new Date(parseInt(year), parseInt(month) - 1, parseInt(day)), isMobile ? 'd MMM' : 'MMM d');
      }),
      datasets: [{
        label: metric.name,
        data: filteredData.map(item => item.value),
        fill: true,
        borderColor: metric.color.main,
        backgroundColor: (context: any) => {
          const chart = context.chart;
          const { ctx, chartArea } = chart;
          if (!chartArea) return metric.color.fill;
          const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          const baseColor = metric.color.main;
          gradient.addColorStop(0, baseColor.replace('rgb', 'rgba').replace(')', ', 0.35)'));
          gradient.addColorStop(0.4, baseColor.replace('rgb', 'rgba').replace(')', ', 0.15)'));
          gradient.addColorStop(1, baseColor.replace('rgb', 'rgba').replace(')', ', 0.02)'));
          return gradient;
        },
        borderWidth: isDark ? 2.5 : 2,
        tension: 0.35,
        pointRadius: 0,
        pointHoverRadius: isMobile ? 5 : 7,
        pointHoverBackgroundColor: isDark ? '#1e293b' : '#ffffff',
        pointHoverBorderColor: metric.color.main,
        pointHoverBorderWidth: 2.5,
      }],
    };

    const options = {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: reducedMotion ? 0 : 750,
        easing: 'easeInOutQuart' as const,
      },
      interaction: {
        mode: 'index' as const,
        intersect: false,
      },
      plugins: {
        legend: {
          display: false,
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
          callbacks: {
            title: (items: any[]) => {
              if (items.length === 0) return '';
              const dataIndex = items[0].dataIndex;
              const dataPoint = filteredData[dataIndex];
              if (!dataPoint) return '';
              return format(parseISO(dataPoint.date), 'MMMM d, yyyy');
            },
            label: (context: any) => {
              const value = context.parsed.y;
              const formattedValue = metric.valueFormatter(value);
              return `${metric.name}: ${formattedValue}${metric.unit ? ' ' + metric.unit : ''}`;
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
          },
          ticks: {
            color: metric.color.main,
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

    const latestValue = filteredData[filteredData.length - 1]?.value || 0;
    const Icon = metric.icon;

    return (
      <div key={metricId} className="bg-card rounded-xl border border-border p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: metric.color.main.replace('rgb', 'rgba').replace(')', ', 0.1)') }}
            >
              <Icon className="w-5 h-5" style={{ color: metric.color.main }} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">{metric.name}</h3>
              <p className="text-2xl font-bold" style={{ color: metric.color.main }}>
                {metric.valueFormatter(latestValue)}
                {metric.unit && <span className="text-sm ml-1 text-muted-foreground">{metric.unit}</span>}
              </p>
            </div>
          </div>
          <div className="relative">
            <button
              onClick={() => toggleExportDropdown(metricId)}
              className="p-2 rounded-lg hover:bg-accent transition-colors"
              title="Export chart"
            >
              <Download className="w-4 h-4 text-muted-foreground" />
            </button>
            {exportDropdownStates[metricId] && (
              <div className="absolute right-0 mt-2 w-40 bg-card border border-border rounded-lg shadow-lg z-10">
                <button
                  onClick={() => handleDownloadPNG(metricId)}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-accent transition-colors rounded-t-lg flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Export as PNG
                </button>
                <button
                  onClick={() => handleDownloadCSV(metricId)}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-accent transition-colors rounded-b-lg flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Export as CSV
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Chart */}
        <div className="h-[300px] mb-4">
          <Line
            ref={(ref) => {
              if (ref) chartRefs.current[metricId] = ref;
            }}
            data={chartData}
            options={options}
            plugins={[crosshairPlugin, watermarkPlugin, lineShadowPlugin]}
          />
        </div>

        {/* Time Range Slider */}
        <TimeRangeSlider
          data={data.map(item => ({ date: item.date, value: item.value }))}
          startIndex={start}
          endIndex={end}
          onChange={(newStart, newEnd) => handleRangeChange(metricId, newStart, newEnd)}
          color={metric.color.main}
        />
      </div>
    );
  };

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl p-8">
        <div className="flex items-center justify-center">
          <LoadingSpinner size="lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Section Header with Chain Selector */}
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#ef4444] to-[#dc2626] flex items-center justify-center shadow-sm">
              <BarChart3 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-foreground">
                Chain-Specific Metrics
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Detailed metrics for individual chains
              </p>
            </div>
          </div>

          {/* Chain Selector Dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="w-full sm:w-64 px-4 py-2.5 bg-muted/40 border border-border rounded-lg flex items-center justify-between hover:bg-muted/70 hover:border-[#ef4444]/20 transition-colors"
            >
              <span className="text-sm font-medium text-foreground">
                {selectedChain?.chainName || 'Select Chain'}
              </span>
              <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {isDropdownOpen && (
              <div className="absolute right-0 mt-2 w-full sm:w-64 bg-card border border-border rounded-lg shadow-lg z-10 max-h-80 overflow-y-auto">
                {chains.map((chain) => (
                  <button
                    key={chain.chainId}
                    onClick={() => {
                      setSelectedChain(chain);
                      setIsDropdownOpen(false);
                    }}
                    className={`w-full px-4 py-3 text-left text-sm hover:bg-muted/30 transition-colors ${
                      selectedChain?.chainId === chain.chainId
                        ? 'bg-[#ef4444]/10 text-[#ef4444] font-medium'
                        : 'text-foreground'
                    }`}
                  >
                    {chain.chainName}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Timeframe Selector */}
        <div className="mt-6 flex flex-wrap gap-2">
          {[7, 30, 90, 360].map((days) => (
            <button
              key={days}
              onClick={() => setTimeframe(days as TimeframeOption)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                timeframe === days
                  ? 'bg-[#ef4444] text-white shadow-sm'
                  : 'bg-muted/40 text-foreground hover:bg-muted/70 hover:border-[#ef4444]/20 border border-border'
              }`}
            >
              {days === 360 ? '1Y' : `${days}D`}
            </button>
          ))}
        </div>
      </div>

      {/* Metrics Charts Grid */}
      {selectedChain && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {METRICS.map(metric => renderMetricChart(metric.id))}
        </div>
      )}
    </div>
  );
}
