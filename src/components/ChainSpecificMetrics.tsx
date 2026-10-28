import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { format } from 'date-fns';
import html2canvas from 'html2canvas';
import { useSearchParams } from 'react-router-dom';
import { getAllChainsCumulativeTxCountLatest, getChains, getChainTxCountHistory, getChainMaxTPSHistory, getChainGasUsedHistory, getChainAvgGasPriceHistory, getChainFeesPaidHistory, getDailyActiveAddresses } from '../api';
import { Chain } from '../types';
import { ChevronDown, BarChart3, Users, Activity, Fuel, Download, Share2 } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';
import { DailyBars, SeriesSummary, parseDay } from './instrument';
import { LoadingSpinner } from './LoadingSpinner';

type TimeframeOption = 30 | 90 | 360;

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
  avgGasPrice: { main: 'rgb(20, 184, 166)', fill: 'rgba(20, 184, 166, 0.15)' },
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [chains, setChains] = useState<Chain[]>([]);
  const [selectedChain, setSelectedChain] = useState<Chain | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [metricsData, setMetricsData] = useState<Record<string, MetricData[]>>({});
  const [dailyActiveLatestByChainId, setDailyActiveLatestByChainId] = useState<Record<string, number>>({});
  const chartContainerRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [copied, setCopied] = useState(false);

  // Range selection states for each metric
  const [rangeStates, setRangeStates] = useState<Record<string, { start: number; end: number }>>({});
  // Export dropdown states for each metric
  const [exportDropdownStates, setExportDropdownStates] = useState<Record<string, boolean>>({});

  const isDark = theme === 'dark';

  // Read timeframe from URL
  const timeframeParam = searchParams.get('chainMetricsTimeframe');
  const timeframe = useMemo(() => {
    const parsed = parseInt(timeframeParam || '30', 10);
    if ([30, 90, 360].includes(parsed)) {
      return parsed as TimeframeOption;
    }
    return 30 as TimeframeOption;
  }, [timeframeParam]);

  // Read chain from URL
  const chainParam = searchParams.get('chainMetricsChain');

  // Update URL with current state
  const updateUrl = useCallback((chainId: string | null, newTimeframe?: number) => {
    const newParams = new URLSearchParams(searchParams);
    if (chainId) {
      newParams.set('chainMetricsChain', chainId);
    } else {
      newParams.delete('chainMetricsChain');
    }
    if (newTimeframe && newTimeframe !== 30) {
      newParams.set('chainMetricsTimeframe', String(newTimeframe));
    } else if (newTimeframe === 30) {
      newParams.delete('chainMetricsTimeframe');
    }
    setSearchParams(newParams, { replace: true });
  }, [searchParams, setSearchParams]);

  // Handle timeframe change
  const handleTimeframeChange = useCallback((newTimeframe: TimeframeOption) => {
    updateUrl(selectedChain?.chainId || null, newTimeframe);
  }, [selectedChain, updateUrl]);

  // Handle chain change
  const handleChainChange = useCallback((chain: Chain) => {
    setSelectedChain(chain);
    updateUrl(chain.chainId, timeframe);
  }, [timeframe, updateUrl]);

  // Share button handler
  const handleShare = useCallback(() => {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      console.warn('Clipboard write failed');
    });
  }, []);

  // Note: there's no bulk "active addresses latest" endpoint; we compute this client-side
  // with a bounded number of requests (cached) to avoid hammering the API.
  const topChainsByDailyActive = useMemo(() => {
    const getLatest = (c: Chain) => Number(dailyActiveLatestByChainId[c.chainId] ?? 0);
    const sorted = [...chains].sort((a, b) => {
      const aVal = getLatest(a);
      const bVal = getLatest(b);
      if (bVal !== aVal) return bVal - aVal;
      return a.chainName.localeCompare(b.chainName);
    });

    const top = sorted.slice(0, 6);
    if (selectedChain && !top.some(c => c.chainId === selectedChain.chainId)) top.push(selectedChain);
    return top;
  }, [chains, selectedChain, dailyActiveLatestByChainId]);

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
          // Stable tie-breaker (prevents "random" feeling when many are 0)
          return a.chainName.localeCompare(b.chainName);
        });
        setChains(sortedChains);

        // Check if URL has a chain param and find that chain
        if (chainParam) {
          const chainFromUrl = sortedChains.find(c => c.chainId === chainParam);
          if (chainFromUrl) {
            setSelectedChain(chainFromUrl);
            return;
          }
        }

        // Default to C-Chain or first chain
        const cChain = sortedChains.find(isCChain);
        setSelectedChain(cChain || sortedChains[0]);
      } catch (err) {
        console.error('Failed to fetch chains:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchChains();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync selected chain from URL param when chains are already loaded
  useEffect(() => {
    if (!chainParam || chains.length === 0) return;
    const chainFromUrl = chains.find(c => c.chainId === chainParam);
    if (chainFromUrl && chainFromUrl.chainId !== selectedChain?.chainId) {
      setSelectedChain(chainFromUrl);
    }
  }, [chainParam, chains, selectedChain?.chainId]);

  // Background: compute latest daily active addresses per chain for ranking the quick-select row.
  useEffect(() => {
    if (!chains.length) return;

    let cancelled = false;

    const getActiveAddressLookupId = (chain: Chain) =>
      (chain.evmChainId ? String(chain.evmChainId) : undefined) || chain.originalChainId || chain.chainId;

    // Limit to a reasonable subset first (already sorted with C-Chain first and by cumulative tx),
    // so we don't fire a request for every chain on initial load.
    const candidateChains = chains.slice(0, 25);

    async function run() {
      const concurrency = 6;
      const queue = [...candidateChains];
      const results: Record<string, number> = {};

      async function worker() {
        while (queue.length && !cancelled) {
          const chain = queue.shift();
          if (!chain) return;

          const lookupId = getActiveAddressLookupId(chain);
          if (!lookupId) continue;

          try {
            const data = await getDailyActiveAddresses(lookupId, 7);
            const latest = data?.[data.length - 1];
            const value = Number(latest?.activeAddresses ?? (latest as { value?: number } | undefined)?.value ?? 0);
            results[chain.chainId] = Number.isFinite(value) ? value : 0;
          } catch {
            results[chain.chainId] = 0;
          }
        }
      }

      await Promise.all(Array.from({ length: concurrency }, () => worker()));
      if (cancelled) return;

      setDailyActiveLatestByChainId(prev => ({ ...prev, ...results }));
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [chains]);

  // Load metrics when chain or timeframe changes
  useEffect(() => {
    if (!selectedChain) return;

    async function fetchMetrics() {
      if (!selectedChain) return;
      const chainId = selectedChain.originalChainId || selectedChain.chainId;
      const evmChainIdStr = selectedChain.evmChainId ? String(selectedChain.evmChainId) : chainId;

      // Each series drops today's unfinished day; ask for one more so the
      // window is full.
      const fetchDays = timeframe + 1;
      const full = <T,>(xs: T[]) => xs.slice(-timeframe);

      try {
        const [
          activeAddresses,
          dailyTxCount,
          maxTPS,
          gasUsed,
          avgGasPrice,
          feesPaid
        ] = await Promise.all([
          getDailyActiveAddresses(evmChainIdStr, fetchDays).catch(() => []),
          getChainTxCountHistory(chainId, fetchDays).catch(() => []),
          getChainMaxTPSHistory(chainId, fetchDays).catch(() => []),
          getChainGasUsedHistory(chainId, fetchDays).catch(() => []),
          getChainAvgGasPriceHistory(chainId, fetchDays).catch(() => []),
          getChainFeesPaidHistory(chainId, fetchDays).catch(() => [])
        ]);

        // Transform all data to MetricData format
        const transformData = (data: any[]): MetricData[] => {
          return data.map(item => {
            const timestamp = item.timestamp;
            // UTC day: a local format would label every bar a day early west of UTC.
            const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
            const value = item.value !== undefined ? item.value : (item.activeAddresses || 0);
            return { timestamp, date, value };
          });
        };

        const newMetricsData: Record<string, MetricData[]> = {
          dailyActiveAddresses: full(transformData(activeAddresses)),
          dailyTxCount: full(transformData(dailyTxCount)),
          maxTPS: full(transformData(maxTPS)),
          gasUsed: full(transformData(gasUsed)),
          avgGasPrice: full(transformData(avgGasPrice)),
          feesPaid: full(transformData(feesPaid)),
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
  const handleDownloadPNG = useCallback(async (metricId: MetricType) => {
    const container = chartContainerRefs.current[metricId];
    if (!container || !selectedChain) return;

    const metric = METRICS.find(m => m.id === metricId);
    if (!metric) return;

    try {
      container.classList.add('exporting');
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

      const canvas = await html2canvas(container, {
        backgroundColor: isDark ? '#0f172a' : '#ffffff',
        scale: 2,
        useCORS: true,
      });

      container.classList.remove('exporting');

      const link = document.createElement('a');
      link.download = `${selectedChain.chainName}-${metric.name.replace(/\s+/g, '-')}-${timeframe}d.png`;
      link.href = canvas.toDataURL('image/png', 1);
      link.click();
    } catch (err) {
      console.error('Failed to export PNG:', err);
      container.classList.remove('exporting');
    }
    setExportDropdownStates(prev => ({ ...prev, [metricId]: false }));
  }, [selectedChain, timeframe, isDark]);

  // Create chart component for each metric
  const renderMetricChart = (metricId: MetricType) => {
    const metric = METRICS.find(m => m.id === metricId);
    if (!metric) return null;

    const data = metricsData[metricId] || [];
    const rangeState = rangeStates[metricId];
    if (!rangeState || data.length === 0) return null;

    const { start, end } = rangeState;
    const filteredData = data.slice(start, end + 1);

    return (
      <ChainMetricCard
        key={metricId}
        metric={metric}
        data={filteredData}
        containerRef={(el) => { chartContainerRefs.current[metricId] = el; }}
        exportHeader={
          <div className="export-show hidden items-center justify-between mb-2">
            <span className="text-sm font-medium text-muted-foreground">{selectedChain?.chainName}</span>
            <span className="text-sm text-muted-foreground">
              {timeframe === 360 ? '1Y' : `${timeframe}D`}, {format(new Date(), 'MMM d, yyyy')}
            </span>
          </div>
        }
        exportMenu={
          <div className="relative export-hide">
            <button
              onClick={() => toggleExportDropdown(metricId)}
              className="inline-flex items-center justify-center w-7 h-7 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title="Export chart"
              aria-label="Export chart"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
            {exportDropdownStates[metricId] && (
              <div className="absolute right-0 mt-1 w-40 bg-popover border border-border rounded shadow-lg z-10 py-1">
                <button
                  onClick={() => handleDownloadPNG(metricId)}
                  className="w-full px-3 h-8 text-left text-[12px] hover:bg-accent transition-colors flex items-center gap-2"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export as PNG
                </button>
                <button
                  onClick={() => handleDownloadCSV(metricId)}
                  className="w-full px-3 h-8 text-left text-[12px] hover:bg-accent transition-colors flex items-center gap-2"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export as CSV
                </button>
              </div>
            )}
          </div>
        }
      />
    );
  };

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-md p-8">
        <div className="flex items-center justify-center">
          <LoadingSpinner size="lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Section Header with Chain Selector */}
      <div className="border-b border-border pb-4">
        <div className="flex flex-col gap-3">
          {/* Top row: Title + dropdown */}
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-semibold text-foreground">Chain-specific metrics</h2>
              <p className="text-[12px] text-muted-foreground">One chain at a time. Pick from the list or the most active chains.</p>
            </div>

            {/* Chain Selector Dropdown */}
            <div className="relative">
              <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="w-full sm:w-64 h-8 px-3 bg-background border border-border rounded flex items-center justify-between hover:border-foreground/30 transition-colors"
              >
                <span className="text-[12px] font-medium text-foreground truncate">
                  {selectedChain?.chainName || 'Select Chain'}
                </span>
                <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {isDropdownOpen && (
                <div className="absolute right-0 mt-2 w-full sm:w-72 bg-card border border-border rounded-md shadow-lg z-10 max-h-80 overflow-y-auto">
                  {chains.map((chain) => (
                    <button
                      key={chain.chainId}
                      onClick={() => {
                        handleChainChange(chain);
                        setIsDropdownOpen(false);
                      }}
                      className={`w-full px-3 py-2 text-left text-[12px] hover:bg-accent/50 transition-colors ${
                        selectedChain?.chainId === chain.chainId
                          ? 'bg-accent text-foreground font-medium'
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

          {/* Second row: Top chains + timeframe */}
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            {/* Quick select: top chains by Daily Active Addresses */}
            {topChainsByDailyActive.length > 0 && (
              <div className="flex items-center gap-3">
                <div className="shrink-0">
                  <div className="text-xs font-medium text-muted-foreground">Top chains</div>
                  <div className="text-[11px] text-muted-foreground/80">by daily active addresses</div>
                </div>
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
                  {topChainsByDailyActive.map((chain) => {
                    const isActive = selectedChain?.chainId === chain.chainId;
                    const logoSrc = chain.chainLogoUri || '/icon-dark-animated.svg';
                    const latestDAA = Number(dailyActiveLatestByChainId[chain.chainId] ?? 0);
                    return (
                      <button
                        key={chain.chainId}
                        onClick={() => {
                          handleChainChange(chain);
                          setIsDropdownOpen(false);
                        }}
                        title={`${chain.chainName}${Number.isFinite(latestDAA) && latestDAA > 0 ? ` • ${latestDAA.toLocaleString()} DAA` : ''}`}
                        className={[
                          'h-9 w-9 rounded border transition-colors flex items-center justify-center shrink-0',
                          'bg-background hover:bg-accent/50',
                          isActive
                            ? 'border-foreground/60'
                            : 'border-border hover:border-foreground/30'
                        ].join(' ')}
                      >
                        <img
                          src={logoSrc}
                          alt={chain.chainName}
                          className="h-6 w-6 rounded bg-muted/30"
                          onError={(e) => {
                            e.currentTarget.src = '/icon-dark-animated.svg';
                            e.currentTarget.onerror = null;
                          }}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Timeframe Selector + Share */}
            <div className="flex flex-wrap items-center gap-1.5 justify-start lg:justify-end">
              {[30, 90, 360].map((days) => (
                <button
                  key={days}
                  onClick={() => handleTimeframeChange(days as TimeframeOption)}
                  className={`h-8 px-3 rounded text-xs font-medium border transition-colors ${
                    timeframe === days
                      ? 'bg-foreground border-foreground text-background'
                      : 'bg-card border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {days === 360 ? '1Y' : `${days}D`}
                </button>
              ))}

              {/* Share Button */}
              <button
                onClick={handleShare}
                className="p-2 rounded-md bg-muted/40 border border-border hover:bg-muted/70 hover:border-foreground/30 transition-all ml-2"
                title="Share this view"
              >
                {copied ? (
                  <span className="text-xs font-medium text-up px-1">Copied!</span>
                ) : (
                  <Share2 className="w-4 h-4 text-muted-foreground" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Metrics Charts Grid */}
      {selectedChain && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {METRICS.map(metric => renderMetricChart(metric.id))}
        </div>
      )}
    </div>
  );
}

/**
 * One metric as daily bars. The headline shows the latest day, or the hovered
 * day while the pointer is over the chart.
 */
function ChainMetricCard({
  metric,
  data,
  containerRef,
  exportHeader,
  exportMenu,
}: {
  metric: (typeof METRICS)[number];
  data: MetricData[];
  containerRef: (el: HTMLDivElement | null) => void;
  exportHeader: React.ReactNode;
  exportMenu: React.ReactNode;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const values = useMemo(() => data.map((d) => d.value), [data]);
  const dates = useMemo(() => data.map((d) => d.date), [data]);
  const i = hoverIdx ?? data.length - 1;
  const point = data[i];
  const Icon = metric.icon;

  return (
    <div ref={containerRef} className="bg-card rounded-md border border-border p-4">
      {exportHeader}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h3 className="text-[12px] text-muted-foreground leading-4 flex items-center gap-1.5">
            <Icon className="w-3.5 h-3.5" style={{ color: metric.color.main }} />
            {metric.name}
          </h3>
          <p className="num text-[22px] leading-7 font-medium text-foreground">
            {point ? metric.valueFormatter(point.value) : '—'}
            {metric.unit && <span className="font-sans text-[11px] ml-1.5 text-muted-foreground">{metric.unit}</span>}
          </p>
          {point && (
            <p className="text-[11px] text-muted-foreground leading-4">
              {hoverIdx == null ? 'Latest, ' : ''}
              {format(parseDay(point.date), hoverIdx == null ? 'MMM d' : 'EEE, MMM d, yyyy')}
            </p>
          )}
        </div>
        {exportMenu}
      </div>

      <div className="h-[220px]">
        <DailyBars
          values={values}
          dates={dates}
          color={metric.color.main}
          format={(v) => metric.valueFormatter(v)}
          onHover={setHoverIdx}
        />
      </div>

      {data.length > 1 && (
        <SeriesSummary
          values={values}
          format={(v) => metric.valueFormatter(v)}
          className="mt-2 export-hide"
        />
      )}
    </div>
  );
}
