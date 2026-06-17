import { memo, useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import { format } from 'date-fns';
import { DailyTxCount, DailyActiveAddresses, MaxTPSHistory, GasUsedHistory, AvgGasPriceHistory, FeesPaidHistory } from '../../types';
import { useTheme } from '../../hooks/useTheme';
import { watermarkPlugin, crosshairPlugin, chartTooltipStyle, CHART_STYLE } from '../../utils/chartConfig';
import { AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { LoadingSpinner } from '../LoadingSpinner';

export type ComparisonMetricType = 'dailyActiveAddresses' | 'dailyTxCount' | 'maxTPS' | 'gasUsed' | 'avgGasPrice' | 'feesPaid';

interface ChainComparisonData {
  chain: {
    chainId: string;
    chainName: string;
    chainLogoUri?: string;
  };
  dailyActiveAddresses: DailyActiveAddresses[];
  dailyTxCount: DailyTxCount[];
  maxTPS: MaxTPSHistory[];
  gasUsed: GasUsedHistory[];
  avgGasPrice: AvgGasPriceHistory[];
  feesPaid: FeesPaidHistory[];
  loading: boolean;
}

interface ComparisonChartProps {
  comparisonChains: ChainComparisonData[];
  metricType: ComparisonMetricType;
  title: string;
  valueLabel: string;
  hoveredChainId?: string | null;
  onHoverChain?: (chainId: string | null) => void;
  viewMode?: 'absolute' | 'normalized';
}

const CHAIN_COLORS = [
  { line: 'rgb(99, 102, 241)', fill: 'rgba(99, 102, 241, 0.1)' },   // Indigo
  { line: 'rgb(16, 185, 129)', fill: 'rgba(16, 185, 129, 0.1)' },   // Emerald
  { line: 'rgb(245, 158, 11)', fill: 'rgba(245, 158, 11, 0.1)' },   // Amber
  { line: 'rgb(239, 68, 68)', fill: 'rgba(239, 68, 68, 0.1)' },     // Red
];

function getDataPoints(data: ChainComparisonData, metricType: ComparisonMetricType): { timestamp: number }[] {
  return data[metricType] as { timestamp: number }[];
}

function getValue(item: any, metricType: ComparisonMetricType): number {
  if (metricType === 'dailyActiveAddresses') {
    return (item as DailyActiveAddresses).activeAddresses;
  }
  return item.value;
}

function formatValue(value: number, metricType: ComparisonMetricType): string {
  switch (metricType) {
    case 'maxTPS':
      return value.toFixed(2);
    case 'avgGasPrice':
      if (value < 0.001) return `${(value * 1e9).toFixed(2)}`;
      return value.toFixed(6);
    case 'feesPaid':
      if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
      if (value >= 1e3) return `${(value / 1e3).toFixed(2)}K`;
      return value.toFixed(2);
    default:
      if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
      if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
      if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
      return value.toLocaleString();
  }
}

function fadeRgb(rgb: string, alpha: number): string {
  const match = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (!match) return rgb;
  const [, r, g, b] = match;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const ComparisonChart = memo(function ComparisonChart({
  comparisonChains,
  metricType,
  title,
  valueLabel,
  hoveredChainId = null,
  onHoverChain,
  viewMode = 'absolute',
}: ComparisonChartProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const isLoading = comparisonChains.some(c => c.loading);

  const chartData = useMemo(() => {
    const allTimestamps = new Set<number>();
    comparisonChains.forEach(data => {
      const dataPoints = getDataPoints(data, metricType);
      dataPoints.forEach(item => allTimestamps.add(item.timestamp));
    });

    const sortedTimestamps = Array.from(allTimestamps).sort((a, b) => a - b);
    const labels = sortedTimestamps.map(ts => format(new Date(ts * 1000), 'MMM d'));

    const datasets = comparisonChains.map((data, index) => {
      const color = CHAIN_COLORS[index % CHAIN_COLORS.length];
      const dataPoints = getDataPoints(data, metricType);

      const dataMap = new Map(
        dataPoints.map(item => [item.timestamp, getValue(item, metricType)])
      );

      const rawValues = sortedTimestamps.map(ts => dataMap.get(ts) ?? null);
      let chartValues: (number | null)[] = rawValues;
      if (viewMode === 'normalized') {
        const numeric = rawValues.filter((v): v is number => v != null);
        const min = numeric.length > 0 ? Math.min(...numeric) : 0;
        const max = numeric.length > 0 ? Math.max(...numeric) : 0;
        const range = max - min || 1;
        chartValues = rawValues.map(v => (v == null ? null : ((v - min) / range) * 100));
      }
      const isHovered = hoveredChainId === data.chain.chainId;
      const isDimmed = hoveredChainId != null && !isHovered;

      const fillTopAlpha = isDimmed ? 0.04 : isHovered ? 0.32 : 0.18;
      return {
        label: data.chain.chainName,
        chainId: data.chain.chainId,
        data: chartValues,
        rawValues,
        data_raw_label: valueLabel,
        borderColor: isDimmed ? fadeRgb(color.line, 0.18) : color.line,
        backgroundColor: (context: { chart: { ctx: CanvasRenderingContext2D; chartArea?: { top: number; bottom: number } } }) => {
          const { ctx, chartArea } = context.chart;
          if (!chartArea) return fadeRgb(color.line, fillTopAlpha);
          const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          gradient.addColorStop(0, fadeRgb(color.line, fillTopAlpha));
          gradient.addColorStop(1, fadeRgb(color.line, 0));
          return gradient;
        },
        borderWidth: isHovered ? (isDark ? 3.5 : 3) : isDark ? 2.5 : 2,
        tension: 0.35,
        pointRadius: 0,
        pointHoverRadius: 7,
        pointHoverBackgroundColor: isDark ? '#1e293b' : '#ffffff',
        pointHoverBorderColor: color.line,
        pointHoverBorderWidth: 2.5,
        fill: 'origin',
        spanGaps: true,
        order: isHovered ? 0 : 1,
      };
    });

    return { labels, datasets };
  }, [comparisonChains, metricType, isDark, hoveredChainId, viewMode, valueLabel]);

  const options = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: CHART_STYLE.animation.duration, easing: CHART_STYLE.animation.easing },
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    onHover: (_event: unknown, elements: Array<{ datasetIndex: number }>) => {
      if (!onHoverChain) return;
      if (elements.length === 0) {
        onHoverChain(null);
        return;
      }
      const idx = elements[0].datasetIndex;
      const chain = comparisonChains[idx];
      onHoverChain(chain?.chain.chainId ?? null);
    },
    plugins: {
      legend: {
        display: true,
        position: 'top' as const,
        labels: {
          color: isDark ? '#e2e8f0' : '#334155',
          padding: 16,
          font: {
            size: 13,
            weight: '500' as const
          },
          usePointStyle: true,
          pointStyle: 'circle'
        }
      },
      tooltip: {
        ...chartTooltipStyle(isDark),
        boxPadding: 8,
        bodySpacing: 6,
        titleMarginBottom: 10,
        displayColors: true,
        usePointStyle: true,
        caretSize: 8,
        caretPadding: 12,
        callbacks: {
          label: (context: { dataset: { label?: string; rawValues?: (number | null)[] }; parsed: { y: number | null }; dataIndex: number }) => {
            const label = context.dataset.label || '';
            const raw = context.dataset.rawValues?.[context.dataIndex] ?? context.parsed.y;
            if (raw == null) return `${label}: No data`;
            const formattedRaw = `${formatValue(raw, metricType)} ${valueLabel}`;
            if (viewMode === 'normalized' && context.parsed.y != null) {
              return `${label}: ${context.parsed.y.toFixed(0)}% · ${formattedRaw}`;
            }
            return `${label}: ${formattedRaw}`;
          }
        }
      },
    },
    scales: {
      x: {
        grid: {
          display: false,
        },
        border: {
          display: false,
        },
        ticks: {
          color: isDark ? '#94a3b8' : '#64748b',
          font: {
            size: 11,
          },
          maxRotation: 0,
        },
      },
      y: {
        beginAtZero: true,
        border: {
          display: false,
        },
        grid: {
          color: isDark ? 'rgba(148, 163, 184, 0.08)' : 'rgba(0, 0, 0, 0.05)',
          drawBorder: false,
        },
        ticks: {
          color: isDark ? '#94a3b8' : '#64748b',
          font: {
            size: 11,
          },
          callback: (value: string | number) => {
            const num = Number(value);
            if (viewMode === 'normalized') return `${num.toFixed(0)}%`;
            return formatValue(num, metricType);
          },
          padding: 8,
        },
        max: viewMode === 'normalized' ? 100 : undefined,
      },
    },
    layout: {
      padding: {
        right: 64,
      },
    },
  }), [isDark, metricType, valueLabel, onHoverChain, comparisonChains, viewMode]);

  const endLabelPlugin = useMemo(() => ({
    id: 'endLineLabels',
    afterDatasetsDraw(chart: {
      ctx: CanvasRenderingContext2D;
      data: { datasets: Array<{ data: Array<number | null>; rawValues?: Array<number | null>; borderColor?: string; label?: string }> };
      getDatasetMeta: (idx: number) => { data: Array<{ x: number; y: number }>; hidden?: boolean };
      chartArea: { right: number; top: number; bottom: number };
    }) {
      const { ctx, data, chartArea } = chart;
      ctx.save();
      ctx.font = '600 11px ui-sans-serif, system-ui, -apple-system';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';

      const placedYs: number[] = [];
      data.datasets.forEach((dataset, idx) => {
        const meta = chart.getDatasetMeta(idx);
        if (meta.hidden) return;
        let lastIdx = -1;
        for (let i = dataset.data.length - 1; i >= 0; i--) {
          if (dataset.data[i] != null) {
            lastIdx = i;
            break;
          }
        }
        if (lastIdx === -1) return;
        const point = meta.data[lastIdx];
        if (!point) return;

        const raw = dataset.rawValues?.[lastIdx] ?? dataset.data[lastIdx];
        if (raw == null) return;

        let text: string;
        if (viewMode === 'normalized') {
          const yPct = dataset.data[lastIdx];
          if (yPct == null) return;
          text = `${Math.round(yPct as number)}%`;
        } else {
          text = formatValue(raw as number, metricType);
        }

        const x = Math.min(point.x + 8, chartArea.right + 60);
        let y = point.y;
        const MIN_GAP = 14;
        while (placedYs.some(py => Math.abs(py - y) < MIN_GAP)) {
          y = y + (y < chartArea.top + chartArea.bottom ? -MIN_GAP : MIN_GAP);
          if (y < chartArea.top) y = chartArea.top + 4;
          if (y > chartArea.bottom) y = chartArea.bottom - 4;
        }
        placedYs.push(y);

        ctx.fillStyle = (dataset.borderColor as string) || (isDark ? '#e2e8f0' : '#334155');
        ctx.fillText(text, x, y);
      });
      ctx.restore();
    },
  }), [metricType, viewMode, isDark]);

  if (isLoading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="bg-card border border-border rounded-xl shadow-md p-6"
      >
        <h3 className="text-lg font-semibold text-foreground mb-4">{title}</h3>
        <div className="h-[400px] flex flex-col items-center justify-center">
          <LoadingSpinner size="lg" />
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="mt-4 text-muted-foreground"
          >
            Loading chart data...
          </motion.p>
        </div>
      </motion.div>
    );
  }

  const hasData = comparisonChains.some(c => {
    const dataPoints = getDataPoints(c, metricType);
    return dataPoints.length > 0;
  });

  if (!hasData) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="bg-card border border-border rounded-xl shadow-md p-6"
      >
        <h3 className="text-lg font-semibold text-foreground mb-4">{title}</h3>
        <div className="h-[400px] flex flex-col items-center justify-center">
          <motion.div
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.1, type: 'spring', stiffness: 300, damping: 20 }}
          >
            <AlertTriangle className="h-12 w-12 text-muted-foreground/50 mb-4" />
          </motion.div>
          <p className="text-muted-foreground text-center">
            No data available for comparison
          </p>
        </div>
      </motion.div>
    );
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={metricType}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12 }}
        transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
        className="bg-card border border-border rounded-xl shadow-md p-6"
      >
        <h3 className="text-lg font-semibold text-foreground mb-4">{title}</h3>
        <div className="h-[400px]" onMouseLeave={() => onHoverChain?.(null)}>
          <Line data={chartData} options={options} plugins={[endLabelPlugin, crosshairPlugin, watermarkPlugin]} />
        </div>
      </motion.div>
    </AnimatePresence>
  );
});
