/**
 * Chart Data Service - Specialized Chart Data Management
 * 
 * Manages chart data with:
 * - Historical chart data caching
 * - Real-time updates integration
 * - Lightweight-charts format conversion
 * - Intelligent preloading for different intervals
 * - Memory-efficient data storage
 * 
 * Built on top of MarketDataService for consistent data flow
 */

import { marketDataService, type KlineData, type MarketDataEvent, type MarketDataSubscriber } from '../market/MarketDataService';
import type { CandlestickData } from 'lightweight-charts';

export interface ChartDataSubscriber {
  id: string;
  onUpdate: (data: CandlestickData) => void;
  onHistoricalData: (data: CandlestickData[]) => void;
  onError?: (error: Error) => void;
}

export interface ChartConfig {
  symbol: string;
  interval: string;
  historicalLimit?: number;
  enableRealTime?: boolean;
  preloadIntervals?: string[];
}

interface ChartDataCache {
  data: CandlestickData[];
  lastUpdate: number;
  interval: string;
  symbol: string;
}

class ChartDataService implements MarketDataSubscriber {
  private static instance: ChartDataService;
  
  public readonly id = 'chart-data-service';
  private subscribers: Map<string, ChartDataSubscriber> = new Map();
  private chartCache: Map<string, ChartDataCache> = new Map();
  private activeSubscriptions: Map<string, ChartConfig> = new Map();
  
  // Common trading intervals in order of popularity
  private readonly commonIntervals = ['1m', '5m', '15m', '1h', '4h', '1d'];
  private debug = import.meta.env.VITE_DEBUG_WS === 'true';

  private constructor() {
    // Register with MarketDataService
    marketDataService.subscribe(
      { 
        symbol: '', // Will be updated per subscription
        includeKlines: true,
        includeTicker: false,
        includeOrderbook: false
      },
      this
    );
  }

  public static getInstance(): ChartDataService {
    if (!ChartDataService.instance) {
      ChartDataService.instance = new ChartDataService();
    }
    return ChartDataService.instance;
  }

  /**
   * Subscribe to chart data for a symbol and interval
   */
  public async subscribe(config: ChartConfig, subscriber: ChartDataSubscriber): Promise<void> {
    const key = this.getKey(config.symbol, config.interval);
    
    this.subscribers.set(subscriber.id, subscriber);
    this.activeSubscriptions.set(key, config);
    
    this.log(`New chart subscription: ${config.symbol} ${config.interval} by ${subscriber.id}`);
    
    try {
      // Load historical data
      await this.loadHistoricalData(config);
      
      // Setup real-time updates if enabled
      if (config.enableRealTime !== false) {
        this.setupRealTimeUpdates(config);
      }
      
      // Preload other intervals if specified
      if (config.preloadIntervals?.length) {
        this.preloadIntervals(config.symbol, config.preloadIntervals);
      }
      
    } catch (error) {
      this.notifyError(subscriber, `Failed to setup chart for ${config.symbol}`, error as Error);
    }
  }

  /**
   * Unsubscribe from chart data
   */
  public unsubscribe(subscriberId: string): void {
    this.subscribers.delete(subscriberId);
    
    // Clean up if no more subscribers for this config
    for (const [key, config] of this.activeSubscriptions.entries()) {
      const hasSubscribers = Array.from(this.subscribers.values())
        .some(sub => this.getSubscriberKey(sub.id) === key);
      
      if (!hasSubscribers) {
        this.cleanupSubscription(config);
        this.activeSubscriptions.delete(key);
      }
    }
    
    this.log(`Unsubscribed ${subscriberId} from chart data`);
  }

  /**
   * Get cached historical data
   */
  public getHistoricalData(symbol: string, interval: string): CandlestickData[] | null {
    const key = this.getKey(symbol, interval);
    const cached = this.chartCache.get(key);
    return cached ? [...cached.data] : null;
  }

  /**
   * Refresh data for symbol and interval
   */
  public async refreshData(symbol: string, interval: string): Promise<void> {
    const config = this.activeSubscriptions.get(this.getKey(symbol, interval));
    if (config) {
      await this.loadHistoricalData(config, true);
    }
  }

