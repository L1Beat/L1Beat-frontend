import React, { useEffect, useState } from 'react';
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
    line: isDark ? 'rgb(129, 140, 248)' : 'rgb(99, 102, 241)',
    fill: isDark ? 'rgba(129, 140, 248, 0.2)' : 'rgba(99, 102, 241, 0.1)'
  };

  const chartColors = color || defaultColors;

  if (loading) {
    return (
      <div className="bg-white dark:bg-dark-800 rounded-lg shadow-md p-6">
        <div className="h-64 flex flex-col items-center justify-center">
          <RefreshCw className="h-12 w-12 text-blue-500 animate-spin mb-4" />
          <p className="text-gray-600 dark:text-gray-300">Loading data...</p>
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
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
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

  const chartData = {
    labels: data.map(item => formatDate(item.timestamp)),
    datasets: [
      {
        label: title,
        data: data.map(item => item.value),
        fill: true,
        borderColor: chartColors.line,
        backgroundColor: chartColors.fill,
        borderWidth: isDark ? 2 : 1.5,
        tension: 0.4,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointBackgroundColor: isDark ? '#1e293b' : '#ffffff',
      },
    ],
  };

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
            const dataPoint = data[context.dataIndex];
            if (tooltipFormatter) {
              return tooltipFormatter(dataPoint);
            }
            return [`${valueLabel}: ${valueFormatter(context.parsed.y)}`];
          },
        },
      },
    },
    scales: {
      x: {
        grid: {
          display: false,
        },
        ticks: {
          color: isDark ? '#94a3b8' : '#64748b',
          font: {
            size: 11,
          },
        },
      },
      y: {
        beginAtZero: true,
        grid: {
          color: isDark ? 'rgba(148, 163, 184, 0.1)' : 'rgba(0, 0, 0, 0.05)',
          drawBorder: false,
        },
        ticks: {
          color: isDark ? '#94a3b8' : '#64748b',
          font: {
            size: 11,
          },
          callback: valueFormatter,
        },
      },
    },
  };

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

      <div className="h-64">
        <Line data={chartData} options={options} />
      </div>
    </div>
  );
}