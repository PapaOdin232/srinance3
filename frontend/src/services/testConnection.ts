// Umożliwia pobieranie zmiennych środowiskowych zarówno w Vite (import.meta.env), jak i w testach (process.env)
export function getEnvVar(key: string, fallback?: string): string {
  if (typeof process !== 'undefined' && process.env && key in process.env) {
    return process.env[key] ?? fallback ?? '';
  }
  return fallback ?? '';
}
import { getAccount, getTicker } from './restClient';
import { WSClient } from './wsClient';

export async function testRestConnection() {
  try {
    const account = await getAccount();
    const ticker = await getTicker('BTCUSDT');
    return { account, ticker };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export function testWsConnection(url: string, onMessage: (msg: any) => void) {
  const ws = new WSClient(url);
  ws.addListener(onMessage);
  // Zamknij po 5s
  setTimeout(() => ws.close(), 5000);
  return ws;
}
