import { parseISO, subDays } from 'date-fns';
import { getStablecoins, getStablecoinsTimeseries } from '../api';
import type { TokenFeed } from '../api';
import type { Stablecoin, StablecoinSeriesPoint } from '../types';

// Tokenized funds on the C-Chain. peg "USD" funds hold $1 a share, so shares
// read as dollars. peg "NAV" funds float and the feed has no price for them
// yet: see isPricedFund below.
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

// A fund is priced when its peg says one share is one dollar. peg "NAV" means
// the share price floats and the feed carries no price yet, so those funds
// show shares only and stay out of every dollar figure. Never value them at $1.
export const isPricedFund = (c: { peg?: string }) => c.peg?.toUpperCase() === 'USD';

export interface FundRow {
  token: string;
  symbol: string;
  issuer: string;
  fund: string;
  logo: string;
  /** False for floating-NAV funds the feed has no price for. */
  priced: boolean;
  /** Shares outstanding. */
  shares: number;
  /** USD value; null when the fund isn't priced. */
  value: number | null;
  /** USD value 30 days ago; null when unpriced or newer than 30 days. */
  value30d: number | null;
  holders: number;
  /** Shares over the last 30 days, oldest first, the last known value carried in. */
  sharesSeries: number[];
  /** Percent change in shares against 30 days ago. null when the fund is newer. */
  sharesChange: number | null;
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
  // The same request the supply chart makes (every fund, full daily history),
  // so the two share one cached call. Full history matters: supply only has
  // points on days with transfers, and a quiet fund's last point can be
  // months old.
  const [all, history] = await Promise.all([
    getStablecoins(evmChainId, FUNDS_FEED),
    getStablecoinsTimeseries({ evmChainId, feed: FUNDS_FEED, metric: 'supply', granularity: 'day', limit: 5000 }).catch(() => []),
  ]);
  // The funds feed lists only funds; the stablecoins feed needs picking.
  const coins: Stablecoin[] = FUNDS_FEED === 'stablecoins' ? all.filter((c) => isTokenizedFund(c.token)) : all;
  const byToken = new Map(history.map((h) => [h.token.toLowerCase(), h.data]));
  const ago = subDays(new Date(), 30);

  const rows = coins.map((coin): FundRow => {
    const token = coin.token.toLowerCase();
    const known = TOKENIZED_FUNDS.find((f) => f.token === token);
    const scale = 10 ** coin.decimals;
    const priced = isPricedFund(coin);
    const pts = byToken.get(token) ?? [];
    const shares = Number(coin.supply) / scale;
    // No point inside the window means no transfers, so no change: the last
    // value before it still holds. None before it means the fund is newer.
    const shares30d = valueAt(pts, ago, scale);
    const inWindow = pts.filter((p) => parseISO(p.period) > ago).map((p) => Number(p.value) / scale);
    const sharesSeries = shares30d != null ? [shares30d, ...inWindow, shares] : inWindow.length ? [...inWindow, shares] : [];
    return {
      token,
      symbol: coin.symbol,
      issuer: known?.issuer ?? coin.issuer ?? coin.symbol,
      fund: known?.fund ?? coin.name,
      logo: known?.logo ?? `https://token-icons.llamao.fi/icons/tokens/${evmChainId}/${token}?h=48&w=48`,
      priced,
      shares,
      value: priced ? shares : null,
      value30d: priced ? shares30d : null,
      holders: coin.holders,
      sharesSeries: sharesSeries.length > 1 ? sharesSeries : [],
      sharesChange: pct(shares, shares30d),
    };
  });
  // Priced funds by value, then the unpriced ones by shares.
  return rows.sort((a, b) => Number(b.priced) - Number(a.priced) || (b.value ?? b.shares) - (a.value ?? a.shares));
}
