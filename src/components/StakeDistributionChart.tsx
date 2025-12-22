import { useMemo } from 'react';
import { Pie } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip } from 'chart.js';
import { Validator } from '../types';
import { useTheme } from '../hooks/useTheme';
import { TrendingUp, Users, Coins } from 'lucide-react';
import { formatUnits, parseBaseUnits, unitsToNumber } from '../utils/formatUnits';

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
  mode?: 'tokens' | 'weight';
  tokenSymbol?: string;
  tokenDecimals?: number;
}

export function StakeDistributionChart({ validators, mode, tokenSymbol, tokenDecimals }: StakeDistributionChartProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const isWeightMode =
    mode === 'weight' ? true : mode === 'tokens' ? false : validators.some(v => v.stakeUnit === 'weight');

  const decimals = typeof tokenDecimals === 'number' && Number.isFinite(tokenDecimals) ? tokenDecimals : 18;
  const unitLabel = isWeightMode ? 'weight' : (tokenSymbol || 'TOKEN');

  const { data, totalStakeBaseUnits, baseByIndex } = useMemo(() => {
    const getStakeBase = (v: Validator) => parseBaseUnits(v.weight) ?? 0n;

    // Calculate total stake/weight (base units or integer if weight-mode)
    const total = validators.reduce((sum, v) => sum + getStakeBase(v), 0n);

    // Sort validators by stake weight in descending order
    const sortedValidators = [...validators].sort((a, b) => {
      const aw = getStakeBase(a);
      const bw = getStakeBase(b);
      return aw < bw ? 1 : (aw > bw ? -1 : 0);
    });

    // Get top 50 validators for display
    const top50 = sortedValidators.slice(0, 50);
    const othersStake = sortedValidators.slice(50).reduce((sum, v) => sum + getStakeBase(v), 0n);

    // Prepare data for the chart (top 50 + others)
    const chartData: Array<{ label: string; navax: bigint }> = [
      ...top50.map(v => ({
        label: `${v.address.slice(0, 8)}...${v.address.slice(-4)}`,
        navax: getStakeBase(v),
      })),
    ];

    if (othersStake > 0n) {
      chartData.push({ label: 'Others', navax: othersStake });
    }

    // ChartJS needs numbers; use best-effort AVAX numbers for rendering.
    const values = chartData.map(v => unitsToNumber(v.navax, isWeightMode ? 0 : decimals));
    const baseByIndex = chartData.map(v => v.navax);
    const backgroundColor = chartData.map((_, i) => 
      i < 50 ? getValidatorColor(i, isDark, 0.8) : '#6b7280'
    );
    const borderColor = chartData.map((_, i) => 
      i < 50 ? getValidatorColor(i, isDark) : '#4b5563'
    );

    return {
      data: {
        labels: chartData.map(v => v.label),
        datasets: [{
          data: values,
          backgroundColor,
          borderColor,
          borderWidth: isDark ? 2 : 1,
        }],
      },
      totalStakeBaseUnits: total,
      baseByIndex,
    };
  }, [validators, isDark, isWeightMode, decimals]);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        // Match app surfaces (Figma: #0A0A0A bg, #262626 borders, #FAFAFA text)
        backgroundColor: isDark ? 'rgba(10, 10, 10, 0.95)' : 'rgba(255, 255, 255, 0.95)',
        titleColor: isDark ? '#FAFAFA' : '#0A0A0A',
        bodyColor: isDark ? '#FAFAFA' : '#0A0A0A',
        borderColor: isDark ? 'rgba(38, 38, 38, 0.8)' : 'rgba(0, 0, 0, 0.1)',
        borderWidth: 1,
        padding: 12,
        boxPadding: 4,
        callbacks: {
          label: (context: any) => {
            const idx = context.dataIndex;
            const base = baseByIndex[idx] ?? 0n;
            const total = totalStakeBaseUnits || 0n;
            const percentage = total > 0n ? ((Number(base) / Number(total)) * 100).toFixed(1) : '0.0';
            const formatted = isWeightMode
              ? formatUnits(base, 0, { maxFractionDigits: 0 })
              : formatUnits(base, decimals, { maxFractionDigits: 2 });
            return `${formatted} ${unitLabel} (${percentage}%)`;
          },
        },
      },
    },
  };

  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border bg-gradient-to-r from-[#ef4444]/15 via-[#ef4444]/5 to-transparent">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#ef4444] rounded-xl">
            <TrendingUp className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">
              {isWeightMode ? 'Weight Distribution' : 'Stake Distribution'}
            </h3>
            <p className="text-sm text-muted-foreground">
              {isWeightMode ? 'Top validators by weight' : 'Top validators by stake amount'}
            </p>
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
              {/* Total Stake - Primary Brand Color */}
              <div className="bg-[#ef4444]/10 rounded-xl p-4 border border-[#ef4444]/20">
                <div className="flex items-center gap-3 mb-2">
                  <Coins className="w-5 h-5 text-[#ef4444]" />
                  <span className="text-sm font-medium text-[#ef4444]">
                    {isWeightMode ? 'Total Weight' : 'Total Stake'}
                  </span>
                </div>
                <p className="text-2xl font-bold text-[#ef4444]">
                  {isWeightMode
                    ? formatUnits(totalStakeBaseUnits, 0, { maxFractionDigits: 0 })
                    : formatUnits(totalStakeBaseUnits, decimals, { maxFractionDigits: 2 })}
                </p>
                <p className="text-xs text-[#ef4444]/80">{unitLabel}</p>
              </div>

              {/* Validators */}
              <div className="bg-muted/20 rounded-xl p-4 border border-border">
                <div className="flex items-center gap-3 mb-2">
                  <Users className="w-5 h-5 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">Validators</span>
                </div>
                <p className="text-2xl font-bold text-foreground">
                  {validators.length}
                </p>
                <p className="text-xs text-muted-foreground">total nodes</p>
              </div>

              {/* Average Stake */}
              <div className="bg-muted/20 rounded-xl p-4 border border-border">
                <div className="flex items-center gap-3 mb-2">
                  <TrendingUp className="w-5 h-5 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">
                    {isWeightMode ? 'Average Weight' : 'Average Stake'}
                  </span>
                </div>
                <p className="text-2xl font-bold text-foreground">
                  {validators.length > 0
                    ? (isWeightMode
                      ? formatUnits(totalStakeBaseUnits / BigInt(validators.length), 0, { maxFractionDigits: 0 })
                      : formatUnits(totalStakeBaseUnits / BigInt(validators.length), decimals, { maxFractionDigits: 2 }))
                    : 'N/A'}
                </p>
                <p className="text-xs text-muted-foreground">{unitLabel}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}