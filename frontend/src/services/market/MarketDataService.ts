/**
 * Market Data Service - Centralized Market Data Management
 * 
 * Consolidates all market data operations using:
 * - WebSocket Connection Manager for real-time data
 * - API Cache Manager for REST API calls
 * - Data normalization and fallback mechanisms
 * - Subscription management
 * 
 * Follows Binance best practices for efficient market data handling
 */

import { connectionManager, ConnectionState } from '../websocket/ConnectionManager';
import { apiCache, cacheKeys, cacheTTL } from '../cache/ApiCacheManager';

// Normalized data types
export interface TickerData {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  high: number;
  low: number;
  timestamp: number;
}

export interface OrderBookData {
  symbol: string;
  bids: Array<[number, number]>; // [price, quantity]
  asks: Array<[number, number]>; // [price, quantity]
  timestamp: number;
}

export interface KlineData {
  symbol: string;
  interval: string;
  openTime: number;
  closeTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: number;
}

// Event types for subscribers
export type MarketDataEvent = 
  | { type: 'ticker'; data: TickerData }
  | { type: 'orderbook'; data: OrderBookData }
  | { type: 'kline'; data: KlineData }
  | { type: 'connection'; state: ConnectionState; url: string }
  | { type: 'error'; error: Error; context: string };

export interface MarketDataSubscriber {
  id: string;
  onEvent: (event: MarketDataEvent) => void;
}

interface SubscriptionConfig {
  symbol: string;
  includeOrderbook?: boolean;
  includeTicker?: boolean;
  includeKlines?: boolean;
  klineInterval?: string;
  orderbookLimit?: number;
}

class MarketDataService {
  private static instance: MarketDataService;
  private subscribers: Map<string, MarketDataSubscriber> = new Map();
  private activeSubscriptions: Map<string, SubscriptionConfig> = new Map();
  private wsConnections: Map<string, string> = new Map(); // symbol -> connectionId
  // Map subscriber -> symbol to allow precise cleanup decisions
  private subscriberSymbols: Map<string, string> = new Map();
  
  // URLs from environment
  private binanceWsUrl = import.meta.env.VITE_BINANCE_WS_URL || 'wss://data-stream.binance.vision/ws';
  private backendWsUrl = this.normalizeBackendUrl(import.meta.env.VITE_WS_URL || 'ws://localhost:8001/ws/market');
  private binanceApiUrl = 'https://api.binance.com/api/v3';
  
  private debug = import.meta.env.VITE_DEBUG_WS === 'true';

  private constructor() {
    // Singleton pattern
  }

  public static getInstance(): MarketDataService {
    if (!MarketDataService.instance) {
      MarketDataService.instance = new MarketDataService();
    }
    return MarketDataService.instance;
  }

  /**
   * Subscribe to market data for a symbol
   */
  public subscribe(config: SubscriptionConfig, subscriber: MarketDataSubscriber): string {
    this.subscribers.set(subscriber.id, subscriber);
    this.activeSubscriptions.set(config.symbol, config);
    this.subscriberSymbols.set(subscriber.id, config.symbol);
    
    this.log(`New subscription for ${config.symbol} by ${subscriber.id}`);
    
    // Setup WebSocket connections based on config
    this.setupSubscriptions(config);
    
    // Load initial data from REST API (cached)
    this.loadInitialData(config);
    
    return subscriber.id;
  }

  /**
   * Unsubscribe from market data
   */
  public unsubscribe(subscriberId: string, symbol?: string): void {
    // Remove subscriber
    this.subscribers.delete(subscriberId);
    // Determine symbol to consider for cleanup
    const mappedSymbol = this.subscriberSymbols.get(subscriberId);
    this.subscriberSymbols.delete(subscriberId);
    const targetSymbol = symbol || mappedSymbol || null;

    if (targetSymbol) {
      // Check if any other subscriber is still interested in this symbol
      const hasOtherForSymbol = Array.from(this.subscriberSymbols.values())
        .some(s => s === targetSymbol);
      if (!hasOtherForSymbol) {
        this.cleanupSubscription(targetSymbol);
      }
    }

    this.log(`Unsubscribed ${subscriberId} from ${symbol || mappedSymbol || 'all'}`);
  }

