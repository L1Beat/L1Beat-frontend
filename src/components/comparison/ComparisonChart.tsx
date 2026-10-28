import { memo, useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import type { ChartOptions, Plugin } from 'chart.js';
import { format } from 'date-fns';
import { DailyTxCount, DailyActiveAddresses, MaxTPSHistory, GasUsedHistory, AvgGasPriceHistory, FeesPaidHistory } from '../../types';
import { useTheme } from '../../hooks/useTheme';
import { crosshairPlugin, chartTooltipStyle, CHART_STYLE } from '../../utils/chartConfig';
import { LoadingSpinner } from '../LoadingSpinner';
import { seriesColor } from './colors';

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
  valueLabel: string;
  hoveredChainId?: string | null;
  onHoverChain?: (chainId: string | null) => void;
  viewMode?: 'absolute' | 'normalized';
  /** Replaces the default "no data" text, e.g. when requests are being rate limited. */
  emptyMessage?: string;
}

function getDataPoints(data: ChainComparisonData, metricType: ComparisonMetricType): { timestamp: number }[] {
  return data[metricType] as { timestamp: number }[];
}

function getValue(item: any, metricType: ComparisonMetricType): number {
  if (metricType === 'dailyActiveAddresses') {
    return (item as DailyActiveAddresses).activeAddresses;
  }
  return item.value;
}

export function formatValue(value: number, metricType: ComparisonMetricType): string {
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

function fade(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export const ComparisonChart = memo(function ComparisonChart({
  comparisonChains,
  metricType,
  valueLabel,
  hoveredChainId = null,
  onHoverChain,
  viewMode = 'absolute',
  emptyMessage,
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
      const color = seriesColor(index);
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

      return {
        label: data.chain.chainName,
        chainId: data.chain.chainId,
        data: chartValues,
        rawValues,
        borderColor: isDimmed ? fade(color, 0.2) : color,
        backgroundColor: color,
        borderWidth: isHovered ? 2.25 : CHART_STYLE.line.width,
        tension: CHART_STYLE.line.tension,
        // A chain with a single day of data has no line to draw; show the day as a dot.
        pointRadius: rawValues.filter(v => v != null).length === 1 ? CHART_STYLE.hover.radius : 0,
        pointHoverRadius: CHART_STYLE.hover.radius,
        pointHoverBackgroundColor: color,
        pointHoverBorderColor: isDark ? '#1a1d21' : '#ffffff',
        pointHoverBorderWidth: CHART_STYLE.hover.strokeWidth,
        fill: false,
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
      // The chain table above and the key below name the lines.
      legend: { display: false },
      tooltip: {
        ...chartTooltipStyle(isDark),
        boxPadding: 6,
        bodySpacing: 4,
        displayColors: true,
        usePointStyle: true,
        callbacks: {
          label: (context: { dataset: { label?: string; rawValues?: (number | null)[] }; parsed: { y: number | null }; dataIndex: number }) => {
            const label = context.dataset.label || '';
            const raw = context.dataset.rawValues?.[context.dataIndex] ?? context.parsed.y;
            if (raw == null) return `${label}: No data`;
            const formattedRaw = `${formatValue(raw, metricType)} ${valueLabel}`;
            if (viewMode === 'normalized' && context.parsed.y != null) {
              return `${label}: ${context.parsed.y.toFixed(0)}%, ${formattedRaw}`;
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
          color: isDark ? CHART_STYLE.tick.dark : CHART_STYLE.tick.light,
          maxRotation: 0,
          autoSkipPadding: 16,
        },
      },
      y: {
        beginAtZero: true,
        border: {
          display: false,
        },
        grid: {
          color: isDark ? CHART_STYLE.grid.dark : CHART_STYLE.grid.light,
          drawBorder: false,
        },
        ticks: {
          color: isDark ? CHART_STYLE.tick.dark : CHART_STYLE.tick.light,
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
      ctx.font = "500 11px 'IBM Plex Mono', ui-monospace, monospace";
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
      <div className="h-[320px] flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const hasData = comparisonChains.some(c => getDataPoints(c, metricType).length > 0);
  if (!hasData) {
    return (
      <div className="h-[320px] flex items-center justify-center text-center px-6">
        <p className="text-[13px] text-muted-foreground max-w-sm">{emptyMessage ?? 'None of these chains have data for this metric yet.'}</p>
      </div>
    );
  }

  return (
    <div className="h-[320px]" onMouseLeave={() => onHoverChain?.(null)}>
      <Line data={chartData} options={options as unknown as ChartOptions<'line'>} plugins={[endLabelPlugin as unknown as Plugin<'line'>, crosshairPlugin]} />
    </div>
  );
});
