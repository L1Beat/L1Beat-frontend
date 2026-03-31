import type { Chain, TVLHistory, TVLHealth, NetworkTPS, TPSHistory, HealthStatus, TeleporterMessageData, TeleporterDailyData, CumulativeTxCount, CumulativeTxCountResponse, DailyTxCount, DailyTxCountLatest, MaxTPSHistory, MaxTPSLatest, GasUsedHistory, GasUsedLatest, AvgGasPriceHistory, AvgGasPriceLatest, FeesPaidHistory, FeesPaidLatest, NetworkValidatorTotal, Validator, L1BeatFeeMetrics, L1BeatFeeSummary, ValidatorDeposit } from './types';
import type { DailyActiveAddresses } from './types';
import { config } from './config';

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
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes

// Export function to clear cache (for debugging/forcing refresh)
export function clearChainsCache() {
  // Clear all chains-related cache entries
  for (const key of cache.keys()) {
    if (key.startsWith('chains')) {
      cache.delete(key);
    }
  }
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
  const cached = cache.get(key);
  const now = Date.now();

  if (cached && now - cached.timestamp < duration) {
    return cached.data;
  }
  
  // Check if we're rate-limited
  if (apiRequestTracker.isRateLimited) {
    console.warn(`Request to ${key} was blocked by rate limiting`);
    
    // If we have cached data (even if expired), use it
    if (cached) {
      return cached.data;
    }
  }
  
  // Record the request attempt
  apiRequestTracker.recordRequest();

  // Fetch fresh data
  const data = await fetcher();
  
  // Sanitize the response data to prevent XSS
  const sanitizedData = sanitizeResponse(data);
  
  // Cache the sanitized data
  cache.set(key, { data: sanitizedData, timestamp: now });
  
  return sanitizedData;
}

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
          throw new Error('Rate limit exceeded - Please try again later');
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

      // Track seen slugs to prevent routing collisions
      const seenSlugs = new Map<string, number>();

      const chains = allChains
        .map((chain) => {
          const chainName = chain.name || chain.chain_name || '';
          const evmChainId = chain.evm_chain_id ? String(chain.evm_chain_id) : '';
          const rawChainId = evmChainId || chain.chain_id || '';

          // Generate URL-friendly slug from chain name
          let baseSlug = chainName
            ? chainName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
            : String(rawChainId || Math.random().toString(36).substring(7));

          // Deduplicate slugs
          const count = seenSlugs.get(baseSlug) ?? 0;
          seenSlugs.set(baseSlug, count + 1);
          const chainSlug = count === 0 ? baseSlug : `${baseSlug}-${count + 1}`;

          const t = chain.network_token;

          return {
            chainId: chainSlug,
            originalChainId: rawChainId,
            chainName,
            chainLogoUri: chain.logo_url || '/icon-dark-animated.svg',
            description: chain.description || '',
            website: chain.website_url || '',
            socials: chain.socials || [],
            categories: chain.categories || [],
            subnetId: chain.subnet_id || '',
            platformChainId: chain.chain_id || '',
            evmChainId: chain.evm_chain_id || undefined,
            isL1: chain.chain_type === 'l1',
            sybilResistanceType: chain.sybil_resistance_type || '',
            network: chain.network || 'mainnet',
            rpcUrl: chain.rpc_url || '',
            explorerUrl: chain.explorer_url || '',
            validatorCount: chain.active_validators ?? chain.validator_count ?? 0,
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
        .sort((a, b) => a.timestamp - b.timestamp);
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
        .sort((a, b) => a.timestamp - b.timestamp);
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
          value: Number(item.value)
        }))
        .sort((a, b) => a.timestamp - b.timestamp);
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
        .sort((a, b) => a.timestamp - b.timestamp);
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
        .sort((a, b) => a.timestamp - b.timestamp);
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
          value: Number(item.value)
        }))
        .sort((a, b) => a.timestamp - b.timestamp);
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
        .sort((a, b) => a.timestamp - b.timestamp);
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
        .sort((a, b) => a.timestamp - b.timestamp);
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
        .sort((a, b) => a.timestamp - b.timestamp);
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
        .sort((a, b) => a.timestamp - b.timestamp);
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
        .sort((a, b) => a.timestamp - b.timestamp);
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
        .sort((a, b) => a.timestamp - b.timestamp);
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
        .sort((a, b) => a.timestamp - b.timestamp);
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
        .sort((a, b) => a.timestamp - b.timestamp);
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
        .sort((a, b) => a.timestamp - b.timestamp);
    } catch (error) {
      console.error('Daily active addresses fetch error:', error);
      return [];
    }
  });
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

