import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { TPSHistory, NetworkTPS, CumulativeTxCount, DailyActiveAddresses, DailyTxCount, MaxTPSHistory, GasUsedHistory, AvgGasPriceHistory, FeesPaidHistory } from '../types';
import { getTPSHistory, getNetworkTPS, getCumulativeTxCount, getDailyActiveAddresses, getNetworkTxCountHistory, getChainTxCountHistory, getChainMaxTPSHistory, getNetworkMaxTPSHistory, getNetworkGasUsedHistory, getChainGasUsedHistory, getNetworkAvgGasPriceHistory, getChainAvgGasPriceHistory, getChainFeesPaidHistory, getNetworkFeesPaidHistory } from '../api';
import { TrendingUp, ChevronDown, AlertTriangle } from 'lucide-react';
import { MetricsChart, DataPoint } from './MetricsChart';

interface L1MetricsChartProps {
  chainId?: string;
  chainName?: string;
  evmChainId?: string;
  tokenSymbol?: string;
}

type MetricType = 'tps' | 'transactions' | 'activeAddresses' | 'dailyTxCount' | 'maxTPS' | 'gasUsed' | 'avgGasPrice' | 'feesPaid';
type TimeframeOption = 7 | 14 | 30 | 90 | 360;

const METRICS = [
  { id: 'tps' as const, name: 'TPS' },
  { id: 'transactions' as const, name: 'Cumulative Transactions' },
  { id: 'activeAddresses' as const, name: 'Daily Active Addresses' },
  { id: 'dailyTxCount' as const, name: 'Daily Transaction Count' },
  { id: 'maxTPS' as const, name: 'Max TPS' },
  { id: 'gasUsed' as const, name: 'Daily Gas Used' },
  { id: 'avgGasPrice' as const, name: 'Avg Gas Price' },
  { id: 'feesPaid' as const, name: 'Fees Paid' },
];

