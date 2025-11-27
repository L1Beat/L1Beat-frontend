import React, { useMemo } from 'react';
import { Pie } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip } from 'chart.js';
import { Validator } from '../types';
import { useTheme } from '../hooks/useTheme';
import { TrendingUp, Users, Coins } from 'lucide-react';

ChartJS.register(ArcElement, Tooltip);

// Export the color generation function for use in other components
export const getValidatorColor = (index: number, isDark: boolean, alpha = 1) => {
  // Use pastel colors with lower saturation and higher lightness
  const hue = (index * 137.508) % 360; // Golden angle approximation
  const saturation = isDark ? '45%' : '40%'; // Lower saturation for pastel effect
  const lightness = isDark ? '70%' : '75%'; // Higher lightness for pastel effect
  return `hsla(${hue}, ${saturation}, ${lightness}, ${alpha})`;
};

interface StakeDistributionChartProps {
  validators: Validator[];
}

export function StakeDistributionChart({ validators }: StakeDistributionChartProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  // Format large numbers with abbreviations, converting from blockchain denomination
  const formatStakeNumber = (num: number): string => {
    // Convert from blockchain denomination to actual tokens (divide by 10^9)
    const actualTokens = num / 1_000_000_000;
    
    if (actualTokens >= 1_000_000) {
      return `${(actualTokens / 1_000_000).toFixed(2)}M`;
    } else if (actualTokens >= 1_000) {
      return `${(actualTokens / 1_000).toFixed(2)}K`;
    } else {
      return actualTokens.toLocaleString(undefined, { maximumFractionDigits: 2 });
    }
  };

  const { data, totalStake } = useMemo(() => {
    // Calculate total stake
    const total = validators.reduce((sum, v) => sum + v.weight, 0);
    
    // Sort validators by stake weight in descending order
    const sortedValidators = [...validators].sort((a, b) => b.weight - a.weight);

    // Get top 50 validators for display
    const top50 = sortedValidators.slice(0, 50);
    const othersStake = sortedValidators.slice(50).reduce((sum, v) => sum + v.weight, 0);

    // Prepare data for the chart (top 50 + others)
    const chartData = [...top50];
    if (othersStake > 0) {
      chartData.push({
        address: 'Others',
        weight: othersStake,
        active: true,
        uptime: 0
      } as Validator);
    }

    const values = chartData.map(v => v.weight);
    const backgroundColor = chartData.map((_, i) => 
      i < 50 ? getValidatorColor(i, isDark, 0.8) : '#6b7280'
    );
    const borderColor = chartData.map((_, i) => 
      i < 50 ? getValidatorColor(i, isDark) : '#4b5563'
    );

    return {
      data: {
        labels: chartData.map(v => 
          v.address === 'Others' ? 'Others' : `${v.address.slice(0, 8)}...${v.address.slice(-4)}`
        ),
        datasets: [{
          data: values,
          backgroundColor,
          borderColor,
          borderWidth: isDark ? 2 : 1,
        }],
      },
      totalStake: total,
    };
  }, [validators, isDark]);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
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
        padding: 12,
        boxPadding: 4,
        callbacks: {
          label: (context: any) => {
            const value = context.raw;
            const percentage = ((value / totalStake) * 100).toFixed(1);
            const formattedStake = formatStakeNumber(value);
            return `${formattedStake} tokens (${percentage}%)`;
          },
        },
      },
    },
  };

  return (
    <div className="bg-white dark:bg-dark-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-[#ef4444]/10 to-[#dc2626]/10 dark:from-[#ef4444]/20 dark:to-[#dc2626]/20">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#ef4444] rounded-lg">
            <TrendingUp className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Stake Distribution</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">Top validators by stake amount</p>
          </div>
        </div>
      </div>

      {/* Statistics */}
      <div className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Chart Section */}
          <div className="lg:col-span-2">
            <div className="h-80 flex items-center justify-center">
              <div className="w-full h-full max-w-sm">
                <Pie data={data} options={options} />
              </div>
            </div>
          </div>

          {/* Statistics and Top Validators */}
          <div className="space-y-6">
            {/* Statistics Cards */}
            <div className="grid grid-cols-1 gap-4">
              <div className="bg-gradient-to-br from-[#ef4444]/10 to-[#dc2626]/10 dark:from-[#ef4444]/30 dark:to-[#dc2626]/30 rounded-lg p-4 border border-[#ef4444]/20 dark:border-[#ef4444]/50">
                <div className="flex items-center gap-3 mb-2">
                  <Coins className="w-5 h-5 text-[#ef4444] dark:text-[#ef4444]" />
                  <span className="text-sm font-medium text-[#ef4444] dark:text-[#ef4444]">Total Stake</span>
                </div>
                <p className="text-2xl font-bold text-[#ef4444] dark:text-[#ef4444]">
                  {formatStakeNumber(totalStake)}
                </p>
                <p className="text-xs text-[#ef4444] dark:text-[#ef4444]">tokens</p>
              </div>

              <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/30 dark:to-green-800/30 rounded-lg p-4 border border-green-200 dark:border-green-700/50">
                <div className="flex items-center gap-3 mb-2">
                  <Users className="w-5 h-5 text-green-600 dark:text-green-400" />
                  <span className="text-sm font-medium text-green-700 dark:text-green-300">Validators</span>
                </div>
                <p className="text-2xl font-bold text-green-900 dark:text-green-100">
                  {validators.length}
                </p>
                <p className="text-xs text-green-600 dark:text-green-400">total nodes</p>
              </div>

              <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/30 dark:to-purple-800/30 rounded-lg p-4 border border-purple-200 dark:border-purple-700/50">
                <div className="flex items-center gap-3 mb-2">
                  <TrendingUp className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                  <span className="text-sm font-medium text-purple-700 dark:text-purple-300">Average Stake</span>
                </div>
                <p className="text-2xl font-bold text-purple-900 dark:text-purple-100">
                  {formatStakeNumber(totalStake / validators.length)}
                </p>
                <p className="text-xs text-purple-600 dark:text-purple-400">tokens</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}