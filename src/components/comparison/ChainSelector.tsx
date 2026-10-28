import { memo, useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Chain } from '../../types';
import { Search, X, Check } from 'lucide-react';

interface ChainSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  chains: Chain[];
  selectedChainIds: string[];
  onSelectChain: (chain: Chain) => void;
  maxChains?: number;
}

/** Searchable list of chains to add to the comparison. */
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
    const q = searchTerm.trim().toLowerCase();
    return chains.filter(chain =>
      !q || chain.chainName.toLowerCase().includes(q) || chain.chainId.toLowerCase().includes(q)
    );
  }, [chains, searchTerm]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isSelected = (chainId: string) => selectedChainIds.includes(chainId);
  const canSelectMore = selectedChainIds.length < maxChains;

  const handleChainClick = (chain: Chain) => {
    if (isSelected(chain.chainId) || !canSelectMore) return;
    onSelectChain(chain);
    setSearchTerm('');
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 pt-16 sm:pt-4 bg-black/60"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add a chain to compare"
        className="bg-popover border border-border rounded-md w-full max-w-md max-h-[70vh] flex flex-col overflow-hidden shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 h-11 border-b border-border">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            type="text"
            placeholder="Search chains"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 min-w-0 bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none"
            autoFocus
          />
          <span className="num text-[11px] text-muted-foreground shrink-0">
            {selectedChainIds.length}/{maxChains}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <ul className="flex-1 overflow-y-auto py-1">
          {filteredChains.length === 0 ? (
            <li className="px-4 py-8 text-center text-[13px] text-muted-foreground">No chain matches "{searchTerm}"</li>
          ) : (
            filteredChains.map(chain => {
              const selected = isSelected(chain.chainId);
              const disabled = !selected && !canSelectMore;
              return (
                <li key={chain.chainId}>
                  <button
                    type="button"
                    onClick={() => handleChainClick(chain)}
                    disabled={disabled || selected}
                    className={`w-full flex items-center gap-2.5 h-9 px-3 text-left text-[13px] transition-colors ${
                      selected ? 'text-muted-foreground' : disabled ? 'text-muted-foreground opacity-50' : 'text-foreground hover:bg-accent'
                    }`}
                  >
                    <img
                      src={chain.chainLogoUri || '/icon-dark-animated.svg'}
                      alt=""
                      loading="lazy"
                      className="w-4 h-4 rounded-full object-cover bg-muted shrink-0"
                      onError={(e) => {
                        e.currentTarget.src = '/icon-dark-animated.svg';
                        e.currentTarget.onerror = null;
                      }}
                    />
                    <span className="flex-1 truncate">{chain.chainName}</span>
                    {selected ? (
                      <Check className="w-3.5 h-3.5 shrink-0" aria-label="Added" />
                    ) : (
                      <span className="num text-[11px] text-muted-foreground shrink-0">
                        {(chain.validatorCount ?? 0).toLocaleString()} validators
                      </span>
                    )}
                  </button>
                </li>
              );
            })
          )}
        </ul>
        {!canSelectMore && (
          <p className="px-3 py-2 border-t border-border text-[11px] text-muted-foreground">
            Remove a chain to add another; up to {maxChains} can be compared.
          </p>
        )}
      </div>
    </div>,
    document.body
  );
});