  /**
   * Get cached ticker data
   */
  public async getTicker(symbol: string): Promise<TickerData | null> {
    try {
      this.validateSymbol(symbol, 'getTicker');
      const data = await apiCache.get(
        cacheKeys.ticker(symbol),
        () => this.fetchTicker(symbol),
        cacheTTL.ticker
      );
      return this.normalizeTicker(data, symbol);
    } catch (error) {
      this.notifyError(`Failed to get ticker for ${symbol}`, error as Error);
      return null;
    }
  }

  /**
   * Get cached orderbook data
   */
  public async getOrderBook(symbol: string, limit = 100): Promise<OrderBookData | null> {
    try {
      this.validateSymbol(symbol, 'getOrderBook');
      const data = await apiCache.get(
        cacheKeys.orderbook(symbol, limit),
        () => this.fetchOrderBook(symbol, limit),
        cacheTTL.orderbook
      );
      return this.normalizeOrderBook(data, symbol);
    } catch (error) {
      this.notifyError(`Failed to get orderbook for ${symbol}`, error as Error);
      return null;
    }
  }

  /**
   * Get cached kline data
   */
  public async getKlines(
    symbol: string, 
    interval: string, 
    limit = 500
  ): Promise<KlineData[]> {
    try {
      this.validateSymbol(symbol, 'getKlines');
      const data = await apiCache.get(
        cacheKeys.klines(symbol, interval, limit),
        () => this.fetchKlines(symbol, interval, limit),
        cacheTTL.klines
      );
      return this.normalizeKlines(data, symbol, interval);
    } catch (error) {
      this.notifyError(`Failed to get klines for ${symbol}`, error as Error);
      return [];
    }
  }

  /**
   * Invalidate cache for symbol
   */
  public invalidateCache(symbol: string): void {
    this.validateSymbol(symbol, 'invalidateCache');
    apiCache.invalidatePattern(new RegExp(`:${symbol}:`));
    this.log(`Cache invalidated for ${symbol}`);
  }

  /**
   * Get service statistics
   */
  public getStats() {
    return {
      subscribers: this.subscribers.size,
      activeSubscriptions: this.activeSubscriptions.size,
      wsConnections: this.wsConnections.size,
      cacheStats: apiCache.getStats()
    };
  }

  private setupSubscriptions(config: SubscriptionConfig): void {
  // (symbol not needed directly here; sub-methods receive full config)
    
    // Setup Binance WebSocket for real-time data if enabled
    if (import.meta.env.VITE_ENABLE_BINANCE_STREAMS === 'true' && config.includeKlines) {
      this.setupBinanceWebSocket(config);
    }
    
    // Setup backend WebSocket only if needed (ticker/orderbook)
    if (config.includeTicker || config.includeOrderbook) {
      this.setupBackendWebSocket(config);
    }
  }

  private setupBinanceWebSocket(config: SubscriptionConfig): void {
    const { symbol, includeKlines, klineInterval = '1m' } = config;
    
    if (!includeKlines) return;
    
    const streams = [`${symbol.toLowerCase()}@kline_${klineInterval}`];
    const url = `${this.binanceWsUrl}/${streams.join('/')}`;
    
    const connectionId = connectionManager.connect({
      url,
      reconnectInterval: 2000,
      maxReconnectAttempts: 5,
      debug: this.debug
    });

    this.wsConnections.set(symbol, connectionId);
    
    // Subscribe to messages
    connectionManager.subscribe(url, {
      id: `binance-${symbol}`,
      onMessage: (data) => this.handleBinanceMessage(data, symbol),
      onStateChange: (state) => this.notifyConnectionChange(state, url),
      onError: (error) => this.notifyError(`Binance WebSocket error for ${symbol}`, error)
    });
    
    this.log(`Setup Binance WebSocket for ${symbol} klines`);
  }

