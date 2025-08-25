/**
 * WebSocket Connection Manager - Singleton Pattern
 * 
 * Centralizes WebSocket connection management following Binance best practices:
 * - Single connection per URL
 * - Smart reconnection strategy 
 * - Observer pattern for subscribers
 * - Connection pooling and resource management
 * 
 * Based on: https://academy.binance.com/en/articles/how-to-use-binance-websocket-api
 */

export interface ConnectionConfig {
  url: string;
  reconnectInterval?: number;
  maxReconnectInterval?: number;
  maxReconnectAttempts?: number;
  heartbeatInterval?: number;
  debug?: boolean;
}

export interface Subscriber {
  id: string;
  onMessage: (data: any) => void;
  onStateChange?: (state: ConnectionState) => void;
  onError?: (error: Error) => void;
}

export const ConnectionState = {
  CONNECTING: 'CONNECTING',
  CONNECTED: 'CONNECTED',
  DISCONNECTED: 'DISCONNECTED',
  RECONNECTING: 'RECONNECTING',
  ERROR: 'ERROR'
} as const;

export type ConnectionState = typeof ConnectionState[keyof typeof ConnectionState];

interface ConnectionInfo {
  websocket: WebSocket;
  state: ConnectionState;
  subscribers: Map<string, Subscriber>;
  config: ConnectionConfig;
  reconnectAttempts: number;
  lastReconnectTime: number;
  heartbeatTimer?: number;
  reconnectTimer?: number;
}

class WebSocketConnectionManager {
  private static instance: WebSocketConnectionManager;
  private connections: Map<string, ConnectionInfo> = new Map();
  private debug = false;

  private constructor() {
    // Singleton pattern - private constructor
    this.debug = import.meta.env.VITE_DEBUG_WS === 'true';
  }

  public static getInstance(): WebSocketConnectionManager {
    if (!WebSocketConnectionManager.instance) {
      WebSocketConnectionManager.instance = new WebSocketConnectionManager();
    }
    return WebSocketConnectionManager.instance;
  }

  /**
   * Get or create WebSocket connection for given URL
   */
  public connect(config: ConnectionConfig): string {
    const { url } = config;
    
    if (this.connections.has(url)) {
      this.log(`Reusing existing connection for ${url}`);
      return url;
    }

    this.log(`Creating new connection for ${url}`);
    
    const connectionInfo: ConnectionInfo = {
      websocket: new WebSocket(url),
      state: ConnectionState.CONNECTING,
      subscribers: new Map(),
      config: {
        reconnectInterval: 2000,
        maxReconnectInterval: 30000,
        maxReconnectAttempts: 5,
        heartbeatInterval: 30000,
        debug: false,
        ...config
      },
      reconnectAttempts: 0,
      lastReconnectTime: 0
    };

    this.setupWebSocketHandlers(url, connectionInfo);
    this.connections.set(url, connectionInfo);
    
    return url;
  }

  /**
   * Subscribe to WebSocket messages
   */
  public subscribe(url: string, subscriber: Subscriber): void {
    const connection = this.connections.get(url);
    if (!connection) {
      throw new Error(`No connection found for URL: ${url}`);
    }

    connection.subscribers.set(subscriber.id, subscriber);
    this.log(`Subscriber ${subscriber.id} added to ${url}. Total: ${connection.subscribers.size}`);

    // Immediately notify about current state
    if (subscriber.onStateChange) {
      subscriber.onStateChange(connection.state);
    }
  }

  /**
   * Unsubscribe from WebSocket messages
   */
  public unsubscribe(url: string, subscriberId: string): void {
    const connection = this.connections.get(url);
    if (!connection) {
      return;
    }

    connection.subscribers.delete(subscriberId);
    this.log(`Subscriber ${subscriberId} removed from ${url}. Remaining: ${connection.subscribers.size}`);

    // If no more subscribers, close connection after delay
    if (connection.subscribers.size === 0) {
      this.log(`No more subscribers for ${url}, scheduling connection cleanup`);
      setTimeout(() => {
        this.closeConnection(url);
      }, 5000); // 5 second grace period
    }
  }

  /**
   * Send message through WebSocket
   */
  public send(url: string, message: any): void {
    const connection = this.connections.get(url);
    if (!connection || connection.state !== ConnectionState.CONNECTED) {
      this.log(`Cannot send message - connection not ready for ${url}`);
      return;
    }

    const messageStr = typeof message === 'string' ? message : JSON.stringify(message);
    connection.websocket.send(messageStr);
    this.log(`Message sent to ${url}:`, message);
  }

  /**
   * Get connection state
   */
  public getState(url: string): ConnectionState | null {
    const connection = this.connections.get(url);
    return connection ? connection.state : null;
  }

  /**
   * Force reconnection
   */
  public reconnect(url: string): void {
    const connection = this.connections.get(url);
    if (!connection) {
      return;
    }

    this.log(`Manual reconnection requested for ${url}`);
    this.closeWebSocket(connection);
    this.attemptReconnect(url, connection);
  }

  /**
   * Close specific connection
   */
  public closeConnection(url: string): void {
    const connection = this.connections.get(url);
    if (!connection) {
      return;
    }

    this.log(`Closing connection for ${url}`);
    this.closeWebSocket(connection);
    this.connections.delete(url);
  }

