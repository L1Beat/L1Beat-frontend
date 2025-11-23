import { Chain } from '../types';
import { Activity, Server, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

interface ChainCardProps {
  chain: Chain;
}

export function ChainCard({ chain }: ChainCardProps) {
  const navigate = useNavigate();

  const handleNavigate = () => {
    // Save current scroll position before navigating
    sessionStorage.setItem('dashboardScrollPosition', window.scrollY.toString());
    navigate(`/chain/${chain.chainId}`);
  };

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
      onClick={handleNavigate}
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
                onError={(e) => {
                  e.currentTarget.src = "https://i.postimg.cc/gcq3RxBm/SAVE-20251114-181539.jpg";
                  e.currentTarget.onerror = null;
                }}
              />
            ) : (
              <motion.img
                src="https://i.postimg.cc/gcq3RxBm/SAVE-20251114-181539.jpg"
                alt={`${chain.chainName} logo`}
                className="w-10 h-10 rounded-lg shadow-sm"
                whileHover={{ scale: 1.1, rotate: 5 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              />
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
          <motion.div
            className="p-3 rounded-lg bg-gray-50 dark:bg-dark-800/50"
            whileHover={{ scale: 1.02 }}
            transition={{ duration: 0.2 }}
          >
            <div className="flex items-center gap-2 mb-1">
              <Activity className={`w-4 h-4 ${tpsColor}`} />
              <span className="text-sm text-gray-600 dark:text-gray-300">TPS</span>
            </div>
            <AnimatePresence mode="popLayout">
              <motion.span
                key={tpsValue}
                initial={{ opacity: 0, y: 5, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -5, scale: 0.95 }}
                transition={{
                  duration: 0.4,
                  ease: [0.4, 0.0, 0.2, 1]
                }}
                className={`text-lg font-bold ${tpsColor} inline-block`}
              >
                {tpsValue}
              </motion.span>
            </AnimatePresence>
          </motion.div>

          <motion.div
            className="p-3 rounded-lg bg-gray-50 dark:bg-dark-800/50"
            whileHover={{ scale: 1.02 }}
            transition={{ duration: 0.2 }}
          >
            <div className="flex items-center gap-2 mb-1">
              <Server className="w-4 h-4 text-blue-500 dark:text-blue-400" />
              <span className="text-sm text-gray-600 dark:text-gray-300">Validators</span>
            </div>
            <AnimatePresence mode="popLayout">
              <motion.span
                key={chain.validators?.length || 0}
                initial={{ opacity: 0, y: 5, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -5, scale: 0.95 }}
                transition={{
                  duration: 0.4,
                  ease: [0.4, 0.0, 0.2, 1]
                }}
                className="text-lg font-bold text-blue-600 dark:text-blue-400 inline-block"
              >
                {chain.validators?.length || 0}
              </motion.span>
            </AnimatePresence>
          </motion.div>
        </div>

        {/* Category Badges */}
        {chain.categories && chain.categories.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700/50">
            <div className="flex flex-wrap gap-2">
              {chain.categories.slice(0, 3).map(category => (
                <span
                  key={category}
                  className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300"
                >
                  {category}
                </span>
              ))}
              {chain.categories.length > 3 && (
                <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center">
                  +{chain.categories.length - 3}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Network Badge */}
        {chain.network && (
          <div className="mt-3">
            <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
              chain.network === 'mainnet'
                ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300'
                : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300'
            }`}>
              {chain.network === 'mainnet' ? 'Mainnet' : 'Fuji Testnet'}
            </span>
          </div>
        )}

        {chain.networkToken && (
          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700/50">
            <div className="flex items-center gap-2">
              {chain.networkToken.logoUri && (
                <img
                  src={chain.networkToken.logoUri}
                  alt={`${chain.networkToken.name} logo`}
                  className="w-5 h-5 rounded-full"
                  onError={(e) => {
                    e.currentTarget.src = "https://i.postimg.cc/gcq3RxBm/SAVE-20251114-181539.jpg";
                    e.currentTarget.onerror = null;
                  }}
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