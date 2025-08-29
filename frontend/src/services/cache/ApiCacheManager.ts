/**
 * API Cache Manager - Singleton Pattern
 * 
 * Manages REST API requests with intelligent caching and deduplication:
 * - TTL-based caching to prevent redundant requests
 * - Request deduplication for identical pending requests  
 * - Request batching where applicable
 * - Fallback mechanisms for cache misses
 * 
 * Based on trading app best practices for efficient API usage
 */

interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
  ttl: number;
  isStale: boolean;
}

interface PendingRequest {
  promise: Promise<any>;
  timestamp: number;
  resolvers: Array<(value: any) => void>;
  rejecters: Array<(error: any) => void>;
}

interface CacheConfig {
  defaultTTL?: number;
  maxCacheSize?: number;
  staleWhileRevalidate?: boolean;
  debug?: boolean;
}

class ApiCacheManager {
  private static instance: ApiCacheManager;
  private cache: Map<string, CacheEntry> = new Map();
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private config: Required<CacheConfig>;
  private hitCount = 0;
  private missCount = 0;

  private constructor(config: CacheConfig = {}) {
    const env = (globalThis as any)?.import?.meta?.env || (typeof process !== 'undefined' ? (process as any).env : {});
    this.config = {
      defaultTTL: 30000, // 30 seconds
      maxCacheSize: 1000,
      staleWhileRevalidate: true,
      debug: env?.VITE_DEBUG_WS === 'true',
      ...config
    };

    // Cleanup expired entries periodically
    setInterval(() => this.cleanup(), 60000); // Every minute
  }

  public static getInstance(config?: CacheConfig): ApiCacheManager {
    if (!ApiCacheManager.instance) {
      ApiCacheManager.instance = new ApiCacheManager(config);
    }
    return ApiCacheManager.instance;
  }

  /**
   * Get data from cache or fetch if not available/expired
   */
  public async get<T>(
    key: string, 
    fetcher: () => Promise<T>, 
    ttl?: number
  ): Promise<T> {
    const cacheKey = this.normalizeKey(key);
    const effectiveTTL = ttl ?? this.config.defaultTTL;

    // Check cache first
    const cached = this.cache.get(cacheKey);
    const now = Date.now();

    if (cached && !this.isExpired(cached, now)) {
      this.hitCount++;
      this.log(`Cache HIT for ${cacheKey}`);
      return cached.data;
    }

    // Check if request is already pending
    const pending = this.pendingRequests.get(cacheKey);
    if (pending) {
      this.log(`Request already pending for ${cacheKey}, waiting...`);
      return new Promise((resolve, reject) => {
        pending.resolvers.push(resolve);
        pending.rejecters.push(reject);
      });
    }

    // Stale-while-revalidate: return stale data if available, but fetch in background
    if (cached && this.config.staleWhileRevalidate && cached.isStale) {
      this.log(`Returning stale data for ${cacheKey}, fetching fresh data in background`);
      this.fetchAndCache(cacheKey, fetcher, effectiveTTL, false); // Background fetch
      return cached.data;
    }

    this.missCount++;
    this.log(`Cache MISS for ${cacheKey}, fetching...`);
    
    return this.fetchAndCache(cacheKey, fetcher, effectiveTTL, true);
  }

  /**
   * Set data in cache manually
   */
  public set<T>(key: string, data: T, ttl?: number): void {
    const cacheKey = this.normalizeKey(key);
    const effectiveTTL = ttl ?? this.config.defaultTTL;

    this.cache.set(cacheKey, {
      data,
      timestamp: Date.now(),
      ttl: effectiveTTL,
      isStale: false
    });

    this.enforceMaxSize();
    this.log(`Data cached for ${cacheKey} with TTL ${effectiveTTL}ms`);
  }

  /**
   * Invalidate specific cache entry
   */
  public invalidate(key: string): void {
    const cacheKey = this.normalizeKey(key);
    const removed = this.cache.delete(cacheKey);
    if (removed) {
      this.log(`Cache invalidated for ${cacheKey}`);
    }
  }