export function L1MetricsChart({ chainId, chainName, evmChainId, tokenSymbol }: L1MetricsChartProps) {
  const [tpsHistory, setTpsHistory] = useState<TPSHistory[]>([]);
  const [txHistory, setTxHistory] = useState<CumulativeTxCount[]>([]);
  const [activeAddressesHistory, setActiveAddressesHistory] = useState<DailyActiveAddresses[]>([]);
  const [dailyTxCountHistory, setDailyTxCountHistory] = useState<DailyTxCount[]>([]);
  const [maxTPSHistory, setMaxTPSHistory] = useState<MaxTPSHistory[]>([]);
  const [gasUsedHistory, setGasUsedHistory] = useState<GasUsedHistory[]>([]);
  const [avgGasPriceHistory, setAvgGasPriceHistory] = useState<AvgGasPriceHistory[]>([]);
  const [feesPaidHistory, setFeesPaidHistory] = useState<FeesPaidHistory[]>([]);
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

  const generateFallbackDailyTxCountData = (days: number): DailyTxCount[] => {
    const now = Math.floor(Date.now() / 1000);
    const dayInSeconds = 24 * 60 * 60;
    return Array.from({ length: days }, (_, i) => ({
      timestamp: now - (days - i - 1) * dayInSeconds,
      value: 0
    }));
  };

  const generateFallbackMaxTPSData = (days: number): MaxTPSHistory[] => {
    const now = Math.floor(Date.now() / 1000);
    const dayInSeconds = 24 * 60 * 60;
    return Array.from({ length: days }, (_, i) => ({
      timestamp: now - (days - i - 1) * dayInSeconds,
      value: 0
    }));
  };

  const generateFallbackGasUsedData = (days: number): GasUsedHistory[] => {
    const now = Math.floor(Date.now() / 1000);
    const dayInSeconds = 24 * 60 * 60;
    return Array.from({ length: days }, (_, i) => ({
      timestamp: now - (days - i - 1) * dayInSeconds,
      value: 0
    }));
  };

  const generateFallbackAvgGasPriceData = (days: number): AvgGasPriceHistory[] => {
    const now = Math.floor(Date.now() / 1000);
    const dayInSeconds = 24 * 60 * 60;
    return Array.from({ length: days }, (_, i) => ({
      timestamp: now - (days - i - 1) * dayInSeconds,
      value: 0
    }));
  };

  const generateFallbackFeesPaidData = (days: number): FeesPaidHistory[] => {
    const now = Math.floor(Date.now() / 1000);
    const dayInSeconds = 24 * 60 * 60;
    return Array.from({ length: days }, (_, i) => ({
      timestamp: now - (days - i - 1) * dayInSeconds,
      value: 0
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
          if (selectedMetric === 'dailyTxCount') {
            promises.push(getChainTxCountHistory(chainId, timeframe));
          }
          if (selectedMetric === 'maxTPS') {
            promises.push(getChainMaxTPSHistory(chainId, timeframe));
          }
          if (selectedMetric === 'gasUsed') {
            promises.push(getChainGasUsedHistory(chainId, timeframe));
          }
          if (selectedMetric === 'avgGasPrice') {
            promises.push(getChainAvgGasPriceHistory(chainId, timeframe));
          }
          if (selectedMetric === 'feesPaid') {
            promises.push(getChainFeesPaidHistory(chainId, timeframe));
          }
        } else {
          promises.push(getTPSHistory(timeframe));
          promises.push(getNetworkTPS());
          if (selectedMetric === 'dailyTxCount') {
            promises.push(getNetworkTxCountHistory(timeframe));
          }
          if (selectedMetric === 'maxTPS') {
            promises.push(getNetworkMaxTPSHistory(timeframe));
          }
          if (selectedMetric === 'gasUsed') {
            promises.push(getNetworkGasUsedHistory(timeframe));
          }
          if (selectedMetric === 'avgGasPrice') {
            promises.push(getNetworkAvgGasPriceHistory(timeframe));
          }
          if (selectedMetric === 'feesPaid') {
            promises.push(getNetworkFeesPaidHistory(timeframe));
          }
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
            if (selectedMetric === 'dailyTxCount') {
              const dailyTxData = results[results.length - 1] && results[results.length - 1].length > 0
                ? results[results.length - 1]
                : generateFallbackDailyTxCountData(timeframe);
              setDailyTxCountHistory(dailyTxData);
            }
            if (selectedMetric === 'maxTPS') {
              const maxTPSData = results[results.length - 1] && results[results.length - 1].length > 0
                ? results[results.length - 1]
                : generateFallbackMaxTPSData(timeframe);
              setMaxTPSHistory(maxTPSData);
            }
            if (selectedMetric === 'gasUsed') {
              const gasUsedData = results[results.length - 1] && results[results.length - 1].length > 0
                ? results[results.length - 1]
                : generateFallbackGasUsedData(timeframe);
              setGasUsedHistory(gasUsedData);
            }
            if (selectedMetric === 'avgGasPrice') {
              const avgGasPriceData = results[results.length - 1] && results[results.length - 1].length > 0
                ? results[results.length - 1]
                : generateFallbackAvgGasPriceData(timeframe);
              setAvgGasPriceHistory(avgGasPriceData);
            }
            if (selectedMetric === 'feesPaid') {
              const feesPaidData = results[results.length - 1] && results[results.length - 1].length > 0
                ? results[results.length - 1]
                : generateFallbackFeesPaidData(timeframe);
              setFeesPaidHistory(feesPaidData);
            }
            setNetworkTPS(null);
          } else {
            setNetworkTPS(results[1]);
            if (selectedMetric === 'dailyTxCount') {
              const dailyTxData = results[2] && results[2].length > 0
                ? results[2]
                : generateFallbackDailyTxCountData(timeframe);
              setDailyTxCountHistory(dailyTxData);
            }
            if (selectedMetric === 'maxTPS') {
              const maxTPSData = results[2] && results[2].length > 0
                ? results[2]
                : generateFallbackMaxTPSData(timeframe);
              setMaxTPSHistory(maxTPSData);
            }
            if (selectedMetric === 'gasUsed') {
              const gasUsedData = results[2] && results[2].length > 0
                ? results[2]
                : generateFallbackGasUsedData(timeframe);
              setGasUsedHistory(gasUsedData);
            }
            if (selectedMetric === 'avgGasPrice') {
              const avgGasPriceData = results[2] && results[2].length > 0
                ? results[2]
                : generateFallbackAvgGasPriceData(timeframe);
              setAvgGasPriceHistory(avgGasPriceData);
            }
            if (selectedMetric === 'feesPaid') {
              const feesPaidData = results[2] && results[2].length > 0
                ? results[2]
                : generateFallbackFeesPaidData(timeframe);
              setFeesPaidHistory(feesPaidData);
            }
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
            if (selectedMetric === 'dailyTxCount') {
              setDailyTxCountHistory(generateFallbackDailyTxCountData(timeframe));
            }
            if (selectedMetric === 'maxTPS') {
              setMaxTPSHistory(generateFallbackMaxTPSData(timeframe));
            }
            if (selectedMetric === 'gasUsed') {
              setGasUsedHistory(generateFallbackGasUsedData(timeframe));
            }
            if (selectedMetric === 'avgGasPrice') {
              setAvgGasPriceHistory(generateFallbackAvgGasPriceData(timeframe));
            }
            if (selectedMetric === 'feesPaid') {
              setFeesPaidHistory(generateFallbackFeesPaidData(timeframe));
            }
          } else {
            if (selectedMetric === 'dailyTxCount') {
              setDailyTxCountHistory(generateFallbackDailyTxCountData(timeframe));
            }
            if (selectedMetric === 'maxTPS') {
              setMaxTPSHistory(generateFallbackMaxTPSData(timeframe));
            }
            if (selectedMetric === 'gasUsed') {
              setGasUsedHistory(generateFallbackGasUsedData(timeframe));
            }
            if (selectedMetric === 'avgGasPrice') {
              setAvgGasPriceHistory(generateFallbackAvgGasPriceData(timeframe));
            }
            if (selectedMetric === 'feesPaid') {
              setFeesPaidHistory(generateFallbackFeesPaidData(timeframe));
            }
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
    if (selectedMetric === 'dailyTxCount') {
      if (value >= 1_000_000_000) {
        return `${(value / 1_000_000_000).toFixed(2)}B`;
      }
      if (value >= 1_000_000) {
        return `${(value / 1_000_000).toFixed(2)}M`;
      }
      if (value >= 1_000) {
        return `${(value / 1_000).toFixed(2)}K`;
      }
      return value.toLocaleString();
    }
    if (selectedMetric === 'maxTPS') {
      return value.toFixed(2);
    }
    if (selectedMetric === 'gasUsed') {
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
    }
    if (selectedMetric === 'avgGasPrice') {
      return value.toFixed(2);
    }
    if (selectedMetric === 'feesPaid') {
      if (value >= 1_000_000) {
        return `${(value / 1_000_000).toFixed(2)}M`;
      }
      if (value >= 1_000) {
        return `${(value / 1_000).toFixed(2)}K`;
      }
      return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
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
    if (selectedMetric === 'dailyTxCount') {
      return dailyTxCountHistory.map(item => ({
        timestamp: item.timestamp,
        value: item.value
      }));
    }
    if (selectedMetric === 'maxTPS') {
      return maxTPSHistory.map(item => ({
        timestamp: item.timestamp,
        value: item.value
      }));
    }
    if (selectedMetric === 'gasUsed') {
      return gasUsedHistory.map(item => ({
        timestamp: item.timestamp,
        value: item.value
      }));
    }
    if (selectedMetric === 'avgGasPrice') {
      return avgGasPriceHistory.map(item => ({
        timestamp: item.timestamp,
        value: item.value
      }));
    }
    if (selectedMetric === 'feesPaid') {
      return feesPaidHistory.map(item => ({
        timestamp: item.timestamp,
        value: item.value
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
    if (selectedMetric === 'dailyTxCount') {
      return [`Transactions: ${dataPoint.value.toLocaleString()}`];
    }
    if (selectedMetric === 'maxTPS') {
      return [`Max TPS: ${dataPoint.value.toFixed(2)}`];
    }
    if (selectedMetric === 'gasUsed') {
      return [`Gas Used: ${dataPoint.value.toLocaleString()}`];
    }
    if (selectedMetric === 'avgGasPrice') {
      return [`Avg Gas Price: ${dataPoint.value.toFixed(2)} n${tokenSymbol || 'AVAX'}`];
    }
    if (selectedMetric === 'feesPaid') {
      return [`Fees Paid: ${dataPoint.value.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${tokenSymbol || 'AVAX'}`];
    }
    return [`Transactions: ${dataPoint.value.toLocaleString()}`];
  };

  const latestValue = selectedMetric === 'tps' 
    ? tpsHistory[tpsHistory.length - 1]
    : selectedMetric === 'activeAddresses'
    ? activeAddressesHistory[activeAddressesHistory.length - 1]
    : selectedMetric === 'dailyTxCount'
    ? dailyTxCountHistory[dailyTxCountHistory.length - 1]
    : selectedMetric === 'maxTPS'
    ? maxTPSHistory[maxTPSHistory.length - 1]
    : selectedMetric === 'gasUsed'
    ? gasUsedHistory[gasUsedHistory.length - 1]
    : selectedMetric === 'avgGasPrice'
    ? avgGasPriceHistory[avgGasPriceHistory.length - 1]
    : selectedMetric === 'feesPaid'
    ? feesPaidHistory[feesPaidHistory.length - 1]
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
        tooltipFormatter={tooltipFormatter}
        color={{
          line: 'rgb(239, 68, 68)', // Brand red #ef4444
          fill: 'rgba(239, 68, 68, 0.1)' // Brand red with opacity
        }}
        valueLabel={
          selectedMetric === 'tps' ? 'TPS' : 
          selectedMetric === 'avgGasPrice' ? `n${tokenSymbol || 'AVAX'}` : 
          selectedMetric === 'feesPaid' ? (tokenSymbol || 'AVAX') :
          ''
        }
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