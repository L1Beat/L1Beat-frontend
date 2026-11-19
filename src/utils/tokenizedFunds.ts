import { parseISO, subDays } from 'date-fns';
import { getStablecoins, getStablecoinsTimeseries } from '../api';
import type { TokenFeed } from '../api';
import type { Stablecoin, StablecoinSeriesPoint } from '../types';

// Tokenized funds on the C-Chain. The feed prices them on-chain only: $1 for
// peg "USD" funds, the ERC-4626 share price for vaults, null otherwise. See
// fundPrice below.
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

// USD per share, from the feed's on-chain pricing: 'peg' for the $1 funds,
// 'erc4626' or 'erc7540' for a vault's share price. null when there is no fresh price
// (floating-NAV funds without an on-chain price, or a read older than 24h).
// Never fall back to $1 for those. A row from a feed without price fields
// (the old stablecoins fallback) is priced only when its peg is USD.
//
// One basis for every dollar figure: when the feed sends value_usd, the price
// is value_usd / shares, so today's value, the 30-day value and the chart all
// multiply shares by the same number and can't drift apart.
export function fundPrice(c: Pick<Stablecoin, 'peg' | 'price_usd' | 'value_usd' | 'supply' | 'decimals'>): number | null {
  if (c.price_usd !== undefined) {
    if (c.price_usd == null || !(c.price_usd > 0)) return null;
    const shares = Number(c.supply) / 10 ** c.decimals;
    return c.value_usd != null && shares > 0 ? c.value_usd / shares : c.price_usd;
  }
  return c.peg?.toUpperCase() === 'USD' ? 1 : null;
}
export const isPricedFund = (c: Parameters<typeof fundPrice>[0]) => fundPrice(c) != null;

// Where a price comes from. 'peg' only when the feed says so, or for a peg USD
// row from a feed without price fields; anything else priced is on-chain.
function priceSourceOf(c: Pick<Stablecoin, 'peg' | 'price_source' | 'price_usd'>): string {
  if (c.price_source) return c.price_source;
  return c.price_usd === undefined && c.peg?.toUpperCase() === 'USD' ? 'peg' : 'onchain';
}

// What kind of fund each token is. The feed has no type field, so this is
// kept here by symbol; an unknown symbol shows no type.
const FUND_TYPES: Record<string, string> = {
  BUIDL: 'Money-market fund',
  BENJI: 'Money-market fund',
  WTGXX: 'Money-market fund',
  VBILL: 'Money-market fund',
  HYTB: 'T-bill vault',
  JAAA: 'CLO fund',
  HINC: 'Bond fund',
  'XDFIS-DEFI-2': 'Fixed-income vault',
  ACRED: 'Private credit',
  NOPAL: 'Private credit',
  AOABTD: 'Crypto fund',
};

export interface FundRow {
  token: string;
  symbol: string;
  issuer: string;
  fund: string;
  logo: string;
  /** From FUND_TYPES; null for a fund not mapped yet. */
  type: string | null;
  /** True when the feed has a fresh price for the fund. */
  priced: boolean;
  /** USD per share, or null. */
  price: number | null;
  /** 'peg' for $1 funds; any other value is an on-chain vault price. */
  priceSource: string | null;
  /** Epoch ms of the on-chain price read; null for peg prices. */
  priceAt: number | null;
  /** Shares outstanding. */
  shares: number;
  /** USD value; null when the fund isn't priced. */
  value: number | null;
  /** Shares 30 days ago at today's price; null when unpriced or newer than 30 days. */
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
    const price = fundPrice(coin);
    const pts = byToken.get(token) ?? [];
    const shares = Number(coin.supply) / scale;
    // No point inside the window means no transfers, so no change: the last
    // value before it still holds. None before it means the fund is newer.
    const shares30d = valueAt(pts, ago, scale);
    const inWindow = pts.filter((p) => parseISO(p.period) > ago).map((p) => Number(p.value) / scale);
    const sharesSeries = shares30d != null ? [shares30d, ...inWindow, shares] : inWindow.length ? [...inWindow, shares] : [];
    const at = coin.price_at ? Date.parse(coin.price_at) : NaN;
    return {
      token,
      symbol: coin.symbol,
      issuer: known?.issuer ?? coin.issuer ?? coin.symbol,
      fund: known?.fund ?? coin.name,
      logo: known?.logo ?? `https://token-icons.llamao.fi/icons/tokens/${evmChainId}/${token}?h=48&w=48`,
      type: FUND_TYPES[coin.symbol.toUpperCase()] ?? null,
      priced: price != null,
      price,
      priceSource: price == null ? null : priceSourceOf(coin),
      priceAt: Number.isFinite(at) ? at : null,
      shares,
      // Equals the feed's value_usd when it sends one (see fundPrice).
      value: price == null ? null : shares * price,
      value30d: price != null && shares30d != null ? shares30d * price : null,
      holders: coin.holders,
      sharesSeries: sharesSeries.length > 1 ? sharesSeries : [],
      sharesChange: pct(shares, shares30d),
    };
  });
  // The feed orders rows by raw base units; sort by value, then the unpriced
  // funds by shares.
  return rows.sort((a, b) => Number(b.priced) - Number(a.priced) || (b.value ?? b.shares) - (a.value ?? a.shares));
}
