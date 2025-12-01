import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { TPSHistory, CumulativeTxCount, DailyActiveAddresses } from '../types';
import { getTPSHistory, getCumulativeTxCount, getDailyActiveAddresses } from '../api';
import { Activity, TrendingUp, Users } from 'lucide-react';
import { MetricsChart, DataPoint } from './MetricsChart';

interface SeparateMetricsChartsProps {
  chainId: string;
  chainName?: string;
  evmChainId?: string;
}

type TimeframeOption = 7 | 14 | 30;

export function SeparateMetricsCharts({ chainId, chainName, evmChainId }: SeparateMetricsChartsProps) {
  const [tpsHistory, setTpsHistory] = useState<TPSHistory[]>([]);
  const [txHistory, setTxHistory] = useState<CumulativeTxCount[]>([]);
  const [activeAddressesHistory, setActiveAddressesHistory] = useState<DailyActiveAddresses[]>([]);
  const [loading, setLoading] = useState({ tps: true, tx: true, addresses: true });
  const [error, setError] = useState({ tps: null as string | null, tx: null as string | null, addresses: null as string | null });
  const [timeframe, setTimeframe] = useState<TimeframeOption>(7);

  useEffect(() => {
    let mounted = true;

    async function fetchData() {
      try {
        setLoading({ tps: true, tx: true, addresses: true });
        setError({ tps: null, tx: null, addresses: null });

        const [tpsData, txData, addressesData] = await Promise.allSettled([
          getTPSHistory(timeframe, chainId),
          getCumulativeTxCount(chainId, timeframe),
          getDailyActiveAddresses(evmChainId || chainId, timeframe),
        ]);

        if (mounted) {
          if (tpsData.status === 'fulfilled') {
            setTpsHistory(tpsData.value.sort((a, b) => a.timestamp - b.timestamp));
            setLoading(prev => ({ ...prev, tps: false }));
          } else {
            setError(prev => ({ ...prev, tps: 'Failed to fetch TPS data' }));
            setLoading(prev => ({ ...prev, tps: false }));
          }

          if (txData.status === 'fulfilled') {
            setTxHistory(txData.value);
            setLoading(prev => ({ ...prev, tx: false }));
          } else {
            setError(prev => ({ ...prev, tx: 'Failed to fetch transaction data' }));
            setLoading(prev => ({ ...prev, tx: false }));
          }

          if (addressesData.status === 'fulfilled') {
            setActiveAddressesHistory(addressesData.value);
            setLoading(prev => ({ ...prev, addresses: false }));
          } else {
            setError(prev => ({ ...prev, addresses: 'Failed to fetch active addresses data' }));
            setLoading(prev => ({ ...prev, addresses: false }));
          }
        }
      } catch (err) {
        console.error('Error fetching metrics:', err);
        if (mounted) {
          setLoading({ tps: false, tx: false, addresses: false });
        }
      }
    }

    fetchData();
    const interval = setInterval(fetchData, 15 * 60 * 1000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [chainId, evmChainId, timeframe]);

  const handleTimeframeChange = (newTimeframe: TimeframeOption) => {
    setTimeframe(newTimeframe);
  };

  // TPS Chart
  const tpsData: DataPoint[] = tpsHistory.map(item => ({
    timestamp: item.timestamp,
    value: item.totalTps,
    metadata: { chainCount: item.chainCount }
  }));

  const tpsLatest = tpsHistory[tpsHistory.length - 1];
  const tpsLastUpdated = tpsLatest
    ? `Last updated: ${format(new Date(tpsLatest.timestamp * 1000), 'MMM d, h:mm a')}`
    : undefined;

  // Cumulative Transactions Chart
  const txData: DataPoint[] = txHistory.map(item => ({
    timestamp: item.timestamp,
    value: item.value
  }));

  const txLatest = txHistory[txHistory.length - 1];
  const txLastUpdated = txLatest
    ? `Last updated: ${format(new Date(txLatest.timestamp * 1000), 'MMM d, h:mm a')}`
    : undefined;

  // Daily Active Addresses Chart
  const addressData: DataPoint[] = activeAddressesHistory.map(item => ({
    timestamp: item.timestamp,
    value: item.activeAddresses,
    metadata: { transactions: item.transactions }
  }));

  const addressLatest = activeAddressesHistory[activeAddressesHistory.length - 1];
  const addressLastUpdated = addressLatest
    ? `Last updated: ${format(new Date(addressLatest.timestamp * 1000), 'MMM d, h:mm a')}`
    : undefined;

  return (
    <div className="space-y-6">
      {/* Shared Timeframe Controls */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Performance Metrics</h3>
        <div className="bg-gray-100 dark:bg-dark-700 rounded-full p-1 flex">
          <button
            onClick={() => handleTimeframeChange(7)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              timeframe === 7
                ? 'bg-[#ef4444] text-white'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-dark-600'
            }`}
          >
            7 Days
          </button>
          <button
            onClick={() => handleTimeframeChange(14)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              timeframe === 14
                ? 'bg-[#ef4444] text-white'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-dark-600'
            }`}
          >
            14 Days
          </button>
          <button
            onClick={() => handleTimeframeChange(30)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              timeframe === 30
                ? 'bg-[#ef4444] text-white'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-dark-600'
            }`}
          >
            30 Days
          </button>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* TPS Chart */}
        <MetricsChart
          title="TPS"
          icon={<Activity className="w-5 h-5 text-[#ef4444]" />}
          data={tpsData}
          loading={loading.tps}
          error={error.tps}
          onRetry={() => handleTimeframeChange(timeframe)}
          valueFormatter={(value) => value.toFixed(2)}
          valueLabel="TPS"
          tooltipFormatter={(dataPoint) => [`TPS: ${dataPoint.value.toFixed(2)}`]}
          color={{
            line: 'rgb(99, 102, 241)',
            fill: 'rgba(99, 102, 241, 0.1)'
          }}
          lastUpdated={tpsLastUpdated}
        />

        {/* Cumulative Transactions Chart */}
        <MetricsChart
          title="Cumulative Txs"
          icon={<TrendingUp className="w-5 h-5 text-yellow-500" />}
          data={txData}
          loading={loading.tx}
          error={error.tx}
          onRetry={() => handleTimeframeChange(timeframe)}
          valueFormatter={(value) => {
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
          }}
          valueLabel=""
          tooltipFormatter={(dataPoint) => [`Transactions: ${dataPoint.value.toLocaleString()}`]}
          color={{
            line: 'rgb(202, 138, 4)',
            fill: 'rgba(202, 138, 4, 0.1)'
          }}
          lastUpdated={txLastUpdated}
        />

        {/* Daily Active Addresses Chart */}
        <MetricsChart
          title="Active Addresses"
          icon={<Users className="w-5 h-5 text-green-500" />}
          data={addressData}
          loading={loading.addresses}
          error={error.addresses}
          onRetry={() => handleTimeframeChange(timeframe)}
          valueFormatter={(value) => {
            if (value >= 1_000_000) {
              return `${(value / 1_000_000).toFixed(2)}M`;
            }
            if (value >= 1_000) {
              return `${(value / 1_000).toFixed(2)}K`;
            }
            return value.toString();
          }}
          valueLabel=""
          tooltipFormatter={(dataPoint) => {
            const lines = [`Active Addresses: ${dataPoint.value.toLocaleString()}`];
            if (dataPoint.metadata?.transactions) {
              lines.push(`Transactions: ${dataPoint.metadata.transactions.toLocaleString()}`);
            }
            return lines;
          }}
          color={{
            line: 'rgb(34, 197, 94)',
            fill: 'rgba(34, 197, 94, 0.1)'
          }}
          lastUpdated={addressLastUpdated}
        />
      </div>
    </div>
  );
}