  /**
   * Close all connections - cleanup
   */
  public closeAllConnections(): void {
    this.log('Closing all WebSocket connections');
    for (const connection of this.connections.values()) {
      this.closeWebSocket(connection);
    }
    this.connections.clear();
  }

  private setupWebSocketHandlers(url: string, connection: ConnectionInfo): void {
    const { websocket } = connection;

    websocket.onopen = () => {
      this.log(`WebSocket connected: ${url}`);
      connection.state = ConnectionState.CONNECTED;
      connection.reconnectAttempts = 0;
      
      this.notifyStateChange(connection);
      this.startHeartbeat(connection);
    };

    websocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.notifyMessage(connection, data);
      } catch (error) {
        this.log(`Failed to parse message from ${url}:`, error);
        // Still notify subscribers with raw data
        this.notifyMessage(connection, event.data);
      }
    };

    websocket.onclose = (event) => {
      this.log(`WebSocket closed: ${url}, code: ${event.code}, reason: ${event.reason}`);
      connection.state = ConnectionState.DISCONNECTED;
      
      this.stopHeartbeat(connection);
      this.notifyStateChange(connection);
      
      // Attempt reconnection if there are still subscribers
      if (connection.subscribers.size > 0 && connection.reconnectAttempts < connection.config.maxReconnectAttempts!) {
        this.scheduleReconnect(url, connection);
      }
    };

    websocket.onerror = (error) => {
      this.log(`WebSocket error: ${url}`, error);
      connection.state = ConnectionState.ERROR;
      
      this.notifyStateChange(connection);
      this.notifyError(connection, new Error(`WebSocket error for ${url}`));
    };
  }

  private scheduleReconnect(url: string, connection: ConnectionInfo): void {
    const delay = Math.min(
      connection.config.reconnectInterval! * Math.pow(2, connection.reconnectAttempts),
      connection.config.maxReconnectInterval!
    );

    this.log(`Scheduling reconnection for ${url} in ${delay}ms (attempt ${connection.reconnectAttempts + 1})`);
    
    connection.reconnectTimer = window.setTimeout(() => {
      this.attemptReconnect(url, connection);
    }, delay);
  }

  private attemptReconnect(url: string, connection: ConnectionInfo): void {
    if (connection.subscribers.size === 0) {
      this.log(`No subscribers left for ${url}, cancelling reconnection`);
      return;
    }

    connection.reconnectAttempts++;
    connection.state = ConnectionState.RECONNECTING;
    this.notifyStateChange(connection);

    this.log(`Attempting reconnection for ${url} (${connection.reconnectAttempts}/${connection.config.maxReconnectAttempts})`);
    
    // Create new WebSocket instance
    connection.websocket = new WebSocket(url);
    this.setupWebSocketHandlers(url, connection);
  }

  private startHeartbeat(connection: ConnectionInfo): void {
    if (!connection.config.heartbeatInterval) {
      return;
    }

    this.stopHeartbeat(connection);
    
    connection.heartbeatTimer = window.setInterval(() => {
      if (connection.websocket.readyState === WebSocket.OPEN) {
        // Send ping - format may vary by WebSocket server
        connection.websocket.send(JSON.stringify({ type: 'ping' }));
      }
    }, connection.config.heartbeatInterval);
  }

  private stopHeartbeat(connection: ConnectionInfo): void {
    if (connection.heartbeatTimer) {
      clearInterval(connection.heartbeatTimer);
      connection.heartbeatTimer = undefined;
    }
  }

  private closeWebSocket(connection: ConnectionInfo): void {
    if (connection.reconnectTimer) {
      clearTimeout(connection.reconnectTimer);
      connection.reconnectTimer = undefined;
    }
    
    this.stopHeartbeat(connection);
    
    if (connection.websocket.readyState === WebSocket.OPEN || 
        connection.websocket.readyState === WebSocket.CONNECTING) {
      connection.websocket.close();
    }
  }

  private notifyMessage(connection: ConnectionInfo, data: any): void {
    for (const subscriber of connection.subscribers.values()) {
      try {
        subscriber.onMessage(data);
      } catch (error) {
        this.log(`Error in subscriber message handler:`, error);
      }
    }
  }

  private notifyStateChange(connection: ConnectionInfo): void {
    for (const subscriber of connection.subscribers.values()) {
      try {
        if (subscriber.onStateChange) {
          subscriber.onStateChange(connection.state);
        }
      } catch (error) {
        this.log(`Error in subscriber state change handler:`, error);
      }
    }
  }

  private notifyError(connection: ConnectionInfo, error: Error): void {
    for (const subscriber of connection.subscribers.values()) {
      try {
        if (subscriber.onError) {
          subscriber.onError(error);
        }
      } catch (error) {
        this.log(`Error in subscriber error handler:`, error);
      }
    }
  }

  private log(message: string, ...args: any[]): void {
    if (this.debug) {
      console.log(`[WebSocketManager] ${message}`, ...args);
    }
  }
}

// Export singleton instance
export const connectionManager = WebSocketConnectionManager.getInstance();

// Cleanup on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    connectionManager.closeAllConnections();
  });
}