  private setupBackendWebSocket(config: SubscriptionConfig): void {
    const { symbol } = config;
    // Guard: symbol must be provided
    if (!symbol || !symbol.trim()) {
      this.log('Skipped backend WebSocket setup: empty symbol');
      return;
    }
    
    connectionManager.connect({
      url: this.backendWsUrl,
      reconnectInterval: 2000,
      maxReconnectAttempts: 5,
      debug: this.debug
    });

    // Subscribe to messages
    connectionManager.subscribe(this.backendWsUrl, {
      id: `backend-${symbol}`,
      onMessage: (data) => this.handleBackendMessage(data, symbol),
      onStateChange: (state) => {
        this.notifyConnectionChange(state, this.backendWsUrl);
        
        // Send subscription message when connected
        if (state === ConnectionState.CONNECTED) {
          // Backend expects shape: { type: 'subscribe', symbol: 'BTCUSDT' }
          connectionManager.send(this.backendWsUrl, {
            type: 'subscribe',
            symbol
          });
        }
      },
      onError: (error) => this.notifyError(`Backend WebSocket error for ${symbol}`, error)
    });
    // If already connected, send subscribe immediately (subscribe() only notifies state; double-safety)
    const st = connectionManager.getState(this.backendWsUrl);
    if (st === ConnectionState.CONNECTED) {
      connectionManager.send(this.backendWsUrl, { type: 'subscribe', symbol });
    }
    
    this.log(`Setup backend WebSocket for ${symbol}`);
  }

  private handleBinanceMessage(data: any, symbol: string): void {
    try {
      if (data.e === 'kline') {
        const klineData = this.normalizeBinanceKline(data, symbol);
        this.notifySubscribers({ type: 'kline', data: klineData });
      }
    } catch (error) {
      this.notifyError(`Error processing Binance message for ${symbol}`, error as Error);
    }
  }

  private handleBackendMessage(data: any, symbol: string): void {
    console.log(`[MarketDataService] handleBackendMessage:`, { data, symbol, subscribers: this.subscribers.size });
    try {
      const config = this.activeSubscriptions.get(symbol);
      if (!config) {
        console.log(`[MarketDataService] No config for symbol:`, symbol);
        return;
      }

      console.log(`[MarketDataService] Processing message type:`, data.type);
      switch (data.type) {
        case 'ticker':
          console.log(`[MarketDataService] Ticker event - includeTicker:`, config.includeTicker, 'symbol match:', data.symbol === symbol);
          if (config.includeTicker && data.symbol === symbol) {
            const tickerData = this.normalizeBackendTicker(data);
            console.log(`[MarketDataService] Normalized ticker:`, tickerData);
            this.notifySubscribers({ type: 'ticker', data: tickerData });
            console.log(`[MarketDataService] Notified ${this.subscribers.size} subscribers`);
          }
          break;
          
        case 'orderbook':
          console.log(`[MarketDataService] Orderbook event - includeOrderbook:`, config.includeOrderbook, 'symbol match:', data.symbol === symbol);
          if (config.includeOrderbook && data.symbol === symbol) {
            const orderbookData = this.normalizeBackendOrderbook(data);
            console.log(`[MarketDataService] Normalized orderbook:`, orderbookData);
            this.notifySubscribers({ type: 'orderbook', data: orderbookData });
            console.log(`[MarketDataService] Notified ${this.subscribers.size} subscribers`);
          }
          break;
      }
    } catch (error) {
      console.error(`[MarketDataService] Error processing backend message for ${symbol}:`, error);
      this.notifyError(`Error processing backend message for ${symbol}`, error as Error);
    }
  }

