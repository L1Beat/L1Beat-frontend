import React, { useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import { format } from 'date-fns';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { useTheme } from '../hooks/useTheme';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { LoadingSpinner } from './LoadingSpinner';
import { watermarkPlugin, lineShadowPlugin, crosshairPlugin } from '../utils/chartConfig';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export interface DataPoint {
  timestamp: number;
  value: number;
  metadata?: Record<string, any>;
}

interface MetricsChartProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  data: DataPoint[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  valueFormatter?: (value: number) => string;
  valueLabel?: string;
  tooltipFormatter?: (dataPoint: DataPoint) => string[];
  color?: {
    line: string;
    fill: string;
  };
  additionalInfo?: React.ReactNode;
  lastUpdated?: string;
  actions?: React.ReactNode;
}

export function MetricsChart({
  title,
  description,
  icon,
  data,
  loading = false,
  error = null,
  onRetry,
  valueFormatter = (value) => value.toFixed(2),
  valueLabel = '',
  tooltipFormatter,
  color,
  additionalInfo,
  lastUpdated,
  actions
}: MetricsChartProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const defaultColors = {
    line: 'rgb(239, 68, 68)',
    fill: isDark ? 'rgba(239, 68, 68, 0.2)' : 'rgba(239, 68, 68, 0.1)'
  };

  const chartColors = color || defaultColors;

  if (loading) {
    return (
      <div className="bg-white dark:bg-dark-800 rounded-lg shadow-md p-6">
        <div className="h-64 flex flex-col items-center justify-center">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-gray-600 dark:text-gray-300">Loading data...</p>
        </div>
      </div>
    );
  }

  // Only show error if there's an actual error AND no data
  // If there's data (even if all 0s), show the chart
  if (error && !data.length) {
    return (
      <div className="bg-white dark:bg-dark-800 rounded-lg shadow-md p-6">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-2">
            {icon}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
              {description && (
                <p className="text-sm text-gray-500 dark:text-gray-400">{description}</p>
              )}
            </div>
          </div>
        </div>
        <div className="h-64 flex flex-col items-center justify-center">
          <AlertTriangle className="h-12 w-12 text-yellow-500 mb-4" />
          <p className="text-gray-600 dark:text-gray-300 text-center mb-4">
            {error}
          </p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-[#ef4444] hover:bg-[#dc2626] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#ef4444]"
            >
              <RefreshCw className="-ml-1 mr-2 h-4 w-4" />
              Retry
            </button>
          )}
        </div>
      </div>
    );
  }

  // If no data at all (shouldn't happen with L1MetricsChart's fallback), show empty state
  if (!data.length) {
    return (
      <div className="bg-white dark:bg-dark-800 rounded-lg shadow-md p-6">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-2">
            {icon}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
              {description && (
                <p className="text-sm text-gray-500 dark:text-gray-400">{description}</p>
              )}
            </div>
          </div>
        </div>
        <div className="h-64 flex flex-col items-center justify-center">
          <AlertTriangle className="h-12 w-12 text-gray-400 mb-4" />
          <p className="text-gray-600 dark:text-gray-300 text-center">
            No data available
          </p>
        </div>
      </div>
    );
  }

  const formatDate = (timestamp: number) => {
    try {
      const date = new Date(timestamp * 1000);
      if (isNaN(date.getTime())) {
        throw new Error('Invalid date');
      }
      return format(date, 'MMM d');
    } catch (err) {
      console.warn('Date formatting error:', err);
      return 'Invalid date';
    }
  };

  const chartData = useMemo(() => ({
    labels: data.map(item => formatDate(item.timestamp)),
    datasets: [
      {
        label: title,
        data: data.map(item => item.value),
        fill: true,
        borderColor: chartColors.line,
        backgroundColor: (context: any) => {
          const chart = context.chart;
          const { ctx, chartArea } = chart;
          if (!chartArea) return 'transparent';
          const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          // Match AvalancheNetworkMetrics gradient
          gradient.addColorStop(0, 'rgba(239, 68, 68, 0.35)');
          gradient.addColorStop(0.4, 'rgba(239, 68, 68, 0.15)');
          gradient.addColorStop(1, 'rgba(239, 68, 68, 0.02)');
          return gradient;
        },
        borderWidth: isDark ? 2.5 : 2,
        tension: 0.35,
        pointRadius: 0,
        pointHoverRadius: 7,
        pointHoverBackgroundColor: isDark ? '#1e293b' : '#ffffff',
        pointHoverBorderColor: chartColors.line,
        pointHoverBorderWidth: 2.5,
      },
    ],
  }), [data, title, chartColors, isDark]);

  const options = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        backgroundColor: isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.98)',
        titleColor: isDark ? '#f1f5f9' : '#0f172a',
        bodyColor: isDark ? '#e2e8f0' : '#334155',
        borderColor: isDark ? `${chartColors.line}40` : `${chartColors.line}30`,
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
          title: (items: any[]) => {
            if (items.length === 0) return '';
            const dataPoint = data[items[0].dataIndex];
            if (!dataPoint) return '';
            try {
              return format(new Date(dataPoint.timestamp * 1000), 'MMMM d, yyyy');
            } catch {
              return '';
            }
          },
          label: (context: any) => {
            const dataPoint = data[context.dataIndex];
            if (tooltipFormatter) {
              return tooltipFormatter(dataPoint);
            }
            return [`${valueLabel}: ${valueFormatter(context.parsed.y)}`];
          },
          // Use chart color for tooltip color box
          labelColor: () => {
            return {
              borderColor: chartColors.line,
              backgroundColor: chartColors.line,
              borderWidth: 2,
              borderRadius: 2,
            };
          },
        },
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
          callback: (value: any) => valueFormatter(Number(value)),
          padding: 8,
        },
      },
    },
  }), [isDark, chartColors, data, tooltipFormatter, valueLabel, valueFormatter]);

  const latestValue = data[data.length - 1]?.value;

  return (
    <div className="bg-white dark:bg-dark-800 rounded-lg shadow-md p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <div className="flex items-center gap-2">
            {icon}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
              {description && (
                <p className="text-sm text-gray-500 dark:text-gray-400">{description}</p>
              )}
            </div>
          </div>
          {lastUpdated && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{lastUpdated}</p>
          )}
        </div>
        <div className="flex items-center gap-4">
          {actions}
          <div className="text-right">
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {valueFormatter(latestValue)} {valueLabel}
            </p>
            {additionalInfo}
          </div>
        </div>
      </div>

      <div className="h-[300px] sm:h-[400px]">
        <Line 
          data={chartData} 
          options={options} 
          plugins={[lineShadowPlugin, crosshairPlugin, watermarkPlugin]}
        />
      </div>
    </div>
  );
}