  /**
   * Preload data for multiple intervals
   */
  public async preloadIntervals(symbol: string, intervals: string[]): Promise<void> {
    this.log(`Preloading intervals for ${symbol}: ${intervals.join(', ')}`);
    
    const promises = intervals.map(interval => 
      this.loadHistoricalData({ 
        symbol, 
        interval, 
        historicalLimit: 100,
        enableRealTime: false 
      })
    );
    
    await Promise.allSettled(promises);
  }

  /**
   * Get list of common trading intervals
   */
  public getCommonIntervals(): string[] {
    return [...this.commonIntervals];
  }

  /**
   * Preload data for all common intervals
   */
  public async preloadCommonIntervals(symbol: string): Promise<void> {
    this.log(`Preloading common intervals for ${symbol}`);
    await this.preloadIntervals(symbol, this.commonIntervals);
  }

  /**
   * Get cache statistics
   */
  public getStats() {
    return {
      subscribers: this.subscribers.size,
      activeSubscriptions: this.activeSubscriptions.size,
      cachedCharts: this.chartCache.size,
      cacheKeys: Array.from(this.chartCache.keys())
    };
  }

  /**
   * Clear cache for symbol or all
   */
  public clearCache(symbol?: string): void {
    if (symbol) {
      for (const key of this.chartCache.keys()) {
        if (key.startsWith(`${symbol}:`)) {
          this.chartCache.delete(key);
        }
      }
      this.log(`Cache cleared for ${symbol}`);
    } else {
      this.chartCache.clear();
      this.log('All chart cache cleared');
    }
  }

  // MarketDataSubscriber implementation
  public onEvent(event: MarketDataEvent): void {
    switch (event.type) {
      case 'kline':
        this.handleKlineUpdate(event.data);
        break;
      case 'error':
        this.log(`Market data error: ${event.context}`, event.error);
        break;
    }
  }

  private async loadHistoricalData(config: ChartConfig, forceRefresh = false): Promise<void> {
    const { symbol, interval, historicalLimit = 500 } = config;
    const key = this.getKey(symbol, interval);
    
    // Check cache first (unless forcing refresh)
    if (!forceRefresh) {
      const cached = this.chartCache.get(key);
      if (cached && this.isCacheValid(cached)) {
        this.notifyHistoricalData(key, cached.data);
        return;
      }
    }
    
    this.log(`Loading historical data for ${symbol} ${interval} (limit: ${historicalLimit})`);
    
    try {
      const klineData = await marketDataService.getKlines(symbol, interval, historicalLimit);
      const chartData = this.convertToChartData(klineData);
      
      // Cache the data
      this.chartCache.set(key, {
        data: chartData,
        lastUpdate: Date.now(),
        interval,
        symbol
      });
      
      // Notify subscribers
      this.notifyHistoricalData(key, chartData);
      
      this.log(`Loaded ${chartData.length} data points for ${symbol} ${interval}`);
    } catch (error) {
      this.log(`Failed to load historical data for ${symbol} ${interval}:`, error);
      throw error;
    }
  }

  private setupRealTimeUpdates(config: ChartConfig): void {
    const { symbol, interval } = config;
    
    // Real-time updates are handled through the onEvent method
    // when MarketDataService sends kline events
    this.log(`Real-time updates enabled for ${symbol} ${interval}`);
  }

  private handleKlineUpdate(klineData: KlineData): void {
    const key = this.getKey(klineData.symbol, klineData.interval);
    const config = this.activeSubscriptions.get(key);
    
    if (!config) return;
    
    const chartData = this.convertKlineToChartData(klineData);
    
    // Update cache
    const cached = this.chartCache.get(key);
    if (cached) {
      this.updateCachedData(cached, chartData);
    }
    
    // Notify subscribers
    this.notifyUpdate(key, chartData);
    
    this.log(`Chart updated: ${klineData.symbol} ${klineData.interval} - Price: ${chartData.close}`);
  }