  /**
   * Invalidate cache entries matching pattern
   */
  public invalidatePattern(pattern: string | RegExp): number {
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    let count = 0;

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
        count++;
      }
    }

    this.log(`Invalidated ${count} cache entries matching pattern ${pattern}`);
    return count;
  }

  /**
   * Clear all cache
   */
  public clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    this.pendingRequests.clear();
    this.log(`Cache cleared, removed ${size} entries`);
  }

  /**
   * Get cache statistics
   */
  public getStats() {
    const totalRequests = this.hitCount + this.missCount;
    return {
      size: this.cache.size,
      hitCount: this.hitCount,
      missCount: this.missCount,
      hitRate: totalRequests > 0 ? (this.hitCount / totalRequests * 100).toFixed(2) + '%' : '0%',
      pendingRequests: this.pendingRequests.size
    };
  }

  /**
   * Preload data into cache
   */
  public async preload<T>(
    key: string, 
    fetcher: () => Promise<T>, 
    ttl?: number
  ): Promise<void> {
    try {
      const data = await fetcher();
      this.set(key, data, ttl);
      this.log(`Preloaded data for ${key}`);
    } catch (error) {
      this.log(`Failed to preload data for ${key}:`, error);
    }
  }

  /**
   * Batch multiple requests - useful for fetching multiple symbols
   */
  public async getBatch<T>(
    requests: Array<{ key: string; fetcher: () => Promise<T>; ttl?: number }>
  ): Promise<Array<{ key: string; data: T; error?: Error }>> {
    const results = await Promise.allSettled(
      requests.map(async ({ key, fetcher, ttl }) => {
        try {
          const data = await this.get(key, fetcher, ttl);
          return { key, data };
        } catch (error) {
          return { key, data: null, error: error as Error };
        }
      })
    );

    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          key: requests[index].key,
          data: null as any,
          error: result.reason
        };
      }
    });
  }

  private async fetchAndCache<T>(
    cacheKey: string, 
    fetcher: () => Promise<T>, 
    ttl: number,
    waitForResult: boolean
  ): Promise<T> {
    // Create pending request entry
    const pendingRequest: PendingRequest = {
      promise: this.executeFetcher(fetcher),
      timestamp: Date.now(),
      resolvers: [],
      rejecters: []
    };

    this.pendingRequests.set(cacheKey, pendingRequest);

    if (!waitForResult) {
      // Background fetch - return immediately
      pendingRequest.promise
        .then((data) => {
          this.cache.set(cacheKey, {
            data,
            timestamp: Date.now(),
            ttl,
            isStale: false
          });
          this.enforceMaxSize();
          this.log(`Background fetch completed for ${cacheKey}`);
        })
        .catch((error) => {
          this.log(`Background fetch failed for ${cacheKey}:`, error);
        })
        .finally(() => {
          this.pendingRequests.delete(cacheKey);
        });

      // Return stale data if available
      const cached = this.cache.get(cacheKey);
      if (cached) {
        return cached.data;
      }
      
      // No stale data, need to wait anyway
      return pendingRequest.promise;
    }

    try {
      const data = await pendingRequest.promise;
      
      // Resolve all waiting promises
      pendingRequest.resolvers.forEach(resolve => resolve(data));
      
      // Cache the result
      this.cache.set(cacheKey, {
        data,
        timestamp: Date.now(),
        ttl,
        isStale: false
      });

      this.enforceMaxSize();
      return data;
    } catch (error) {
      // Reject all waiting promises
      pendingRequest.rejecters.forEach(reject => reject(error));
      throw error;
    } finally {
      this.pendingRequests.delete(cacheKey);
    }
  }

  private async executeFetcher<T>(fetcher: () => Promise<T>): Promise<T> {
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Request timeout')), 30000); // 30s timeout
    });

    return Promise.race([fetcher(), timeout]);
  }

  private normalizeKey(key: string): string {
    // Normalize keys to handle slight variations
    return key.toLowerCase().trim();
  }

  private isExpired(entry: CacheEntry, now: number): boolean {
    const expired = now - entry.timestamp > entry.ttl;
    if (expired && !entry.isStale) {
      entry.isStale = true;
    }
    return expired;
  }

  private cleanup(): void {
    const now = Date.now();
    let removedCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      // Remove entries that are expired beyond grace period
      if (now - entry.timestamp > entry.ttl * 2) {
        this.cache.delete(key);
        removedCount++;
      }
    }

    // Clean up stale pending requests (older than 5 minutes)
    for (const [key, pending] of this.pendingRequests.entries()) {
      if (now - pending.timestamp > 300000) {
        this.pendingRequests.delete(key);
      }
    }

    if (removedCount > 0) {
      this.log(`Cleanup: removed ${removedCount} expired entries`);
    }
  }

  private enforceMaxSize(): void {
    if (this.cache.size <= this.config.maxCacheSize) {
      return;
    }

    // Remove oldest entries when cache is too large
    const entries = Array.from(this.cache.entries())
      .sort(([, a], [, b]) => a.timestamp - b.timestamp);

    const removeCount = this.cache.size - this.config.maxCacheSize;
    for (let i = 0; i < removeCount; i++) {
      this.cache.delete(entries[i][0]);
    }

    this.log(`Cache size limit enforced: removed ${removeCount} oldest entries`);
  }

  private log(message: string, ...args: any[]): void {
    if (this.config.debug) {
      console.log(`[ApiCacheManager] ${message}`, ...args);
    }
  }
}

// Export singleton instance
export const apiCache = ApiCacheManager.getInstance();

// Helper functions for common cache patterns
export const cacheKeys = {
  ticker: (symbol: string) => `ticker:${symbol}`,
  klines: (symbol: string, interval: string, limit?: number) => 
    `klines:${symbol}:${interval}:${limit || 500}`,
  orderbook: (symbol: string, limit?: number) => 
    `orderbook:${symbol}:${limit || 100}`,
  tradingPairs: () => 'trading-pairs',
  exchangeInfo: () => 'exchange-info'
};

// TTL constants for different data types
export const cacheTTL = {
  ticker: 5000,        // 5 seconds - real-time data
  klines: 60000,       // 1 minute - historical data
  orderbook: 2000,     // 2 seconds - real-time data
  tradingPairs: 300000, // 5 minutes - relatively static
  exchangeInfo: 600000  // 10 minutes - static data
};
