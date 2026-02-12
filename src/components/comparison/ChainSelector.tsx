import { memo, useState, useMemo } from 'react';
import { Chain } from '../../types';
import { Search, X, Check } from 'lucide-react';
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
    if (isSelected(chain.chainId) || !canSelectMore) return;
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
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden"
          style={{ boxShadow: 'var(--card-shadow)' }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border">
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                Select Chains
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                {selectedChainIds.length}/{maxChains} selected
              </p>
            </div>
            <motion.button
              onClick={onClose}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="p-2 rounded-lg hover:bg-muted transition-colors"
            >
              <X className="w-5 h-5 text-muted-foreground" />
            </motion.button>
          </div>

          {/* Search */}
          <div className="px-6 pt-4 pb-3">
            <div className="relative group/search">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60 group-focus-within/search:text-[#ef4444] transition-colors pointer-events-none" />
              <input
                type="text"
                placeholder="Search chains..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ color: 'var(--foreground)' }}
                className="w-full pl-10 pr-10 py-2.5 text-sm rounded-xl bg-white dark:bg-[#2c2c2e] border border-border placeholder-gray-400 dark:placeholder-gray-500 transition-all focus:outline-none focus:bg-white dark:focus:bg-[#2c2c2e] focus:border-[#ef4444]/40 focus:shadow-[0_0_0_3px_rgba(239,68,68,0.08)]"
                autoFocus
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-md text-muted-foreground/50 hover:text-foreground hover:bg-muted transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Icon Grid */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden px-6 pb-6 scrollbar-hide">
            {filteredChains.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Search className="w-12 h-12 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">No chains found</p>
              </div>
            ) : (
              <div className="grid grid-cols-5 sm:grid-cols-7 md:grid-cols-9 gap-3 pt-10">
                {filteredChains.map((chain, index) => {
                  const selected = isSelected(chain.chainId);
                  const disabled = !selected && !canSelectMore;
                  const logoSrc = chain.chainLogoUri || '/icon-dark-animated.svg';

                  return (
                    <motion.button
                      key={chain.chainId}
                      onClick={() => handleChainClick(chain)}
                      disabled={disabled}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: index * 0.01, duration: 0.15 }}
                      whileHover={!disabled && !selected ? { scale: 1.08, y: -2 } : {}}
                      whileTap={!disabled && !selected ? { scale: 0.95 } : {}}
                      className={`group relative aspect-square rounded-xl border flex items-center justify-center transition-all duration-200 ${
                        selected
                          ? 'border-[#ef4444] bg-[#ef4444]/10 shadow-lg shadow-[#ef4444]/20'
                          : disabled
                          ? 'border-border bg-muted/30 opacity-30 cursor-not-allowed'
                          : 'border-border bg-muted/40 hover:border-[#ef4444]/50 hover:bg-muted/70 hover:shadow-md'
                      }`}
                    >
                      <img
                        src={logoSrc}
                        alt={chain.chainName}
                        className={`w-8 h-8 rounded-lg transition-transform duration-200 ${
                          selected ? 'scale-100' : 'group-hover:scale-110'
                        }`}
                        onError={(e) => {
                          e.currentTarget.src = '/icon-dark-animated.svg';
                          e.currentTarget.onerror = null;
                        }}
                      />

                      {/* Selected checkmark badge */}
                      {selected && (
                        <motion.div
                          initial={{ scale: 0, rotate: -180 }}
                          animate={{ scale: 1, rotate: 0 }}
                          transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-[#ef4444] rounded-full flex items-center justify-center shadow-lg"
                        >
                          <Check className="w-3 h-3 text-white" strokeWidth={3} />
                        </motion.div>
                      )}

                      {/* Hover tooltip */}
                      <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 rounded-lg bg-foreground text-background text-xs font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-50 shadow-lg">
                        {chain.chainName}
                        <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px">
                          <div className="w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-foreground"></div>
                        </div>
                      </div>
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
