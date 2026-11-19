import { format, parseISO, subDays } from 'date-fns';
import { getStablecoins, getStablecoinsTimeseries } from '../api';
import type { TokenFeed } from '../api';
import type { Stablecoin, StablecoinSeriesPoint } from '../types';

// Tokenized money-market funds on the C-Chain. Supply is read in the feed's
// peg units, which is dollars for BUIDL and BENJI (both hold $1 a share). A
// fund with a floating share price will need per-fund pricing from the backend
// before its supply can be shown as dollars.
//
// Where the Funds page reads from. /tokenized-funds lists only funds and is
// live in production; /stablecoins no longer returns BUIDL or BENJI, even with
// token=. 'stablecoins' remains as a one-line fallback if that ever reverts.
export const FUNDS_FEED: TokenFeed = 'tokenized-funds';

// Known funds, keyed by lowercase contract: display names and logos. On the
// 'stablecoins' feed this list also picks the fund rows out of the coins.
export const TOKENIZED_FUNDS = [
  {
    token: '0x53fc82f14f009009b440a706e31c9021e1196a2f',
    issuer: 'BlackRock',
    fund: 'USD Institutional Digital Liquidity Fund',
    logo: 'https://coin-images.coingecko.com/coins/images/36291/large/blackrock.png',
  },
  {
    token: '0xe08b4c1005603427420e64252a8b120cace4d122',
    issuer: 'Franklin Templeton',
    fund: 'OnChain U.S. Government Money Fund',
    logo: 'https://token-icons.llamao.fi/icons/tokens/43114/0xe08b4c1005603427420e64252a8b120cace4d122?h=48&w=48',
  },
] as const;

const FUND_ADDRESSES = new Set<string>(TOKENIZED_FUNDS.map((f) => f.token));

export const isTokenizedFund = (token: string) => FUND_ADDRESSES.has(token.toLowerCase());

export interface FundRow {
  token: string;
  symbol: string;
  issuer: string;
  fund: string;
  logo: string;
  /** Shares outstanding, counted at $1 a share as the feed reports them. */
  supply: number;
  holders: number;
  /** Daily supply over the last 30 days, oldest first. */
  supplySeries: number[];
  /** Percent, against 30 days ago. null when there's no history that far back. */
  supplyChange: number | null;
  holdersChange: number | null;
  /** Supply 30 days ago, for the aggregate change. */
  supply30d: number | null;
}

// Last value on or before a date, from a series ordered oldest first.
function valueAt(points: StablecoinSeriesPoint[], at: Date, scale: number): number | null {
  let hit: number | null = null;
  for (const p of points) {
    if (parseISO(p.period) > at) break;
    hit = Number(p.value) / scale;
  }
  return hit;
}

const pct = (now: number, then: number | null) => (then != null && then > 0 ? ((now - then) / then) * 100 : null);

export async function loadTokenizedFunds(evmChainId = 43114): Promise<FundRow[]> {
  const all: Stablecoin[] = await getStablecoins(evmChainId, FUNDS_FEED);
  // The funds feed lists only funds; the stablecoins feed needs picking.
  const coins = FUNDS_FEED === 'stablecoins' ? all.filter((c) => isTokenizedFund(c.token)) : all;
  const from = format(subDays(new Date(), 45), 'yyyy-MM-dd');
  const ago = subDays(new Date(), 30);

  const rows = await Promise.all(
    coins.map(async (coin): Promise<FundRow> => {
      const token = coin.token.toLowerCase();
      const known = TOKENIZED_FUNDS.find((f) => f.token === token);
      const f = {
        token,
        issuer: known?.issuer ?? coin.issuer ?? coin.symbol,
        fund: known?.fund ?? coin.name,
        logo: known?.logo ?? `https://token-icons.llamao.fi/icons/tokens/${evmChainId}/${token}?h=48&w=48`,
      };
      const scale = 10 ** coin.decimals;
      const series = { evmChainId, feed: FUNDS_FEED, token, from, limit: 90 };
      const [sup, hol] = await Promise.all([
        getStablecoinsTimeseries({ ...series, metric: 'supply' }).catch(() => []),
        getStablecoinsTimeseries({ ...series, metric: 'holders' }).catch(() => []),
      ]);
      const sPts = sup[0]?.data ?? [];
      const hPts = hol[0]?.data ?? [];
      const supply = Number(coin.supply) / scale;
      const supply30d = valueAt(sPts, ago, scale);
      const holders30d = valueAt(hPts, ago, 1);
      const recent = sPts.filter((p) => parseISO(p.period) >= ago).map((p) => Number(p.value) / scale);
      return {
        token: f.token,
        symbol: coin.symbol,
        issuer: f.issuer,
        fund: f.fund,
        logo: f.logo,
        supply,
        holders: coin.holders,
        supplySeries: recent.length > 1 ? recent : [],
        supplyChange: pct(supply, supply30d),
        holdersChange: pct(coin.holders, holders30d),
        supply30d,
      };
    }),
  );
  return rows.sort((a, b) => b.supply - a.supply);
}
