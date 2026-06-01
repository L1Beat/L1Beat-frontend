import { useMemo, useState } from 'react';
import { Pie } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip } from 'chart.js';
import { Validator } from '../types';
import { useTheme } from '../hooks/useTheme';
import { PieChart } from 'lucide-react';
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
  onValidatorClick?: (validator: Validator) => void;
}

export function StakeDistributionChart({ validators, mode, tokenSymbol, tokenDecimals, onValidatorClick }: StakeDistributionChartProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  // Hide the centre label while a slice is hovered so the tooltip doesn't collide with it.
  const [hovering, setHovering] = useState(false);

  const isWeightMode =
    mode === 'weight' ? true : mode === 'tokens' ? false : validators.some(v => v.stakeUnit === 'weight');

  const decimals = typeof tokenDecimals === 'number' && Number.isFinite(tokenDecimals) ? tokenDecimals : 18;
  const unitLabel = isWeightMode ? 'weight' : (tokenSymbol || 'N/A');

  const { data, totalStakeBaseUnits, baseByIndex, sortedTop } = useMemo(() => {
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
      sortedTop: top50,
    };
  }, [validators, isDark, isWeightMode, decimals]);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '62%',
    onHover: (_event: any, elements: any[]) => {
      const canvas = _event.native?.target as HTMLCanvasElement | undefined;
      if (canvas) {
        canvas.style.cursor = elements.length > 0 && elements[0].index < sortedTop.length ? 'pointer' : 'default';
      }
      setHovering(elements.length > 0);
    },
    onClick: (_event: any, elements: any[]) => {
      if (!onValidatorClick || elements.length === 0) return;
      const idx = elements[0].index;
      if (idx < sortedTop.length) {
        onValidatorClick(sortedTop[idx]);
      }
    },
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

  const totalDisplay = isWeightMode
    ? formatUnits(totalStakeBaseUnits, 0, { maxFractionDigits: 0 })
    : formatUnits(totalStakeBaseUnits, decimals, { maxFractionDigits: 2 });
  const avgDisplay =
    validators.length > 0
      ? isWeightMode
        ? formatUnits(totalStakeBaseUnits / BigInt(validators.length), 0, { maxFractionDigits: 0 })
        : formatUnits(totalStakeBaseUnits / BigInt(validators.length), decimals, { maxFractionDigits: 2 })
      : 'N/A';

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <header className="flex items-center justify-between gap-2 px-4 sm:px-5 py-3.5 border-b border-border">
        <div className="flex items-center gap-2">
          <PieChart className="w-4 h-4 text-[#ef4444]" />
          <h2 className="text-[14px] font-semibold text-foreground">
            {isWeightMode ? 'Weight distribution' : 'Stake distribution'}
          </h2>
        </div>
        <span className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground">
          {validators.length} validators
        </span>
      </header>

      <div className="p-4 sm:p-6">
        <div className="relative h-64 sm:h-72 flex items-center justify-center">
          <div className="w-full h-full max-w-[300px]">
            <Pie data={data} options={options} />
          </div>
          {/* Total in the donut centre — hidden while hovering so the tooltip is readable */}
          {!hovering && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Total {unitLabel}</span>
              <span className="text-lg font-bold text-foreground tabular-nums">{totalDisplay}</span>
            </div>
          )}
        </div>
        <p className="text-center text-[11px] text-muted-foreground mt-3">
          {validators.length} validators · avg{' '}
          <span className="font-semibold text-foreground tabular-nums">{avgDisplay}</span> {unitLabel} · tap a slice for detail
        </p>
      </div>
    </div>
  );
}