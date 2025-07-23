// Importuj tylko wersję process.env
import { getAccount, getTicker } from './restClient';
import EnhancedWSClient from './wsClient';

export async function testRestConnection() {
  try {
    const account = await getAccount();
    const ticker = await getTicker('BTCUSDT');
    return { account, ticker };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export function testWsConnection(url: string, onMessage: (msg: unknown) => void) {
  const ws = new EnhancedWSClient(url);
  ws.addListener(onMessage);
  // Zamknij po 5s
  setTimeout(() => { ws.destroy(); }, 5000);
  return ws;
}
