// Enhanced WebSocket Client z exponential backoff, connection states i heartbeat

export const ConnectionState = {
  DISCONNECTED: 'DISCONNECTED',
  CONNECTING: 'CONNECTING', 
  CONNECTED: 'CONNECTED',
  RECONNECTING: 'RECONNECTING',
  ERROR: 'ERROR',
  CLOSING: 'CLOSING'
} as const;

export type ConnectionState = typeof ConnectionState[keyof typeof ConnectionState];

export type WSMessage =
  | { type: 'ticker', symbol: string, price: string, change?: string, changePercent?: string }
  | { type: 'orderbook', symbol: string, bids: [string, string][], asks: [string, string][] }
  | { type: 'log', message: string }
  | { type: 'bot_status', status: any, running: boolean }
  | { type: 'ping' }
  | { type: 'pong' }
  | { type: string, [key: string]: unknown };

export type WSListener = (msg: WSMessage) => void;
export type StateChangeListener = (state: ConnectionState, error?: string) => void;

export interface WSClientOptions {
  reconnectInterval?: number;
  maxReconnectInterval?: number;
  maxReconnectAttempts?: number;
  heartbeatInterval?: number;
  heartbeatTimeout?: number;
  debug?: boolean;
}

export class EnhancedWSClient {
  private url: string;
  private ws: WebSocket | null = null;
  private listeners: WSListener[] = [];
  private stateListeners: StateChangeListener[] = [];
  
  // Connection state
  private state: ConnectionState = ConnectionState.DISCONNECTED;
  private shouldReconnect = true;
  private reconnectAttempts = 0;
  private reconnectTimeout: number | null = null;
  
  // Options with defaults
  private options: Required<WSClientOptions>;
  
  // Heartbeat
  private heartbeatInterval: number | null = null;
  private heartbeatTimeout: number | null = null;
  private lastPongTime = Date.now();
  
  // Debouncing for React Strict Mode
  private connectDebounceTimeout: number | null = null;
  private isDestroyed = false;

  constructor(url: string, options: WSClientOptions = {}) {
    this.url = url;
    this.options = {
      reconnectInterval: 2000,
      maxReconnectInterval: 30000,
      maxReconnectAttempts: 10,
      heartbeatInterval: 30000,
      heartbeatTimeout: 5000,
      debug: true,
      ...options
    };
    
    this.log(`[WSClient] Creating instance for ${url}`);
    this.debouncedConnect();
  }

  private log(message: string, ...args: any[]) {
    if (this.options.debug) {
      console.log(message, ...args);
    }
  }

  private warn(message: string, ...args: any[]) {
    if (this.options.debug) {
      console.warn(message, ...args);
    }
  }

  private error(message: string, ...args: any[]) {
    console.error(message, ...args);
  }

  private setState(newState: ConnectionState, error?: string) {
    if (this.state !== newState) {
      this.log(`[WSClient] State change: ${this.state} -> ${newState}${error ? ` (${error})` : ''}`);
      this.state = newState;
      this.notifyStateListeners(newState, error);
    }
  }

  private notifyStateListeners(state: ConnectionState, error?: string) {
    this.stateListeners.forEach(listener => {
      try {
        listener(state, error);
      } catch (e) {
        this.error('[WSClient] Error in state listener:', e);
      }
    });
  }

  private debouncedConnect() {
    if (this.connectDebounceTimeout) {
      clearTimeout(this.connectDebounceTimeout);
    }
    
    this.connectDebounceTimeout = window.setTimeout(() => {
      if (!this.isDestroyed) {
        this.connect();
      }
    }, 100);
  }

  private connect() {
    if (this.isDestroyed) return;
    
    if (this.state === ConnectionState.CONNECTING || this.state === ConnectionState.CONNECTED) {
      this.log('[WSClient] Already connecting/connected, skipping');
      return;
    }

    if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
      this.setState(ConnectionState.ERROR, `Max reconnect attempts (${this.options.maxReconnectAttempts}) reached`);
      return;
    }

    this.setState(this.reconnectAttempts > 0 ? ConnectionState.RECONNECTING : ConnectionState.CONNECTING);
    
