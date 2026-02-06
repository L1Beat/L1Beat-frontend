import { memo, useState, useMemo } from 'react';
import { Chain } from '../../types';
import { Search, X, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ChainSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  chains: Chain[];
  selectedChainIds: string[];
  onSelectChain: (chain: Chain) => void;
  maxChains?: number;
}

export const ChainSelector = memo(function ChainSelector({
  isOpen,
  onClose,
  chains,
  selectedChainIds,
  onSelectChain,
  maxChains = 4
}: ChainSelectorProps) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredChains = useMemo(() => {
    return chains.filter(chain =>
      chain.chainName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      chain.chainId.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [chains, searchTerm]);

  const isSelected = (chainId: string) => selectedChainIds.includes(chainId);
  const canSelectMore = selectedChainIds.length < maxChains;

  const handleChainClick = (chain: Chain) => {
    if (isSelected(chain.chainId)) {
      return;
    }
    if (!canSelectMore) {
      return;
    }
    onSelectChain(chain);
    setSearchTerm('');
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="bg-white dark:bg-dark-800 rounded-xl shadow-2xl max-w-3xl w-full max-h-[80vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                Select Chains to Compare
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {selectedChainIds.length} of {maxChains} selected
              </p>
            </div>
            <motion.button
              onClick={onClose}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            </motion.button>
          </div>

          {/* Search Bar */}
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search chains..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-dark-900 text-gray-900 dark:text-white placeholder-gray-500 transition-all focus:outline-none focus:ring-2 focus:ring-[#ef4444]/20 focus:border-[#ef4444]"
                autoFocus
              />
            </div>
          </div>

          {/* Chain Grid */}
          <div className="flex-1 overflow-y-auto p-6">
            {filteredChains.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500 dark:text-gray-400">
                  No chains found matching "{searchTerm}"
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {filteredChains.map((chain) => {
                  const selected = isSelected(chain.chainId);
                  const disabled = !selected && !canSelectMore;

                  return (
                    <motion.button
                      key={chain.chainId}
                      onClick={() => handleChainClick(chain)}
                      disabled={disabled}
                      whileHover={!disabled ? { scale: 1.02 } : {}}
                      whileTap={!disabled ? { scale: 0.98 } : {}}
                      className={`flex items-center gap-3 p-4 rounded-lg border transition-all text-left ${
                        selected
                          ? 'bg-[#ef4444]/10 border-[#ef4444] cursor-default'
                          : disabled
                          ? 'bg-gray-50 dark:bg-dark-900/50 border-gray-200 dark:border-gray-700 opacity-50 cursor-not-allowed'
                          : 'bg-white dark:bg-dark-900 border-gray-200 dark:border-gray-700 hover:border-[#ef4444]/50 hover:bg-gray-50 dark:hover:bg-dark-900/80'
                      }`}
                    >
                      {chain.chainLogoUri ? (
                        <img
                          src={chain.chainLogoUri}
                          alt={`${chain.chainName} logo`}
                          className="w-10 h-10 rounded-lg shadow-sm flex-shrink-0"
                          onError={(e) => {
                            e.currentTarget.src = "/icon-dark-animated.svg";
                            e.currentTarget.onerror = null;
                          }}
                        />
                      ) : (
                        <img
                          src="/icon-dark-animated.svg"
                          alt={`${chain.chainName} logo`}
                          className="w-10 h-10 rounded-lg shadow-sm flex-shrink-0"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                          {chain.chainName}
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {chain.validatorCount || 0} validators
                        </p>
                      </div>
                      {selected && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ type: "spring", stiffness: 500, damping: 30 }}
                        >
                          <CheckCircle2 className="w-6 h-6 text-[#ef4444] flex-shrink-0" />
                        </motion.div>
                      )}
                    </motion.button>
                  );
                })}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
});
