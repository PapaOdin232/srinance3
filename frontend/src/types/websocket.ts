// types/websocket.ts - Typy dla WebSocket messages
export interface WSLogMessage {
  type: 'log';
  message: string;
  timestamp?: string;
}

export interface WSBotStatusMessage {
  type: 'bot_status';
  status: string | { status: string; [key: string]: unknown };
  running: boolean;
}

export interface WSTickerMessage {
  type: 'ticker';
  symbol: string;
  price: string;
}

export interface WSOrderbookMessage {
  type: 'orderbook';
  symbol: string;
  bids: [string, string][];
  asks: [string, string][];
}

export interface WSGenericMessage {
  type: string;
  [key: string]: unknown;
}

export type WSMessage = WSLogMessage | WSBotStatusMessage | WSTickerMessage | WSOrderbookMessage | WSGenericMessage;

export interface BotStatus {
  running: boolean;
  status: string;
}

export interface BotLog {
  id?: number;
  message: string;
  timestamp: string;
  level?: 'info' | 'warning' | 'error';
}
