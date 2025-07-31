// Binance WebSocket Client for Kline/Candlestick streams
// Dedicated client for real-time candlestick data from Binance WebSocket API

export interface BinanceKlineData {
  e: string;      // Event type (always "kline")
  E: number;      // Event time (timestamp in milliseconds)
  s: string;      // Symbol (e.g., "BTCUSDT")
  k: {
    t: number;    // Kline start time (timestamp in milliseconds)
    T: number;    // Kline close time (timestamp in milliseconds)
    s: string;    // Symbol (e.g., "BTCUSDT")
    i: string;    // Interval (e.g., "1m")
    f: number;    // First trade ID
    L: number;    // Last trade ID
    o: string;    // Open price
    c: string;    // Close price
    h: string;    // High price
    l: string;    // Low price
    v: string;    // Base asset volume
    n: number;    // Number of trades
    x: boolean;   // Is this kline closed? (true when kline is finalized)
    q: string;    // Quote asset volume
    V: string;    // Taker buy base asset volume
    Q: string;    // Taker buy quote asset volume
  };
}

export type BinanceKlineListener = (data: BinanceKlineData) => void;

export class BinanceWSClient {
  private ws: WebSocket | null = null;
  private listeners: BinanceKlineListener[] = [];
  private symbol: string;
  private interval: string;
  private shouldReconnect = true;
  private reconnectTimeout: number | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private isDestroyed = false;

  constructor(symbol: string, interval: string = '1m') {
    this.symbol = symbol.toLowerCase();
    this.interval = interval;
    this.connect();
  }

  private connect() {
    if (this.isDestroyed) {
      console.log('[BinanceWSClient] Client is destroyed, skipping connect');
      return;
    }

    // Use environment variable for Binance WebSocket URL
    const baseUrl = import.meta.env.VITE_BINANCE_WS_URL || 'wss://stream.binance.com:9443/ws';
    const url = `${baseUrl}/${this.symbol}@kline_${this.interval}`;
    console.log(`[BinanceWSClient] Connecting to ${url}`);

    try {
      this.ws = new WebSocket(url);
      
      this.ws.onopen = () => {
        console.log(`[BinanceWSClient] Connected to ${url}`);
        this.reconnectAttempts = 0;
      };

      this.ws.onmessage = (event) => {
        try {
          const data: BinanceKlineData = JSON.parse(event.data);
          if (data.e === 'kline') {
            console.log(`[BinanceWSClient] Received kline for ${data.s}:`, data.k);
            this.notifyListeners(data);
          }
        } catch (error) {
          console.error('[BinanceWSClient] Failed to parse message:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('[BinanceWSClient] WebSocket error:', error);
        console.error('[BinanceWSClient] Connection URL:', url);
        console.error('[BinanceWSClient] WebSocket readyState:', this.ws?.readyState);
        
        // Additional error information
        if (this.ws?.readyState === WebSocket.CLOSING) {
          console.warn('[BinanceWSClient] WebSocket is closing');
        } else if (this.ws?.readyState === WebSocket.CLOSED) {
          console.warn('[BinanceWSClient] WebSocket is closed');
        }
      };

      this.ws.onclose = (event) => {
        console.log(`[BinanceWSClient] Connection closed: ${event.code} ${event.reason}`);
        this.ws = null;
        
        // Don't attempt reconnection if the close was due to an invalid endpoint (code 1006)
        if (event.code === 1006) {
          console.warn('[BinanceWSClient] Connection failed - possibly invalid endpoint or unsupported stream. Check if testnet supports kline streams.');
          console.warn('[BinanceWSClient] Consider setting VITE_ENABLE_BINANCE_STREAMS=false in development.');
          this.shouldReconnect = false;
          return;
        }
        
        if (this.shouldReconnect && !this.isDestroyed && this.reconnectAttempts < this.maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
          console.log(`[BinanceWSClient] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`);
          
          this.reconnectTimeout = window.setTimeout(() => {
            this.reconnectAttempts++;
            this.connect();
          }, delay);
        } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          console.error('[BinanceWSClient] Max reconnection attempts reached. Giving up.');
        }
      };

    } catch (error) {
      console.error('[BinanceWSClient] Failed to create WebSocket:', error);
    }
  }

  private notifyListeners(data: BinanceKlineData) {
    this.listeners.forEach(listener => {
      try {
        listener(data);
      } catch (error) {
        console.error('[BinanceWSClient] Error in listener:', error);
      }
    });
  }

  addListener(listener: BinanceKlineListener) {
    this.listeners.push(listener);
    console.log(`[BinanceWSClient] Added listener, total: ${this.listeners.length}`);
  }

  removeListener(listener: BinanceKlineListener) {
    const index = this.listeners.indexOf(listener);
    if (index !== -1) {
      this.listeners.splice(index, 1);
      console.log(`[BinanceWSClient] Removed listener, total: ${this.listeners.length}`);
    }
  }

  destroy() {
    console.log('[BinanceWSClient] Destroying client');
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

  // Change symbol (creates new connection)
  changeSymbol(newSymbol: string, newInterval?: string) {
    this.symbol = newSymbol.toLowerCase();
    if (newInterval) {
      this.interval = newInterval;
    }
    
    console.log(`[BinanceWSClient] Changing to ${this.symbol}@kline_${this.interval}`);
    
    // Close current connection and create new one
    if (this.ws) {
      this.ws.close();
    }
    
    this.reconnectAttempts = 0;
    this.connect();
  }
}

export default BinanceWSClient;