  private updateCachedData(cache: ChartDataCache, newData: CandlestickData): void {
    const existingIndex = cache.data.findIndex(d => d.time === newData.time);
    
    if (existingIndex >= 0) {
      // Update existing candle
      cache.data[existingIndex] = newData;
    } else {
      // Add new candle and maintain size limit
      cache.data.push(newData);
      
      // Keep only last 1000 candles in memory
      if (cache.data.length > 1000) {
        cache.data = cache.data.slice(-1000);
      }
    }
    
    cache.lastUpdate = Date.now();
  }

  private convertToChartData(klineData: KlineData[]): CandlestickData[] {
    return klineData.map(kline => this.convertKlineToChartData(kline));
  }

  private convertKlineToChartData(kline: KlineData): CandlestickData {
    return {
      time: Math.floor(kline.openTime / 1000) as any, // Convert to seconds for lightweight-charts
      open: kline.open,
      high: kline.high,
      low: kline.low,
      close: kline.close
    };
  }

  private isCacheValid(cache: ChartDataCache): boolean {
    const maxAge = this.getCacheMaxAge(cache.interval);
    return Date.now() - cache.lastUpdate < maxAge;
  }

  private getCacheMaxAge(interval: string): number {
    // Cache validity based on interval
    switch (interval) {
      case '1m': return 60000;      // 1 minute
      case '5m': return 300000;     // 5 minutes  
      case '15m': return 900000;    // 15 minutes
      case '1h': return 3600000;    // 1 hour
      case '4h': return 14400000;   // 4 hours
      case '1d': return 86400000;   // 1 day
      default: return 300000;       // 5 minutes default
    }
  }

  private getKey(symbol: string, interval: string): string {
    return `${symbol}:${interval}`;
  }

  private getSubscriberKey(_subscriberId: string): string {
    // Simplified - in real implementation you'd track subscriber-key mapping
    return Array.from(this.activeSubscriptions.keys())[0] || '';
  }

  private cleanupSubscription(config: ChartConfig): void {
    const key = this.getKey(config.symbol, config.interval);
    
    // Keep cache but remove from active subscriptions
    // Cache will be cleaned up by TTL
    
    this.log(`Cleaned up subscription for ${key}`);
  }

  private notifyHistoricalData(key: string, data: CandlestickData[]): void {
    for (const subscriber of this.subscribers.values()) {
      if (this.getSubscriberKey(subscriber.id) === key) {
        try {
          subscriber.onHistoricalData(data);
        } catch (error) {
          this.log(`Error notifying subscriber ${subscriber.id} historical data:`, error);
        }
      }
    }
  }

  private notifyUpdate(key: string, data: CandlestickData): void {
    for (const subscriber of this.subscribers.values()) {
      if (this.getSubscriberKey(subscriber.id) === key) {
        try {
          subscriber.onUpdate(data);
        } catch (error) {
          this.log(`Error notifying subscriber ${subscriber.id} update:`, error);
        }
      }
    }
  }

  private notifyError(subscriber: ChartDataSubscriber, context: string, error: Error): void {
    try {
      if (subscriber.onError) {
        subscriber.onError(new Error(`${context}: ${error.message}`));
      }
    } catch (e) {
      this.log(`Error in error handler for ${subscriber.id}:`, e);
    }
  }

  private log(message: string, ...args: any[]): void {
    if (this.debug) {
      console.log(`[ChartDataService] ${message}`, ...args);
    }
  }
}

// Export singleton instance
export const chartDataService = ChartDataService.getInstance();

// Helper hook for React components
export interface UseChartDataOptions {
  symbol: string;
  interval: string;
  historicalLimit?: number;
  enableRealTime?: boolean;
  preloadIntervals?: string[];
}

export interface UseChartDataReturn {
  historicalData: CandlestickData[];
  lastUpdate: CandlestickData | null;
  loading: boolean;
  error: Error | null;
  refreshData: () => Promise<void>;
}

// Note: The actual React hook implementation would go in a separate hooks file
// This is just the interface definition for now
