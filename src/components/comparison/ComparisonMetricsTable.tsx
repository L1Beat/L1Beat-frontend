import { memo, useMemo } from 'react';
import { Chain, TPSHistory, CumulativeTxCount, DailyTxCount } from '../../types';
import { Activity, Server, Loader2, BarChart3 } from 'lucide-react';

interface ChainComparisonData {
  chain: Chain;
  tpsHistory: TPSHistory[];
  cumulativeTx: CumulativeTxCount[];
  dailyTxCount: DailyTxCount[];
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
      // Compute latest TPS from history since /chains endpoint doesn't include it
      const latestTps = data.tpsHistory.length > 0
        ? data.tpsHistory[data.tpsHistory.length - 1].totalTps
        : (data.chain.tps?.value || 0);
      const validatorCount = data.chain.validatorCount || 0;
      // Compute cumulative tx from history since /chains endpoint doesn't include it
      const latestCumulativeTx = data.cumulativeTx.length > 0
        ? data.cumulativeTx[data.cumulativeTx.length - 1].value
        : (data.chain.cumulativeTxCount?.value || 0);

      return {
        chainId: data.chain.chainId,
        chainName: data.chain.chainName,
        tps: latestTps,
        validators: validatorCount,
        cumulativeTx: latestCumulativeTx,
        loading: data.loading
      };
    });

    const maxTps = Math.max(...chains.map(c => c.tps));
    const maxValidators = Math.max(...chains.map(c => c.validators));
    const maxCumulativeTx = Math.max(...chains.map(c => c.cumulativeTx));

    return {
      chains,
      best: { maxTps, maxValidators, maxCumulativeTx }
    };
  }, [comparisonChains]);

  const formatTPS = (tps: number) => {
    if (tps < 0.6) return '< 1.0';
    return tps.toFixed(2);
  };

  const formatCumulativeTx = (value: number) => {
    if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
    return value.toLocaleString();
  };

  const isBest = (value: number, max: number) => value > 0 && value === max;

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
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
            {/* TPS Row */}
            <tr className="hover:bg-muted/30 transition-colors">
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-[#ef4444]" />
                  <span className="text-sm font-medium text-foreground">TPS</span>
                </div>
              </td>
              {metrics.chains.map((chain) => {
                const best = isBest(chain.tps, metrics.best.maxTps);
                return (
                  <td key={chain.chainId} className="px-6 py-4 whitespace-nowrap">
                    {chain.loading ? (
                      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    ) : (
                      <span
                        className={`text-lg font-bold ${
                          best
                            ? 'text-green-600 dark:text-green-400'
                            : 'text-foreground'
                        }`}
                      >
                        {formatTPS(chain.tps)}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>

            {/* Validators Row */}
            <tr className="hover:bg-muted/30 transition-colors">
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="flex items-center gap-2">
                  <Server className="w-4 h-4 text-[#ef4444]" />
                  <span className="text-sm font-medium text-foreground">Validators</span>
                </div>
              </td>
              {metrics.chains.map((chain) => {
                const best = isBest(chain.validators, metrics.best.maxValidators);
                return (
                  <td key={chain.chainId} className="px-6 py-4 whitespace-nowrap">
                    {chain.loading ? (
                      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    ) : (
                      <span
                        className={`text-lg font-bold ${
                          best
                            ? 'text-green-600 dark:text-green-400'
                            : 'text-foreground'
                        }`}
                      >
                        {chain.validators}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>

            {/* Cumulative Transactions Row */}
            <tr className="hover:bg-muted/30 transition-colors">
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-[#ef4444]" />
                  <span className="text-sm font-medium text-foreground">Total Transactions</span>
                </div>
              </td>
              {metrics.chains.map((chain) => {
                const best = isBest(chain.cumulativeTx, metrics.best.maxCumulativeTx);
                return (
                  <td key={chain.chainId} className="px-6 py-4 whitespace-nowrap">
                    {chain.loading ? (
                      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    ) : chain.cumulativeTx === 0 ? (
                      <span className="text-sm text-muted-foreground">N/A</span>
                    ) : (
                      <span
                        className={`text-lg font-bold ${
                          best
                            ? 'text-green-600 dark:text-green-400'
                            : 'text-foreground'
                        }`}
                      >
                        {formatCumulativeTx(chain.cumulativeTx)}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
});
