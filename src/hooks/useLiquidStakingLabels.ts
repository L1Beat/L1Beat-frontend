import { useEffect, useState } from 'react';
import { getLiquidStaking } from '../api';

/** Protocol logos, hosted with the site, keyed by the indexer's protocol id. */
export const LIQUID_STAKING_LOGOS: Record<string, string> = {
  'benqi-savax': '/logos/benqi.jpg',
};

export interface LiquidStakingLabel {
  name: string;
  token: string;
  /** 'unconfirmed': matched on-chain, not published by the protocol. */
  attribution: 'confirmed' | 'unconfirmed';
  logo?: string;
}

/** P-Chain address → the liquid staking protocol that delegates from it. Empty until loaded. */
export function useLiquidStakingLabels(): Record<string, LiquidStakingLabel> {
  const [labels, setLabels] = useState<Record<string, LiquidStakingLabel>>({});
  useEffect(() => {
    let cancelled = false;
    getLiquidStaking().then((d) => {
      if (cancelled || !d) return;
      const out: Record<string, LiquidStakingLabel> = {};
      for (const p of d.protocols) {
        for (const a of p.p_chain_addresses) {
          out[a] = { name: p.name, token: p.token_symbol, attribution: p.attribution, logo: LIQUID_STAKING_LOGOS[p.id] };
        }
      }
      setLabels(out);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return labels;
}
