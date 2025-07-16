
import axios from 'axios';

import { getEnvVar } from './testConnection';

const API_BASE_URL = getEnvVar('VITE_API_URL', 'http://localhost:8000');

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Typy odpowiedzi zgodne z backendem
export interface AccountResponse {
  balances: Record<string, string>;
  permissions: string[];
  limits: Record<string, number>;
}

export interface TickerResponse {
  symbol: string;
  price: string;
}

export interface HistoryResponse {
  history: Array<any>; // doprecyzuj typ po stronie backendu
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
    const res = await api.post<TickerResponse>('/ticker', { symbol });
    return res.data;
  } catch (err) {
    handleError(err);
  }
}

export async function getHistory() {
  try {
    const res = await api.get<HistoryResponse>('/history');
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
  if (typeof error === 'object' && error !== null && 'isAxiosError' in error && (error as any).isAxiosError) {
    const err = error as any;
    throw new Error(err.response?.data?.detail || err.message);
  }
  throw new Error('Unknown error');
}