    try {
      this.ws = new WebSocket(this.url);
      
      this.ws.onopen = () => {
        if (this.isDestroyed) return;
        
        this.log(`[WSClient] Connected to ${this.url}`);
        this.reconnectAttempts = 0;
        this.lastPongTime = Date.now();
        this.setState(ConnectionState.CONNECTED);
        this.startHeartbeat();
      };

      this.ws.onmessage = (event) => {
        if (this.isDestroyed) return;
        
        try {
          const data = JSON.parse(event.data);
          
          // Handle heartbeat
          if (data.type === 'pong') {
            this.lastPongTime = Date.now();
            this.log('[WSClient] Received pong');
            return;
          }
          
          if (data.type === 'ping') {
            this.send({ type: 'pong' });
            return;
          }

          this.log(`[WSClient] Received message:`, data);
          this.notifyListeners(data);
        } catch (e) {
          this.warn('[WSClient] Failed to parse message:', event.data, e);
        }
      };

      this.ws.onerror = (event) => {
        if (this.isDestroyed) return;
        
        this.error(`[WSClient] WebSocket error:`, event);
        this.setState(ConnectionState.ERROR, 'WebSocket connection error');
      };

      this.ws.onclose = (event) => {
        if (this.isDestroyed) return;
        
        this.log(`[WSClient] Connection closed. Code: ${event.code}, Reason: ${event.reason}`);
        this.stopHeartbeat();
        
        if (event.code === 1000) {
          // Normal closure
          this.setState(ConnectionState.DISCONNECTED);
        } else {
          this.setState(ConnectionState.ERROR, `Connection closed unexpectedly (${event.code})`);
          this.scheduleReconnect();
        }
      };
      
    } catch (e) {
      this.error('[WSClient] Failed to create WebSocket:', e);
      this.setState(ConnectionState.ERROR, 'Failed to create WebSocket connection');
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (!this.shouldReconnect || this.isDestroyed) return;
    
    const delay = Math.min(
      this.options.reconnectInterval * Math.pow(2, this.reconnectAttempts),
      this.options.maxReconnectInterval
    );
    
    this.log(`[WSClient] Scheduling reconnect in ${delay}ms (attempt ${this.reconnectAttempts + 1})`);
    
    this.reconnectTimeout = window.setTimeout(() => {
      if (!this.isDestroyed) {
        this.reconnectAttempts++;
        this.connect();
      }
    }, delay);
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    
    this.heartbeatInterval = window.setInterval(() => {
      if (this.isDestroyed) return;
      
      const timeSinceLastPong = Date.now() - this.lastPongTime;
      
      if (timeSinceLastPong > this.options.heartbeatTimeout + this.options.heartbeatInterval) {
        this.warn('[WSClient] Heartbeat timeout, closing connection');
        this.ws?.close();
        return;
      }
      
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.send({ type: 'ping' });
        this.log('[WSClient] Sent ping');
      }
    }, this.options.heartbeatInterval);
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
      this.heartbeatTimeout = null;
    }
  }

  private notifyListeners(data: WSMessage) {
    this.listeners.forEach(listener => {
      try {
        listener(data);
      } catch (e) {
        this.error('[WSClient] Error in message listener:', e);
      }
    });
  }

  // Public API
  public getState(): ConnectionState {
    return this.state;
  }

  public isConnected(): boolean {
    return this.state === ConnectionState.CONNECTED;
  }

  public send(data: object): boolean {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
      return true;
    }
    
    this.warn('[WSClient] Cannot send, WebSocket not open:', this.state);
    return false;
  }

  public addListener(listener: WSListener) {
    this.listeners.push(listener);
  }

  public removeListener(listener: WSListener) {
    this.listeners = this.listeners.filter(l => l !== listener);
  }

  public addStateListener(listener: StateChangeListener) {
    this.stateListeners.push(listener);
  }

  public removeStateListener(listener: StateChangeListener) {
    this.stateListeners = this.stateListeners.filter(l => l !== listener);
  }

  public reconnect() {
    this.log('[WSClient] Manual reconnect requested');
    this.reconnectAttempts = 0;
    this.close();
    setTimeout(() => this.connect(), 100);
  }

  public close() {
    this.log('[WSClient] Closing connection');
    this.shouldReconnect = false;
    this.setState(ConnectionState.CLOSING);
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    if (this.connectDebounceTimeout) {
      clearTimeout(this.connectDebounceTimeout);
      this.connectDebounceTimeout = null;
    }
    
    this.stopHeartbeat();
    this.ws?.close(1000, 'Client requested close');
    this.ws = null;
    this.setState(ConnectionState.DISCONNECTED);
  }

  public destroy() {
    this.log('[WSClient] Destroying instance');
    this.isDestroyed = true;
    this.close();
    this.listeners = [];
    this.stateListeners = [];
  }
}

// Utility function for connection state display
export function getConnectionStateDisplay(state: ConnectionState): { text: string; color: string; icon: string } {
  switch (state) {
    case ConnectionState.CONNECTED:
      return { text: 'Połączony', color: '#10B981', icon: '🟢' };
    case ConnectionState.CONNECTING:
      return { text: 'Łączenie...', color: '#F59E0B', icon: '🟡' };
    case ConnectionState.RECONNECTING:
      return { text: 'Ponowne łączenie...', color: '#F59E0B', icon: '🔄' };
    case ConnectionState.DISCONNECTED:
      return { text: 'Rozłączony', color: '#6B7280', icon: '⚫' };
    case ConnectionState.ERROR:
      return { text: 'Błąd połączenia', color: '#EF4444', icon: '🔴' };
    case ConnectionState.CLOSING:
      return { text: 'Zamykanie...', color: '#6B7280', icon: '⏹️' };
    default:
      return { text: 'Nieznany', color: '#6B7280', icon: '❓' };
  }
}

export default EnhancedWSClient;