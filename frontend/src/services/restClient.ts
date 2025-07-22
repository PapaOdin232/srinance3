
import axios from 'axios';

import { getEnvVar } from './testConnection';


const API_BASE_URL = getEnvVar('VITE_API_URL', 'http://localhost:8000');
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
}


// Typ odpowiedzi dla historii konta
export interface HistoryResponse {
  history: Array<unknown>; // Doprecyzuj typ po stronie backendu
}

export interface OrderbookResponse {
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