  private async loadInitialData(config: SubscriptionConfig): Promise<void> {
    const { symbol, includeTicker, includeOrderbook, includeKlines, klineInterval = '1m' } = config;
    
    try {
      // Load initial data in parallel
      const promises: Promise<any>[] = [];
      
      if (includeTicker) {
        promises.push(this.getTicker(symbol));
      }
      
      if (includeOrderbook) {
        promises.push(this.getOrderBook(symbol));
      }
      
      if (includeKlines) {
        promises.push(this.getKlines(symbol, klineInterval, 100));
      }
      
      await Promise.allSettled(promises);
      this.log(`Initial data loaded for ${symbol}`);
    } catch (error) {
      this.notifyError(`Failed to load initial data for ${symbol}`, error as Error);
    }
  }

  private cleanupSubscription(symbol: string): void {
    // Remove WebSocket subscriptions
    const connectionId = this.wsConnections.get(symbol);
    if (connectionId) {
      connectionManager.unsubscribe(connectionId, `binance-${symbol}`);
      connectionManager.unsubscribe(this.backendWsUrl, `backend-${symbol}`);
      this.wsConnections.delete(symbol);
    }
    // Proactively inform backend to stop streaming this symbol
    try {
      connectionManager.send(this.backendWsUrl, { type: 'unsubscribe', symbol });
    } catch (_) {
      // ignore if connection not ready
    }
    
    this.activeSubscriptions.delete(symbol);
    this.log(`Cleaned up subscription for ${symbol}`);
  }

  // REST API calls
  private validateSymbol(symbol: string, context: string): void {
    if (!symbol || typeof symbol !== 'string' || symbol.trim() === '') {
      throw new Error(`Invalid symbol '${symbol}' in ${context}. Symbol must be a non-empty string.`);
    }
  }

  private async fetchTicker(symbol: string): Promise<any> {
    this.validateSymbol(symbol, 'fetchTicker');
    const response = await fetch(`${this.binanceApiUrl}/ticker/24hr?symbol=${symbol}`);
    if (!response.ok) throw new Error(`Failed to fetch ticker: ${response.statusText}`);
    return response.json();
  }

  private async fetchOrderBook(symbol: string, limit: number): Promise<any> {
    this.validateSymbol(symbol, 'fetchOrderBook');
    const response = await fetch(`${this.binanceApiUrl}/depth?symbol=${symbol}&limit=${limit}`);
    if (!response.ok) throw new Error(`Failed to fetch orderbook: ${response.statusText}`);
    return response.json();
  }

