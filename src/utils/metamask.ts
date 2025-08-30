import { Chain } from '../types';

export interface MetaMaskError extends Error {
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
 * Get the MetaMask provider specifically, even when multiple wallets are installed
 */
export function getMetaMaskProvider(): EthereumProvider | null {
  if (typeof window === 'undefined' || !window.ethereum) {
    console.log('MetaMask check: No window.ethereum available');
    return null;
  }

  console.log('Ethereum provider info:', {
    isMetaMask: window.ethereum.isMetaMask,
    isCoreWallet: window.ethereum.isCoreWallet,
    hasProviders: !!window.ethereum.providers,
    providersCount: window.ethereum.providers ? window.ethereum.providers.length : 0
  });

  // If there are multiple providers, find MetaMask
  if (window.ethereum.providers && Array.isArray(window.ethereum.providers)) {
    console.log('Multiple providers found, looking for MetaMask...');
    const metamaskProvider = window.ethereum.providers.find(
      (provider: EthereumProvider) => provider.isMetaMask
    );
    if (metamaskProvider) {
      console.log('Found MetaMask in providers array');
    } else {
      console.log('MetaMask not found in providers array');
    }
    return metamaskProvider || null;
  }

  // If it's MetaMask directly
  if (window.ethereum.isMetaMask) {
    console.log('Found MetaMask as primary provider');
    return window.ethereum;
  }

  console.log('MetaMask not detected');
  return null;
}

/**
 * Check if MetaMask is installed
 */
export function isMetaMaskInstalled(): boolean {
  return getMetaMaskProvider() !== null;
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

/**
 * Add a network to MetaMask
 */
export async function addNetworkToMetaMask(chain: Chain): Promise<boolean> {
  const provider = getMetaMaskProvider();
  if (!provider) {
    throw new Error('MetaMask is not installed');
  }

  if (!chain.networkToken) {
    throw new Error('Network token information is required');
  }

  // Generate RPC URL if not provided
  const rpcUrl = chain.rpcUrl || generateRpcUrl(chain.chainId);
  
  // Ensure chainId is in hex format
  let hexChainId: string;
  if (chain.chainId.startsWith('0x')) {
    hexChainId = chain.chainId;
  } else {
    const numericChainId = parseInt(chain.chainId);
    if (isNaN(numericChainId)) {
      throw new Error('Invalid chain ID format');
    }
    hexChainId = `0x${numericChainId.toString(16)}`;
  }
  
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
    const metamaskError = error as MetaMaskError;
    
    // User rejected the request
    if (metamaskError.code === 4001) {
      throw new Error('User rejected the request');
    }
    
    // Chain already added
    if (metamaskError.code === -32602) {
      throw new Error('Invalid parameters - chain may already be added');
    }
    
    throw new Error(`Failed to add network: ${metamaskError.message}`);
  }
}

/**
 * Switch to a specific network in MetaMask
 */
export async function switchToNetwork(chainId: string): Promise<boolean> {
  const provider = getMetaMaskProvider();
  if (!provider) {
    throw new Error('MetaMask is not installed');
  }

  const hexChainId = chainId.startsWith('0x') ? chainId : `0x${parseInt(chainId).toString(16)}`;
  
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: hexChainId }]
    });
    
    return true;
  } catch (error) {
    const metamaskError = error as MetaMaskError;
    
    // User rejected the request
    if (metamaskError.code === 4001) {
      throw new Error('User rejected the request');
    }
    
    // Chain not added to MetaMask yet
    if (metamaskError.code === 4902) {
      throw new Error('Chain not found in MetaMask - please add it first');
    }
    
    throw new Error(`Failed to switch network: ${metamaskError.message}`);
  }
}

/**
 * Request account access from MetaMask
 */
export async function connectWallet(): Promise<string[]> {
  const provider = getMetaMaskProvider();
  if (!provider) {
    throw new Error('MetaMask is not installed');
  }

  try {
    const accounts = await provider.request({
      method: 'eth_requestAccounts'
    }) as string[];
    
    return accounts;
  } catch (error) {
    const metamaskError = error as MetaMaskError;
    
    if (metamaskError.code === 4001) {
      throw new Error('User rejected the connection request');
    }
    
    throw new Error(`Failed to connect wallet: ${metamaskError.message}`);
  }
}

/**
 * Get the current network from MetaMask
 */
export async function getCurrentNetwork(): Promise<string> {
  const provider = getMetaMaskProvider();
  if (!provider) {
    throw new Error('MetaMask is not installed');
  }

  try {
    const chainId = await provider.request({
      method: 'eth_chainId'
    }) as string;
    
    return chainId;
  } catch (error) {
    const metamaskError = error as MetaMaskError;
    throw new Error(`Failed to get current network: ${metamaskError.message}`);
  }
}