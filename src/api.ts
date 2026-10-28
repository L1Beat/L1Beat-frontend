import type { Chain, TVLHistory, TVLHealth, NetworkTPS, TPSHistory, HealthStatus, TeleporterMessageData, TeleporterDailyData, CumulativeTxCount, CumulativeTxCountResponse, DailyTxCount, DailyTxCountLatest, MaxTPSHistory, MaxTPSLatest, GasUsedHistory, GasUsedLatest, AvgGasPriceHistory, AvgGasPriceLatest, FeesPaidHistory, FeesPaidLatest, NetworkValidatorTotal, Validator, L1BeatFeeMetrics, L1BeatFeeSummary, ValidatorDeposit, Stablecoin, StablecoinsResponse, StablecoinSeries, StablecoinTimeseriesResponse, StablecoinMetric, StablecoinGranularity, ChainRisk } from './types';
import type { DailyActiveAddresses } from './types';
import { config } from './config';
import { getFallbackChainLogos } from './services/chainLogos';

/** What the indexer's chain list gets when a chain has no logo. */
export const PLACEHOLDER_CHAIN_LOGO = '/icon-dark-animated.svg';

// Filter predicate to exclude today's partial data from time-series arrays.
// Data for the current day is incomplete and causes misleading dips in charts.
function isNotToday(d: { timestamp: number }): boolean {
  // Daily points are UTC days. Measuring from local midnight let the unfinished
  // UTC day through for anyone east of UTC, in the hours after their midnight.
  const now = new Date();
  const todayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 1000;
  return d.timestamp < todayStart;
}

// XSS protection - sanitize strings in API responses
// Only encode < and > to prevent HTML tag injection. React already escapes
// attribute values and text nodes, so encoding & / " / ' here would
// double-encode and corrupt URLs (e.g. &amp; in image src attributes).
function sanitizeString(value: string): string {
  if (typeof value !== 'string') return value;
  return value.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Sanitize API response recursively
function sanitizeResponse(data: any): any {
  if (data === null || data === undefined) return data;
  
  if (typeof data === 'string') {
    return sanitizeString(data);
  }
  
  if (Array.isArray(data)) {
    return data.map(item => sanitizeResponse(item));
  }
  
  if (typeof data === 'object') {
    const result: Record<string, any> = {};
    
    for (const key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        result[key] = sanitizeResponse(data[key]);
      }
    }
    
    return result;
  }
  
  return data;
}

// Add caching layer for API responses
type CacheEntry = { data: any; timestamp: number };
const cache = new Map<string, CacheEntry>();
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes

// --- sessionStorage persistence -------------------------------------------
// The in-memory Map above is wiped on every page reload, so a refresh or a
// return visit re-fetches every metric from the network. Mirroring entries
// into sessionStorage lets those loads render instantly from cache instead.
// sessionStorage (not localStorage) is deliberate: it survives reloads but
// clears when the tab closes, which bounds how stale data can get.
// Bump PERSIST_VERSION whenever a cached response shape changes to bust old data.
const PERSIST_VERSION = 'v1';
const PERSIST_PREFIX = `l1beat-cache-${PERSIST_VERSION}:`;

const persistAvailable = (() => {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) return false;
    const probe = `${PERSIST_PREFIX}__probe__`;
    window.sessionStorage.setItem(probe, '1');
    window.sessionStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
})();

function persistGet(key: string): CacheEntry | null {
  if (!persistAvailable) return null;
  try {
    const raw = window.sessionStorage.getItem(PERSIST_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed.timestamp === 'number' ? parsed : null;
  } catch {
    return null;
  }
}

function clearPersistedCache(predicate?: (key: string) => boolean): void {
  if (!persistAvailable) return;
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < window.sessionStorage.length; i++) {
      const k = window.sessionStorage.key(i);
      if (!k || !k.startsWith(PERSIST_PREFIX)) continue;
      if (!predicate || predicate(k.slice(PERSIST_PREFIX.length))) toRemove.push(k);
    }
    toRemove.forEach((k) => window.sessionStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

function persistSet(key: string, entry: CacheEntry): void {
  if (!persistAvailable) return;
  const write = () => window.sessionStorage.setItem(PERSIST_PREFIX + key, JSON.stringify(entry));
  try {
    write();
  } catch {
    // Likely a quota error — drop our namespace and retry once.
    try {
      clearPersistedCache();
      write();
    } catch {
      /* give up; the in-memory cache still works */
    }
  }
}

// Read a still-fresh entry from memory, falling back to sessionStorage (and
// hydrating memory on a hit). Returns undefined on miss/expiry.
function readCache(key: string, duration: number): any {
  const now = Date.now();
  const mem = cache.get(key);
  if (mem && now - mem.timestamp < duration) return mem.data;
  const persisted = persistGet(key);
  if (persisted && now - persisted.timestamp < duration) {
    cache.set(key, persisted);
    return persisted.data;
  }
  return undefined;
}

function writeCache(key: string, data: any, timestamp: number): void {
  cache.set(key, { data, timestamp });
  persistSet(key, { data, timestamp });
}

// Export function to clear cache (for debugging/forcing refresh)
export function clearChainsCache() {
  // Clear all chains-related cache entries (memory + persisted)
  for (const key of cache.keys()) {
    if (key.startsWith('chains')) {
      cache.delete(key);
    }
  }
  clearPersistedCache((key) => key.startsWith('chains'));
}

// Clear chains cache on module load to ensure fresh data after code changes
clearChainsCache();

const BASE_URL = config.apiBaseUrl;
const API_URL = `${BASE_URL}/api`;
const EXPLORER_URL = 'https://subnets.avax.network';

const DEFAULT_HEADERS = {
  'Accept': 'application/json',
  'Content-Type': 'application/json',
  'Origin': typeof window !== 'undefined' ? window.location.origin : '',
};

// Define constants for rate limiting
const REQUEST_LIMIT = 200; // Max requests per minute
const REQUEST_PERIOD = 60 * 1000; // 1 minute in milliseconds

// Track API calls for rate limiting
const apiRequestTracker = {
  requests: [] as number[],
  isRateLimited: false,
  rateLimitTimeout: null as ReturnType<typeof setTimeout> | null,
  
  // Record a new request timestamp
  recordRequest() {
    const now = Date.now();
    this.requests.push(now);
    
    // Remove old requests outside the tracking window
    this.requests = this.requests.filter(time => now - time < REQUEST_PERIOD);
    
    // Check if we've exceeded the limit
    if (this.requests.length > REQUEST_LIMIT && !this.isRateLimited) {
      this.isRateLimited = true;
      console.warn(`Rate limit reached: ${this.requests.length} requests in the last minute`);
      
      // Auto-reset after the time window
      if (this.rateLimitTimeout) {
        clearTimeout(this.rateLimitTimeout);
      }
      
      this.rateLimitTimeout = setTimeout(() => {
        this.isRateLimited = false;
        this.requests = [];
      }, REQUEST_PERIOD);
    }
    
    return this.isRateLimited;
  },
  
  // Get current request count
  getRequestCount() {
    const now = Date.now();
    this.requests = this.requests.filter(time => now - time < REQUEST_PERIOD);
    return this.requests.length;
  }
};

async function fetchWithCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  duration: number = CACHE_DURATION
): Promise<T> {
  const now = Date.now();

  const fresh = readCache(key, duration);
  if (fresh !== undefined) {
    return fresh as T;
  }

  // Check if we're rate-limited
  if (apiRequestTracker.isRateLimited) {
    console.warn(`Request to ${key} was blocked by rate limiting`);

    // If we have cached data (even if expired), use it
    const stale = cache.get(key) ?? persistGet(key);
    if (stale) {
      return stale.data;
    }
  }

  // Record the request attempt
  apiRequestTracker.recordRequest();

  // Fetch fresh data
  const data = await fetcher();

  // Sanitize the response data to prevent XSS
  const sanitizedData = sanitizeResponse(data);

  // Cache the sanitized data (memory + sessionStorage)
  if (isCacheable(sanitizedData)) writeCache(key, sanitizedData, now);

  return sanitizedData;
}

// Fetchers swallow errors and return an empty list, so an empty result often
// means "the request failed" (a 429, a timeout). Caching it would pin the
// empty state for the whole cache window and make Retry a no-op.
function isCacheable(data: unknown): boolean {
  if (data == null) return false;
  if (Array.isArray(data)) return data.length > 0;
  return true;
}

// When the backend last answered 429. Fetchers turn failures into empty lists,
// so views use this to tell "rate limited" apart from "no data".
let lastRateLimitedAt = 0;
export function recentlyRateLimited(withinMs = 60_000): boolean {
  return Date.now() - lastRateLimitedAt < withinMs;
}

class ClientError extends Error {}

async function fetchWithRetry<T>(
  url: string,
  options: RequestInit = {},
  retries: number = 3,
  backoffFactor: number = 2,
  timeout: number = 30000 // 30 second timeout
): Promise<T> {
  let lastError: Error = new Error('Unknown error occurred');
  let attempt = 0;

  while (attempt < retries) {
    // Fresh controller per attempt so a timeout on one attempt doesn't
    // permanently abort the signal shared by subsequent retries.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        mode: 'cors',
        credentials: 'omit',
        headers: {
          ...DEFAULT_HEADERS,
          ...options.headers,
          'Cache-Control': 'no-cache',
        },
      });

      clearTimeout(timeoutId);

      // Check for HTTP errors
      if (!response.ok) {
        if (response.status === 504) {
          throw new Error('Server timeout - The request took too long to complete');
        }
        if (response.status === 429) {
          lastRateLimitedAt = Date.now();
          throw new ClientError('Rate limit exceeded - Please try again later');
        }
        if (response.status >= 400 && response.status < 500) {
          throw new ClientError(`HTTP error! status: ${response.status}`);
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const data = await response.json();
        return data;
      }

      throw new Error('Invalid content type');
    } catch (error) {
      clearTimeout(timeoutId);
      lastError = error as Error;

      // A 4xx won't change on retry, and retrying a 429 only spends more of
      // the rate limit.
      if (error instanceof ClientError) break;

      // Check if the request was aborted (timeout)
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error('Request timeout - The connection to the server timed out');
      }

      // Check if it's a CORS error
      if (error instanceof TypeError && error.message.includes('CORS')) {
        console.error('CORS error detected:', error);
        break; // Exit retry loop and return fallback data
      }

      // Check for network errors (offline)
      if (error instanceof TypeError && (error.message.includes('Failed to fetch') || error.message.includes('Network request failed'))) {
        console.error('Network error detected:', error);
        break; // Exit retry loop and return fallback data
      }

      attempt++;

      if (attempt === retries) break;

      const delay = Math.min(1000 * Math.pow(backoffFactor, attempt), 10000);
      const jitter = Math.random() * 1000;
      await new Promise(resolve => setTimeout(resolve, delay + jitter));
    }
  }

  console.warn('All retry attempts failed, returning fallback data:', lastError.message);
  return getFallbackData<T>();
}

