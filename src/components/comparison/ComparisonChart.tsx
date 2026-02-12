import { memo, useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import { format } from 'date-fns';
import { DailyTxCount, DailyActiveAddresses, MaxTPSHistory, GasUsedHistory, AvgGasPriceHistory, FeesPaidHistory } from '../../types';
import { useTheme } from '../../hooks/useTheme';
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

export const ComparisonChart = memo(function ComparisonChart({
  comparisonChains,
  metricType,
  title,
  valueLabel
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

      const chartValues = sortedTimestamps.map(ts => dataMap.get(ts) ?? null);

      return {
        label: data.chain.chainName,
        data: chartValues,
        borderColor: color.line,
        backgroundColor: 'transparent',
        borderWidth: isDark ? 2.5 : 2,
        tension: 0.35,
        pointRadius: 0,
        pointHoverRadius: 7,
        pointHoverBackgroundColor: isDark ? '#1e293b' : '#ffffff',
        pointHoverBorderColor: color.line,
        pointHoverBorderWidth: 2.5,
        fill: false,
        spanGaps: true
      };
    });

    return { labels, datasets };
  }, [comparisonChains, metricType, isDark]);

  const options = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false,
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
        backgroundColor: isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.98)',
        titleColor: isDark ? '#f1f5f9' : '#0f172a',
        bodyColor: isDark ? '#e2e8f0' : '#334155',
        borderColor: isDark ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.3)',
        borderWidth: 1,
        padding: 16,
        boxPadding: 8,
        cornerRadius: 12,
        titleFont: {
          size: 15,
          weight: 'bold' as const,
        },
        bodyFont: {
          size: 14,
        },
        bodySpacing: 6,
        titleMarginBottom: 10,
        displayColors: true,
        usePointStyle: true,
        caretSize: 8,
        caretPadding: 12,
        callbacks: {
          label: (context: { dataset: { label?: string }; parsed: { y: number | null } }) => {
            const label = context.dataset.label || '';
            const value = context.parsed.y;
            if (value === null) return `${label}: No data`;
            return `${label}: ${formatValue(value, metricType)} ${valueLabel}`;
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
          color: isDark ? 'rgba(148, 163, 184, 0.08)' : 'rgba(0, 0, 0, 0.04)',
          drawBorder: false,
        },
        ticks: {
          color: isDark ? '#94a3b8' : '#64748b',
          font: {
            size: 11,
          },
          callback: (value: string | number) => {
            const num = Number(value);
            return formatValue(num, metricType);
          },
          padding: 8,
        },
      },
    },
  }), [isDark, metricType, valueLabel]);

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
        <div className="h-[400px]">
          <Line data={chartData} options={options} />
        </div>
      </motion.div>
    </AnimatePresence>
  );
});
