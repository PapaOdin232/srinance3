import type { AccountResponse, TickerResponse, HistoryResponse, OrderbookResponse, BotStatusResponse, BotLogsResponse } from './restClient';

export const mockAccount: AccountResponse = {
  balances: { BTC: '0.5', USDT: '1000' },
  permissions: ['SPOT'],
  limits: { limit1: 100 },
};

export const mockTicker: TickerResponse = {
  symbol: 'BTCUSDT',
  price: '50000',
};

export const mockHistory: HistoryResponse = {
  history: [
    { time: '2024-01-01', symbol: 'BTCUSDT', qty: '0.1', price: '40000', side: 'BUY' },
  ],
};

export const mockOrderbook: OrderbookResponse = {
  bids: [['49900', '0.5']],
  asks: [['50100', '0.3']],
};

export const mockBotStatus: BotStatusResponse = {
  status: 'stopped',
  running: false,
};

export const mockBotLogs: BotLogsResponse = {
  logs: ['Bot initialized'],
};
