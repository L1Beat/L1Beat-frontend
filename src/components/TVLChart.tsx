import { useEffect, useState } from 'react';
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
import { TVLHistory, TVLHealth } from '../types';
import { getTVLHistory, getTVLHealth } from '../api';
import { useTheme } from '../hooks/useTheme';
import { AlertTriangle, TrendingUp, RefreshCw, Info } from 'lucide-react';
import { LoadingSpinner } from './LoadingSpinner';

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

export function TVLChart() {
  const { theme } = useTheme();
  const [tvlHistory, setTvlHistory] = useState<TVLHistory[]>([]);
  const [tvlHealth, setTvlHealth] = useState<TVLHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  const isDark = theme === 'dark';

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      setRetrying(true);

      const [history, health] = await Promise.all([
        getTVLHistory(30),
        getTVLHealth()
      ]);

      // Validate and process TVL history data
      if (history && Array.isArray(history)) {
        const validHistory = history
          .filter(item => 
            item && 
            typeof item.date === 'number' && 
            typeof item.tvl === 'number' && 
            !isNaN(item.date) && 
            !isNaN(item.tvl)
          )
          .sort((a, b) => a.date - b.date); // Sort by date ascending

        if (validHistory.length > 0) {
          setTvlHistory(validHistory);
          setTvlHealth(health);
        } else {
          throw new Error('No valid TVL data available');
        }
      } else {
        throw new Error('Invalid TVL data format');
      }
    } catch (err) {
      console.error('TVL data fetch error:', err);
      setError('Unable to load TVL data. Please try again later.');
    } finally {
      setLoading(false);
      setRetrying(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    const loadData = async () => {
      try {
        await fetchData();
      } catch (err) {
        if (mounted) {
          setError('Failed to load TVL data');
        }
      }
    };

    loadData();
    const interval = setInterval(loadData, 5 * 60 * 1000); // Refresh every 5 minutes

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  if (loading) {
    return (
      <div className="bg-white dark:bg-dark-800 rounded-lg shadow-md p-6">
        <div className="h-64 flex flex-col items-center justify-center">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-gray-600 dark:text-gray-300">Loading TVL data...</p>
        </div>
      </div>
    );
  }

  if (error || !tvlHistory.length) {
    return (
      <div className="bg-white dark:bg-dark-800 rounded-lg shadow-md p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-500" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Total Value Locked (TVL)</h3>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Historical TVL data across all chains
            </p>
          </div>
        </div>
        <div className="h-64 flex flex-col items-center justify-center">
          <AlertTriangle className="h-12 w-12 text-yellow-500 mb-4" />
          <p className="text-gray-600 dark:text-gray-300 text-center mb-4">
            {error || 'No TVL data available at the moment'}
          </p>
          <button 
            onClick={fetchData}
            disabled={retrying}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {retrying ? (
              <>
                <RefreshCw className="animate-spin -ml-1 mr-2 h-4 w-4" />
                Retrying...
              </>
            ) : (
              <>
                <RefreshCw className="-ml-1 mr-2 h-4 w-4" />
                Retry
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  const data = {
    labels: tvlHistory.map(item => 
      format(new Date(item.date * 1000), 'MMM d')
    ),
    datasets: [
      {
        label: 'Total Value Locked (TVL)',
        data: tvlHistory.map(item => item.tvl),
        fill: true,
        borderColor: isDark ? 'rgb(96, 165, 250)' : 'rgb(59, 130, 246)',
        backgroundColor: isDark ? 'rgba(96, 165, 250, 0.2)' : 'rgba(59, 130, 246, 0.1)',
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
            return `TVL: $${context.parsed.y.toLocaleString()}`;
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
          callback: (value: any) => `$${value.toLocaleString()}`,
        },
      },
    },
  };

  return (
    <div className="bg-white dark:bg-dark-800 rounded-lg shadow-md p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-500" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Total Value Locked (TVL)</h3>
          </div>
          {tvlHealth && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Last updated: {format(new Date(tvlHealth.lastUpdate), 'MMM d, h:mm a')}
            </p>
          )}
        </div>
        {tvlHealth && (
          <div className="text-right">
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              ${tvlHealth.tvl.toLocaleString()}
            </p>
            <p className={`text-sm ${tvlHealth.status === 'healthy' ? 'text-green-500 dark:text-green-400' : 'text-yellow-500 dark:text-yellow-400'}`}>
              {tvlHealth.status === 'healthy' ? 'Data is current' : 'Data is stale'}
            </p>
          </div>
        )}
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 mb-6 flex items-start gap-2">
        <Info className="w-5 h-5 text-blue-500 dark:text-blue-400 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-sm text-blue-700 dark:text-blue-300">
            This TVL data currently only includes assets locked in the Avalanche C-Chain. Data from other chains will be added in future updates.
          </p>
        </div>
      </div>

      <div className="h-64">
        <Line data={data} options={options} />
      </div>
    </div>
  );
}