// Fallback data generator
function getFallbackData<T>(): T {
  const fallbackData: Record<string, any> = {
    Chain: [],
    TVLHistory: [],
    TVLHealth: {
      lastUpdate: new Date().toISOString(),
      ageInHours: 0,
      tvl: 0,
      status: 'stale'
    },
    NetworkTPS: {
      totalTps: 0,
      chainCount: 0,
      timestamp: Date.now(),
      lastUpdate: new Date().toISOString(),
      dataAge: 0,
      dataAgeUnit: 'minutes',
      updatedAt: new Date().toISOString()
    },
    TPSHistory: [],
    HealthStatus: {
      status: 'unknown',
      timestamp: Date.now()
    },
    TeleporterMessageData: {
      messages: [],
      metadata: {
        totalMessages: 0,
        startDate: new Date().toISOString(),
        endDate: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    },
    TeleporterDailyData: []
  };

  // Use type assertion instead of dynamic property access
  return fallbackData as unknown as T;
}

export async function getChains(filters?: { category?: string; network?: 'mainnet' | 'fuji'; includeInactive?: boolean }): Promise<Chain[]> {
  const activeParam = filters?.includeInactive ? 'false' : 'true';
  const cacheKey = `chains_l1beat_${filters?.category || 'all'}_${filters?.network || 'all'}_active_${activeParam}`;

  return fetchExternalWithCache(cacheKey, async () => {
    try {
      const allChains = await fetchAllL1BeatPages<any>('/api/v1/data/chains', { active: activeParam, count: 'true' });

      // URL slugs come from chain names, and names repeat (redeployments keep
      // the old chain's name). Assign them in a fixed order, active chains
      // first and then by P-Chain id, so a chain gets the same slug whether it
      // was loaded with or without inactive chains, and active chains keep the
      // plain name.
      const baseSlugOf = (chain: any) => {
        const name = chain.name || chain.chain_name || '';
        const raw = (chain.evm_chain_id ? String(chain.evm_chain_id) : '') || chain.chain_id || '';
        return name
          ? name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
          : String(raw || Math.random().toString(36).substring(7));
      };
      const slugById = new Map<string, string>();
      const seenSlugs = new Map<string, number>();
      [...allChains]
        .sort((a, b) =>
          Number(b.is_active ?? false) - Number(a.is_active ?? false) ||
          String(a.chain_id ?? '').localeCompare(String(b.chain_id ?? '')))
        .forEach((chain) => {
          const base = baseSlugOf(chain);
          const count = seenSlugs.get(base) ?? 0;
          seenSlugs.set(base, count + 1);
          slugById.set(String(chain.chain_id), count === 0 ? base : `${base}-${count + 1}`);
        });

      const chains = allChains
        .map((chain) => {
          const chainName = chain.name || chain.chain_name || '';
          const evmChainId = chain.evm_chain_id ? String(chain.evm_chain_id) : '';
          const rawChainId = evmChainId || chain.chain_id || '';
          const chainSlug = slugById.get(String(chain.chain_id)) ?? baseSlugOf(chain);

          const t = chain.network_token;

          return {
            chainId: chainSlug,
            originalChainId: rawChainId,
            chainName,
            chainLogoUri: chain.logo_url || PLACEHOLDER_CHAIN_LOGO,
            description: chain.description || '',
            website: chain.website_url || '',
            socials: chain.socials || [],
            categories: chain.categories || [],
            subnetId: chain.subnet_id || '',
            platformChainId: chain.chain_id || '',
            evmChainId: chain.evm_chain_id || undefined,
            isL1: chain.chain_type === 'l1',
            isActive: chain.is_active ?? false,
            sybilResistanceType: chain.sybil_resistance_type || '',
            network: chain.network || 'mainnet',
            rpcUrl: chain.rpc_url || '',
            explorerUrl: chain.explorer_url || '',
            validatorCount: chain.active_validators ?? chain.validator_count ?? 0,
            decentralization: chain.decentralization || undefined,
            validators: [],
            tps: null,
            cumulativeTxCount: null,
            networkToken: t ? {
              name: t.name || t.symbol || 'N/A',
              symbol: t.symbol || t.name || 'N/A',
              decimals: typeof t.decimals === 'number' ? t.decimals : 18,
              logoUri: t.logo_uri || undefined,
            } : {
              name: 'N/A',
              symbol: 'N/A',
              decimals: 18,
              logoUri: undefined,
            },
          };
        })
        .filter((chain) => {
          // Apply filters
          if (filters?.category && !chain.categories.map((c: string) => c.toLowerCase()).includes(filters.category.toLowerCase())) return false;
          if (filters?.network && chain.network !== filters.network) return false;
          return true;
        });

      // The indexer has no logo for about half the chains. Fill what Glacier
      // knows; the rest keep the placeholder and render as a lettered disc.
      const missing = chains.filter((c) => c.chainLogoUri === PLACEHOLDER_CHAIN_LOGO && c.platformChainId);
      if (missing.length > 0) {
        const fallback = await getFallbackChainLogos();
        for (const c of missing) {
          const uri = fallback[c.platformChainId];
          if (uri) c.chainLogoUri = uri;
        }
      }

      return chains;
    } catch (error) {
      console.error('L1Beat chains fetch error:', error);
      return [];
    }
  }, 5 * 60 * 1000);
}

export async function getChainValidators(chainId: string): Promise<Validator[]> {
  return fetchWithCache(`chain-validators-${chainId}`, async () => {
    try {
      const data = await fetchWithRetry<any[]>(`${API_URL}/chains/${chainId}/validators`);
      
      if (!data || !Array.isArray(data)) {
        return [];
      }

      return data.map((validator: any) => {
        const amountStakedRaw = validator.amountStaked ?? validator.amount_staked;
        const weightRaw = validator.weight ?? validator.validatorWeight ?? validator.stakeWeight;

        const hasAmountStaked = Number.isFinite(Number(amountStakedRaw));
        const hasWeight = Number.isFinite(Number(weightRaw));

        const stakeUnit: 'tokens' | 'weight' | undefined =
          hasAmountStaked ? 'tokens' : (hasWeight ? 'weight' : undefined);

        const weightValueRaw = hasAmountStaked
          ? amountStakedRaw
          : (hasWeight ? weightRaw : validator.amountStaked);

        return ({
        address: validator.nodeId,
        active: validator.validationStatus === 'active',
        uptime: validator.uptimePerformance,
          // Keep as string to preserve precision (nAVAX base units)
          weight: String(weightValueRaw ?? '0'),
          stakeUnit,
          remainingBalance: Number(
            validator.remainingBalance ??
            validator.remaining_balance ??
            validator.balance ??
            validator.remaining ??
            0
          ) || undefined,
        explorerUrl: `${EXPLORER_URL}/validators/${validator.nodeId}`
        });
      });
    } catch (error) {
      console.error('Chain validators fetch error:', error);
      return [];
    }
  });
}

// Full per-chain risk envelope (validator-manager control, decentralization with
// raw weights, economic). Keyed by the L1Beat chain_id (Chain.platformChainId),
// NOT the URL slug. Returns null on 404/unknown chain. Cached 10min.
export async function getChainRisk(chainId: string): Promise<ChainRisk | null> {
  if (!chainId) return null;
  return fetchExternalWithCache(
    `chain-risk-${chainId}`,
    async () => {
      try {
        const res = await fetchExternalWithRetry<{ data: ChainRisk }>(
          `${L1BEAT_EXTERNAL_API}/api/v1/data/chains/${chainId}/risk`,
        );
        return res?.data ?? null;
      } catch (error) {
        console.error('Chain risk fetch error:', error);
        return null;
      }
    },
    10 * 60 * 1000,
  );
}

export async function getCategories(): Promise<string[]> {
  return fetchExternalWithCache('categories_l1beat', async () => {
    try {
      const chains = await getChains();
      const categorySet = new Set<string>();
      chains.forEach(c => c.categories?.forEach((cat: string) => categorySet.add(cat)));
      return Array.from(categorySet).sort();
    } catch (error) {
      console.error('Categories fetch error:', error);
      return [];
    }
  }, 5 * 60 * 1000);
}

export async function getTVLHistory(days: number = 30): Promise<TVLHistory[]> {
  return fetchWithCache(`tvl-history-${days}`, async () => {
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const response = await fetchWithRetry<{ data: any[] }>(`${API_URL}/tvl/history?days=${days}&t=${timestamp}`);
      
      if (!response.data || !Array.isArray(response.data)) {
        return [];
      }

      return response.data
        .filter(item => item && typeof item.date === 'number' && typeof item.tvl === 'number')
        .map(item => ({
          date: Number(item.date),
          tvl: Number(item.tvl)
        }))
        .sort((a, b) => a.date - b.date);
    } catch (error) {
      console.error('TVL history fetch error:', error);
      return [];
    }
  });
}

export async function getTVLHealth(): Promise<TVLHealth> {
  return fetchWithCache('tvl-health', async () => {
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const response = await fetchWithRetry<TVLHealth>(`${API_URL}/tvl/health?t=${timestamp}`);
      
      // Validate the response fields
      if (!response || typeof response.lastUpdate !== 'string' || typeof response.tvl !== 'number') {
        throw new Error('Invalid TVL health response format');
      }

      return {
        lastUpdate: response.lastUpdate,
        ageInHours: Number(response.ageInHours) || 0,
        tvl: Number(response.tvl),
        status: response.status === 'healthy' ? 'healthy' : 'stale'
      };
    } catch (error) {
      console.error('TVL health fetch error:', error);
      return {
        lastUpdate: new Date().toISOString(),
        ageInHours: 0,
        tvl: 0,
        status: 'stale'
      };
    }
  });
}

