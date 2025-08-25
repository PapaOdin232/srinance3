
import axios from 'axios';

import { getEnvVar } from './getEnvVar';


const API_BASE_URL = getEnvVar('VITE_API_URL', 'http://localhost:8001');
const AUTH_TOKEN = getEnvVar('VITE_AUTH_TOKEN', 'example_admin_token');

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${AUTH_TOKEN}`,
  },
});

// Typy odpowiedzi zgodne z backendem
export interface CommissionRates {
  maker: string;
  taker: string;
  buyer: string;
  seller: string;
}

export interface Balance {
  asset: string;
  free: string;
  locked: string;
}

export interface AccountResponse {
  makerCommission: number;
  takerCommission: number;
  buyerCommission: number;
  sellerCommission: number;
  commissionRates: CommissionRates;
  canTrade: boolean;
  canWithdraw: boolean;
  canDeposit: boolean;
  brokered: boolean;
  requireSelfTradePrevention: boolean;
  preventSor: boolean;
  updateTime: number;
  accountType: string;
  balances: Balance[];
  permissions: string[];
  uid: number;
  /** Niestandardowe pole backendu, nie występuje w oficjalnym API Binance */
  limits?: Record<string, number>;
}

export interface TickerResponse {
  symbol: string;
  price: string;
  change?: string;
  changePercent?: string;
}


// Typ odpowiedzi dla historii konta
export interface HistoryResponse {
  history: Array<unknown>; // Doprecyzuj typ po stronie backendu
}

export interface OrderbookResponse {
  symbol?: string;
  bids: Array<[string, string]>;
  asks: Array<[string, string]>;
}

export interface BotStatusResponse {
  status: string;
  running: boolean;
}

export interface BotLogsResponse {
  logs: string[];
}

// Order Management Types
export interface OrderResponse {
  symbol: string;
  orderId: number;
  orderListId: number;
  clientOrderId: string;
  price: string;
  origQty: string;
  executedQty: string;
  cummulativeQuoteQty: string;
  /** Średnia cena (dla MARKET może być wyliczana lub zwracana z backendu) */
  avgPrice?: string;
  status: string;
  timeInForce: string;
  type: string;
  side: string;
  stopPrice?: string;
  icebergQty?: string;
  time: number;
  updateTime: number;
  isWorking: boolean;
  workingTime?: number;
  origQuoteOrderQty: string;
  selfTradePreventionMode?: string;
}

export interface OpenOrdersResponse {
  orders: OrderResponse[];
}

// Order history: unify shape between different backends
export interface OrderHistoryResponse {
  orders: OrderResponse[];
  hasMore?: boolean;
  nextCursor?: number | null;
  source?: string;
  symbol?: string;
}

export interface OrderStatusResponse {
  order: OrderResponse;
}

// Przykładowe funkcje API
export async function getAccount() {
  try {
    const res = await api.get<AccountResponse>('/account');
    return res.data;
  } catch (err) {
    handleError(err);
  }
}


export async function getTicker(symbol: string) {
  try {
    const res = await api.get<TickerResponse>(`/ticker?symbol=${encodeURIComponent(symbol)}`);
    return res.data;
  } catch (err) {
    handleError(err);
  }
}


export async function getAccountHistory(symbol: string) {
  try {
    const res = await api.get<HistoryResponse>(`/account/history?symbol=${encodeURIComponent(symbol)}`);
    return res.data;
  } catch (err) {
    handleError(err);
  }
}

export async function getAccountBalance(asset: string) {
  try {
    const res = await api.get<{ balance: string }>(`/account/balance?asset=${encodeURIComponent(asset)}`);
    return res.data;
  } catch (err) {
    handleError(err);
  }
}

export async function getOrderbook(symbol: string) {
  try {
    const res = await api.get<OrderbookResponse>(`/orderbook?symbol=${symbol}`);
    return res.data;
  } catch (err) {
    handleError(err);
  }
}

// Order Management Functions
export async function getOpenOrders(symbol?: string) {
  try {
    const url = symbol ? `/orders/open?symbol=${encodeURIComponent(symbol)}` : '/orders/open';
    // Prosty cache w pamięci (TTL 4s) aby uniknąć spamowania gdy komponent się rerenderuje
    const cacheKey = `open:${symbol || 'ALL'}`;
    type CacheEntry = { time: number; data: OpenOrdersResponse };
    const g = (globalThis as any);
    g.__OPEN_ORDERS_CACHE = g.__OPEN_ORDERS_CACHE || new Map<string, CacheEntry>();
    const cache: Map<string, CacheEntry> = g.__OPEN_ORDERS_CACHE;
    const entry = cache.get(cacheKey);
    const now = Date.now();
    if (entry && now - entry.time < 4000) {
      return entry.data;
    }
    const res = await api.get<OpenOrdersResponse>(url);
    if (res.data) {
      cache.set(cacheKey, { time: now, data: res.data });
    }
    return res.data;
  } catch (err) {
    handleError(err);
  }
}

export async function getOrdersHistory(
  symbol: string,
  limit: number = 100,
  orderId?: number,
  startTime?: number,
  endTime?: number
) {
  try {
    const params = new URLSearchParams({
      symbol,
      limit: limit.toString(),
    });
    
    if (orderId) params.append('orderId', orderId.toString());
    if (startTime) params.append('startTime', startTime.toString());
    if (endTime) params.append('endTime', endTime.toString());

    const res = await api.get<any>(`/orders/history?${params}`);
    const raw = res.data || {};

    // Helper: normalize single order record
    const normalizeOrder = (o: any): OrderResponse => {
      // Ensure numeric timestamps in ms
      const toMs = (v: any): number => {
        if (v == null) return 0;
        let n = typeof v === 'string' ? parseInt(v, 10) : Number(v);
        if (!Number.isFinite(n)) return 0;
        if (n < 1e12) n = n * 1000; // seconds -> ms
        return n;
      };
      // Stringify numeric-like fields
      const toStr = (v: any, def: string = '0') => {
        if (v == null) return def;
        return String(v);
      };
      const executedQty = toStr(o.executedQty, '0');
      const cqq = toStr(o.cummulativeQuoteQty, '0');
      // avgPrice: prefer provided, else derive if possible
      const avg = o.avgPrice != null && o.avgPrice !== ''
        ? toStr(o.avgPrice)
        : (() => {
            const ex = parseFloat(executedQty);
            const cq = parseFloat(cqq);
            if (ex > 0 && Number.isFinite(cq)) return String(cq / ex);
            return '0';
          })();
      return {
        symbol: toStr(o.symbol, ''),
        orderId: Number(o.orderId ?? o.id ?? 0),
        orderListId: Number(o.orderListId ?? 0),
        clientOrderId: toStr(o.clientOrderId, ''),
        price: toStr(o.price, '0'),
        origQty: toStr(o.origQty, '0'),
        executedQty,
        cummulativeQuoteQty: cqq,
        avgPrice: avg,
        status: toStr(o.status, ''),
        timeInForce: toStr(o.timeInForce, ''),
        type: toStr(o.type, ''),
        side: toStr(o.side, ''),
        stopPrice: o.stopPrice != null ? toStr(o.stopPrice) : undefined,
        icebergQty: o.icebergQty != null ? toStr(o.icebergQty) : undefined,
        time: toMs(o.time),
        updateTime: toMs(o.updateTime ?? o.time),
        isWorking: Boolean(o.isWorking),
        workingTime: o.workingTime != null ? Number(o.workingTime) : undefined,
        origQuoteOrderQty: toStr(o.origQuoteOrderQty, '0'),
        selfTradePreventionMode: o.selfTradePreventionMode,
      };
    };

    // Normalize various response shapes to a single interface
    const rawOrders = raw.orders || raw.items || [];
    const orders: OrderResponse[] = Array.isArray(rawOrders) ? rawOrders.map(normalizeOrder) : [];
    const hasMore: boolean | undefined =
      typeof raw.hasMore === 'boolean' ? raw.hasMore : (Array.isArray(orders) ? orders.length >= limit : undefined);
    const nextCursor: number | null | undefined =
      raw.nextCursor !== undefined ? raw.nextCursor : (Array.isArray(orders) && orders.length > 0 ? orders[orders.length - 1].orderId : null);
    const normalized: OrderHistoryResponse = {
      orders,
      hasMore,
      nextCursor,
      source: raw.source,
      symbol: raw.symbol,
    };
    return normalized;
  } catch (err) {
    handleError(err);
  }
}

export async function getOrderStatus(orderId: number, symbol: string, origClientOrderId?: string) {
  try {
    const params = new URLSearchParams({
      symbol,
    });
    
    if (origClientOrderId) {
      params.append('origClientOrderId', origClientOrderId);
    }

    const res = await api.get<OrderStatusResponse>(`/orders/${orderId}?${params}`);
    return res.data;
  } catch (err) {
    handleError(err);
  }
}

// Alias for compatibility with MarketPanel.tsx
export const getOrderBook = getOrderbook;

// Alias for compatibility with MarketPanel.tsx
export const getCurrentTicker = getTicker;

// Exchange info and 24hr ticker endpoints
export async function getExchangeInfo() {
  try {
    const res = await api.get('/exchangeInfo');
    return res.data;
  } catch (err) {
    handleError(err);
  }
}

export async function get24hrTicker() {
  try {
    const res = await api.get('/24hr');
    return res.data;
  } catch (err) {
    handleError(err);
  }
}

// Klines response type (Binance returns arrays of values)
export type KlineResponse = [
  number,  // Open time
  string,  // Open price
  string,  // High price
  string,  // Low price
  string,  // Close price
  string,  // Volume
  number,  // Close time
  string,  // Quote asset volume
  number,  // Number of trades
  string,  // Taker buy base asset volume
  string   // Taker buy quote asset volume
];

// Get Klines (candlestick data)
export async function getKlines(symbol: string, interval: string = '1m', limit: number = 100) {
  try {
    const res = await api.get<KlineResponse[]>(`/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=${limit}`);
    return res.data;
  } catch (err) {
    handleError(err);
  }
}

export async function getBotStatus() {
  try {
    const res = await api.get<BotStatusResponse>('/bot/status');
    return res.data;
  } catch (err) {
    handleError(err);
  }
}

export async function getBotLogs() {
  try {
    const res = await api.get<BotLogsResponse>('/bot/logs');
    return res.data;
  } catch (err) {
    handleError(err);
  }
}

// ===== ORDER MANAGEMENT FUNCTIONS =====

export interface PlaceOrderRequest {
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT' | 'STOP_LOSS' | 'STOP_LOSS_LIMIT' | 'TAKE_PROFIT' | 'TAKE_PROFIT_LIMIT';
  quantity: string;
  price?: string;
  timeInForce?: 'GTC' | 'IOC' | 'FOK';
}

export interface PlaceOrderResponse {
  success: boolean;
  order?: any;
  error?: string;
}

export interface TestOrderResponse {
  success: boolean;
  message?: string;
  test_result?: any;
  error?: string;
}

export interface CancelOrderResponse {
  success: boolean;
  cancelled_order?: any;
  error?: string;
}

export async function placeOrder(orderData: PlaceOrderRequest) {
  try {
    const res = await api.post<PlaceOrderResponse>('/orders', orderData);
    return res.data;
  } catch (err) {
    handleError(err);
  }
}

export async function testOrder(orderData: PlaceOrderRequest) {
  try {
    const res = await api.post<TestOrderResponse>('/orders/test', orderData);
    return res.data;
  } catch (err) {
    handleError(err);
  }
}

export async function cancelOrder(orderId: number, symbol: string, origClientOrderId?: string) {
  try {
    const params = new URLSearchParams({ symbol });
    if (origClientOrderId) {
      params.append('origClientOrderId', origClientOrderId);
    }
    
    const res = await api.delete<CancelOrderResponse>(`/orders/${orderId}?${params}`);
    return res.data;
  } catch (err) {
    handleError(err);
  }
}

// Metrics API removed

function handleError(error: unknown): never {
  // Obsługa błędów Axios
  if (typeof error === 'object' && error !== null && 'isAxiosError' in error && (error as { isAxiosError?: boolean }).isAxiosError) {
    const err = error as any;
    // Loguj szczegóły do konsoli
    console.error('API error:', err);
    // Wyświetl szczegóły użytkownikowi
    throw new Error(err.response?.data?.detail || err.message || 'Błąd API');
  }
  // Obsługa zwykłych błędów JS
  if (error instanceof Error) {
    throw error;
  }
  console.error('Unknown error:', error);
  throw new Error('Unknown error');
}
