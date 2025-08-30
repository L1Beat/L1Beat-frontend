import { Chain } from '../types';
import { Activity, Server, Plus, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface ChainListViewProps {
  chains: Chain[];
}

export function ChainListView({ chains }: ChainListViewProps) {
  const navigate = useNavigate();

  const formatTPS = (tps: Chain['tps']) => {
    if (!tps || typeof tps.value !== 'number') return 'N/A';
    if (tps.value < 0.5) return '< 1.0';
    return tps.value.toFixed(2);
  };

  const getTPSColor = (tpsStr: string) => {
    if (tpsStr === 'N/A') return 'text-gray-400 dark:text-gray-500';
    if (tpsStr === '< 1.0') return 'text-yellow-500 dark:text-yellow-400';
    const tps = Number(tpsStr);
    if (tps >= 1) return 'text-green-500 dark:text-green-400';
    if (tps >= 0.5) return 'text-yellow-500 dark:text-yellow-400';
    return 'text-red-500 dark:text-red-400';
  };

  const formatCumulativeTxCount = (cumulativeTxCount: Chain['cumulativeTxCount']) => {
    if (!cumulativeTxCount || typeof cumulativeTxCount.value !== 'number') return 'N/A';
    const count = cumulativeTxCount.value;
    if (count >= 1e9) return `${(count / 1e9).toFixed(1)}B`;
    if (count >= 1e6) return `${(count / 1e6).toFixed(1)}M`;
    if (count >= 1e3) return `${(count / 1e3).toFixed(1)}K`;
    return count.toString();
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {chains.map((chain, index) => {
        const tpsValue = formatTPS(chain.tps);
        const tpsColor = getTPSColor(tpsValue);
        const cumulativeTxValue = formatCumulativeTxCount(chain.cumulativeTxCount);
        
        return (
          <div 
            key={chain.chainId}
            className="bg-white dark:bg-dark-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 cursor-pointer hover:shadow-lg hover:shadow-blue-500/10 hover:border-blue-400 dark:hover:border-blue-500 hover:-translate-y-1 hover:scale-[1.02] transition-all duration-300 ease-out group animate-fade-in"
            style={{
              animationDelay: `${index * 50}ms`,
              animationFillMode: 'both'
            }}
            onClick={() => navigate(`/chain/${chain.chainId}`)}
          >
            <div className="flex items-center gap-3">
              {chain.chainLogoUri ? (
                <img 
                  src={chain.chainLogoUri} 
                  alt={`${chain.chainName} logo`}
                  className="w-8 h-8 rounded-lg shadow-sm flex-shrink-0 group-hover:scale-110 transition-transform duration-300"
                />
              ) : (
                <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0 group-hover:scale-110 group-hover:bg-blue-200 dark:group-hover:bg-blue-800/50 transition-all duration-300">
                  <Server className="w-5 h-5 text-blue-600 dark:text-blue-400 group-hover:rotate-12 transition-transform duration-300" />
                </div>
              )}
              
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                  {chain.chainName}
                </h3>
                <div className="flex items-center gap-4 mt-1">
                  <div className="flex items-center gap-1">
                    <Zap className={`w-3 h-3 ${tpsColor}`} />
                    <span className={`text-xs font-medium ${tpsColor}`}>
                      {tpsValue} TPS
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Server className="w-3 h-3 text-blue-500 dark:text-blue-400" />
                    <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                      {chain.validators?.length || 0}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Plus className="w-3 h-3 text-purple-500 dark:text-purple-400" />
                    <span className="text-xs font-medium text-purple-600 dark:text-purple-400">
                      {cumulativeTxValue}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}