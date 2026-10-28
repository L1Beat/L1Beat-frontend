import type { Chain } from '../types';

/**
 * A few EVM chain IDs are registered on two blockchains (a chain that moved
 * subnets). Activity is keyed by EVM ID, so it belongs to one of them only:
 * the one with more active validators, first listed on a tie.
 */
export function activityOwners(chains: Chain[]): Map<string, Chain> {
  const owners = new Map<string, Chain>();
  for (const chain of chains) {
    if (!chain.evmChainId) continue;
    const key = String(chain.evmChainId);
    const prev = owners.get(key);
    if (!prev || (chain.validatorCount ?? 0) > (prev.validatorCount ?? 0)) owners.set(key, chain);
  }
  return owners;
}

/** The chain whose page and totals carry this chain's activity; itself unless it shares an EVM ID. */
export function activityOwnerOf(owners: Map<string, Chain>, chain: Chain): Chain {
  return (chain.evmChainId && owners.get(String(chain.evmChainId))) || chain;
}
