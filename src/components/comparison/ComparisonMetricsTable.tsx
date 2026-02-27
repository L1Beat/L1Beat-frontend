import { memo, useMemo } from 'react';
import { Chain, DailyTxCount, DailyActiveAddresses, MaxTPSHistory, GasUsedHistory, AvgGasPriceHistory, FeesPaidHistory } from '../../types';
import { Activity, Server, Loader2, BarChart3 } from 'lucide-react';
import { motion } from 'framer-motion';

interface ChainComparisonData {
  chain: Chain;
  dailyActiveAddresses: DailyActiveAddresses[];
  dailyTxCount: DailyTxCount[];
  maxTPS: MaxTPSHistory[];
  gasUsed: GasUsedHistory[];
  avgGasPrice: AvgGasPriceHistory[];
  feesPaid: FeesPaidHistory[];
  loading: boolean;
}

interface ComparisonMetricsTableProps {
  comparisonChains: ChainComparisonData[];
}

export const ComparisonMetricsTable = memo(function ComparisonMetricsTable({
  comparisonChains
}: ComparisonMetricsTableProps) {
  const metrics = useMemo(() => {
    const chains = comparisonChains.map(data => {
      const latestMaxTps = data.maxTPS.length > 0
        ? data.maxTPS[data.maxTPS.length - 1].value
        : 0;
      const validatorCount = data.chain.validatorCount || 0;
      const latestDailyTx = data.dailyTxCount.length > 0
        ? data.dailyTxCount[data.dailyTxCount.length - 1].value
        : 0;

      return {
        chainId: data.chain.chainId,
        chainName: data.chain.chainName,
        maxTps: latestMaxTps,
        validators: validatorCount,
        dailyTx: latestDailyTx,
        loading: data.loading
      };
    });

    const maxMaxTps = Math.max(...chains.map(c => c.maxTps));
    const maxValidators = Math.max(...chains.map(c => c.validators));
    const maxDailyTx = Math.max(...chains.map(c => c.dailyTx));

    return {
      chains,
      best: { maxMaxTps, maxValidators, maxDailyTx }
    };
  }, [comparisonChains]);

  const formatTPS = (tps: number) => {
    if (tps < 0.6) return '< 1.0';
    return tps.toFixed(2);
  };

  const formatCount = (value: number) => {
    if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
    return value.toLocaleString();
  };

  const isBest = (value: number, max: number) => value > 0 && value === max;

  const rows = [
    {
      key: 'maxTps',
      icon: Activity,
      label: 'Max TPS',
      getValue: (c: typeof metrics.chains[0]) => c.maxTps,
      getBest: (c: typeof metrics.chains[0]) => isBest(c.maxTps, metrics.best.maxMaxTps),
      format: formatTPS,
    },
    {
      key: 'validators',
      icon: Server,
      label: 'Validators',
      getValue: (c: typeof metrics.chains[0]) => c.validators,
      getBest: (c: typeof metrics.chains[0]) => isBest(c.validators, metrics.best.maxValidators),
      format: (v: number) => String(v),
    },
    {
      key: 'dailyTx',
      icon: BarChart3,
      label: 'Daily Transactions',
      getValue: (c: typeof metrics.chains[0]) => c.dailyTx,
      getBest: (c: typeof metrics.chains[0]) => isBest(c.dailyTx, metrics.best.maxDailyTx),
      format: formatCount,
      showNA: true,
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
      className="bg-card border border-border rounded-xl overflow-hidden shadow-sm"
    >
      <div className="p-6 border-b border-border bg-muted/20">
        <h3 className="text-lg font-semibold text-foreground">
          Performance Metrics
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Best values highlighted in green
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-border">
          <thead className="bg-muted/20">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Metric
              </th>
              {metrics.chains.map((chain) => (
                <th
                  key={chain.chainId}
                  className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                >
                  <div className="flex items-center gap-2">
                    <span className="truncate max-w-[150px]" title={chain.chainName}>
                      {chain.chainName}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-card divide-y divide-border">
            {rows.map((row, rowIndex) => {
              const Icon = row.icon;
              return (
                <motion.tr
                  key={row.key}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: rowIndex * 0.06, duration: 0.3 }}
                  className="hover:bg-muted/30 transition-colors"
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4 text-[#ef4444]" />
                      <span className="text-sm font-medium text-foreground">{row.label}</span>
                    </div>
                  </td>
                  {metrics.chains.map((chain) => {
                    const value = row.getValue(chain);
                    const best = row.getBest(chain);
                    return (
                      <td key={chain.chainId} className="px-6 py-4 whitespace-nowrap">
                        {chain.loading ? (
                          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                        ) : row.showNA && value === 0 ? (
                          <span className="text-sm text-muted-foreground">N/A</span>
                        ) : (
                          <motion.span
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: rowIndex * 0.06 + 0.15 }}
                            className={`text-lg font-bold ${
                              best
                                ? 'text-green-600 dark:text-green-400'
                                : 'text-foreground'
                            }`}
                          >
                            {row.format(value)}
                          </motion.span>
                        )}
                      </td>
                    );
                  })}
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
});
