// Prosty klient WebSocket z reconnect i obsługą błędów

export type WSMessage =
  | { type: 'ticker', symbol: string, price: string }
  | { type: 'orderbook', symbol: string, bids: [string, string][], asks: [string, string][] }
  | { type: 'log', message: string }
  | { type: string, [key: string]: unknown };

export type WSListener = (msg: WSMessage) => void;

export class WSClient {
  private url: string;
  private ws: WebSocket | null = null;
  private listeners: WSListener[] = [];
  private reconnectTimeout = 2000;
  private shouldReconnect = true;
  private onErrorCallback?: (err: string) => void;

  constructor(url: string, onErrorCallback?: (err: string) => void) {
    this.url = url;
    this.onErrorCallback = onErrorCallback;
    console.log(`[WSClient] Konstruktor: tworzę instancję dla url=${url}`);
    this.connect();
  }

  private connect() {
    this.ws = new WebSocket(this.url);
    this.ws.onopen = () => {
      console.log(`[WSClient] onopen: Połączono z WebSocket (${this.url})`);
      if (this.onErrorCallback) this.onErrorCallback("");
    };
    this.ws.onmessage = (event) => {
      console.log(`[WSClient] onmessage: Otrzymano wiadomość (${this.url})`, event.data);
      try {
        const data = JSON.parse(event.data);
        this.listeners.forEach((cb) => { cb(data); });
      } catch (e) {
        console.warn('[WSClient] Błąd parsowania wiadomości', e);
      }
    };
    this.ws.onerror = (event) => {
      console.error(`[WSClient] onerror: Błąd połączenia z WebSocketem (${this.url})`, event);
      if (this.onErrorCallback) this.onErrorCallback("Błąd połączenia z WebSocketem");
    };
    this.ws.onclose = () => {
      console.log(`[WSClient] onclose: Połączenie z WebSocketem zostało zamknięte (${this.url})`);
      if (this.onErrorCallback) this.onErrorCallback("Połączenie z WebSocketem zostało zamknięte");
      if (this.shouldReconnect) {
        setTimeout(() => this.connect(), this.reconnectTimeout);
      }
    };
  }

  public send(data: object) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  public addListener(cb: WSListener) {
    this.listeners.push(cb);
  }

  public removeListener(cb: WSListener) {
    this.listeners = this.listeners.filter((l) => l !== cb);
  }

  public close() {
    this.shouldReconnect = false;
    this.ws?.close();
  }
}

// Przykład użycia:
// const ws = new WSClient('ws://localhost:8000/ws/market');
// ws.addListener((msg) => { ... });
