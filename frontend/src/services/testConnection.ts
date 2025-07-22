// Importuj tylko wersję process.env
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

export function testWsConnection(url: string, onMessage: (msg: unknown) => void) {
  const ws = new WSClient(url);
  ws.addListener(onMessage);
  // Zamknij po 5s
  setTimeout(() => { ws.close(); }, 5000);
  return ws;
}
