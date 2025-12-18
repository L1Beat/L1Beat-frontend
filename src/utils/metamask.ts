import { Chain } from '../types';

export interface WalletError extends Error {
  code: number;
  message: string;
}

export interface EthereumProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  isMetaMask?: boolean;
  isCoreWallet?: boolean;
  providers?: EthereumProvider[];
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

/**
 * Get the CORE wallet provider specifically, even when multiple wallets are installed
 */
export function getCoreProvider(): EthereumProvider | null {
  if (typeof window === 'undefined' || !window.ethereum) {
    console.log('CORE wallet check: No window.ethereum available');
    return null;
  }

  console.log('Ethereum provider info:', {
    isMetaMask: window.ethereum.isMetaMask,
    isCoreWallet: window.ethereum.isCoreWallet,
    hasProviders: !!window.ethereum.providers,
    providersCount: window.ethereum.providers ? window.ethereum.providers.length : 0
  });

  // If there are multiple providers, find CORE wallet first, then any other wallet
  if (window.ethereum.providers && Array.isArray(window.ethereum.providers)) {
    console.log('Multiple providers found, looking for CORE wallet...');
    const coreProvider = window.ethereum.providers.find(
      (provider: EthereumProvider) => provider.isCoreWallet
    );
    if (coreProvider) {
      console.log('Found CORE wallet in providers array');
      return coreProvider;
    }

    // Fallback to any other available wallet
    const otherProvider = window.ethereum.providers[0];
    if (otherProvider) {
      console.log('CORE wallet not found, using other available wallet');
    } else {
      console.log('No wallet providers found in providers array');
    }
    return otherProvider || null;
  }

  // If it's CORE wallet directly
  if (window.ethereum.isCoreWallet) {
    console.log('Found CORE wallet as primary provider');
    return window.ethereum;
  }

  // Fallback to any other wallet
  console.log('CORE wallet not found, using other available wallet');
  return window.ethereum;
}

/**
 * Check if CORE wallet is installed (with other wallets as fallback)
 */
export function isCoreInstalled(): boolean {
  return getCoreProvider() !== null;
}

/**
 * @deprecated Use isCoreInstalled() instead
 */
export function isMetaMaskInstalled(): boolean {
  return isCoreInstalled();
}

/**
 * Generate RPC URL for a chain if not provided
 * This is a fallback method - ideally RPC URLs should come from the API
 */
export function generateRpcUrl(chainId: string): string {
  // For Avalanche subnets, we'll use a common pattern
  // This is a fallback - real RPC URLs should come from the chain data
  return `https://subnets.avax.network/subnet/${chainId}/rpc`;
}

function toHexChainId(chain: Chain): string {
  // Prefer explicit EVM chain id fields; chain.chainId is a routing slug in this app.
  const raw =
    (typeof chain.evmChainId === 'number' ? String(chain.evmChainId) : undefined) ||
    chain.originalChainId ||
    chain.chainId;

  if (typeof raw === 'string' && raw.startsWith('0x')) {
    return raw;
  }

  const numeric = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(numeric)) {
    throw new Error('Invalid chain ID format');
  }
  return `0x${numeric.toString(16)}`;
}

/**
 * Add a network to CORE wallet (or other wallet fallback)
 */
export async function addNetworkToWallet(chain: Chain): Promise<boolean> {
  const provider = getCoreProvider();
  if (!provider) {
    throw new Error('CORE wallet (or other wallet) is not installed');
  }

  if (!chain.networkToken) {
    throw new Error('Network token information is required');
  }

  // Prefer real RPC URLs from API; fall back to subnetId-based URL if present.
  const rpcUrl =
    chain.rpcUrl ||
    chain.rpcUrls?.[0] ||
    (chain.subnetId ? generateRpcUrl(chain.subnetId) : undefined) ||
    generateRpcUrl(chain.chainId);

  const hexChainId = toHexChainId(chain);
  
  try {
    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [{
        chainId: hexChainId,
        chainName: chain.chainName,
        nativeCurrency: {
          name: chain.networkToken.name,
          symbol: chain.networkToken.symbol,
          decimals: chain.networkToken.decimals || 18
        },
        rpcUrls: [rpcUrl],
        blockExplorerUrls: chain.explorerUrl ? [chain.explorerUrl] : undefined,
        iconUrls: chain.chainLogoUri ? [chain.chainLogoUri] : undefined
      }]
    });
    
    return true;
  } catch (error) {
    const walletError = error as WalletError;
    
    // User rejected the request
    if (walletError.code === 4001) {
      throw new Error('User rejected the request');
    }
    
    // Chain already added
    if (walletError.code === -32602) {
      throw new Error('Invalid parameters - chain may already be added');
    }

    throw new Error(`Failed to add network: ${walletError.message}`);
  }
}

/**
 * Switch to a specific network in CORE wallet (or other wallet fallback)
 */
export async function switchToNetwork(chainId: string): Promise<boolean> {
  const provider = getCoreProvider();
  if (!provider) {
    throw new Error('CORE wallet (or other wallet) is not installed');
  }

  const hexChainId = chainId.startsWith('0x') ? chainId : `0x${parseInt(chainId).toString(16)}`;
  
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: hexChainId }]
    });
    
    return true;
  } catch (error) {
    const walletError = error as WalletError;
    
    // User rejected the request
    if (walletError.code === 4001) {
      throw new Error('User rejected the request');
    }
    
    // Chain not added to wallet yet
    if (walletError.code === 4902) {
      throw new Error('Chain not found in wallet - please add it first');
    }

    throw new Error(`Failed to switch network: ${walletError.message}`);
  }
}

/**
 * Request account access from CORE wallet (or other wallet fallback)
 */
export async function connectWallet(): Promise<string[]> {
  const provider = getCoreProvider();
  if (!provider) {
    throw new Error('CORE wallet (or other wallet) is not installed');
  }

  try {
    const accounts = await provider.request({
      method: 'eth_requestAccounts'
    }) as string[];
    
    return accounts;
  } catch (error) {
    const walletError = error as WalletError;
    
    if (walletError.code === 4001) {
      throw new Error('User rejected the connection request');
    }
    
    throw new Error(`Failed to connect wallet: ${walletError.message}`);
  }
}

/**
 * Get the current network from CORE wallet (or other wallet fallback)
 */
export async function getCurrentNetwork(): Promise<string> {
  const provider = getCoreProvider();
  if (!provider) {
    throw new Error('CORE wallet (or other wallet) is not installed');
  }

  try {
    const chainId = await provider.request({
      method: 'eth_chainId'
    }) as string;
    
    return chainId;
  } catch (error) {
    const walletError = error as WalletError;
    throw new Error(`Failed to get current network: ${walletError.message}`);
  }
}

/**
 * @deprecated Use addNetworkToWallet() instead
 */
export async function addNetworkToMetaMask(chain: Chain): Promise<boolean> {
  return addNetworkToWallet(chain);
}