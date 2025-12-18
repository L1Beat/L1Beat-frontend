import type { Chain, TVLHistory, TVLHealth, NetworkTPS, TPSHistory, HealthStatus, TeleporterMessageData, TeleporterDailyData, CumulativeTxCount, CumulativeTxCountResponse, DailyTxCount, DailyTxCountLatest, MaxTPSHistory, MaxTPSLatest, GasUsedHistory, GasUsedLatest, AvgGasPriceHistory, AvgGasPriceLatest, FeesPaidHistory, FeesPaidLatest, NetworkValidatorTotal, Validator } from './types';
import type { DailyActiveAddresses } from './types';
import { config } from './config';

// XSS protection - sanitize strings in API responses
function sanitizeString(value: string): string {
  if (typeof value !== 'string') return value;
  
  // Replace potentially dangerous characters
  return value
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
const REQUEST_LIMIT = 50; // Max requests per minute
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
        console.log('Rate limit reset');
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
      console.log(`Using stale cached data for ${key} due to rate limiting`);
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
  
  // Create a new AbortController for each retry attempt
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    while (attempt < retries) {
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
    
    // If we've exhausted all retries, return fallback data instead of throwing
    console.warn('All retry attempts failed, returning fallback data:', lastError.message);
    return getFallbackData<T>();
  } finally {
    // Always clear the timeout to prevent memory leaks
    clearTimeout(timeoutId);
  }
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

export async function getChains(filters?: { category?: string; network?: 'mainnet' | 'fuji' }): Promise<Chain[]> {
  const queryParams = new URLSearchParams();
  if (filters?.category) queryParams.append('category', filters.category);
  if (filters?.network) queryParams.append('network', filters.network);

  const cacheKey = `chains_${queryParams.toString() || 'all'}`;

  return fetchWithCache(cacheKey, async () => {
    try {
      const url = `${API_URL}/chains${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
      const data = await fetchWithRetry<any[]>(url);

      const chains = data.map((chain) => {
        // Debug: Log chain data to see networkToken field
        if (!chain.networkToken && !chain.token && !chain.nativeToken) {
          console.log(`Chain ${chain.chainName} missing networkToken field. Available fields:`, Object.keys(chain));
        }

        // Handle potential backend property name changes
        // Prioritize using the chain name as the primary ID for URLs, but keep numeric IDs for other purposes if needed
        // We sanitize the chain name to be URL-friendly (lowercase, replace spaces with dashes)
        const rawChainId = chain.evmChainId || chain.chainId || chain.id || chain._id;
        
        // Generate a slug from the chain name if available
        let chainSlug = rawChainId;
        if (chain.chainName) {
          chainSlug = chain.chainName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        }
        
        if (!chainSlug) {
          console.warn('Chain missing ID and Name:', chain);
          // Fallback to a random string if absolutely nothing is available (should shouldn't happen)
           chainSlug = Math.random().toString(36).substring(7);
        }

        const validatorCountRaw = chain.validatorCount || chain.validatorsCount || chain.validator_count || chain.nodeCount || 0;
        const validatorCount = Number(validatorCountRaw);

        return {
          ...chain,
          // We use the slug as the main chainId for routing purposes
          chainId: String(chainSlug),
          // We store the original numeric ID if we need it for API calls
          originalChainId: String(rawChainId),
          tps: chain.tps ? {
            value: Number(chain.tps.value),
            timestamp: chain.tps.timestamp
          } : null,
          // cumulativeTxCount is now included in the backend response
          cumulativeTxCount: chain.cumulativeTxCount ? {
            value: chain.cumulativeTxCount.value,
            timestamp: chain.cumulativeTxCount.timestamp
          } : null,
          // Handle various potential field names for validator count and ensure it's a number
          validatorCount: validatorCount,
          validators: chain.validators ? chain.validators.map((validator: any) => ({
            address: validator.nodeId,
            active: validator.validationStatus === 'active',
            uptime: validator.uptimePerformance,
            weight: Number(validator.amountStaked),
            explorerUrl: chain.explorerUrl ? `${EXPLORER_URL}/validators/${validator.nodeId}` : undefined
          })) : [],
          // Explicitly handle networkToken to ensure it's available
          networkToken: chain.networkToken || chain.token || chain.nativeToken || {
            name: 'AVAX',
            symbol: 'AVAX',
            decimals: 18
          }
        };
      });

      return chains;
    } catch (error) {
      console.error('Chains fetch error:', error);
      return [];
    }
  });
}

export async function getChainValidators(chainId: string): Promise<Validator[]> {
  return fetchWithCache(`chain-validators-${chainId}`, async () => {
    try {
      const data = await fetchWithRetry<any[]>(`${API_URL}/chains/${chainId}/validators`);
      
      if (!data || !Array.isArray(data)) {
        return [];
      }

      return data.map((validator: any) => ({
        address: validator.nodeId,
        active: validator.validationStatus === 'active',
        uptime: validator.uptimePerformance,
        weight: Number(validator.amountStaked),
        explorerUrl: `${EXPLORER_URL}/validators/${validator.nodeId}`
      }));
    } catch (error) {
      console.error('Chain validators fetch error:', error);
      return [];
    }
  });
}

export async function getCategories(): Promise<string[]> {
  return fetchWithCache('categories', async () => {
    try {
      const data = await fetchWithRetry<string[]>(`${API_URL}/chains/categories`);
      return data || [];
    } catch (error) {
      console.error('Categories fetch error:', error);
      return [];
    }
  });
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
      console.log(`Fetching daily active addresses for chainId: ${chainId}, days: ${days}`);
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