export async function getTPSHistory(days: number = 7, chainId?: string): Promise<TPSHistory[]> {
  return fetchWithCache(`tps-history-${chainId || 'network'}-${days}`, async () => {
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const url = chainId 
        ? `${API_URL}/chains/${chainId}/tps/history?days=${days}&t=${timestamp}`
        : `${API_URL}/tps/network/history?days=${days}&t=${timestamp}`;

      const response = await fetchWithRetry<{
        success: boolean;
        data: Array<any>;
      }>(url);

      if (!response.success || !Array.isArray(response.data)) {
        return [];
      }

      return response.data
        .filter(item => item && typeof item.timestamp === 'number' && (typeof item.value === 'number' || typeof item.totalTps === 'number'))
        .map(item => ({
          timestamp: Number(item.timestamp),
          totalTps: Number(item.value || item.totalTps || 0),
          chainCount: Number(item.chainCount || 1),
          date: item.timestamp
        }))
        .sort((a, b) => a.timestamp - b.timestamp).filter(isNotToday);
    } catch (error) {
      console.error('TPS history fetch error:', error);
      return [];
    }
  });
}

export async function getCumulativeTxCount(chainId: string, days: number = 7): Promise<CumulativeTxCount[]> {
  return fetchWithCache(`cumulative-tx-${chainId}-${days}`, async () => {
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const response = await fetchWithRetry<CumulativeTxCountResponse>(
        `${API_URL}/chains/${chainId}/cumulativeTxCount/history?days=${days}&t=${timestamp}`
      );
      
      if (!response.success || !Array.isArray(response.data)) {
        throw new Error('Invalid cumulative transaction count data format');
      }

      return response.data
        .sort((a, b) => a.timestamp - b.timestamp).filter(isNotToday);
    } catch (error) {
      console.error('Cumulative transaction count fetch error:', error);
      return [];
    }
  });
}

// Fetch latest cumulative tx count for all chains in one request.
// Returns a normalized map keyed by chain id (typically evmChainId or chainId as string).
export async function getAllChainsCumulativeTxCountLatest(): Promise<Record<string, { value: number; timestamp: number }>> {
  return fetchWithCache('cumulative-tx-all-latest', async () => {
    try {
      const response = await fetchWithRetry<any>(`${API_URL}/cumulativeTxCount/all/latest`);

      // Accept multiple backend response shapes and normalize:
      // 1) { success: true, data: { [chainId]: { value, timestamp } } }
      // 2) { success: true, data: Array<{ chainId|evmChainId, cumulativeTxCount: { value, timestamp } }> }
      // 3) Array<{ chainId|evmChainId, cumulativeTxCount: { value, timestamp } }>
      const payload = (response && typeof response === 'object' && 'data' in response) ? (response as any).data : response;
      const map: Record<string, { value: number; timestamp: number }> = {};

      const addAliases = (source: any, value: number, ts: number) => {
        // Keep keying consistent with UI lookups (evmChainId -> originalChainId -> chainId),
        // but also alias under other ids to be resilient to backend response shapes.
        const candidates = [
          source?.evmChainId,
          source?.originalChainId,
          source?.chainId,
          source?.id,
          source?._id
        ]
          .map((v) => (v === undefined || v === null ? '' : String(v)))
          .map((s) => s.trim())
          .filter(Boolean);

        const unique = Array.from(new Set(candidates));
        for (const k of unique) {
          map[k] = { value, timestamp: ts };
        }
      };

      if (Array.isArray(payload)) {
        for (const item of payload) {
          const value = Number(item?.cumulativeTxCount?.value ?? item?.value ?? item?.count);
          const ts = Number(item?.cumulativeTxCount?.timestamp ?? item?.timestamp ?? item?.time ?? 0);
          if (!Number.isFinite(value)) continue;
          addAliases(item, value, Number.isFinite(ts) ? ts : 0);
        }
        return map;
      }

      if (payload && typeof payload === 'object') {
        for (const [key, val] of Object.entries(payload)) {
          if (!val || typeof val !== 'object') continue;
          const value = Number((val as any).value ?? (val as any).count);
          const ts = Number((val as any).timestamp ?? (val as any).time ?? 0);
          if (!Number.isFinite(value)) continue;
          const normalizedTs = Number.isFinite(ts) ? ts : 0;
          map[String(key)] = { value, timestamp: normalizedTs };
          // If the value object also includes ids, alias under them too.
          addAliases(val, value, normalizedTs);
        }
        return map;
      }

      return {};
    } catch (error) {
      console.error('All chains cumulative tx latest fetch error:', error);
      return {};
    }
  }, 60 * 1000); // Cache for 1 minute
}

export async function getNetworkTPS(): Promise<NetworkTPS> {
  return fetchWithCache('network-tps', async () => {
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const response = await fetchWithRetry<{
        success: boolean;
        data: NetworkTPS;
      }>(`${API_URL}/tps/network/latest?t=${timestamp}`);

      if (!response.success || !response.data) {
        throw new Error('Invalid network TPS response format');
      }

      return {
        totalTps: Number(response.data.totalTps) || 0,
        chainCount: Number(response.data.chainCount) || 0,
        timestamp: Number(response.data.timestamp) || Date.now(),
        lastUpdate: response.data.lastUpdate || new Date().toISOString(),
        dataAge: Number(response.data.dataAge) || 0,
        dataAgeUnit: response.data.dataAgeUnit || 'minutes',
        updatedAt: response.data.updatedAt || new Date().toISOString()
      };
    } catch (error) {
      console.error('Network TPS fetch error:', error);
      return {
        totalTps: 0,
        chainCount: 0,
        timestamp: Date.now(),
        lastUpdate: new Date().toISOString(),
        dataAge: 0,
        dataAgeUnit: 'minutes',
        updatedAt: new Date().toISOString()
      };
    }
  });
}

// Fetch latest TPS for all chains in one request (preferred for dashboards/lists).
// Returns a normalized map keyed by chain id (usually numeric id as string).
export async function getAllChainsTPSLatest(): Promise<Record<string, { value: number; timestamp: number }>> {
  return fetchWithCache('tps-all-latest', async () => {
    try {
      const response = await fetchWithRetry<any>(`${API_URL}/tps/all/latest`);

      // Accept multiple backend response shapes and normalize:
      // 1) { success: true, data: { [chainId]: { value, timestamp } } }
      // 2) { success: true, data: Array<{ chainId, value, timestamp }> }
      // 3) Array<{ chainId, value, timestamp }>
      const payload = (response && typeof response === 'object' && 'data' in response) ? (response as any).data : response;
      const map: Record<string, { value: number; timestamp: number }> = {};

      const addAliases = (source: any, value: number, ts: number) => {
        const candidates = [
          source?.evmChainId,
          source?.originalChainId,
          source?.chainId,
          source?.id,
          source?._id
        ]
          .map((v) => (v === undefined || v === null ? '' : String(v)))
          .map((s) => s.trim())
          .filter(Boolean);

        const unique = Array.from(new Set(candidates));
        for (const k of unique) {
          map[k] = { value, timestamp: ts };
        }
      };

      if (Array.isArray(payload)) {
        for (const item of payload) {
          const value = Number(item?.tps?.value ?? item?.value ?? item?.tps ?? item?.totalTps);
          const ts = Number(item?.tps?.timestamp ?? item?.timestamp ?? item?.time ?? item?.updatedAt ?? 0);
          if (!Number.isFinite(value)) continue;
          addAliases(item, value, Number.isFinite(ts) ? ts : 0);
        }
        return map;
      }

      if (payload && typeof payload === 'object') {
        for (const [key, val] of Object.entries(payload)) {
          if (!val || typeof val !== 'object') continue;
          const value = Number((val as any).value ?? (val as any).tps ?? (val as any).totalTps);
          const ts = Number((val as any).timestamp ?? (val as any).time ?? (val as any).updatedAt ?? 0);
          if (!Number.isFinite(value)) continue;
          const normalizedTs = Number.isFinite(ts) ? ts : 0;
          map[String(key)] = { value, timestamp: normalizedTs };
          addAliases(val, value, normalizedTs);
        }
        return map;
      }

      return {};
    } catch (error) {
      console.error('All chains TPS latest fetch error:', error);
      return {};
    }
  }, 60 * 1000); // Cache for 1 minute
}

export interface DailyTxLatest {
  /** Transactions on the latest complete UTC day. */
  value: number;
  /** The day before, for day-over-day change. */
  previous: number | null;
  /** UTC midnight (seconds) of the day `value` covers. */
  timestamp: number;
}

// Latest complete day of one metric for every chain, keyed by every id a chain
// might be looked up by. Empty when the backend doesn't serve it yet.
async function getAllChainsLatest(path: string, field: string): Promise<Record<string, DailyTxLatest>> {
  return fetchWithCache(`${field}-all-latest`, async () => {
    try {
      const response = await fetchWithRetry<any>(`${API_URL}/${path}/all/latest`);
      const rows = Array.isArray(response?.data) ? response.data : [];
      const map: Record<string, DailyTxLatest> = {};
      for (const row of rows) {
        const latest = row?.[field];
        const value = Number(latest?.value);
        if (!latest || !Number.isFinite(value)) continue;
        const previous = latest.previous == null ? null : Number(latest.previous);
        const entry = {
          value,
          previous: Number.isFinite(previous) ? previous : null,
          timestamp: Number(latest.timestamp) || 0,
        };
        for (const k of [row.evmChainId, row.subnetId, row.chainId]) {
          if (k != null && String(k).trim()) map[String(k).trim()] = entry;
        }
      }
      return map;
    } catch (error) {
      console.error(`All chains ${field} latest fetch error:`, error);
      return {};
    }
  }, 60 * 1000);
}