  private async fetchKlines(symbol: string, interval: string, limit: number): Promise<any> {
    this.validateSymbol(symbol, 'fetchKlines');
    const response = await fetch(
      `${this.binanceApiUrl}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
    );
    if (!response.ok) throw new Error(`Failed to fetch klines: ${response.statusText}`);
    return response.json();
  }

  // Data normalization methods
  private normalizeTicker(data: any, symbol: string): TickerData {
    return {
      symbol,
      price: parseFloat(data.lastPrice || data.price || '0'),
      change: parseFloat(data.priceChange || data.change || '0'),
      changePercent: parseFloat(data.priceChangePercent || data.changePercent || '0'),
      volume: parseFloat(data.volume || '0'),
      high: parseFloat(data.highPrice || '0'),
      low: parseFloat(data.lowPrice || '0'),
      timestamp: Date.now()
    };
  }

  private normalizeOrderBook(data: any, symbol: string): OrderBookData {
    return {
      symbol,
      bids: (data.bids || []).map((bid: any) => [parseFloat(bid[0]), parseFloat(bid[1])]),
      asks: (data.asks || []).map((ask: any) => [parseFloat(ask[0]), parseFloat(ask[1])]),
      timestamp: Date.now()
    };
  }

  private normalizeKlines(data: any[], symbol: string, interval: string): KlineData[] {
    return data.map(kline => ({
      symbol,
      interval,
      openTime: kline[0],
      closeTime: kline[6],
      open: parseFloat(kline[1]),
      high: parseFloat(kline[2]),
      low: parseFloat(kline[3]),
      close: parseFloat(kline[4]),
      volume: parseFloat(kline[5]),
      timestamp: Date.now()
    }));
  }

  private normalizeBinanceKline(data: any, symbol: string): KlineData {
    const k = data.k;
    return {
      symbol,
      interval: k.i,
      openTime: k.t,
      closeTime: k.T,
      open: parseFloat(k.o),
      high: parseFloat(k.h),
      low: parseFloat(k.l),
      close: parseFloat(k.c),
      volume: parseFloat(k.v),
      timestamp: Date.now()
    };
  }

  private normalizeBackendTicker(data: any): TickerData {
    return {
      symbol: data.symbol,
      price: parseFloat(data.price || '0'),
      change: parseFloat(data.change || '0'),
      changePercent: parseFloat(data.changePercent?.replace('%', '') || '0'),
      volume: parseFloat(data.volume || '0'),
      high: parseFloat(data.high || '0'),
      low: parseFloat(data.low || '0'),
      timestamp: Date.now()
    };
  }

  private normalizeBackendOrderbook(data: any): OrderBookData {
    return {
      symbol: data.symbol,
      bids: (data.bids || []).map((bid: any) => [parseFloat(bid[0]), parseFloat(bid[1])]),
      asks: (data.asks || []).map((ask: any) => [parseFloat(ask[0]), parseFloat(ask[1])]),
      timestamp: Date.now()
    };
  }

  // Utility methods
  // getSymbolForSubscriber removed (replaced by subscriberSymbols map directly)

  private notifySubscribers(event: MarketDataEvent): void {
    console.log(`[MarketDataService] notifySubscribers:`, { type: event.type, subscriberCount: this.subscribers.size });
    for (const subscriber of this.subscribers.values()) {
      try {
        console.log(`[MarketDataService] Notifying subscriber:`, subscriber.id);
        subscriber.onEvent(event);
        console.log(`[MarketDataService] Successfully notified:`, subscriber.id);
      } catch (error) {
        console.error(`[MarketDataService] Error notifying subscriber ${subscriber.id}:`, error);
        this.log(`Error notifying subscriber ${subscriber.id}:`, error);
      }
    }
  }

  private notifyConnectionChange(state: ConnectionState, url: string): void {
    this.notifySubscribers({ 
      type: 'connection', 
      state, 
      url 
    });
  }

  private notifyError(context: string, error: Error): void {
    this.notifySubscribers({ 
      type: 'error', 
      error, 
      context 
    });
  }

  private log(message: string, ...args: any[]): void {
    if (this.debug) {
      console.log(`[MarketDataService] ${message}`, ...args);
    }
  }

  /**
   * Normalize backend WS base URL to always point to /ws/market
   */
  private normalizeBackendUrl(raw: string): string {
    if (!raw) return 'ws://localhost:8001/ws/market';
    let url = String(raw).trim();
    // Drop trailing spaces and duplicate slashes (but keep ws://)
    url = url.replace(/\s+/g, '');
    // Remove trailing slashes
    url = url.replace(/\/+$/g, '');
    // If already specific channel, return as-is
    if (/\/ws\/(market|bot|user)$/i.test(url)) {
      return url;
    }
    // If ends with /ws -> append /market
    if (/\/ws$/i.test(url)) {
      return `${url}/market`;
    }
    // If ends with /ws/ -> append market
    if (/\/ws$/i.test(url.replace(/\/+$/g, ''))) {
      return `${url}/market`;
    }
    // Otherwise, ensure /ws/market
    return `${url}/ws/market`;
  }
}

// Export singleton instance
export const marketDataService = MarketDataService.getInstance();
