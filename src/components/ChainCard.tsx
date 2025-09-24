import { Chain } from '../types';
import { Activity, Server, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';

interface ChainCardProps {
  chain: Chain;
}

export function ChainCard({ chain }: ChainCardProps) {
  const navigate = useNavigate();

  const formatTPS = (tps: Chain['tps']) => {
    if (!tps || typeof tps.value !== 'number') return 'N/A';
    if (tps.value < 0.6) return '< 1.0';
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

  const tpsValue = formatTPS(chain.tps);
  const tpsColor = getTPSColor(tpsValue);

  return (
    <motion.div
      className="stat-card cursor-pointer"
      onClick={() => navigate(`/chain/${chain.chainId}`)}
      whileHover={{
        y: -4,
        scale: 1.02,
        boxShadow: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 10px 10px -5px rgb(0 0 0 / 0.04)"
      }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            {chain.chainLogoUri ? (
              <motion.img
                src={chain.chainLogoUri}
                alt={`${chain.chainName} logo`}
                className="w-10 h-10 rounded-lg shadow-sm"
                whileHover={{ scale: 1.1, rotate: 5 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              />
            ) : (
              <motion.div
                className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center"
                whileHover={{
                  scale: 1.1,
                  backgroundColor: "rgb(191 219 254)",
                  rotate: 5
                }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                <motion.div
                  whileHover={{ rotate: 15 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                >
                  <Server className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </motion.div>
              </motion.div>
            )}
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                {chain.chainName}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">ID: {chain.chainId}</p>
            </div>
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 rounded-lg bg-gray-50 dark:bg-dark-800/50">
            <div className="flex items-center gap-2 mb-1">
              <Activity className={`w-4 h-4 ${tpsColor}`} />
              <span className="text-sm text-gray-600 dark:text-gray-300">TPS</span>
            </div>
            <span className={`text-lg font-bold ${tpsColor}`}>{tpsValue}</span>
          </div>

          <div className="p-3 rounded-lg bg-gray-50 dark:bg-dark-800/50">
            <div className="flex items-center gap-2 mb-1">
              <Server className="w-4 h-4 text-blue-500 dark:text-blue-400" />
              <span className="text-sm text-gray-600 dark:text-gray-300">Validators</span>
            </div>
            <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
              {chain.validators?.length || 0}
            </span>
          </div>
        </div>

        {chain.networkToken && (
          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700/50">
            <div className="flex items-center gap-2">
              {chain.networkToken.logoUri && (
                <img 
                  src={chain.networkToken.logoUri} 
                  alt={`${chain.networkToken.name} logo`}
                  className="w-5 h-5 rounded-full"
                />
              )}
              <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                {chain.networkToken.name} ({chain.networkToken.symbol})
              </span>
            </div>
          </div>
        )}

        {chain.tps?.timestamp && (
          <div className="mt-4 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <Clock className="w-3 h-3" />
            <span>Updated {format(new Date(chain.tps.timestamp * 1000), 'MMM d, h:mm a')}</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}