export const getAllChainsTxCountLatest = () => getAllChainsLatest('tx-count', 'txCount');
export const getAllChainsActiveAddressesLatest = () => getAllChainsLatest('active-addresses', 'activeAddresses');

export async function getNetworkMaxTPSHistory(days: number = 30): Promise<MaxTPSHistory[]> {
  return fetchWithCache(`network-max-tps-history-${days}`, async () => {
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const url = `${API_URL}/max-tps/network/history?days=${days}&t=${timestamp}`;

      const response = await fetchWithRetry<{
        success: boolean;
        data: Array<any>;
      }>(url);

      if (!response.success || !Array.isArray(response.data)) {
        return [];
      }

      return response.data
        .filter(item => item && typeof item.timestamp === 'number' && typeof item.value === 'number')
        .map(item => ({
          timestamp: Number(item.timestamp),
          value: Number(item.value),
          chainCount: typeof item.chainCount === 'number' ? item.chainCount : undefined,
        }))
        .sort((a, b) => a.timestamp - b.timestamp).filter(isNotToday);
    } catch (error) {
      console.error('Network max TPS history fetch error:', error);
      return [];
    }
  });
}

export async function getChainMaxTPSHistory(chainId: string, days: number = 30): Promise<MaxTPSHistory[]> {
  return fetchWithCache(`chain-max-tps-history-${chainId}-${days}`, async () => {
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const url = `${API_URL}/chains/${chainId}/max-tps/history?days=${days}&t=${timestamp}`;

      const response = await fetchWithRetry<{
        success: boolean;
        data: Array<any>;
      }>(url);
      
      if (!response.success || !Array.isArray(response.data)) {
        throw new Error('Invalid chain max TPS history data format');
      }

      return response.data
        .filter(item => item && typeof item.timestamp === 'number' && typeof item.value === 'number')
        .map(item => ({
          timestamp: Number(item.timestamp),
          value: Number(item.value)
        }))
        .sort((a, b) => a.timestamp - b.timestamp).filter(isNotToday);
    } catch (error) {
      console.error('Chain max TPS history fetch error:', error);
      return [];
    }
  });
}

export async function getDailyMessageVolumeFromExternal(days: number = 30): Promise<{ timestamp: number; value: number }[]> {
  // Use 365 days as default if user asks for more data, but respect the 'days' parameter if it's smaller
  // The external API supports 'days' parameter
  return fetchWithCache(`daily-message-volume-external-${days}`, async () => {
    try {
      const url = `https://idx6.solokhin.com/api/global/metrics/dailyMessageVolume?days=${days}`;
      const response = await fetchWithRetry<{
        success: boolean;
        data: Array<any>;
      }>(url);

      // The external API returns an array directly or inside data property
      const dataArray = Array.isArray(response) ? response : (response.data || []);

      if (!Array.isArray(dataArray)) {
        return [];
      }

      return dataArray
        .map(item => ({
          timestamp: Math.floor(new Date(item.date).getTime() / 1000),
          value: Number(item.messageCount || item.count || item.value || 0)
        }))
        .sort((a, b) => a.timestamp - b.timestamp).filter(isNotToday);
    } catch (error) {
      console.error('Daily message volume fetch error:', error);
      return [];
    }
  }, 5 * 60 * 1000); // Cache for 5 minutes
}

export async function getNetworkMaxTPSLatest(): Promise<MaxTPSLatest | null> {
  return fetchWithCache('network-max-tps-latest', async () => {
    try {
      const response = await fetchWithRetry<{
        success: boolean;
        data: MaxTPSLatest;
      }>(`${API_URL}/max-tps/network/latest`);

      if (!response.success || !response.data) {
        throw new Error('Invalid network max TPS latest response format');
      }

      return {
        timestamp: Number(response.data.timestamp),
        value: Number(response.data.value),
        chainCount: Number(response.data.chainCount)
      };
    } catch (error) {
      console.error('Network max TPS latest fetch error:', error);
      return null;
    }
  });
}

export async function getNetworkTxCountLatest(): Promise<DailyTxCountLatest | null> {
  return fetchWithCache('network-tx-count-latest', async () => {
    try {
      const response = await fetchWithRetry<{
        success: boolean;
        data: DailyTxCountLatest;
      }>(`${API_URL}/tx-count/network/latest`);

      if (!response.success || !response.data) {
        throw new Error('Invalid network tx count latest response format');
      }

      return {
        timestamp: Number(response.data.timestamp),
        value: Number(response.data.value),
        chainCount: Number(response.data.chainCount)
      };
    } catch (error) {
      console.error('Network tx count latest fetch error:', error);
      return null;
    }
  });
}

export async function getNetworkTxCountHistory(days: number = 30): Promise<DailyTxCount[]> {
  return fetchWithCache(`network-tx-count-history-${days}`, async () => {
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const url = `${API_URL}/tx-count/network/history?days=${days}&t=${timestamp}`;

      const response = await fetchWithRetry<{
        success: boolean;
        data: Array<any>;
      }>(url);

      if (!response.success || !Array.isArray(response.data)) {
        return [];
      }

      return response.data
        .filter(item => item && typeof item.timestamp === 'number' && typeof item.value === 'number')
        .map(item => ({
          timestamp: Number(item.timestamp),
          value: Number(item.value),
          chainCount: typeof item.chainCount === 'number' ? item.chainCount : undefined,
        }))
        .sort((a, b) => a.timestamp - b.timestamp).filter(isNotToday);
    } catch (error) {
      console.error('Network tx count history fetch error:', error);
      return [];
    }
  });
}

export async function getChainTxCountHistory(chainId: string, days: number = 30): Promise<DailyTxCount[]> {
  return fetchWithCache(`chain-tx-count-history-${chainId}-${days}`, async () => {
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const url = `${API_URL}/chains/${chainId}/tx-count/history?days=${days}&t=${timestamp}`;

      const response = await fetchWithRetry<{
        success: boolean;
        data: Array<any>;
      }>(url);
      
      if (!response.success || !Array.isArray(response.data)) {
        throw new Error('Invalid chain tx count history data format');
      }

      return response.data
        .filter(item => item && typeof item.timestamp === 'number' && typeof item.value === 'number')
        .map(item => ({
          timestamp: Number(item.timestamp),
          value: Number(item.value)
        }))
        .sort((a, b) => a.timestamp - b.timestamp).filter(isNotToday);
    } catch (error) {
      console.error('Chain tx count history fetch error:', error);
      return [];
    }
  });
}

export async function getNetworkGasUsedHistory(days: number = 30): Promise<GasUsedHistory[]> {
  return fetchWithCache(`network-gas-used-history-${days}`, async () => {
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const url = `${API_URL}/gas-used/network/history?days=${days}&t=${timestamp}`;

      const response = await fetchWithRetry<{
        success: boolean;
        data: Array<any>;
      }>(url);

      if (!response.success || !Array.isArray(response.data)) {
        return [];
      }

      return response.data
        .filter(item => item && typeof item.timestamp === 'number' && typeof item.value === 'number')
        .map(item => ({
          timestamp: Number(item.timestamp),
          value: Number(item.value)
        }))
        .sort((a, b) => a.timestamp - b.timestamp).filter(isNotToday);
    } catch (error) {
      console.error('Network gas used history fetch error:', error);
      return [];
    }
  });
}

export async function getChainGasUsedHistory(chainId: string, days: number = 30): Promise<GasUsedHistory[]> {
  return fetchWithCache(`chain-gas-used-history-${chainId}-${days}`, async () => {
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const url = `${API_URL}/chains/${chainId}/gas-used/history?days=${days}&t=${timestamp}`;

      const response = await fetchWithRetry<{
        success: boolean;
        data: Array<any>;
      }>(url);
      
      if (!response.success || !Array.isArray(response.data)) {
        throw new Error('Invalid chain gas used history data format');
      }

      return response.data
        .filter(item => item && typeof item.timestamp === 'number' && typeof item.value === 'number')
        .map(item => ({
          timestamp: Number(item.timestamp),
          value: Number(item.value)
        }))
        .sort((a, b) => a.timestamp - b.timestamp).filter(isNotToday);
    } catch (error) {
      console.error('Chain gas used history fetch error:', error);
      return [];
    }
  });
}

export async function getNetworkGasUsedLatest(): Promise<GasUsedLatest | null> {
  return fetchWithCache('network-gas-used-latest', async () => {
    try {
      const response = await fetchWithRetry<{
        success: boolean;
        data: GasUsedLatest;
      }>(`${API_URL}/gas-used/network/latest`);

      if (!response.success || !response.data) {
        throw new Error('Invalid network gas used latest response format');
      }

      return {
        timestamp: Number(response.data.timestamp),
        value: Number(response.data.value),
        chainCount: Number(response.data.chainCount)
      };
    } catch (error) {
      console.error('Network gas used latest fetch error:', error);
      return null;
    }
  });
}

export async function getChainGasUsedLatest(chainId: string): Promise<GasUsedLatest | null> {
  return fetchWithCache(`chain-gas-used-latest-${chainId}`, async () => {
    try {
      const response = await fetchWithRetry<{
        success: boolean;
        data: GasUsedLatest;
      }>(`${API_URL}/chains/${chainId}/gas-used/latest`);

      if (!response.success || !response.data) {
        throw new Error('Invalid chain gas used latest response format');
      }

      return {
        timestamp: Number(response.data.timestamp),
        value: Number(response.data.value),
        chainCount: undefined // Chain specific data doesn't have chainCount
      };
    } catch (error) {
      console.error('Chain gas used latest fetch error:', error);
      return null;
    }
  });
}

export async function getNetworkValidatorTotal(): Promise<NetworkValidatorTotal> {
  return fetchWithCache('network-validator-total', async () => {
    try {
      const response = await fetchWithRetry<{
        success: boolean;
        totalValidators: number;
        chainsWithValidators: number;
        timestamp: string;
      }>(`${API_URL}/validators/network/total`);

      if (!response.success) {
        throw new Error('Invalid network validator total response format');
      }

      return {
        totalValidators: response.totalValidators || 0,
        chainsWithValidators: response.chainsWithValidators || 0,
        timestamp: response.timestamp || new Date().toISOString()
      };
    } catch (error) {
      console.error('Network validator total fetch error:', error);
      return {
        totalValidators: 0,
        chainsWithValidators: 0,
        timestamp: new Date().toISOString()
      };
    }
  });
}

