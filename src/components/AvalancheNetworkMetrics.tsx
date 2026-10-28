import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { usePolling } from '../hooks/usePolling';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { Delta, SeriesSummary } from './instrument';
import { DailyBars, parseDay } from './instrument/DailyBars';
import html2canvas from 'html2canvas';
import { TimeframeOption } from '../types';
import { useTheme } from '../hooks/useTheme';
import { RefreshCw, BarChart3, Users, Activity, Fuel, Download, MessageSquare, Share2, Coins, Info } from 'lucide-react';
import { getNetworkActiveAddressesHistory, getNetworkTxCountHistory, getNetworkMaxTPSHistory, getDailyMessageVolumeFromExternal, getNetworkGasUsedHistory, getTPSHistory, getNetworkDailyFeeBurn, getL1BeatFeeSummary } from '../api';
import { LoadingSpinner } from './LoadingSpinner';
import { TimeRangeSlider } from './TimeRangeSlider';

interface MetricData {
  timestamp: number;
  date: string;
  value: number;
  metadata?: {
    chainCount?: number;
    dailyBurn?: number;
    chains?: Array<{
      chainId: string;
      chainName: string;
      value: number;
    }>;
  };
}

type MetricType = 'networkTPS' | 'dailyMessageVolume' | 'dailyActiveAddresses' | 'dailyTxCount' | 'maxTPS' | 'gasUsed' | 'feeBurn';

// Distinct colors for each metric
const METRIC_COLORS = {
  networkTPS: { main: 'rgb(34, 211, 238)', fill: 'rgba(34, 211, 238, 0.12)' },         // Cyan
  dailyActiveAddresses: { main: 'rgb(59, 130, 246)', fill: 'rgba(59, 130, 246, 0.15)' }, // Blue
  dailyTxCount: { main: 'rgb(168, 85, 247)', fill: 'rgba(168, 85, 247, 0.15)' },        // Purple
  maxTPS: { main: 'rgb(34, 197, 94)', fill: 'rgba(34, 197, 94, 0.15)' },                // Green
  gasUsed: { main: 'rgb(249, 115, 22)', fill: 'rgba(249, 115, 22, 0.15)' },             // Orange
  dailyMessageVolume: { main: 'rgb(236, 72, 153)', fill: 'rgba(236, 72, 153, 0.15)' },  // Pink
  feeBurn: { main: 'rgb(245, 158, 11)', fill: 'rgba(245, 158, 11, 0.15)' },              // Amber
};

// The running total of validation fees overlays the bars in red, apart from the amber series.
const CUMULATIVE_COLOR = 'rgb(232, 65, 66)';

/** How a window of daily values rolls up into the headline number. */
type Aggregate = 'sum' | 'avg' | 'max';
const AGGREGATE_LABEL: Record<Aggregate, string> = { sum: 'Total', avg: 'Daily average', max: 'Peak day' };

