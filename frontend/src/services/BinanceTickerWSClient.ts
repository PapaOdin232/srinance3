// Optimized Binance WebSocket Client for Selected Tickers
// Provides real-time 24hr ticker statistics for specific symbols only
// Fixes performance issue: was downloading 570MB for all symbols, now only selected ones

export interface BinanceTicker24hr {
  e: string;      // Event type (always "24hrTicker")
  E: number;      // Event time (timestamp in milliseconds)
  s: string;      // Symbol (e.g., "BTCUSDT")
  p: string;      // Price change
  P: string;      // Price change percent
  w: string;      // Weighted average price
  x: string;      // First trade(F)-1 price
  c: string;      // Last price
  Q: string;      // Last quantity
  b: string;      // Best bid price
  B: string;      // Best bid quantity
  a: string;      // Best ask price
  A: string;      // Best ask quantity
  o: string;      // Open price
  h: string;      // High price
  l: string;      // Low price
  v: string;      // Total traded base asset volume
  q: string;      // Total traded quote asset volume
  O: number;      // Statistics open time
  C: number;      // Statistics close time
  F: number;      // First trade ID
  L: number;      // Last trade Id
  n: number;      // Total number of trades
}

export type BinanceTickerListener = (tickers: BinanceTicker24hr[]) => void;

import { createLogger } from './logger';

export class BinanceTickerWSClient {
  private ws: WebSocket | null = null;
  private listeners: BinanceTickerListener[] = [];
  private shouldReconnect = true;
  private reconnectTimeout: number | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private isDestroyed = false;
  private readonly baseUrl: string;
  private subscribedSymbols = new Set<string>();

  private logger = createLogger('binance:ticker');

  constructor() {
    // Use environment variable for Binance WebSocket URL, with fallback
  // Prefer env var in tests; Vite will inline in builds
  // @ts-ignore
  const fromEnv = (typeof process !== 'undefined' && (process as any).env?.VITE_BINANCE_WS_URL) as string | undefined;
  this.baseUrl = fromEnv || 'wss://data-stream.binance.vision/ws';
  this.logger.debug('init', { baseUrl: this.baseUrl });
    // Don't auto-connect, wait for subscriptions
  }

  // debug flag handled by central logger now

  // Subscribe to specific symbols for ticker updates
  subscribe(symbols: string[]) {
    symbols.forEach(symbol => {
      const symbolLower = symbol.toLowerCase();
      if (!this.subscribedSymbols.has(symbolLower)) {
        this.subscribedSymbols.add(symbolLower);
  this.logger.trace('subscribe', { symbol });
      }
    });
    
    if (this.subscribedSymbols.size > 0 && !this.ws) {
      this.connect();
    }
  }

  // Unsubscribe from specific symbols
  unsubscribe(symbols: string[]) {
    symbols.forEach(symbol => {
      const symbolLower = symbol.toLowerCase();
      this.subscribedSymbols.delete(symbolLower);
  this.logger.trace('unsubscribe', { symbol });
    });
    
    if (this.subscribedSymbols.size === 0 && this.ws) {
  this.logger.debug('no-subscriptions-close');
      this.ws.close();
    }
  }

  private buildStreamUrl(): string {
    if (this.subscribedSymbols.size === 0) {
      throw new Error('No symbols subscribed');
    }
    
    // Build streams for subscribed symbols: symbol@ticker
    const streams = Array.from(this.subscribedSymbols).map(symbol => `${symbol}@ticker`);
    const streamParam = streams.join('/');

    // Support both single-stream (/ws/<stream>) and combined streams (/stream?streams=...)
    // If only one stream and baseUrl ends with /ws, use single stream path for efficiency
    if (streams.length === 1 && this.baseUrl.endsWith('/ws')) {
      return `${this.baseUrl}/${streams[0]}`;
    }

    // Otherwise use combined stream format regardless of trailing segment in baseUrl
    // Normalize to data-stream root, preserving potential custom host in baseUrl
    const root = this.baseUrl.replace(/\/ws$/i, '').replace(/\/stream\??streams=?$/i, '');
    return `${root}/stream?streams=${encodeURIComponent(streamParam)}`;
  }