export async function getNetworkAvgGasPriceHistory(days: number = 30): Promise<AvgGasPriceHistory[]> {
  return fetchWithCache(`network-avg-gas-price-history-${days}`, async () => {
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const url = `${API_URL}/avg-gas-price/network/history?days=${days}&t=${timestamp}`;

      const response = await fetchWithRetry<{
        success: boolean;
        data: Array<any>;
      }>(url);

      if (!response.success || !Array.isArray(response.data)) {
        return [];
      }

      return response.data
        .filter(item => item && typeof item.timestamp === 'number' && typeof item.value === 'number')
        .map(item => ({
          timestamp: Number(item.timestamp),
          value: Number(item.value)
        }))
        .sort((a, b) => a.timestamp - b.timestamp).filter(isNotToday);
    } catch (error) {
      console.error('Network avg gas price history fetch error:', error);
      return [];
    }
  });
}

export async function getChainAvgGasPriceHistory(chainId: string, days: number = 30): Promise<AvgGasPriceHistory[]> {
  return fetchWithCache(`chain-avg-gas-price-history-${chainId}-${days}`, async () => {
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const url = `${API_URL}/chains/${chainId}/avg-gas-price/history?days=${days}&t=${timestamp}`;

      const response = await fetchWithRetry<{
        success: boolean;
        data: Array<any>;
      }>(url);
      
      if (!response.success || !Array.isArray(response.data)) {
        throw new Error('Invalid chain avg gas price history data format');
      }

      return response.data
        .filter(item => item && typeof item.timestamp === 'number' && typeof item.value === 'number')
        .map(item => {
          let value = Number(item.value);
          
          // Special handling for C-Chain (43114): scale down by factor of 10 based on user report
          // The API returns ~2.44 but user expects ~0.24 for 2.44, and ~0.11 for 1.19
          if (chainId === '43114') {
            value = value / 10;
          }
          
          return {
            timestamp: Number(item.timestamp),
            value: value
          };
        })
        .sort((a, b) => a.timestamp - b.timestamp).filter(isNotToday);
    } catch (error) {
      console.error('Chain avg gas price history fetch error:', error);
      return [];
    }
  });
}

export async function getNetworkAvgGasPriceLatest(): Promise<AvgGasPriceLatest | null> {
  return fetchWithCache('network-avg-gas-price-latest', async () => {
    try {
      const response = await fetchWithRetry<{
        success: boolean;
        data: AvgGasPriceLatest;
      }>(`${API_URL}/avg-gas-price/network/latest`);

      if (!response.success || !response.data) {
        throw new Error('Invalid network avg gas price latest response format');
      }

      return {
        timestamp: Number(response.data.timestamp),
        value: Number(response.data.value),
        chainCount: Number(response.data.chainCount)
      };
    } catch (error) {
      console.error('Network avg gas price latest fetch error:', error);
      return null;
    }
  });
}

export async function getChainAvgGasPriceLatest(chainId: string): Promise<AvgGasPriceLatest | null> {
  return fetchWithCache(`chain-avg-gas-price-latest-${chainId}`, async () => {
    try {
      const response = await fetchWithRetry<{
        success: boolean;
        data: AvgGasPriceLatest;
      }>(`${API_URL}/chains/${chainId}/avg-gas-price/latest`);

      if (!response.success || !response.data) {
        throw new Error('Invalid chain avg gas price latest response format');
      }

      let value = Number(response.data.value);
      
      // Special handling for C-Chain (43114): scale down by factor of 10
      if (chainId === '43114') {
        value = value / 10;
      }

      return {
        timestamp: Number(response.data.timestamp),
        value: value,
        chainCount: undefined
      };
    } catch (error) {
      console.error('Chain avg gas price latest fetch error:', error);
      return null;
    }
  });
}

export async function getChainFeesPaidHistory(chainId: string, days: number = 30): Promise<FeesPaidHistory[]> {
  return fetchWithCache(`chain-fees-paid-history-${chainId}-${days}`, async () => {
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const url = `${API_URL}/chains/${chainId}/fees-paid/history?days=${days}&t=${timestamp}`;

      const response = await fetchWithRetry<{
        success: boolean;
        data: Array<any>;
      }>(url);
      
      if (!response.success || !Array.isArray(response.data)) {
        throw new Error('Invalid chain fees paid history data format');
      }

      return response.data
        .filter(item => item && typeof item.timestamp === 'number' && typeof item.value === 'number')
        .map(item => ({
          timestamp: Number(item.timestamp),
          value: Number(item.value)
        }))
        .sort((a, b) => a.timestamp - b.timestamp).filter(isNotToday);
    } catch (error) {
      console.error('Chain fees paid history fetch error:', error);
      return [];
    }
  });
}

export async function getChainFeesPaidLatest(chainId: string): Promise<FeesPaidLatest | null> {
  return fetchWithCache(`chain-fees-paid-latest-${chainId}`, async () => {
    try {
      const response = await fetchWithRetry<{
        success: boolean;
        data: FeesPaidLatest;
      }>(`${API_URL}/chains/${chainId}/fees-paid/latest`);

      if (!response.success || !response.data) {
        throw new Error('Invalid chain fees paid latest response format');
      }

      return {
        timestamp: Number(response.data.timestamp),
        value: Number(response.data.value),
        chainCount: undefined
      };
    } catch (error) {
      console.error('Chain fees paid latest fetch error:', error);
      return null;
    }
  });
}

export async function getNetworkFeesPaidHistory(days: number = 30): Promise<FeesPaidHistory[]> {
  return fetchWithCache(`network-fees-paid-history-${days}`, async () => {
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const url = `${API_URL}/fees-paid/network/history?days=${days}&t=${timestamp}`;

      const response = await fetchWithRetry<{
        success: boolean;
        data: Array<any>;
      }>(url);

      if (!response.success || !Array.isArray(response.data)) {
        return [];
      }

      return response.data
        .filter(item => item && typeof item.timestamp === 'number' && typeof item.value === 'number')
        .map(item => ({
          timestamp: Number(item.timestamp),
          value: Number(item.value)
        }))
        .sort((a, b) => a.timestamp - b.timestamp).filter(isNotToday);
    } catch (error) {
      console.error('Network fees paid history fetch error:', error);
      return [];
    }
  });
}

export async function getNetworkFeesPaidLatest(): Promise<FeesPaidLatest | null> {
  return fetchWithCache('network-fees-paid-latest', async () => {
    try {
      const response = await fetchWithRetry<{
        success: boolean;
        data: FeesPaidLatest;
      }>(`${API_URL}/fees-paid/network/latest`);

      if (!response.success || !response.data) {
        throw new Error('Invalid network fees paid latest response format');
      }

      return {
        timestamp: Number(response.data.timestamp),
        value: Number(response.data.value),
        chainCount: Number(response.data.chainCount)
      };
    } catch (error) {
      console.error('Network fees paid latest fetch error:', error);
      return null;
    }
  });
}

export async function getNetworkActiveAddressesHistory(days: number = 30): Promise<DailyActiveAddresses[]> {
  return fetchWithCache(`network-active-addresses-history-${days}`, async () => {
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const url = `${API_URL}/active-addresses/network/history?days=${days}&t=${timestamp}`;

      const response = await fetchWithRetry<{
        success: boolean;
        data: Array<any>;
      }>(url);

      if (!response.success || !Array.isArray(response.data)) {
        return [];
      }

      return response.data
        .filter(item => item && typeof item.timestamp === 'number' && typeof item.value === 'number')
        .map(item => ({
          timestamp: Number(item.timestamp),
          activeAddresses: Number(item.value),
          transactions: 0 // API doesn't provide transactions count yet
        }))
        .sort((a, b) => a.timestamp - b.timestamp).filter(isNotToday);
    } catch (error) {
      console.error('Network active addresses history fetch error:', error);
      return [];
    }
  });
}

export async function getDailyActiveAddresses(chainId: string, days: number = 30): Promise<DailyActiveAddresses[]> {
  return fetchWithCache(`daily-active-addresses-${chainId}-${days}`, async () => {
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const url = `${API_URL}/chains/${chainId}/active-addresses/history?days=${days}&t=${timestamp}`;

      const response = await fetchWithRetry<{
        success: boolean;
        data: Array<any>;
      }>(url);
      
      if (!response.success || !Array.isArray(response.data)) {
        throw new Error('Invalid daily active addresses data format');
      }

      return response.data
        .filter(item => item && typeof item.timestamp === 'number' && typeof item.value === 'number')
        .map(item => ({
          timestamp: Number(item.timestamp),
          activeAddresses: Number(item.value),
          transactions: 0 // API doesn't provide transactions count yet
        }))
        .sort((a, b) => a.timestamp - b.timestamp).filter(isNotToday);
    } catch (error) {
      console.error('Daily active addresses fetch error:', error);
      return [];
    }
  });
}

export type ChainMetric = 'txCount' | 'maxTps' | 'activeAddresses' | 'gasUsed' | 'feesPaid' | 'avgGasPrice';

export interface ChainMetricsHistory {
  txCount?: DailyTxCount[];
  maxTps?: MaxTPSHistory[];
  activeAddresses?: DailyActiveAddresses[];
  gasUsed?: GasUsedHistory[];
  feesPaid?: FeesPaidHistory[];
  avgGasPrice?: AvgGasPriceHistory[];
}

const singleMetricHistory: Record<ChainMetric, (chainId: string, days: number) => Promise<unknown[]>> = {
  txCount: getChainTxCountHistory,
  maxTps: getChainMaxTPSHistory,
  activeAddresses: getDailyActiveAddresses,
  gasUsed: getChainGasUsedHistory,
  feesPaid: getChainFeesPaidHistory,
  avgGasPrice: getChainAvgGasPriceHistory,
};

