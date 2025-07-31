// WebSocket configuration for Binance API connections
// Centralized configuration for all WebSocket endpoints

export const WEBSOCKET_CONFIG = {
  // Binance WebSocket endpoints
  BINANCE: {
    // Primary endpoint - optimized for market data only
    MARKET_DATA: import.meta.env.VITE_BINANCE_WS_URL || 'wss://data-stream.binance.vision/ws',
    
    // Alternative endpoint - full Binance WebSocket API
    FULL_API: 'wss://stream.binance.com:9443/ws',
    
    // Testnet endpoint
    TESTNET: 'wss://stream.testnet.binance.vision/ws',
  },

  // Backend WebSocket endpoints
  BACKEND: {
    MARKET: import.meta.env.VITE_WS_URL || 'ws://localhost:8001/ws',
    BOT: (import.meta.env.VITE_WS_URL || 'ws://localhost:8001/ws').replace('/ws', '/ws/bot'),
  },

  // Connection settings
  SETTINGS: {
    // Reconnection settings
    MAX_RECONNECT_ATTEMPTS: 5,
    RECONNECT_DELAY_BASE: 1000, // Base delay in ms
    RECONNECT_DELAY_MAX: 30000,  // Max delay in ms
    
    // Connection limits (as per Binance documentation)
    MAX_STREAMS_PER_CONNECTION: 1024,
    MAX_CONNECTIONS_PER_IP: 300, // per 5 minutes
    RATE_LIMIT_MESSAGES_PER_SECOND: 5,
    
    // Heartbeat settings
    PING_INTERVAL: 20000, // Binance sends ping every 20s
    PONG_TIMEOUT: 60000,  // Connection closed if no pong within 60s
  },

  // Stream names for easy reference
  STREAMS: {
    KLINE: (symbol: string, interval: string) => `${symbol.toLowerCase()}@kline_${interval}`,
    TICKER_24HR: '!ticker@arr',
    TICKER_SINGLE: (symbol: string) => `${symbol.toLowerCase()}@ticker`,
    DEPTH: (symbol: string, levels?: number) => levels ? 
      `${symbol.toLowerCase()}@depth${levels}` : 
      `${symbol.toLowerCase()}@depth`,
    TRADE: (symbol: string) => `${symbol.toLowerCase()}@trade`,
  },
} as const;

export default WEBSOCKET_CONFIG;
