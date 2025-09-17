import React, { useState } from 'react';
import { Wallet, Check, AlertCircle, ExternalLink } from 'lucide-react';
import { Chain } from '../types';
import { isCoreInstalled, addNetworkToWallet } from '../utils/metamask';

interface AddToMetaMaskProps {
  chain: Chain;
  variant?: 'default' | 'compact';
  className?: string;
}

export function AddToMetaMask({ chain, variant = 'default', className = '' }: AddToMetaMaskProps) {
  const [status, setStatus] = useState<'idle' | 'adding' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  
  const handleAddToWallet = async () => {
    if (!isCoreInstalled()) {
      window.open('https://core.app/', '_blank', 'noopener,noreferrer');
      return;
    }

    if (!chain.networkToken) {
      setStatus('error');
      setErrorMessage('Network token information is not available');
      setTimeout(() => setStatus('idle'), 3000);
      return;
    }

    setStatus('adding');
    setErrorMessage('');

    try {
      console.log('Attempting to add network to wallet:', {
        chainId: chain.chainId,
        chainName: chain.chainName,
        networkToken: chain.networkToken
      });

      await addNetworkToWallet(chain);
      setStatus('success');
      setTimeout(() => setStatus('idle'), 3000);
    } catch (error) {
      console.error('Wallet add network error:', error);
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Failed to add network');
      setTimeout(() => setStatus('idle'), 5000);
    }
  };


  const getButtonContent = () => {
    if (!isCoreInstalled()) {
      return (
        <>
          <ExternalLink className="w-4 h-4" />
          {variant === 'compact' ? 'CORE' : 'Install CORE'}
        </>
      );
    }

    switch (status) {
      case 'adding':
        return (
          <>
            <div className="w-4 h-4 animate-spin rounded-full border-2 border-current border-t-transparent"></div>
            {variant === 'compact' ? 'Adding...' : 'Adding to Wallet...'}
          </>
        );
      case 'success':
        return (
          <>
            <Check className="w-4 h-4" />
            {variant === 'compact' ? 'Added!' : 'Added to Wallet!'}
          </>
        );
      case 'error':
        return (
          <>
            <AlertCircle className="w-4 h-4" />
            {variant === 'compact' ? 'Error' : 'Try Again'}
          </>
        );
      default:
        return (
          <>
            <Wallet className="w-4 h-4" />
            {variant === 'compact' ? 'Add' : 'Add to Wallet'}
          </>
        );
    }
  };

  const getButtonStyles = () => {
    const baseStyles = "inline-flex items-center gap-2 font-medium rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed";
    
    if (variant === 'compact') {
      switch (status) {
        case 'success':
          return `${baseStyles} px-3 py-1.5 text-xs bg-green-50 text-green-700 border border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-700/50`;
        case 'error':
          return `${baseStyles} px-3 py-1.5 text-xs bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:border-red-700/50 dark:hover:bg-red-900/30 focus:ring-red-500`;
        default:
          return `${baseStyles} px-3 py-1.5 text-xs bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-700/50 dark:hover:bg-orange-900/30 focus:ring-orange-500`;
      }
    } else {
      switch (status) {
        case 'success':
          return `${baseStyles} px-4 py-2 text-sm bg-green-50 text-green-700 border border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-700/50`;
        case 'error':
          return `${baseStyles} px-4 py-2 text-sm bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:border-red-700/50 dark:hover:bg-red-900/30 focus:ring-red-500`;
        default:
          return `${baseStyles} px-4 py-2 text-sm bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-700/50 dark:hover:bg-orange-900/30 focus:ring-orange-500`;
      }
    }
  };

  return (
    <div className={`relative ${className}`}>
      <button
        onClick={handleAddToWallet}
        disabled={status === 'adding' || status === 'success'}
        className={getButtonStyles()}
        title={
          !isCoreInstalled()
            ? "Install CORE wallet to add this network"
            : `Add ${chain.chainName} network to wallet`
        }
      >
        {getButtonContent()}
      </button>
      
      {/* Error tooltip */}
      {status === 'error' && errorMessage && (
        <div className="absolute top-full left-0 mt-2 p-2 bg-red-900 text-red-100 text-xs rounded-lg shadow-lg z-10 max-w-xs">
          <div className="flex items-start gap-1">
            <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
        </div>
      )}
      
      {/* Success message for compact variant */}
      {status === 'success' && variant === 'compact' && (
        <div className="absolute top-full left-0 mt-2 p-2 bg-green-900 text-green-100 text-xs rounded-lg shadow-lg z-10">
          Network added to Wallet!
        </div>
      )}
    </div>
  );
}