// Several of a chain's daily series in one request. A backend without the
// batch route (404) gets one request per series instead.
export async function getChainMetricsHistory(chainId: string, days: number, metrics: ChainMetric[]): Promise<ChainMetricsHistory> {
  const wanted = [...new Set(metrics)].sort();
  if (wanted.length === 0) return {};
  let missingRoute = false;
  const batch = await fetchWithCache(`chain-metrics-history-${chainId}-${days}-${wanted.join(',')}`, async () => {
    try {
      const response = await fetchWithRetry<{ success: boolean; data: Record<string, any[]> }>(
        `${API_URL}/chains/${chainId}/metrics/history?days=${days}&metrics=${wanted.join(',')}`);
      if (!response.success || !response.data) throw new Error('Invalid chain metrics history data format');
      const result: Record<string, unknown[]> = {};
      for (const metric of wanted) {
        const points = (Array.isArray(response.data[metric]) ? response.data[metric] : [])
          .filter(item => item && typeof item.timestamp === 'number' && typeof item.value === 'number')
          .map(item => ({ timestamp: Number(item.timestamp), value: Number(item.value) }))
          .sort((a, b) => a.timestamp - b.timestamp).filter(isNotToday);
        result[metric] = metric === 'activeAddresses'
          ? points.map(p => ({ timestamp: p.timestamp, activeAddresses: p.value, transactions: 0 }))
          // Same C-Chain scaling as getChainAvgGasPriceHistory.
          : metric === 'avgGasPrice' && chainId === '43114'
            ? points.map(p => ({ ...p, value: p.value / 10 }))
            : points;
      }
      return result as ChainMetricsHistory;
    } catch (error) {
      missingRoute = error instanceof ClientError && error.message.includes('status: 404');
      if (!missingRoute) console.error('Chain metrics history fetch error:', error);
      return null;
    }
  });
  if (batch) return batch;
  if (!missingRoute) return {};
  const series = await Promise.all(wanted.map(m => singleMetricHistory[m](chainId, days).catch(() => [])));
  return Object.fromEntries(wanted.map((m, i) => [m, series[i]]));
}

export async function getHealth(): Promise<HealthStatus> {
  return fetchWithCache('health-status', async () => {
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const response = await fetchWithRetry<any>(`${BASE_URL}/health?t=${timestamp}`);
      
      // The health endpoint returns the status directly, not wrapped in a data object
      if (typeof response?.status === 'string') {
        return {
          status: response.status,
          timestamp: response.currentTime ? new Date(response.currentTime).getTime() : Date.now()
        };
      }
      
      return {
        status: 'unknown',
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('Health status fetch error:', error);
      return {
        status: 'unknown',
        timestamp: Date.now()
      };
    }
  }, 30000); // Cache for 30 seconds
}

export async function getTeleporterMessages(
  timeframe: 'daily' | 'weekly' = 'daily'
): Promise<TeleporterMessageData> {
  return fetchWithCache(`teleporter-messages-${timeframe}`, async () => {
    try {
      const endpoint = timeframe === 'weekly'
        ? `${API_URL}/teleporter/messages/weekly-count`
        : `${API_URL}/teleporter/messages/daily-count`;
      const response = await fetchWithRetry<any>(endpoint);
      
      // Handle both raw array and { data: [...] } formats
      const dataArray = Array.isArray(response) ? response : (response?.data || []);
      
      if (!Array.isArray(dataArray)) {
        throw new Error('Invalid Teleporter message data format');
      }
      
      // Map the API response to our internal format
      const messages = dataArray.map((msg: any) => ({
        source: msg.sourceChain || msg.source || 'Unknown',
        target: msg.destinationChain || msg.target || 'Unknown',
        value: Number(msg.messageCount || msg.count || msg.value || 0)
      }));
      
      // Calculate total messages if metadata is missing
      const totalMessages = response?.metadata?.totalMessages || 
        messages.reduce((sum: number, msg: any) => sum + msg.value, 0);
      
      return {
        messages,
        metadata: {
          totalMessages,
          startDate: response?.metadata?.startDate || new Date().toISOString(),
          endDate: response?.metadata?.endDate || new Date().toISOString(),
          updatedAt: response?.metadata?.updatedAt || new Date().toISOString()
        }
      };
    } catch (error) {
      console.error('Teleporter messages fetch error:', error);
      return {
        messages: [],
        metadata: {
          totalMessages: 0,
          startDate: new Date().toISOString(),
          endDate: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      };
    }
  }, 15 * 60 * 1000); // Cache for 15 minutes
}

export async function getTeleporterDailyHistory(days: number = 30): Promise<TeleporterDailyData[]> {
  return fetchWithCache(`teleporter-daily-history-${days}`, async () => {
    try {
      const response = await fetchWithRetry<{ data: TeleporterDailyData[] }>(
        `${API_URL}/teleporter/messages/historical-daily?days=${days}`
      );

      if (!response.data || !Array.isArray(response.data)) {
        throw new Error('Invalid Teleporter daily history data format');
      }

      return response.data;
    } catch (error) {
      console.error('Teleporter daily history fetch error:', error);
      return [];
    }
  }, 15 * 60 * 1000); // Cache for 15 minutes
}

const L1BEAT_EXTERNAL_API = import.meta.env.VITE_L1BEAT_EXTERNAL_API || 'https://api.l1beat.io';

// Cache wrapper for external API calls — skips the internal rate limiter since
// these calls go to a different origin and should not consume the backend quota.
async function fetchExternalWithCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  duration: number = CACHE_DURATION
): Promise<T> {
  const now = Date.now();
  const fresh = readCache(key, duration);
  if (fresh !== undefined) {
    return fresh as T;
  }
  const data = await fetcher();
  const sanitizedData = sanitizeResponse(data);
  if (isCacheable(sanitizedData)) writeCache(key, sanitizedData, now);
  return sanitizedData;
}

