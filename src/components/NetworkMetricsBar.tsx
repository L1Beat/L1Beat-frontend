import React, { useEffect, useState } from 'react';
import { getNetworkTPS, getNetworkMaxTPSLatest, getNetworkTxCountLatest, getTeleporterMessages, getNetworkGasUsedLatest } from '../api';
import { NetworkTPS, MaxTPSLatest, DailyTxCountLatest, TeleporterMessageData, GasUsedLatest } from '../types';
import { Activity, BarChart3, TrendingUp, MessageSquare, Fuel } from 'lucide-react';

export function NetworkMetricsBar() {
  const [networkTPS, setNetworkTPS] = useState<NetworkTPS | null>(null);
  const [maxTPS, setMaxTPS] = useState<MaxTPSLatest | null>(null);
  const [dailyTxCount, setDailyTxCount] = useState<DailyTxCountLatest | null>(null);
  const [teleporterData, setTeleporterData] = useState<TeleporterMessageData | null>(null);
  const [gasUsed, setGasUsed] = useState<GasUsedLatest | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [networkTPSData, maxTPSData, dailyTxCountData, teleporterMessagesData, gasUsedData] = await Promise.all([
          getNetworkTPS(),
          getNetworkMaxTPSLatest(),
          getNetworkTxCountLatest(),
          getTeleporterMessages(),
          getNetworkGasUsedLatest()
        ]);
        
        setNetworkTPS(networkTPSData);
        setMaxTPS(maxTPSData);
        setDailyTxCount(dailyTxCountData);
        setTeleporterData(teleporterMessagesData);
        setGasUsed(gasUsedData);
      } catch (err) {
        console.error('Failed to fetch network metrics:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, []);

  const formatTPS = (tpsValue: number): string => {
    return Math.round(tpsValue).toString();
  };

  const formatNumber = (num: number): string => {
    if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(2)}B`;
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
    return num.toLocaleString();
  };

  if (loading) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
      {/* Network TPS */}
      {networkTPS && (
        <div className="bg-white dark:bg-dark-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 shadow-sm hover:border-[#ef4444]/50 transition-colors duration-300 flex items-center justify-between group">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#ef4444]/10 rounded-lg group-hover:bg-[#ef4444]/20 transition-colors">
              <Activity className="w-5 h-5 text-[#ef4444]" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400 font-medium group-hover:text-[#ef4444]/80 transition-colors">Daily Network TPS</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{formatTPS(networkTPS.totalTps)}</p>
            </div>
          </div>
        </div>
      )}

      {/* 24h Tx Count */}
      {dailyTxCount && (
        <div className="bg-white dark:bg-dark-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 shadow-sm hover:border-[#ef4444]/50 transition-colors duration-300 flex items-center justify-between group">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#ef4444]/10 rounded-lg group-hover:bg-[#ef4444]/20 transition-colors">
              <BarChart3 className="w-5 h-5 text-[#ef4444]" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400 font-medium group-hover:text-[#ef4444]/80 transition-colors">Daily Tx Count</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{formatNumber(dailyTxCount.value)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Max TPS */}
      {maxTPS && (
        <div className="bg-white dark:bg-dark-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 shadow-sm hover:border-[#ef4444]/50 transition-colors duration-300 flex items-center justify-between group">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#ef4444]/10 rounded-lg group-hover:bg-[#ef4444]/20 transition-colors">
              <TrendingUp className="w-5 h-5 text-[#ef4444]" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400 font-medium group-hover:text-[#ef4444]/80 transition-colors">Daily Max TPS</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{formatTPS(maxTPS.value)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Daily Gas Used */}
      {gasUsed && (
        <div className="bg-white dark:bg-dark-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 shadow-sm hover:border-[#ef4444]/50 transition-colors duration-300 flex items-center justify-between group">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#ef4444]/10 rounded-lg group-hover:bg-[#ef4444]/20 transition-colors">
              <Fuel className="w-5 h-5 text-[#ef4444]" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400 font-medium group-hover:text-[#ef4444]/80 transition-colors">Daily Gas Used</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{formatNumber(gasUsed.value)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Total Messages (ICM) */}
      {teleporterData && (
        <div className="bg-white dark:bg-dark-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 shadow-sm hover:border-[#ef4444]/50 transition-colors duration-300 flex items-center justify-between group">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#ef4444]/10 rounded-lg group-hover:bg-[#ef4444]/20 transition-colors">
              <MessageSquare className="w-5 h-5 text-[#ef4444]" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400 font-medium group-hover:text-[#ef4444]/80 transition-colors">Daily ICM Messages</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{formatNumber(teleporterData.messages.reduce((sum, msg) => sum + msg.value, 0))}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

