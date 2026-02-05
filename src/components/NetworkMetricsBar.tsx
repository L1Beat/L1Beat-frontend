import React, { useEffect, useState } from 'react';
import { getTPSHistory, getNetworkMaxTPSHistory, getNetworkTxCountHistory, getTeleporterMessages, getNetworkValidatorTotal } from '../api';
import { NetworkTPS, MaxTPSLatest, DailyTxCountLatest, TeleporterMessageData, NetworkValidatorTotal } from '../types';
import { Activity, BarChart3, TrendingUp, MessageSquare, Users } from 'lucide-react';

export function NetworkMetricsBar() {
  const [networkTPS, setNetworkTPS] = useState<NetworkTPS | null>(null);
  const [maxTPS, setMaxTPS] = useState<MaxTPSLatest | null>(null);
  const [dailyTxCount, setDailyTxCount] = useState<DailyTxCountLatest | null>(null);
  const [teleporterData, setTeleporterData] = useState<TeleporterMessageData | null>(null);
  const [validatorTotal, setValidatorTotal] = useState<NetworkValidatorTotal | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch last 2 days of history to compare today vs yesterday
        const [tpsHistory, maxTPSHistory, txCountHistory, teleporterMessagesData, validatorTotalData] = await Promise.all([
          getTPSHistory(2),
          getNetworkMaxTPSHistory(2),
          getNetworkTxCountHistory(2),
          getTeleporterMessages(),
          getNetworkValidatorTotal()
        ]);

        // Get most recent complete day's data (use yesterday if today's data is low/incomplete)
        const getMostRecentCompleteData = <T extends { timestamp: number; value?: number; totalTps?: number }>(
          history: T[]
        ): T | null => {
          if (!history || history.length === 0) return null;

          // Sort by timestamp descending (most recent first)
          const sorted = [...history].sort((a, b) => b.timestamp - a.timestamp);

          // Check if we're early in the day (less than 6 hours since midnight UTC)
          const now = new Date();
          const hoursSinceMidnight = now.getUTCHours() + now.getUTCMinutes() / 60;
          const isEarlyInDay = hoursSinceMidnight < 6;

          // If early in the day or today's data is very low, use yesterday's data
          const todayData = sorted[0];
          const yesterdayData = sorted[1];
          const todayValue = todayData?.value ?? todayData?.totalTps ?? 0;

          if (isEarlyInDay && yesterdayData) {
            return yesterdayData;
          }

          // If today's data is suspiciously low compared to yesterday (< 20% of yesterday), use yesterday
          if (yesterdayData) {
            const yesterdayValue = yesterdayData.value ?? yesterdayData.totalTps ?? 0;
            if (yesterdayValue > 0 && todayValue < yesterdayValue * 0.2) {
              return yesterdayData;
            }
          }

          return todayData;
        };

        // Convert TPS history to NetworkTPS format
        const tpsData = getMostRecentCompleteData(tpsHistory);
        if (tpsData) {
          setNetworkTPS({
            totalTps: tpsData.totalTps ?? 0,
            chainCount: tpsData.chainCount ?? 0,
            timestamp: tpsData.timestamp,
            lastUpdate: new Date(tpsData.timestamp * 1000).toISOString(),
            dataAge: 0,
            dataAgeUnit: 'minutes',
            updatedAt: new Date().toISOString()
          });
        }

        // Convert other metrics
        const maxTPSData = getMostRecentCompleteData(maxTPSHistory);
        if (maxTPSData) {
          setMaxTPS({
            value: maxTPSData.value ?? 0,
            timestamp: maxTPSData.timestamp
          });
        }

        const txCountData = getMostRecentCompleteData(txCountHistory);
        if (txCountData) {
          setDailyTxCount({
            value: txCountData.value ?? 0,
            timestamp: txCountData.timestamp
          });
        }

        setValidatorTotal(validatorTotalData);
        setTeleporterData(teleporterMessagesData);
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
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4 mb-6 sm:mb-8">
      {/* Network TPS */}
      {networkTPS && (
        <div className="bg-card rounded-lg p-3 sm:p-4 border border-border hover:border-[#ef4444]/50 transition-colors duration-300 flex items-center justify-between group">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="p-1.5 sm:p-2 bg-[#ef4444]/10 rounded-lg group-hover:bg-[#ef4444]/20 transition-colors">
              <Activity className="w-4 h-4 sm:w-5 sm:h-5 text-[#ef4444]" />
            </div>
            <div>
              <p className="text-xs sm:text-sm text-muted-foreground font-medium group-hover:text-[#ef4444]/80 transition-colors">Daily Network TPS</p>
              <p className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">{formatTPS(networkTPS.totalTps)}</p>
            </div>
          </div>
        </div>
      )}

      {/* 24h Tx Count */}
      {dailyTxCount && (
        <div className="bg-card rounded-lg p-3 sm:p-4 border border-border hover:border-[#ef4444]/50 transition-colors duration-300 flex items-center justify-between group">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="p-1.5 sm:p-2 bg-[#ef4444]/10 rounded-lg group-hover:bg-[#ef4444]/20 transition-colors">
              <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5 text-[#ef4444]" />
            </div>
            <div>
              <p className="text-xs sm:text-sm text-muted-foreground font-medium group-hover:text-[#ef4444]/80 transition-colors">Daily Tx Count</p>
              <p className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">{formatNumber(dailyTxCount.value)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Max TPS */}
      {maxTPS && (
        <div className="bg-card rounded-lg p-3 sm:p-4 border border-border hover:border-[#ef4444]/50 transition-colors duration-300 flex items-center justify-between group">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="p-1.5 sm:p-2 bg-[#ef4444]/10 rounded-lg group-hover:bg-[#ef4444]/20 transition-colors">
              <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-[#ef4444]" />
            </div>
            <div>
              <p className="text-xs sm:text-sm text-muted-foreground font-medium group-hover:text-[#ef4444]/80 transition-colors">Daily Max TPS</p>
              <p className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">{formatTPS(maxTPS.value)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Total Validators */}
      {validatorTotal && (
        <div className="bg-card rounded-lg p-3 sm:p-4 border border-border hover:border-[#ef4444]/50 transition-colors duration-300 flex items-center justify-between group">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="p-1.5 sm:p-2 bg-[#ef4444]/10 rounded-lg group-hover:bg-[#ef4444]/20 transition-colors">
              <Users className="w-4 h-4 sm:w-5 sm:h-5 text-[#ef4444]" />
            </div>
            <div>
              <p className="text-xs sm:text-sm text-muted-foreground font-medium group-hover:text-[#ef4444]/80 transition-colors">Total Validators</p>
              <p className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">{validatorTotal.totalValidators.toLocaleString()}</p>
            </div>
          </div>
        </div>
      )}

      {/* Total Messages (ICM) */}
      {teleporterData && (
        <div className="bg-card rounded-lg p-3 sm:p-4 border border-border hover:border-[#ef4444]/50 transition-colors duration-300 flex items-center justify-between group">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="p-1.5 sm:p-2 bg-[#ef4444]/10 rounded-lg group-hover:bg-[#ef4444]/20 transition-colors">
              <MessageSquare className="w-4 h-4 sm:w-5 sm:h-5 text-[#ef4444]" />
            </div>
            <div>
              <p className="text-xs sm:text-sm text-muted-foreground font-medium group-hover:text-[#ef4444]/80 transition-colors">Daily ICM Messages</p>
              <p className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">{formatNumber(teleporterData.messages.reduce((sum, msg) => sum + msg.value, 0))}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

