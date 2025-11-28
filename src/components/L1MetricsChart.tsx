import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { TPSHistory, NetworkTPS, CumulativeTxCount, DailyActiveAddresses } from '../types';
import { getTPSHistory, getNetworkTPS, getCumulativeTxCount, getDailyActiveAddresses } from '../api';
import { TrendingUp, ChevronDown, AlertTriangle } from 'lucide-react';
import { MetricsChart, DataPoint } from './MetricsChart';

interface L1MetricsChartProps {
  chainId?: string;
  chainName?: string;
  evmChainId?: string;
}

type MetricType = 'tps' | 'transactions' | 'activeAddresses';
type TimeframeOption = 7 | 14 | 30;

const METRICS = [
  { id: 'tps' as const, name: 'TPS' },
  { id: 'transactions' as const, name: 'Cumulative Transactions' },
  { id: 'activeAddresses' as const, name: 'Daily Active Addresses' },
];

export function L1MetricsChart({ chainId, chainName, evmChainId }: L1MetricsChartProps) {
  const [tpsHistory, setTpsHistory] = useState<TPSHistory[]>([]);
  const [txHistory, setTxHistory] = useState<CumulativeTxCount[]>([]);
  const [activeAddressesHistory, setActiveAddressesHistory] = useState<DailyActiveAddresses[]>([]);
  const [networkTPS, setNetworkTPS] = useState<NetworkTPS | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMetric, setSelectedMetric] = useState<MetricType>('tps');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [timeframe, setTimeframe] = useState<TimeframeOption>(7);

  // Generate fallback data with 0 values for the given timeframe
  const generateFallbackData = (days: number): TPSHistory[] => {
    const now = Math.floor(Date.now() / 1000);
    const dayInSeconds = 24 * 60 * 60;
    return Array.from({ length: days }, (_, i) => ({
      timestamp: now - (days - i - 1) * dayInSeconds,
      totalTps: 0,
      chainCount: 0
    }));
  };

  const generateFallbackTxData = (days: number): CumulativeTxCount[] => {
    const now = Math.floor(Date.now() / 1000);
    const dayInSeconds = 24 * 60 * 60;
    return Array.from({ length: days }, (_, i) => ({
      timestamp: now - (days - i - 1) * dayInSeconds,
      value: 0
    }));
  };

  const generateFallbackActiveAddressesData = (days: number): DailyActiveAddresses[] => {
    const now = Math.floor(Date.now() / 1000);
    const dayInSeconds = 24 * 60 * 60;
    return Array.from({ length: days }, (_, i) => ({
      timestamp: now - (days - i - 1) * dayInSeconds,
      activeAddresses: 0,
      transactions: 0
    }));
  };

  useEffect(() => {
    let mounted = true;

    async function fetchData() {
      try {
        setLoading(true);
        setError(null);
        
        const promises: Promise<any>[] = [];
        
        if (chainId) {
          promises.push(getTPSHistory(timeframe, chainId));
          promises.push(getCumulativeTxCount(chainId, timeframe));
          if (evmChainId && selectedMetric === 'activeAddresses') {
            promises.push(getDailyActiveAddresses(evmChainId, timeframe));
          } else if (selectedMetric === 'activeAddresses') {
            // Try using chainId as evmChainId if evmChainId is not provided
            promises.push(getDailyActiveAddresses(chainId, timeframe));
          }
        } else {
          promises.push(getTPSHistory(timeframe));
          promises.push(getNetworkTPS());
        }

        const results = await Promise.all(promises);

        if (mounted) {
          // Use fallback data if API returns empty arrays
          const tpsData = results[0] && results[0].length > 0
            ? results[0].sort((a, b) => a.timestamp - b.timestamp)
            : generateFallbackData(timeframe);
          setTpsHistory(tpsData);

          if (chainId) {
            const txData = results[1] && results[1].length > 0
              ? results[1]
              : generateFallbackTxData(timeframe);
            setTxHistory(txData);

            if ((evmChainId || selectedMetric === 'activeAddresses') && results[2]) {
              const activeAddressData = results[2].length > 0
                ? results[2]
                : generateFallbackActiveAddressesData(timeframe);
              setActiveAddressesHistory(activeAddressData);
            }
            setNetworkTPS(null);
          } else {
            setNetworkTPS(results[1]);
          }
        }
      } catch (err) {
        console.error('Error fetching data:', err);
        if (mounted) {
          // Use fallback data on error instead of showing error state
          setTpsHistory(generateFallbackData(timeframe));
          if (chainId) {
            setTxHistory(generateFallbackTxData(timeframe));
            setActiveAddressesHistory(generateFallbackActiveAddressesData(timeframe));
          }
          setError(null); // Don't show error, just use 0 values
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    fetchData();
    const interval = setInterval(fetchData, 15 * 60 * 1000);
    
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [chainId, evmChainId, timeframe, selectedMetric]);

  const formatValue = (value: number): string => {
    if (selectedMetric === 'tps') {
      return `${value.toFixed(2)}`;
    }
    if (selectedMetric === 'activeAddresses') {
      if (value >= 1_000_000) {
        return `${(value / 1_000_000).toFixed(2)}M`;
      }
      if (value >= 1_000) {
        return `${(value / 1_000).toFixed(2)}K`;
      }
      return value.toString();
    }
    if (value >= 1_000_000_000) {
      return `${(value / 1_000_000_000).toFixed(2)}B`;
    }
    if (value >= 1_000_000) {
      return `${(value / 1_000_000).toFixed(2)}M`;
    }
    if (value >= 1_000) {
      return `${(value / 1_000).toFixed(2)}K`;
    }
    return value.toFixed(2);
  };

  const getChartData = (): DataPoint[] => {
    if (selectedMetric === 'tps') {
      return tpsHistory.map(item => ({
        timestamp: item.timestamp,
        value: item.totalTps,
        metadata: {
          chainCount: item.chainCount
        }
      }));
    }
    if (selectedMetric === 'activeAddresses') {
      console.log('Active addresses data:', activeAddressesHistory);
      return activeAddressesHistory.map(item => ({
        timestamp: item.timestamp,
        value: item.activeAddresses,
        metadata: {
          transactions: item.transactions
        }
      }));
    }
    return txHistory.map(item => ({
      timestamp: item.timestamp,
      value: item.value
    }));
  };

  const tooltipFormatter = (dataPoint: DataPoint): string[] => {
    if (selectedMetric === 'tps') {
      const lines = [`TPS: ${dataPoint.value.toFixed(2)}`];
      if (!chainId && dataPoint.metadata?.chainCount) {
        lines.push(`Active Chains: ${dataPoint.metadata.chainCount}`);
      }
      return lines;
    }
    if (selectedMetric === 'activeAddresses') {
      const lines = [`Active Addresses: ${dataPoint.value.toLocaleString()}`];
      if (dataPoint.metadata?.transactions) {
        lines.push(`Transactions: ${dataPoint.metadata.transactions.toLocaleString()}`);
      }
      return lines;
    }
    return [`Transactions: ${dataPoint.value.toLocaleString()}`];
  };

  const latestValue = selectedMetric === 'tps' 
    ? tpsHistory[tpsHistory.length - 1]
    : selectedMetric === 'activeAddresses'
    ? activeAddressesHistory[activeAddressesHistory.length - 1]
    : txHistory[txHistory.length - 1];

  const lastUpdated = latestValue
    ? `Last updated: ${format(new Date(latestValue.timestamp * 1000), 'MMM d, h:mm a')}`
    : undefined;

  const handleMetricChange = (metric: MetricType) => {
    setSelectedMetric(metric);
    setIsDropdownOpen(false);
  };

  const handleTimeframeChange = (newTimeframe: TimeframeOption) => {
    setTimeframe(newTimeframe);
  };

  return (
    <div className="space-y-4">
      <MetricsChart
        title={chainId ? `${chainName || 'Chain'} Metrics` : 'Network-wide Metrics'}
        icon={<TrendingUp className="w-5 h-5 text-[#ef4444]" />}
        data={getChartData()}
        loading={loading && getChartData().length === 0 && (tpsHistory.length === 0 || (chainId && txHistory.length === 0))}
        error={error}
        onRetry={() => handleTimeframeChange(timeframe)}
        valueFormatter={formatValue}
        valueLabel={selectedMetric === 'tps' ? 'TPS' : ''}
        tooltipFormatter={tooltipFormatter}
        color={{
          line: selectedMetric === 'tps'
            ? 'rgb(239, 68, 68)' // Brand red #ef4444
            : selectedMetric === 'activeAddresses'
            ? 'rgb(34, 197, 94)' // Keep green for positive metrics
            : 'rgb(202, 138, 4)', // Keep yellow for warnings
          fill: selectedMetric === 'tps'
            ? 'rgba(239, 68, 68, 0.1)' // Brand red with opacity
            : selectedMetric === 'activeAddresses'
            ? 'rgba(34, 197, 94, 0.1)'
            : 'rgba(202, 138, 4, 0.1)'
        }}
        lastUpdated={lastUpdated}
        actions={
          <div className="flex items-center gap-3">
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
            </div>

            <div className="relative">
              <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-dark-700 hover:bg-gray-200 dark:hover:bg-dark-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 transition-colors"
              >
                {METRICS.find(m => m.id === selectedMetric)?.name}
                <ChevronDown className={`w-4 h-4 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
              </button>
              
              {isDropdownOpen && (
                <div 
                  className="absolute right-0 mt-1 w-48 bg-white dark:bg-dark-800 rounded-lg shadow-lg border border-gray-200 dark:border-dark-700 py-1 z-10"
                >
                  {METRICS.map(metric => (
                    <button
                      key={metric.id}
                      onClick={() => handleMetricChange(metric.id)}
                      className={`w-full text-left px-4 py-2 text-sm ${
                        selectedMetric === metric.id
                          ? 'bg-gray-100 dark:bg-dark-700 text-gray-900 dark:text-white'
                          : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-dark-700/50'
                      }`}
                    >
                      {metric.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        }
        additionalInfo={
          !chainId && networkTPS && selectedMetric === 'tps' ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Across {networkTPS.chainCount} active chains
            </p>
          ) : undefined
        }
      />
    </div>
  );
}