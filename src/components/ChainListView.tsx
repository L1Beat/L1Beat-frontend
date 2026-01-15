import { memo, useCallback } from 'react';
import { Chain } from '../types';
import { Server, Zap, Shield } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';

interface ChainListViewProps {
  chains: Chain[];
}

interface ChainListItemProps {
  chain: Chain;
  index: number;
  onNavigate: (chainId: string) => void;
}

// Helper functions moved outside component
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

// Memoized list item to prevent re-renders during parent animations
const ChainListItem = memo(function ChainListItem({ chain, index, onNavigate }: ChainListItemProps) {
  const tpsValue = formatTPS(chain.tps);
  const tpsColor = getTPSColor(tpsValue);
  
  return (
    <motion.div
      className="bg-white dark:bg-[#1a1a1a] rounded-xl border border-gray-200 dark:border-gray-800 p-4 cursor-pointer group transition-all duration-300 hover:border-[#ef4444]/50 hover:shadow-[0_10px_25px_-5px_rgba(239,68,68,0.1),0_8px_10px_-6px_rgba(239,68,68,0.05)]"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.4,
        delay: Math.min(index * 0.05, 0.5), // Cap delay to prevent long waits
        ease: [0.25, 0.46, 0.45, 0.94]
      }}
      whileHover={{
        y: -4,
        scale: 1.02,
      }}
      whileTap={{ scale: 0.98 }}
      onClick={() => onNavigate(chain.chainId)}
    >
      <div className="flex items-center gap-3">
        {chain.chainLogoUri ? (
          <motion.img
            src={chain.chainLogoUri}
            alt={`${chain.chainName} logo`}
            className="w-10 h-10 rounded-lg shadow-sm flex-shrink-0 bg-white dark:bg-gray-900"
            whileHover={{ scale: 1.1 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            onError={(e) => {
              e.currentTarget.src = "/icon-dark-animated.svg";
              e.currentTarget.onerror = null;
            }}
          />
        ) : (
          <motion.img
            src="/icon-dark-animated.svg"
            alt={`${chain.chainName} logo`}
            className="w-10 h-10 rounded-lg shadow-sm flex-shrink-0 bg-white dark:bg-gray-900"
            whileHover={{ scale: 1.1 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          />
        )}
        
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate mb-1.5">
            {chain.chainName}
          </h3>
          <div className="flex items-center gap-2 whitespace-nowrap">
            <div className="flex items-center gap-1 min-w-[70px]">
              <Zap className={`w-3 h-3 ${tpsColor} flex-shrink-0`} />
              <span className={`text-xs font-medium ${tpsColor}`}>
                {tpsValue} TPS
              </span>
            </div>
            <div className="w-px h-3 bg-gray-200 dark:bg-gray-700 flex-shrink-0"></div>
            <div className="flex items-center gap-1 min-w-[30px]">
              <Server className="w-3 h-3 text-gray-400 dark:text-gray-500 flex-shrink-0" />
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                {chain.validatorCount || 0}
              </span>
            </div>
            <div className="w-px h-3 bg-gray-200 dark:bg-gray-700 flex-shrink-0"></div>
            <div className="flex items-center gap-1 cursor-help" title="Coming Soon">
              <Shield className="w-3 h-3 text-gray-400 dark:text-gray-500 flex-shrink-0" />
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-yellow-500/10 text-yellow-600 dark:text-yellow-500 border border-yellow-500/20">
                STAGE
              </span>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison - only re-render if chain data changes
  return (
    prevProps.chain.chainId === nextProps.chain.chainId &&
    prevProps.chain.tps?.value === nextProps.chain.tps?.value &&
    prevProps.chain.validatorCount === nextProps.chain.validatorCount &&
    prevProps.index === nextProps.index
  );
});

// Memoized container component
export const ChainListView = memo(function ChainListView({ chains }: ChainListViewProps) {
  const navigate = useNavigate();

  const handleNavigate = useCallback((chainId: string) => {
    // Save current scroll position before navigating
    sessionStorage.setItem('dashboardScrollPosition', window.scrollY.toString());
    navigate(`/chain/${chainId}`);
  }, [navigate]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
      {chains.map((chain, index) => (
        <ChainListItem
          key={chain.chainId}
          chain={chain}
          index={index}
          onNavigate={handleNavigate}
        />
      ))}
    </div>
  );
});