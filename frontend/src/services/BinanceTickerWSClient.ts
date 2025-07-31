// Binance WebSocket Client for All Market Tickers (!ticker@arr)
// Provides real-time 24hr ticker statistics for all symbols

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

export class BinanceTickerWSClient {
  private ws: WebSocket | null = null;
  private listeners: BinanceTickerListener[] = [];
  private shouldReconnect = true;
  private reconnectTimeout: number | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private isDestroyed = false;
  private readonly url: string;

  constructor() {
    // Use environment variable for Binance WebSocket URL, with fallback
    const baseUrl = import.meta.env.VITE_BINANCE_WS_URL || 'wss://data-stream.binance.vision/ws';
    this.url = `${baseUrl}/!ticker@arr`;
    console.log(`[BinanceTickerWSClient] Will connect to ${this.url}`);
    this.connect();
  }

  private connect() {
    if (this.isDestroyed) {
      console.log('[BinanceTickerWSClient] Client is destroyed, skipping connect');
      return;
    }

    console.log(`[BinanceTickerWSClient] Connecting to ${this.url}`);

    try {
      this.ws = new WebSocket(this.url);
      
      this.ws.onopen = () => {
        console.log(`[BinanceTickerWSClient] Connected to all market tickers stream`);
        this.reconnectAttempts = 0;
      };

      this.ws.onmessage = (event) => {
        try {
          const tickers: BinanceTicker24hr[] = JSON.parse(event.data);
          
          // Validate that we received an array of tickers
          if (Array.isArray(tickers) && tickers.length > 0) {
            // Filter only USDT pairs to match our asset list
            const usdtTickers = tickers.filter(ticker => 
              ticker.s && ticker.s.endsWith('USDT') && ticker.e === '24hrTicker'
            );
            
            if (usdtTickers.length > 0) {
              console.log(`[BinanceTickerWSClient] Received ${usdtTickers.length} USDT ticker updates`);
              this.notifyListeners(usdtTickers);
            }
          }
        } catch (error) {
          console.error('[BinanceTickerWSClient] Failed to parse message:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('[BinanceTickerWSClient] WebSocket error:', error);
        console.error('[BinanceTickerWSClient] Connection URL:', this.url);
        console.error('[BinanceTickerWSClient] WebSocket readyState:', this.ws?.readyState);
      };

      this.ws.onclose = (event) => {
        console.log(`[BinanceTickerWSClient] Connection closed: ${event.code} ${event.reason}`);
        this.ws = null;
        
        // Don't attempt reconnection if the close was due to an invalid endpoint
        if (event.code === 1006) {
          console.warn('[BinanceTickerWSClient] Connection failed - possibly invalid endpoint. Check VITE_BINANCE_WS_URL configuration.');
          this.shouldReconnect = false;
          return;
        }
        
        if (this.shouldReconnect && !this.isDestroyed && this.reconnectAttempts < this.maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
          console.log(`[BinanceTickerWSClient] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`);
          
          this.reconnectTimeout = window.setTimeout(() => {
            this.reconnectAttempts++;
            this.connect();
          }, delay);
        } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          console.error('[BinanceTickerWSClient] Max reconnection attempts reached. Giving up.');
        }
      };

    } catch (error) {
      console.error('[BinanceTickerWSClient] Failed to create WebSocket:', error);
    }
  }

  private notifyListeners(tickers: BinanceTicker24hr[]) {
    this.listeners.forEach(listener => {
      try {
        listener(tickers);
      } catch (error) {
        console.error('[BinanceTickerWSClient] Error in listener:', error);
      }
    });
  }

  addListener(listener: BinanceTickerListener) {
    this.listeners.push(listener);
    console.log(`[BinanceTickerWSClient] Added listener, total: ${this.listeners.length}`);
  }

  removeListener(listener: BinanceTickerListener) {
    const index = this.listeners.indexOf(listener);
    if (index !== -1) {
      this.listeners.splice(index, 1);
      console.log(`[BinanceTickerWSClient] Removed listener, total: ${this.listeners.length}`);
    }
  }

  destroy() {
    console.log('[BinanceTickerWSClient] Destroying client');
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
