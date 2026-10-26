/**
 * Fills in logos for chains the L1Beat indexer has none for.
 *
 * Source: Avalanche's public Glacier chain list, matched on the P-Chain
 * blockchain id (`platformChainId`). It covers the chains Ava Labs has
 * registered; small or private L1s stay without a logo and render as a
 * lettered disc. Fetched once per session and cached in sessionStorage.
 */

const GLACIER_CHAINS_URL = 'https://glacier-api.avax.network/v1/chains';
const CACHE_KEY = 'l1beat:glacier-logos:v2';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** Logos we know of that neither source carries, keyed by platform chain id. */
const LOGO_OVERRIDES: Record<string, string> = {
  // DOS Chain (second deployment; the first already carries this logo)
  '2ewKoUrSjnviEgGmeTiELHBmNjxVTVczBPowST471rYUZvA9bk': 'https://cdn.snowpeer.io/dos.png',
  // Frqtal, both deployments
  '2FJM6WqyDGX2PZYipnatYXuXsNcKLio5fJMkEaGgpP4kHDTPw2': 'https://cdn.snowpeer.io/frqtal.png',
  '2jQuqy3RpCmVQHZCdpz9SJD92yP5VL4GgKBGeGJPYJxm9vkNNH': 'https://cdn.snowpeer.io/frqtal.png',
};

type LogoMap = Record<string, string>;

let inFlight: Promise<LogoMap> | null = null;

function readCache(): LogoMap | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; logos: LogoMap };
    if (Date.now() - parsed.at > CACHE_TTL_MS) return null;
    return parsed.logos;
  } catch {
    return null;
  }
}

function writeCache(logos: LogoMap) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), logos }));
  } catch {
    /* ignore quota or privacy-mode failures */
  }
}

/** Platform chain id → logo URL, from Glacier. Empty map on any failure. */
export function getFallbackChainLogos(): Promise<LogoMap> {
  if (typeof window === 'undefined') return Promise.resolve({ ...LOGO_OVERRIDES });
  const cached = readCache();
  if (cached) return Promise.resolve({ ...cached, ...LOGO_OVERRIDES });
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 6000);
      const res = await fetch(GLACIER_CHAINS_URL, {
        headers: { accept: 'application/json' },
        signal: controller.signal,
      });
      window.clearTimeout(timer);
      if (!res.ok) throw new Error(`Glacier ${res.status}`);
      const body = (await res.json()) as { chains?: Array<{ platformChainId?: string; chainLogoUri?: string }> };
      // Glacier reuses one generic image for chains without a logo of their
      // own. A URL shared by several chains is that placeholder, not a logo.
      const uses = new Map<string, number>();
      for (const c of body.chains ?? []) {
        if (c.chainLogoUri) uses.set(c.chainLogoUri, (uses.get(c.chainLogoUri) ?? 0) + 1);
      }
      const logos: LogoMap = {};
      for (const c of body.chains ?? []) {
        if (!c.platformChainId || !c.chainLogoUri) continue;
        if ((uses.get(c.chainLogoUri) ?? 0) > 2) continue;
        logos[c.platformChainId] = c.chainLogoUri;
      }
      writeCache(logos);
      return { ...logos, ...LOGO_OVERRIDES };
    } catch {
      return { ...LOGO_OVERRIDES };
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}
