import type { AccountResponse, TickerResponse, HistoryResponse, OrderbookResponse, BotStatusResponse, BotLogsResponse } from './restClient';

export const mockAccount: AccountResponse = {
  makerCommission: 10,
  takerCommission: 10,
  buyerCommission: 0,
  sellerCommission: 0,
  commissionRates: {
    maker: '0.00100000',
    taker: '0.00100000',
    buyer: '0.00000000',
    seller: '0.00000000',
  },
  canTrade: true,
  canWithdraw: true,
  canDeposit: true,
  brokered: false,
  requireSelfTradePrevention: false,
  preventSor: false,
  updateTime: 1751456749287,
  accountType: 'SPOT',
  balances: [
    { asset: 'BTC', free: '0.5', locked: '0.0' },
    { asset: 'USDT', free: '1000', locked: '0.0' },
  ],
  permissions: ['SPOT'],
  uid: 123456789,
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