  private connect() {
    if (this.isDestroyed) {
  this.logger.debug('skip-connect-destroyed');
      return;
    }

    if (this.subscribedSymbols.size === 0) {
  this.logger.trace('skip-connect-empty');
      return;
    }

  const url = this.buildStreamUrl();
    this.logger.debug('connecting', { url });

    try {
      this.ws = new WebSocket(url);
      
      this.ws.onopen = () => {
        this.logger.debug('connected', { streams: this.subscribedSymbols.size });
        this.reconnectAttempts = 0;
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // Handle single ticker update (not array like before)
          if (data.e === '24hrTicker') {
            if (data.s && this.subscribedSymbols.has(String(data.s).toLowerCase())) {
              this.notifyListeners([data]); // Wrap in array for compatibility
            }
          } else if (Array.isArray(data)) {
            // Some endpoints may send arrays (safety)
            const filtered = (data as BinanceTicker24hr[]).filter(t => t.s && this.subscribedSymbols.has(String(t.s).toLowerCase()));
            if (filtered.length) this.notifyListeners(filtered);
          } else if (data && data.stream && data.data) {
            // Combined stream payload: { stream: 'btcusdt@ticker', data: {...} }
            const payload = data.data as BinanceTicker24hr;
            if (payload.e === '24hrTicker' && payload.s && this.subscribedSymbols.has(String(payload.s).toLowerCase())) {
              this.notifyListeners([payload]);
            }
          }
        } catch (error) {
          this.logger.warn('parse-failed', error);
        }
      };

      this.ws.onerror = (error) => {
  this.logger.error('ws-error', error);
  this.logger.debug('ws-error-meta', { url, state: this.ws?.readyState });
      };

      this.ws.onclose = (event) => {
  this.logger.warn('closed', { code: event.code, reason: event.reason });
        this.ws = null;
        
        // Don't attempt reconnection if the close was due to an invalid endpoint
        if (event.code === 1006) {
          this.logger.error('invalid-endpoint?');
          this.shouldReconnect = false;
          return;
        }
        
        if (this.shouldReconnect && !this.isDestroyed && this.reconnectAttempts < this.maxReconnectAttempts && this.subscribedSymbols.size > 0) {
          const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
          this.logger.debug('reconnect-schedule', { delay, attempt: this.reconnectAttempts + 1 });
          
          this.reconnectTimeout = window.setTimeout(() => {
            this.reconnectAttempts++;
            this.connect();
          }, delay);
        } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          this.logger.error('reconnect-max');
        }
      };

    } catch (error) {
      console.error('[BinanceTickerWSClient] Failed to create WebSocket:', error);
    }
  }

  // Replace current subscriptions with a new set and reconnect
  setSubscriptions(symbols: string[]) {
    const next = new Set(symbols.map(s => s.toLowerCase()));
    // If identical, do nothing
    if (
      next.size === this.subscribedSymbols.size &&
      Array.from(next).every(s => this.subscribedSymbols.has(s))
    ) {
      return;
    }

  this.logger.debug('set-subscriptions', { count: next.size });
    this.subscribedSymbols = next;

    // Reconnect with new streams
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.reconnectAttempts = 0;
    this.connect();
  }

  private notifyListeners(tickers: BinanceTicker24hr[]) {
    this.listeners.forEach(listener => {
      try {
        listener(tickers);
      } catch (error) {
  this.logger.error('listener-error', error);
      }
    });
  }

  addListener(listener: BinanceTickerListener) {
    this.listeners.push(listener);
  this.logger.trace('add-listener', { total: this.listeners.length });
  }

  removeListener(listener: BinanceTickerListener) {
    const index = this.listeners.indexOf(listener);
    if (index !== -1) {
      this.listeners.splice(index, 1);
  this.logger.trace('remove-listener', { total: this.listeners.length });
    }
  }

  destroy() {
  this.logger.info('destroy');
    this.isDestroyed = true;
    this.shouldReconnect = false;
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this.listeners = [];
  }

  // Get current connection state
  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

export default BinanceTickerWSClient;