// Fetch from external APIs with only CORS-safe headers (no Cache-Control /
// Content-Type / Origin that trigger a preflight). Creates a fresh
// AbortController per attempt so retries are not dead after a timeout.
async function fetchExternalWithRetry<T>(
  url: string,
  retries: number = 3,
  backoffFactor: number = 2,
  timeout: number = 30000
): Promise<T> {
  let lastError: Error = new Error('Unknown error occurred');
  let retryAfterMs: number | null = null;

  for (let attempt = 0; attempt < retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        mode: 'cors',
        credentials: 'omit',
        headers: { 'Accept': 'application/json' },
      });

      if (response.status === 429) {
        // The indexer's limit refills each second, so a wait usually clears it.
        lastRateLimitedAt = Date.now();
        const retryAfter = Number(response.headers.get('Retry-After'));
        retryAfterMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : null;
        throw new Error('HTTP error! status: 429');
      }
      if (!response.ok) {
        const err = response.status < 500 ? new ClientError(`HTTP error! status: ${response.status}`) : new Error(`HTTP error! status: ${response.status}`);
        throw err;
      }

      return await response.json() as T;
    } catch (error) {
      lastError = error instanceof DOMException && error.name === 'AbortError'
        ? new Error('Request timeout')
        : error as Error;
      // Other 4xx answers won't change on retry.
      if (error instanceof ClientError) break;

      if (attempt < retries - 1) {
        const delay = retryAfterMs ?? Math.min(1000 * Math.pow(backoffFactor, attempt + 1), 10000);
        retryAfterMs = null;
        await new Promise(resolve => setTimeout(resolve, Math.min(delay, 10000)));
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError;
}

// Paginate through all pages of an L1Beat external API endpoint.
// Stops when has_more is false or a page returns no data (guards against a
// stuck has_more=true from a misbehaving API).
async function fetchAllL1BeatPages<T>(
  endpoint: string,
  extraParams: Record<string, string> = {},
  opts: { throttleMs?: number; maxPages?: number; pageSize?: number } = {}
): Promise<T[]> {
  // throttleMs: pause between pages to stay under the API's rate limit on
  //   endpoints with many pages (e.g. the Primary Network has 3000+ validators).
  // maxPages: hard safety bound on the number of requests.
  const { throttleMs = 0, maxPages = Infinity, pageSize = 100 } = opts;
  const all: T[] = [];
  let offset = 0;
  const limit = pageSize;
  let page = 0;

  while (page < maxPages) {
    const params = new URLSearchParams({ ...extraParams, limit: String(limit), offset: String(offset) });
    let response: { data: T[]; meta: { has_more: boolean } };
    try {
      response = await fetchExternalWithRetry<{ data: T[]; meta: { has_more: boolean } }>(
        `${L1BEAT_EXTERNAL_API}${endpoint}?${params.toString()}`
      );
    } catch (error) {
      // A later page failing (e.g. a 429 mid-pagination) must NOT discard the
      // pages we already have — return the partial set instead of throwing.
      console.warn(`fetchAllL1BeatPages: stopped early for ${endpoint} at offset ${offset}:`, error);
      break;
    }
    const chunk = response.data ?? [];
    all.push(...chunk);
    page += 1;
    if (chunk.length === 0 || !response.meta?.has_more) break;
    offset += limit;
    if (throttleMs > 0) await new Promise((r) => setTimeout(r, throttleMs));
  }

  // Deduplicate — the API can return overlapping items across pages
  const seen = new Set<string>();
  return all.filter((item: any) => {
    const key = item.chain_id || item.id || JSON.stringify(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Fetch the count of active validators for a single subnet by requesting
// limit=1 and reading meta.total.  Cached per subnet for 5 minutes.
export async function getL1BeatActiveValidatorCount(subnetId: string): Promise<number> {
  const cacheKey = `l1beat-active-validators-${subnetId}`;
  return fetchExternalWithCache(cacheKey, async () => {
    try {
      const params = new URLSearchParams({ subnet_id: subnetId, active: 'true', count: 'true', limit: '1' });
      const response = await fetchExternalWithRetry<{ data: unknown[]; meta: { total: number } }>(
        `${L1BEAT_EXTERNAL_API}/api/v1/data/validators?${params.toString()}`
      );
      return response.meta?.total ?? 0;
    } catch (error) {
      console.error(`L1Beat active validator count fetch error (${subnetId}):`, error);
      return 0;
    }
  }, 5 * 60 * 1000);
}

// Fetch active validator counts for multiple subnets in batches to avoid 429s.
// Returns a map of subnetId -> active validator count.
export async function getL1BeatActiveValidatorCounts(subnetIds: string[]): Promise<Record<string, number>> {
  const unique = [...new Set(subnetIds.filter(Boolean))];
  const counts: Record<string, number> = {};
  const BATCH_SIZE = 5;

  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const batch = unique.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (id) => ({ id, count: await getL1BeatActiveValidatorCount(id) }))
    );
    results.forEach(({ id, count }) => { counts[id] = count; });
  }

  return counts;
}

// L1Beat subnet record as returned by /api/v1/data/subnets/{id}
export interface L1BeatSubnet {
  subnet_id: string;
  subnet_type: 'l1' | 'legacy';
  created_block: number;
  created_time: string;
  chain_id: string;
  converted_block?: number;
  converted_time?: string;
}

// L1Beat validator record as returned by /api/v1/data/validators
export interface L1BeatValidator {
  subnet_id: string;
  validation_id: string;
  node_id: string;
  balance?: number;
  weight: number;
  staked_amount?: string; // PoS only: staked amount in whole tokens (decimal string)
  staked_token?: string;  // PoS only: symbol of the token actually staked
  start_time: string;
  end_time?: string;
  uptime_percentage?: number;
  active: boolean;
  initial_deposit?: number;
  total_topups?: number;
  refund_amount?: number;
  fees_paid?: number;
  // Legacy subnet validators only — enriched with Primary Network data
  primary_stake?: number;   // nAVAX staked on Primary Network
  primary_uptime?: number;  // uptime percentage on Primary Network (0-100)

  // L1 registration info (detail endpoint only)
  tx_hash?: string;
  tx_type?: string;  // 'RegisterL1Validator' | 'ConvertSubnetToL1' (P-Chain type name, no Tx suffix)
  created_block?: number;
  created_time?: string;
  bls_public_key?: string;
  remaining_balance_owner?: string;

  // L1 computed fields
  total_deposited?: number;
  daily_fee_burn?: number;
  estimated_days_left?: number;

  // All active validators with end_time
  days_remaining?: number;

  // Primary Network detail fields
  delegation_fee_percent?: number;
  delegator_count?: number;
  total_delegated?: number;
  total_stake?: number;
  network_share_percent?: number;
}

// Fetch validators for a subnet from L1Beat and convert to our Validator type.
// By default fetches only active validators. Pass activeOnly=false to include inactive.
export async function getL1BeatValidators(subnetId: string, activeOnly: boolean = true): Promise<Validator[]> {
  const cacheKey = `l1beat-validators-detail-${subnetId}-${activeOnly ? 'active' : 'all'}`;
  return fetchExternalWithCache(cacheKey, async () => {
    try {
      const params: Record<string, string> = { subnet_id: subnetId };
      if (activeOnly) params['active'] = 'true';
      // The API serves up to 10,000 rows per page, so even the Primary Network
      // (5,000+ validators including inactive history) is one request. The
      // paging loop stays for larger sets; the throttle and cap are safety bounds.
      const allValidators = await fetchAllL1BeatPages<L1BeatValidator>(
        '/api/v1/data/validators',
        params,
        { throttleMs: 150, maxPages: 10, pageSize: 10000 }
      );
      return allValidators.map((v) => {
        // PoS chains return a real staked amount + token; PoA chains omit them
        // and we fall back to showing the raw P-Chain weight.
        const isStaked = v.staked_amount != null;
        return {
          address: v.node_id,
          // API may return active as a boolean, the string 'true', or the number 1.
          // Compare via `unknown` so the defensive string/number checks are allowed.
          active: v.active === true || (v.active as unknown) === 'true' || (v.active as unknown) === 1,
          // The API always supplies one of these; consumers treat uptime as a
          // number, so assert it here rather than widening the domain type.
          uptime: (v.primary_uptime ?? v.uptime_percentage) as number,
          weight: String(v.weight),
          stakeUnit: (isStaked ? 'tokens' : 'weight') as 'tokens' | 'weight',
          stakedAmount: isStaked ? String(v.staked_amount) : undefined,
          stakedToken: v.staked_token ?? undefined,
          remainingBalance: v.balance,
          explorerUrl: `https://subnets.avax.network/validators/${v.node_id}`,
          validationId: v.validation_id,
        };
      });
    } catch (error) {
      console.error(`L1Beat validators fetch error (${subnetId}):`, error);
      return [];
    }
  }, 5 * 60 * 1000);
}

export async function getL1BeatFeeMetrics(subnetId?: string): Promise<L1BeatFeeMetrics[]> {
  const cacheKey = `l1beat-fees-${subnetId ?? 'all'}`;
  return fetchExternalWithCache(cacheKey, async () => {
    try {
      const extraParams: Record<string, string> = {};
      if (subnetId) extraParams['subnet_id'] = subnetId;
      return await fetchAllL1BeatPages<L1BeatFeeMetrics>('/api/v1/metrics/fees', extraParams);
    } catch (error) {
      console.error('L1Beat fee metrics fetch error:', error);
      return [];
    }
  }, 5 * 60 * 1000);
}

// Fetch the global fee summary (aggregated across all subnets)
export async function getL1BeatFeeSummary(): Promise<L1BeatFeeSummary | null> {
  return fetchExternalWithCache('l1beat-fee-summary', async () => {
    try {
      const response = await fetchExternalWithRetry<{ data: any[]; summary: L1BeatFeeSummary }>(
        `${L1BEAT_EXTERNAL_API}/api/v1/metrics/fees?limit=1`
      );
      return response.summary ?? null;
    } catch (error) {
      console.error('L1Beat fee summary fetch error:', error);
      return null;
    }
  }, 5 * 60 * 1000);
}

// Daily fee burn for a single subnet
export interface DailyFeeBurnValidator {
  validation_id: string;
  node_id: string;
  fees_burned: number;
  active_seconds: number;
}

export interface DailyFeeBurn {
  date: string;
  total_fees_burned: number;
  active_validators: number;
  validators?: DailyFeeBurnValidator[];
}

export async function getL1BeatDailyFeeBurn(subnetId: string, options?: { days?: number; validators?: boolean }): Promise<DailyFeeBurn[]> {
  const days = options?.days;
  const validators = options?.validators;
  const cacheKey = `l1beat-daily-fees-${subnetId}-${days ?? 'all'}-${validators ? 'v' : ''}`;
  return fetchExternalWithCache(cacheKey, async () => {
    try {
      const params = new URLSearchParams({ subnet_id: subnetId });
      if (days) params.set('days', String(days));
      if (validators) params.set('validators', 'true');
      const response = await fetchExternalWithRetry<{ data: DailyFeeBurn[] }>(
        `${L1BEAT_EXTERNAL_API}/api/v1/metrics/fees/daily?${params.toString()}`
      );
      return response.data ?? [];
    } catch (error) {
      console.error(`L1Beat daily fee burn fetch error (${subnetId}):`, error);
      return [];
    }
  }, 5 * 60 * 1000);
}

// --- EVM (C-Chain) base + priority fee burn -------------------------------
// Unlike L1 validation-fee burn, every C-Chain transaction burns its EIP-1559
// base fee AND priority tip. Amounts are nAVAX as decimal strings — they can
// exceed Number.MAX_SAFE_INTEGER, so parse with BigInt before dividing.
export interface FeeBurnAmounts {
  total_burned: string;        // nAVAX
  base_fee_burned: string;     // nAVAX
  priority_fee_burned: string; // nAVAX = total - base
}
export interface FeeBurnPoint extends FeeBurnAmounts {
  period: string; // ISO8601 UTC
}
export interface FeeBurnResponse {
  chain_id: number;
  granularity: 'hour' | 'day' | 'week' | 'month';
  unit: 'nAVAX';
  cumulative: FeeBurnAmounts; // all-time, ignores from/to/granularity
  series: FeeBurnPoint[];      // oldest-first
}

// Convert an nAVAX decimal string to AVAX. BigInt keeps the integer exact; the
// AVAX result is small enough for a JS number.
export function nAvaxToAvax(n: string | undefined | null): number {
  if (!n) return 0;
  try {
    return Number(BigInt(n)) / 1e9;
  } catch {
    return 0;
  }
}

export async function getEvmFeesBurned(
  chainId: number | string,
  options?: { granularity?: 'hour' | 'day' | 'week' | 'month'; limit?: number; from?: string; to?: string },
): Promise<FeeBurnResponse | null> {
  const granularity = options?.granularity ?? 'day';
  const cacheKey = `evm-fees-burned-${chainId}-${granularity}-${options?.limit ?? ''}-${options?.from ?? ''}-${options?.to ?? ''}`;
  return fetchExternalWithCache(cacheKey, async () => {
    try {
      const params = new URLSearchParams({ granularity });
      if (options?.limit) params.set('limit', String(options.limit));
      if (options?.from) params.set('from', options.from);
      if (options?.to) params.set('to', options.to);
      const response = await fetchExternalWithRetry<{ data: FeeBurnResponse }>(
        `${L1BEAT_EXTERNAL_API}/api/v1/metrics/evm/${chainId}/fees/burned?${params.toString()}`,
      );
      return response.data ?? null;
    } catch (error) {
      console.error(`EVM fees burned fetch error (${chainId}):`, error);
      return null;
    }
  }, 5 * 60 * 1000);
}

// Network-wide all-time AVAX burned (nAVAX strings). The authoritative cumulative
// for the live burn page; the websocket layers new-block deltas on top.
export interface BurnedTotal {
  unit: string;
  total_burned: string; // nAVAX
  by_chain: { p_chain: string | null; x_chain: string | null; c_chain: string | null };
  updated_at: string;
}

export async function getBurnedTotal(): Promise<BurnedTotal | null> {
  return fetchExternalWithCache('burned-total', async () => {
    try {
      const response = await fetchExternalWithRetry<{ data: BurnedTotal }>(
        `${L1BEAT_EXTERNAL_API}/api/v1/metrics/burned/total`,
      );
      return response.data ?? null;
    } catch (error) {
      console.error('Burned total fetch error:', error);
      return null;
    }
  }, 60 * 1000);
}

// Daily L1 validation fees summed across every L1. The indexer aggregates when
// subnet_id is omitted, so this is one request instead of one per L1 (which ran
// into the API's burst limit and dropped L1s from the daily totals).
export async function getNetworkDailyFeeBurn(days: number = 30): Promise<{ timestamp: number; value: number }[]> {
  const cacheKey = `l1beat-network-daily-fees-${days}`;
  return fetchExternalWithCache(cacheKey, async () => {
    try {
      const response = await fetchExternalWithRetry<{ data: DailyFeeBurn[] }>(
        `${L1BEAT_EXTERNAL_API}/api/v1/metrics/fees/daily?days=${days}`
      );
      // nAVAX to AVAX, oldest first.
      return (response.data ?? [])
        .map((entry) => ({
          timestamp: Math.floor(new Date(entry.date).getTime() / 1000),
          value: entry.total_fees_burned / 1_000_000_000,
        }))
        .sort((a, b) => a.timestamp - b.timestamp)
        .slice(-days);
    } catch (error) {
      console.error('Network daily fee burn fetch error:', error);
      return [];
    }
  }, 5 * 60 * 1000);
}

// Fetch a single validator by validation_id or node_id from L1Beat.
export async function getL1BeatValidator(id: string, subnetId?: string): Promise<L1BeatValidator | null> {
  const cacheKey = `l1beat-validator-${id}-${subnetId ?? 'base'}`;
  return fetchExternalWithCache(cacheKey, async () => {
    try {
      const url = subnetId
        ? `${L1BEAT_EXTERNAL_API}/api/v1/data/validators/${encodeURIComponent(id)}?subnet_id=${encodeURIComponent(subnetId)}`
        : `${L1BEAT_EXTERNAL_API}/api/v1/data/validators/${encodeURIComponent(id)}`;
      const response = await fetchExternalWithRetry<{ data: L1BeatValidator }>(url);
      return response.data ?? null;
    } catch (error) {
      console.error(`L1Beat validator fetch error (${id}):`, error);
      return null;
    }
  }, 5 * 60 * 1000);
}

// Every validation a node has run, active or ended, across all subnets.
export async function getL1BeatNodeValidations(nodeId: string): Promise<L1BeatValidator[]> {
  const cacheKey = `l1beat-node-validations-${nodeId}`;
  return fetchExternalWithCache(cacheKey, async () => {
    try {
      return await fetchAllL1BeatPages<L1BeatValidator>(
        '/api/v1/data/validators',
        { node_id: nodeId },
        { maxPages: 5, pageSize: 1000 }
      );
    } catch (error) {
      console.error(`L1Beat node validations fetch error (${nodeId}):`, error);
      return [];
    }
  }, 5 * 60 * 1000);
}

// Fetch deposit history for a validator from L1Beat.
export async function getL1BeatValidatorDeposits(id: string): Promise<ValidatorDeposit[]> {
  const cacheKey = `l1beat-validator-deposits-${id}`;
  return fetchExternalWithCache(cacheKey, async () => {
    try {
      return await fetchAllL1BeatPages<ValidatorDeposit>(
        `/api/v1/data/validators/${encodeURIComponent(id)}/deposits`
      );
    } catch (error) {
      console.error(`L1Beat validator deposits fetch error (${id}):`, error);
      return [];
    }
  }, 5 * 60 * 1000);
}

// Fetch the subnet type for a single subnet by ID.
export async function getL1BeatSubnetType(subnetId: string): Promise<'l1' | 'legacy' | null> {
  const cacheKey = `l1beat-subnet-type-${subnetId}`;
  return fetchExternalWithCache(cacheKey, async () => {
    try {
      const response = await fetchExternalWithRetry<{ data: { subnet: L1BeatSubnet } }>(
        `${L1BEAT_EXTERNAL_API}/api/v1/data/subnets/${encodeURIComponent(subnetId)}`
      );
      return response.data?.subnet?.subnet_type ?? null;
    } catch (error) {
      console.error(`L1Beat subnet type fetch error (${subnetId}):`, error);
      return null;
    }
  }, 15 * 60 * 1000);
}

// Resolve a chain by its subnet ID (uses cached getChains data).
export async function getChainBySubnetId(subnetId: string): Promise<Chain | null> {
  try {
    const chains = await getChains();
    return chains.find(c => c.subnetId === subnetId) ?? null;
  } catch {
    return null;
  }
}

export async function getStablecoins(evmChainId: number | string = 43114): Promise<Stablecoin[]> {
  return fetchExternalWithCache(`stablecoins-${evmChainId}`, async () => {
    try {
      const response = await fetchExternalWithRetry<StablecoinsResponse>(
        `${L1BEAT_EXTERNAL_API}/api/v1/data/evm/${evmChainId}/stablecoins`
      );
      return Array.isArray(response?.data) ? response.data : [];
    } catch (error) {
      console.error('Stablecoins fetch error:', error);
      return [];
    }
  });
}

// Historical stablecoin metrics. One series per token when `token` is omitted
// (each ordered oldest→newest). Values are strings — supply/volume are raw base
// units needing /10^decimals; transfers/holders are plain counts. There is no
// `meta`/pagination envelope here, and `limit` is per-token. Cached 15min.
export async function getStablecoinsTimeseries(opts: {
  evmChainId?: number | string;
  metric: StablecoinMetric;
  granularity?: StablecoinGranularity;
  token?: string;
  limit?: number;
  from?: string;
  to?: string;
}): Promise<StablecoinSeries[]> {
  const {
    evmChainId = 43114,
    metric,
    granularity = 'day',
    token,
    limit = 365,
    from,
    to,
  } = opts;

  const params = new URLSearchParams({ metric, granularity, limit: String(limit) });
  if (token) params.set('token', token);
  if (from) params.set('from', from);
  if (to) params.set('to', to);

  const key = `stablecoins-ts-${evmChainId}-${metric}-${granularity}-${token ?? 'all'}-${limit}-${from ?? ''}-${to ?? ''}`;

  return fetchExternalWithCache(key, async () => {
    try {
      const response = await fetchExternalWithRetry<StablecoinTimeseriesResponse>(
        `${L1BEAT_EXTERNAL_API}/api/v1/data/evm/${evmChainId}/stablecoins/timeseries?${params.toString()}`,
      );
      return Array.isArray(response?.data) ? response.data : [];
    } catch (error) {
      console.error('Stablecoins timeseries fetch error:', error);
      return [];
    }
  });
}

// Resolves token logos via CoinGecko's GeckoTerminal multi-token endpoint.
// One call, up to 30 addresses, returns canonical CoinGecko image URLs.
// Cached 24h since logos basically never change. Network slugs map to
// GeckoTerminal's internal IDs — "avax" for Avalanche C-Chain.
const GT_NETWORK_BY_EVM: Record<string, string> = {
  '43114': 'avax',
};

export async function getTokenLogos(
  addresses: string[],
  evmChainId: number | string = 43114,
): Promise<Record<string, string>> {
  if (!addresses.length) return {};
  const network = GT_NETWORK_BY_EVM[String(evmChainId)] || 'avax';
  // Stable cache key regardless of address ordering.
  const sorted = [...addresses].map((a) => a.toLowerCase()).sort();
  const key = `gt-logos-${network}-${sorted.join(',')}`;

  return fetchExternalWithCache(
    key,
    async () => {
      const out: Record<string, string> = {};
      // GeckoTerminal caps at 30 addresses per call. Chunk to stay under.
      const CHUNK = 30;
      for (let i = 0; i < sorted.length; i += CHUNK) {
        const slice = sorted.slice(i, i + CHUNK);
        const url = `https://api.geckoterminal.com/api/v2/networks/${network}/tokens/multi/${slice.join(
          ',',
        )}`;
        try {
          const resp = await fetchExternalWithRetry<{
            data?: Array<{ attributes?: { address?: string; image_url?: string } }>;
          }>(url);
          for (const item of resp.data ?? []) {
            const addr = item.attributes?.address?.toLowerCase();
            const img = item.attributes?.image_url;
            if (addr && img && !img.includes('missing.png')) {
              out[addr] = img;
            }
          }
        } catch (error) {
          console.error('GeckoTerminal logo fetch error:', error);
        }
      }
      return out;
    },
    24 * 60 * 60 * 1000,
  );
}

// FX rates for non-USD pegs. Cached for ~6h since rates barely move intraday.
// Source: frankfurter.app (ECB rates, free, no key). Falls back to a rough
// snapshot if the call fails so the page never breaks.
export interface FxRates {
  EUR: number;
  SGD: number;
  JPY: number;
  CHF: number;
  GBP: number;
  BRL: number;
  TRY: number;
  [code: string]: number;
}

// Every non-USD peg we track needs a rate, otherwise pegToUsd leaves the value
// in face units and badly overstates supply (e.g. 12M lira counted as $12M).
// Rough fallbacks only — the live frankfurter call refreshes them.
const FX_FALLBACK: FxRates = {
  EUR: 1.08, SGD: 0.74, JPY: 0.0064, CHF: 1.25, GBP: 1.34, BRL: 0.2, TRY: 0.022,
};

const FX_CODES = ['EUR', 'SGD', 'JPY', 'CHF', 'GBP', 'BRL', 'TRY'] as const;

export async function getFxRates(): Promise<FxRates> {
  return fetchWithCache('fx-rates-usd', async () => {
    try {
      const res = await fetch(
        `https://api.frankfurter.app/latest?from=USD&to=${FX_CODES.join(',')}`,
      );
      if (!res.ok) throw new Error(`fx http ${res.status}`);
      const json = (await res.json()) as { rates?: Record<string, number> };
      const rates = json.rates ?? {};
      // frankfurter returns 1 USD = X EUR, we want 1 EUR = Y USD → invert.
      const inv = (r: number | undefined) => (r && r > 0 ? 1 / r : undefined);
      const out = { ...FX_FALLBACK };
      for (const code of FX_CODES) out[code] = inv(rates[code]) ?? FX_FALLBACK[code];
      return out;
    } catch (error) {
      console.error('FX rates fetch error:', error);
      return FX_FALLBACK;
    }
  }, 6 * 60 * 60 * 1000);
}