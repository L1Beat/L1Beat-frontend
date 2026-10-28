import type { Chain } from '../types';

/** Head tags for a chain page; the SSG build writes the same ones into /chain/<slug>/index.html. */
export function chainSeo(chain: Chain) {
  return {
    title: chain.chainName,
    description:
      chain.description?.slice(0, 200) ||
      `${chain.chainName} on Avalanche: current TPS, validators, economics, and a side-by-side compare against other L1s.`,
    image: chain.chainLogoUri,
    url: `/chain/${chain.chainId}`,
  };
}
