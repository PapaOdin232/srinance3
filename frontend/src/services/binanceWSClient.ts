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
  private isConnecting = false;

  constructor(symbol: string, interval: string = '1m', _useTradeStream: boolean = false) {
    this.symbol = symbol.toLowerCase();
    this.interval = interval;
    this.connect();
  }

  private connect() {
    if (this.isDestroyed) {
      console.log('[BinanceWSClient] Client is destroyed, skipping connect');
      return;
    }
    if (this.isConnecting) {
      console.log('[BinanceWSClient] Already connecting, skipping');
      return;
    }

  // Use environment variable for Binance WebSocket URL (guarded for Jest)
  const env = (globalThis as any)?.import?.meta?.env || (typeof process !== 'undefined' ? (process as any).env : {});
  const baseUrl = env?.VITE_BINANCE_WS_URL || 'wss://data-stream.binance.vision/ws';
    const url = `${baseUrl}/${this.symbol}@kline_${this.interval}`;
    console.log(`[BinanceWSClient] Connecting to ${url}`);
    console.log(`[BinanceWSClient] Using ${baseUrl.includes('data-stream') ? 'data-stream.binance.vision (optimized for market data)' : 'stream.binance.com (full API)'}`);

    try {
      this.isConnecting = true;
      this.ws = new WebSocket(url);
      
      this.ws.onopen = () => {
        console.log(`[BinanceWSClient] Successfully connected to ${url}`);
        this.reconnectAttempts = 0;
        this.isConnecting = false;
      };

      this.ws.onmessage = (event) => {
        try {
          const data: BinanceKlineData = JSON.parse(event.data);
          if (data.e === 'kline') {
            // Validate kline data before passing to listeners
            if (data.k && typeof data.k.t === 'number' && typeof data.k.o === 'string') {
              this.notifyListeners(data);
            } else {
              console.warn('[BinanceWSClient] Invalid kline data format:', data);
            }
          }
        } catch (error) {
          console.error('[BinanceWSClient] Failed to parse message:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('[BinanceWSClient] WebSocket error:', error);
        console.error('[BinanceWSClient] Connection URL:', url);
        console.error('[BinanceWSClient] WebSocket readyState:', this.ws?.readyState || 'WebSocket null');
        console.error('[BinanceWSClient] Symbol/Interval:', `${this.symbol}@kline_${this.interval}`);
        
        // Additional error information
        if (this.ws) {
          if (this.ws.readyState === WebSocket.CLOSING) {
            console.warn('[BinanceWSClient] WebSocket is closing');
          } else if (this.ws.readyState === WebSocket.CLOSED) {
            console.warn('[BinanceWSClient] WebSocket is closed');
          } else if (this.ws.readyState === WebSocket.CONNECTING) {
            console.warn('[BinanceWSClient] WebSocket is still connecting');
          }
        } else {
          console.warn('[BinanceWSClient] WebSocket instance is null');
        }
      };

      this.ws.onclose = (event) => {
        console.log(`[BinanceWSClient] Connection closed: ${event.code} ${event.reason}`);
        this.ws = null;
        this.isConnecting = false;
        
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
      this.isConnecting = false;
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
    
    const closeWs = () => {
      if (this.ws) {
        console.log(`[BinanceWSClient] Closing WebSocket (readyState: ${this.ws.readyState})`);
        try {
          // Remove handlers to avoid firing after close
          this.ws.onopen = null as any;
          this.ws.onmessage = null as any;
          this.ws.onerror = null as any;
          this.ws.onclose = null as any;
        } catch {}
        try {
          this.ws.close(1000, 'Client destroyed');
        } catch (e) {
          console.warn('[BinanceWSClient] Error while closing ws:', e);
        }
        this.ws = null;
      }
    };

    if (this.isConnecting) {
      // Defer actual close to avoid race where ws is closed before open completes
      console.log('[BinanceWSClient] Deferring destroy until connection completes');
      setTimeout(() => closeWs(), 200);
    } else {
      closeWs();
    }
    
    this.listeners = [];
    console.log('[BinanceWSClient] Client destroyed successfully');
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
    
    // Force close current connection and wait for it to close
    const doChange = () => {
      if (this.ws) {
        console.log(`[BinanceWSClient] Force closing existing connection (readyState: ${this.ws.readyState})`);
        this.shouldReconnect = false; // Prevent reconnection during change
        try {
          this.ws.onopen = null as any;
          this.ws.onmessage = null as any;
          this.ws.onerror = null as any;
          this.ws.onclose = null as any;
        } catch {}
        try {
          this.ws.close(1000, 'Changing symbol/interval'); // Use proper close code
        } catch (e) {
          console.warn('[BinanceWSClient] Error while closing ws during change:', e);
        }
        this.ws = null;
      }

      // Clear any pending reconnection
      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = null;
      }

      this.reconnectAttempts = 0;
      this.shouldReconnect = true; // Re-enable reconnection
      this.isConnecting = false;

      // Delay to ensure previous connection is fully closed
      setTimeout(() => {
        if (!this.isDestroyed) {
          this.connect();
        }
      }, 200); // Increased delay for more reliable connection
    };

    if (this.isConnecting) {
      console.log('[BinanceWSClient] changeSymbol called while connecting; deferring change');
      setTimeout(doChange, 220);
    } else {
      doChange();
    }
    
    // Clear any pending reconnection
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    this.reconnectAttempts = 0;
    this.shouldReconnect = true; // Re-enable reconnection
    this.isConnecting = false;
    
    // Delay to ensure previous connection is fully closed
    setTimeout(() => {
      if (!this.isDestroyed) {
        this.connect();
      }
    }, 200); // Increased delay for more reliable connection
  }
}

export default BinanceWSClient;