const METRICS = [
  { 
    id: 'networkTPS' as const,
    aggregate: 'avg' as Aggregate,
    name: 'TPS',
    fullName: 'Network TPS',
    description: 'Average transactions per second aggregated across all Avalanche L1s and C-Chain',
    icon: Activity,
    color: METRIC_COLORS.networkTPS,
    valueFormatter: (value: number) => value.toFixed(2),
    unit: 'TPS'
  },
  { 
    id: 'dailyActiveAddresses' as const,
    aggregate: 'avg' as Aggregate, 
    name: 'Active Addresses',
    fullName: 'Daily Active Addresses',
    description: 'Total unique wallet addresses that sent or received transactions across all chains in a day',
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
    aggregate: 'sum' as Aggregate,
    name: 'Tx Count',
    fullName: 'Daily Transaction Count',
    description: 'Total number of transactions processed across all Avalanche chains per day',
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
    aggregate: 'max' as Aggregate,
    name: 'Max TPS',
    fullName: 'Maximum TPS',
    description: 'Highest TPS peak recorded in a single day across the entire Avalanche network',
    icon: Activity,
    color: METRIC_COLORS.maxTPS,
    valueFormatter: (value: number) => value.toFixed(2),
    unit: 'TPS'
  },
  {
    id: 'gasUsed' as const,
    aggregate: 'sum' as Aggregate,
    name: 'Gas Used',
    fullName: 'Daily Gas Used',
    description: 'Total computational gas consumed by all transactions across Avalanche chains per day',
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
    aggregate: 'sum' as Aggregate,
    name: 'ICM Messages',
    fullName: 'Daily ICM Message Volume',
    description: 'Total Interchain Messages (ICM) sent across Avalanche L1s daily',
    icon: MessageSquare,
    color: METRIC_COLORS.dailyMessageVolume,
    valueFormatter: (value: number) => value.toLocaleString(),
    unit: 'messages'
  },
  {
    id: 'feeBurn' as const,
    aggregate: 'sum' as Aggregate,
    name: 'L1 Validation Fees',
    fullName: 'L1 Validation Fees',
    description: 'AVAX paid by L1 validators to the P-Chain for continuous validation, per day.',
    icon: Coins,
    color: METRIC_COLORS.feeBurn,
    valueFormatter: (value: number) => {
      if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
      if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
      if (value >= 1) return value.toFixed(2);
      return value.toFixed(4);
    },
    unit: 'AVAX'
  },
];

