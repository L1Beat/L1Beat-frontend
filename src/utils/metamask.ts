import { Chain } from '../types';

export interface MetaMaskError extends Error {
  code: number;
  message: string;
}

export interface EthereumProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  isMetaMask?: boolean;
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

/**
 * Check if MetaMask is installed
 */
export function isMetaMaskInstalled(): boolean {
  return typeof window !== 'undefined' && 
         typeof window.ethereum !== 'undefined' && 
         window.ethereum.isMetaMask === true;
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
  if (!isMetaMaskInstalled()) {
    throw new Error('MetaMask is not installed');
  }

  if (!chain.networkToken) {
    throw new Error('Network token information is required');
  }

  // Generate RPC URL if not provided
  const rpcUrl = chain.rpcUrl || generateRpcUrl(chain.chainId);
  
  try {
    await window.ethereum!.request({
      method: 'wallet_addEthereumChain',
      params: [{
        chainId: chain.chainId.startsWith('0x') ? chain.chainId : `0x${parseInt(chain.chainId).toString(16)}`,
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
  if (!isMetaMaskInstalled()) {
    throw new Error('MetaMask is not installed');
  }

  const hexChainId = chainId.startsWith('0x') ? chainId : `0x${parseInt(chainId).toString(16)}`;
  
  try {
    await window.ethereum!.request({
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
  if (!isMetaMaskInstalled()) {
    throw new Error('MetaMask is not installed');
  }

  try {
    const accounts = await window.ethereum!.request({
      method: 'eth_requestAccounts'
    });
    
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
  if (!isMetaMaskInstalled()) {
    throw new Error('MetaMask is not installed');
  }

  try {
    const chainId = await window.ethereum!.request({
      method: 'eth_chainId'
    });
    
    return chainId;
  } catch (error) {
    const metamaskError = error as MetaMaskError;
    throw new Error(`Failed to get current network: ${metamaskError.message}`);
  }
}