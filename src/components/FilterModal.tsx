import React from 'react';
import { X, Filter, Users, RotateCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface FilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCategory: string;
  onCategoryChange: (value: string) => void;
  categories: string[];
  showChainsWithoutValidators: boolean;
  onShowChainsWithoutValidatorsChange: (value: boolean) => void;
}

export function FilterModal({
  isOpen,
  onClose,
  selectedCategory,
  onCategoryChange,
  categories,
  showChainsWithoutValidators,
  onShowChainsWithoutValidatorsChange
}: FilterModalProps) {
  const handleReset = () => {
    onCategoryChange('');
    onShowChainsWithoutValidatorsChange(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onClose();
    }
  };

  const hasActiveFilters =
    selectedCategory !== '' ||
    showChainsWithoutValidators;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black bg-opacity-60 z-40"
            onClick={onClose}
          />

          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              onKeyDown={handleKeyDown}
              className="bg-card rounded-2xl border border-border max-w-md w-full max-h-[90vh] overflow-y-auto pointer-events-auto"
            >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-border">
            <div className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-[#ef4444] dark:text-[#ef4444]" />
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Filter Chains
              </h2>
            </div>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* Category Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                Category
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => onCategoryChange('')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                    selectedCategory === ''
                      ? 'bg-[#ef4444] text-white'
                      : 'bg-muted text-foreground hover:bg-accent'
                  }`}
                >
                  All
                </button>
                {categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => onCategoryChange(selectedCategory === cat ? '' : cat)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                      selectedCategory === cat
                        ? 'bg-[#ef4444] text-white'
                        : 'bg-muted text-foreground hover:bg-accent'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Validator Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Validators
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showChainsWithoutValidators}
                  onChange={(e) => onShowChainsWithoutValidatorsChange(e.target.checked)}
                  className="w-4 h-4 text-[#ef4444] border-border rounded focus:ring-[#ef4444] bg-muted cursor-pointer"
                />
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    Include chains without validators
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-6 border-t border-border">
            <motion.button
              onClick={handleReset}
              disabled={!hasActiveFilters}
              whileHover={hasActiveFilters ? { scale: 1.02 } : {}}
              whileTap={hasActiveFilters ? { scale: 0.98 } : {}}
              className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Reset Filters
            </motion.button>
            <motion.button
              onClick={onClose}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="px-6 py-2 bg-[#ef4444] hover:bg-[#dc2626] text-white text-sm font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-[#ef4444] focus:ring-offset-2"
            >
              Apply
            </motion.button>
          </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