export function AvalancheNetworkMetrics({
  hero = false,
  actions,
}: {
  /** Fill the parent as the Metrics page's first screen: controls float, chart fills. */
  hero?: boolean;
  /** Extra controls rendered at the right end of the hero toolbar. */
  actions?: React.ReactNode;
} = {}) {
  const { theme } = useTheme();
  const [searchParams, setSearchParams] = useSearchParams();

  // Multi-metric data storage: { metricId: MetricData[] }
  const [metricsData, setMetricsData] = useState<Record<string, MetricData[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  // Read timeframe from URL or default to 30 (7 bars was too sparse to read)
  const timeframeParam = searchParams.get('networkTimeframe');
  const timeframe = useMemo(() => {
    const parsed = parseInt(timeframeParam || '30', 10);
    if ([30, 90, 360].includes(parsed)) {
      return parsed as TimeframeOption;
    }
    return 30 as TimeframeOption;
  }, [timeframeParam]);

  // Read selected metric from URL or default to 'networkTPS' (single metric only)
  const metricsParam = searchParams.get('networkMetrics');
  const selectedMetrics = useMemo(() => {
    if (!metricsParam) return ['networkTPS'] as MetricType[];
    const first = metricsParam.split(',').find(m =>
      METRICS.some(metric => metric.id === m)
    ) as MetricType | undefined;
    return first ? [first] : ['networkTPS'] as MetricType[];
  }, [metricsParam]);

  // Update URL with current state
  const updateUrl = useCallback((newTimeframe?: TimeframeOption, newMetrics?: MetricType[]) => {
    const newParams = new URLSearchParams(searchParams);

    if (newTimeframe !== undefined) {
      newParams.set('networkTimeframe', String(newTimeframe));
    }

    if (newMetrics !== undefined) {
      if (newMetrics.length > 0) {
        newParams.set('networkMetrics', newMetrics.join(','));
      } else {
        newParams.delete('networkMetrics');
      }
    }

    setSearchParams(newParams, { replace: true });
  }, [searchParams, setSearchParams]);

  // Copy share URL to clipboard
  const handleCopyShareUrl = useCallback(() => {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      console.warn('Clipboard write failed');
    });
  }, []);

  // Range selection state
  const [rangeStart, setRangeStart] = useState(0);
  const [rangeEnd, setRangeEnd] = useState(0);

  const isDark = theme === 'dark';

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
    // The hero has no range slider. Using the slider's indices there would
    // render one stale partial range (old indices, new data) before the reset
    // effect runs, and the bar chart kept leftover bars from that frame.
    if (hero) return primaryData;
    const start = Math.max(0, rangeStart);
    const end = Math.min(primaryData.length - 1, rangeEnd);
    return primaryData.slice(start, end + 1);
  }, [primaryData, rangeStart, rangeEnd, hero]);


  // Export chart as PNG
  // Export dropdown state
  const [isExportDropdownOpen, setIsExportDropdownOpen] = useState(false);

  const handleExportPNG = useCallback(async () => {
    if (!containerRef.current) return;

    try {
      // Toggle export mode: show export header, hide interactive controls
      containerRef.current.classList.add('exporting');
      // Wait a frame for the DOM to update
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

      const canvas = await html2canvas(containerRef.current, {
        backgroundColor: isDark ? '#0f172a' : '#ffffff',
        scale: 2,
        useCORS: true,
      });

      containerRef.current.classList.remove('exporting');

      const link = document.createElement('a');
      const metricNames = selectedMetrics.join('-');
      link.download = `l1beat-${metricNames}-${timeframe}d.png`;
      link.href = canvas.toDataURL('image/png', 1);
      link.click();
    } catch (err) {
      console.error('Failed to export PNG:', err);
      containerRef.current?.classList.remove('exporting');
    }
    setIsExportDropdownOpen(false);
  }, [selectedMetrics, timeframe, isDark]);

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

        case 'feeBurn':
          // Fetch all-time total and daily data in parallel
          const [feeSummary, feeBurnDaily] = await Promise.all([
            getL1BeatFeeSummary(),
            getNetworkDailyFeeBurn(daysToFetch === 360 ? 365 : daysToFetch)
          ]);

          const sortedFeeBurn = feeBurnDaily
            .filter(item => item && typeof item.timestamp === 'number' && typeof item.value === 'number')
            .sort((a, b) => a.timestamp - b.timestamp)
            .slice(-daysToFetch);

          if (sortedFeeBurn.length > 0 && feeSummary) {
            const allTimeTotal = feeSummary.total_fees_paid / 1_000_000_000;
            const windowSum = sortedFeeBurn.reduce((sum, item) => sum + item.value, 0);
            let cumulative = allTimeTotal - windowSum;

            processedData = sortedFeeBurn.map(item => {
              cumulative += item.value;
              return {
                timestamp: item.timestamp,
                date: new Date(item.timestamp * 1000).toISOString(),
                value: cumulative,
                metadata: { dailyBurn: item.value }
              };
            });
          }
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
            // Most series drop today's unfinished day, so a 30 day request
            // would chart 29. Ask for one more and keep the newest N.
            const data = await fetchSingleMetric(metricId, daysToFetch + 1);
            results[metricId] = data.slice(-daysToFetch);
          } catch (err) {
            console.error(`Failed to fetch ${metricId}:`, err);
            results[metricId] = [];
          }
        })
      );

      // Skip the state update (and Chart.js re-render) when an unchanged poll
      // returns the same series — compare keys + each series' length + latest point.
      setMetricsData((prev) => {
        const nextKeys = Object.keys(results);
        const same =
          Object.keys(prev).length === nextKeys.length &&
          nextKeys.every((k) => {
            const a = prev[k];
            const b = results[k];
            return (
              a !== undefined &&
              a.length === b.length &&
              (a.length === 0 || a[a.length - 1].timestamp === b[b.length - 1].timestamp)
            );
          });
        return same ? prev : results;
      });

      // Check if any metric has data
      const hasData = Object.values(results).some(arr => arr.length > 0);
      if (!hasData) {
        setError('No data came back for this metric. The API may be busy; try again in a moment.');
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

  // Re-fetch when metrics change; polling pauses while the tab is hidden.
  usePolling(() => {
    fetchAllMetrics();
  }, 15 * 60 * 1000, [timeframe, selectedMetrics.join(',')]);

  const handleTimeframeChange = (newTimeframe: TimeframeOption) => {
    updateUrl(newTimeframe, undefined);
  };


  // Bars plot what happened each day. Validation fees are stored cumulative,
  // so their bars use the daily amount instead.
  const barValues = useMemo(
    () =>
      filteredPrimaryData.map((d) =>
        primaryMetric.id === 'feeBurn' ? d.metadata?.dailyBurn ?? 0 : d.value,
      ),
    [filteredPrimaryData, primaryMetric.id],
  );
  // Validation fees: the stored running total rides along as a line.
  const cumulativeValues = useMemo(
    () => (primaryMetric.id === 'feeBurn' ? filteredPrimaryData.map((d) => d.value) : undefined),
    [filteredPrimaryData, primaryMetric.id],
  );
  const barDates = useMemo(() => filteredPrimaryData.map((d) => d.date), [filteredPrimaryData]);
  // The newest point is today when its UTC date matches: that day is still filling.
  const partialLast =
    filteredPrimaryData.length > 0 &&
    filteredPrimaryData[filteredPrimaryData.length - 1].date.slice(0, 10) === new Date().toISOString().slice(0, 10);
  const hasSeries = barValues.length > 0;
  // Finished days only: an unfinished today would read as the window's low.
  const completeValues = useMemo(() => (partialLast ? barValues.slice(0, -1) : barValues), [barValues, partialLast]);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  useEffect(() => setHoverIdx(null), [primaryMetric.id, timeframe]);


  // Loading state - must be AFTER all hooks
  if (loading && Object.keys(metricsData).length === 0) {
    return (
      <div className={hero ? 'h-full w-full bg-stage' : 'bg-card border border-border rounded-md p-6'}>
        <div className={`${hero ? 'h-full' : 'h-[300px] sm:h-[400px]'} flex flex-col items-center justify-center`}>
          <LoadingSpinner size="lg" />
          <p className="mt-3 text-[12px] text-muted-foreground">Loading network metrics</p>
        </div>
      </div>
    );
  }

  // Shared pieces for both layouts.
  const rangeButtons = (
    <div className="inline-flex items-center gap-px p-px rounded border border-border bg-background">
      {[30, 90, 360].map((days) => (
        <button
          key={days}
          onClick={() => handleTimeframeChange(days as TimeframeOption)}
          className={`num h-7 px-2.5 rounded-[3px] text-[12px] font-medium transition-colors ${
            timeframe === days
              ? 'bg-foreground text-background'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent'
          }`}
        >
          {days === 360 ? '1Y' : `${days}D`}
        </button>
      ))}
    </div>
  );

  const iconButton =
    'inline-flex items-center justify-center w-7 h-7 rounded border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

  const shareAndExport = (
    <>
      <button onClick={handleCopyShareUrl} className={iconButton} title={copied ? 'Copied' : 'Copy share link'} aria-label="Copy share link">
        <Share2 className={`w-3.5 h-3.5 ${copied ? 'text-up' : ''}`} />
      </button>
      <div className="relative">
        <button
          onClick={() => setIsExportDropdownOpen(!isExportDropdownOpen)}
          disabled={!hasSeries}
          className={iconButton}
          title="Export chart"
          aria-label="Export chart"
        >
          <Download className="w-3.5 h-3.5" />
        </button>
        {isExportDropdownOpen && hasSeries && (
          <div className="absolute right-0 mt-1 w-40 bg-popover border border-border rounded shadow-lg z-40 py-1">
            <button onClick={handleExportPNG} className="w-full px-3 h-8 text-left text-[12px] hover:bg-accent transition-colors flex items-center gap-2">
              <Download className="w-3.5 h-3.5" />
              Export as PNG
            </button>
            <button onClick={handleExportCSV} className="w-full px-3 h-8 text-left text-[12px] hover:bg-accent transition-colors flex items-center gap-2">
              <Download className="w-3.5 h-3.5" />
              Export as CSV
            </button>
          </div>
        )}
      </div>
    </>
  );

  const metricChips = (
    // On narrow screens the chips scroll sideways; the fade at the right edge says so.
    <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pr-6 [mask-image:linear-gradient(to_right,black_calc(100%-32px),transparent)] lg:pr-0 lg:[mask-image:none]">
      {METRICS.map((metric) => {
        const Icon = metric.icon;
        const isSelected = selectedMetrics[0] === metric.id;
        const metricData = metricsData[metric.id] || [];
        const latestValue = metricData[metricData.length - 1]?.value;
        return (
          <button
            key={metric.id}
            onClick={() => updateUrl(undefined, [metric.id])}
            aria-pressed={isSelected}
            className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded text-[12px] font-medium whitespace-nowrap transition-colors ${
              isSelected
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent/60'
            }`}
          >
            <Icon className="w-3.5 h-3.5" style={{ color: metric.color.main }} />
            <span>{metric.name}</span>
            {isSelected && latestValue !== undefined && (
              <span className="num text-[11px] text-muted-foreground">{metric.valueFormatter(latestValue)}</span>
            )}
          </button>
        );
      })}
    </div>
  );

  const metricInfo = (
    <div className="relative group">
      <div className="flex items-center gap-1.5 text-muted-foreground cursor-help">
        <Info className="w-3.5 h-3.5" />
      </div>
      <div className="absolute right-0 top-full mt-2 px-3 py-2.5 rounded bg-popover border border-border text-[11px] max-w-[280px] whitespace-normal opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 pointer-events-none z-40 shadow-lg">
        <p className="font-medium text-foreground mb-1">{primaryMetric.fullName}</p>
        <p className="text-muted-foreground leading-relaxed">{primaryMetric.description}</p>
      </div>
    </div>
  );

  const exportHeader = (
    <div className="export-show hidden items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="text-lg font-bold" style={{ color: primaryMetric.color.main }}>
          {primaryMetric.fullName}
        </div>
        {(() => {
          const d = metricsData[selectedMetrics[0]] || [];
          const v = d[d.length - 1]?.value;
          return v !== undefined ? (
            <span className="text-2xl font-bold" style={{ color: primaryMetric.color.main }}>
              {primaryMetric.valueFormatter(v)} {primaryMetric.unit}
            </span>
          ) : null;
        })()}
      </div>
      <span className="text-sm text-muted-foreground">
        {timeframe === 360 ? '1Y' : `${timeframe}D`}, {format(new Date(), 'MMM d, yyyy')}
      </span>
    </div>
  );

  const chart = hasSeries ? (
    <DailyBars
      values={barValues}
      dates={barDates}
      color={primaryMetric.color.main}
      format={primaryMetric.valueFormatter}
      partialLast={partialLast}
      cumulative={cumulativeValues}
      cumulativeColor={CUMULATIVE_COLOR}
      formatCumulative={(v) => `${primaryMetric.valueFormatter(v)} AVAX paid to date`}
      onHover={setHoverIdx}
    />
  ) : (
    <div className="flex flex-col items-center justify-center h-full">
      <p className="text-[12px] text-muted-foreground text-center mb-3">
        {error || 'No data available for this metric'}
      </p>
      {!error?.includes('coming soon') && !error?.includes('not available yet') && (
        <button
          onClick={() => fetchAllMetrics()}
          disabled={retrying}
          className="inline-flex items-center gap-1.5 h-7 px-3 text-[12px] font-medium rounded bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${retrying ? 'animate-spin' : ''}`} />
          {retrying ? 'Retrying' : 'Retry'}
        </button>
      )}
    </div>
  );

  // Headline: the window rolled up, or the hovered day.
  const readout = (() => {
    if (!hasSeries) return null;
    const agg = primaryMetric.aggregate;
    const total = barValues.reduce((x, y) => x + y, 0);
    const done = completeValues.length ? completeValues : barValues;
    const rolled =
      agg === 'sum' ? total : agg === 'avg' ? done.reduce((x, y) => x + y, 0) / done.length : Math.max(...done);
    const first = parseDay(barDates[0]);
    const last = parseDay(barDates[barDates.length - 1]);
    const i = hoverIdx;
    const value = i != null ? barValues[i] : rolled;
    const prev = i != null && i > 0 ? barValues[i - 1] : null;
    const change = prev ? ((barValues[i!] - prev) / prev) * 100 : null;
    const toDate = cumulativeValues ? cumulativeValues[i ?? cumulativeValues.length - 1] : null;
    return (
      <div className="min-w-0">
        <div className="text-[12px] text-muted-foreground leading-4">
          {i != null
            ? `${format(parseDay(barDates[i]), 'EEE, MMM d, yyyy')}${partialLast && i === barDates.length - 1 ? ', so far' : ''}`
            : `${AGGREGATE_LABEL[agg]}, ${format(first, 'MMM d')} to ${format(last, 'MMM d, yyyy')}`}
        </div>
        <div className="mt-1 flex items-baseline gap-2 flex-wrap">
          <span className="num text-[32px] leading-9 font-medium text-foreground">{primaryMetric.valueFormatter(value)}</span>
          <span className="text-[13px] text-muted-foreground">{primaryMetric.unit}</span>
          {change != null && Number.isFinite(change) && <Delta value={change} label="vs day before" />}
          {toDate != null && (
            <span className="inline-flex items-baseline gap-1.5 ml-2 text-[11px] text-muted-foreground">
              {/* Doubles as the legend for the cumulative line. */}
              <span aria-hidden className="self-center w-3 h-[1.5px]" style={{ background: CUMULATIVE_COLOR }} />
              <span className="num text-foreground">{primaryMetric.valueFormatter(toDate)}</span>
              AVAX {i == null ? 'all time' : 'paid to date'}
            </span>
          )}
        </div>
      </div>
    );
  })();

  const summary =
    completeValues.length > 1 ? (
      <SeriesSummary values={completeValues} format={primaryMetric.valueFormatter} className="export-hide" />
    ) : null;

  if (hero) {
    return (
      <div ref={containerRef} className="relative h-full w-full bg-stage">
        {/* Toolbar floats over the chart. */}
        <div className="absolute top-3 left-4 sm:left-6 right-4 sm:right-6 z-30 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between pointer-events-none [&>*]:pointer-events-auto export-hide">
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="text-[15px] leading-6 font-semibold text-foreground shrink-0">Network metrics</h1>
            {metricChips}
            {metricInfo}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {rangeButtons}
            {shareAndExport}
            {actions}
          </div>
        </div>
        <div className="absolute left-4 sm:left-6 right-4 sm:right-6 top-24 lg:top-[60px] export-hide">{readout}</div>
        {/* Below md the stat strip sits under the hero, so the chart runs to the bottom. */}
        <div className="absolute left-4 sm:left-6 right-4 sm:right-6 top-44 lg:top-[136px] bottom-4 md:bottom-[168px]">
          {chart}
        </div>
        {summary && (
          <div className="hidden md:block absolute left-4 sm:left-6 bottom-[140px] z-20">{summary}</div>
        )}
        <div className="absolute left-4 right-4 top-2 hidden export-show">{exportHeader}</div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="bg-card rounded-md border border-border p-4 sm:p-5">
      <div className="flex flex-col gap-3 mb-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-[14px] font-semibold text-foreground">Network charts</h2>
            <p className="text-[12px] text-muted-foreground export-hide">
              Pick up to three metrics to overlay across every Avalanche L1.
            </p>
          </div>
          <div className="flex items-center gap-2 export-hide">
            {rangeButtons}
            {shareAndExport}
          </div>
        </div>
        <div className="flex items-center gap-2 export-hide">
          {metricChips}
          <div className="ml-auto">{metricInfo}</div>
        </div>
        {exportHeader}
      </div>

      <div className="mb-3">{readout}</div>
      <div className="h-[300px] sm:h-[400px]">{chart}</div>

      {summary && <div className="mt-3">{summary}</div>}

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