export async function getTeleporterMessages(): Promise<TeleporterMessageData> {
  return fetchWithCache('teleporter-messages', async () => {
    try {
      const response = await fetchWithRetry<any>(`${API_URL}/teleporter/messages/daily-count`);
      
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
  const cached = cache.get(key);
  const now = Date.now();
  if (cached && now - cached.timestamp < duration) {
    return cached.data;
  }
  const data = await fetcher();
  const sanitizedData = sanitizeResponse(data);
  cache.set(key, { data: sanitizedData, timestamp: now });
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

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json() as T;
    } catch (error) {
      lastError = error instanceof DOMException && error.name === 'AbortError'
        ? new Error('Request timeout')
        : error as Error;

      if (attempt < retries - 1) {
        const delay = Math.min(1000 * Math.pow(backoffFactor, attempt + 1), 10000);
        await new Promise(resolve => setTimeout(resolve, delay));
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
  extraParams: Record<string, string> = {}
): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const params = new URLSearchParams({ ...extraParams, limit: String(limit), offset: String(offset) });
    const response = await fetchExternalWithRetry<{ data: T[]; meta: { has_more: boolean } }>(
      `${L1BEAT_EXTERNAL_API}${endpoint}?${params.toString()}`
    );
    const chunk = response.data ?? [];
    all.push(...chunk);
    if (chunk.length === 0 || !response.meta?.has_more) break;
    offset += limit;
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
  tx_type?: string;  // 'RegisterL1ValidatorTx' | 'ConvertSubnetToL1Tx'
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
      const allValidators = await fetchAllL1BeatPages<L1BeatValidator>(
        '/api/v1/data/validators',
        params
      );
      return allValidators.map((v) => ({
        address: v.node_id,
        active: v.active,
        uptime: v.primary_uptime ?? v.uptime_percentage,
        weight: String(v.weight),
        stakeUnit: 'weight' as const,
        remainingBalance: v.balance,
        explorerUrl: `https://subnets.avax.network/validators/${v.node_id}`,
        validationId: v.validation_id,
      }));
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

// Aggregate daily fee burn across all L1 subnets for network-wide chart
export async function getNetworkDailyFeeBurn(days: number = 30): Promise<{ timestamp: number; value: number }[]> {
  const cacheKey = `l1beat-network-daily-fees-${days}`;
  return fetchExternalWithCache(cacheKey, async () => {
    try {
      // Get all L1 chains to find subnet IDs
      const chains = await getChains();
      const l1SubnetIds = [...new Set(
        chains.filter(c => c.isL1 && c.subnetId).map(c => c.subnetId)
      )];

      // Fetch daily fees for all subnets in parallel
      const allFees = await Promise.all(
        l1SubnetIds.map(id => getL1BeatDailyFeeBurn(id))
      );

      // Aggregate by date
      const feesByDate = new Map<string, number>();
      allFees.flat().forEach(entry => {
        const current = feesByDate.get(entry.date) || 0;
        feesByDate.set(entry.date, current + entry.total_fees_burned);
      });

      // Convert to sorted array, filter by days, convert nAVAX to AVAX
      const sorted = Array.from(feesByDate.entries())
        .map(([date, nAvax]) => ({
          timestamp: Math.floor(new Date(date).getTime() / 1000),
          value: nAvax / 1_000_000_000,
        }))
        .sort((a, b) => a.timestamp - b.timestamp)
        .slice(-days);

      return sorted;
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