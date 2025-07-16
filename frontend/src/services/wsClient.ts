// Prosty klient WebSocket z reconnect i obsługą błędów

export type WSMessage =
  | { type: 'ticker'; symbol: string; price: string }
  | { type: 'orderbook'; symbol: string; bids: [string, string][]; asks: [string, string][] }
  | { type: 'log'; message: string }
  | { type: string; [key: string]: any };

export type WSListener = (msg: WSMessage) => void;

export class WSClient {
  private url: string;
  private ws: WebSocket | null = null;
  private listeners: WSListener[] = [];
  private reconnectTimeout = 2000;
  private shouldReconnect = true;

  constructor(url: string) {
    this.url = url;
    this.connect();
  }

  private connect() {
    this.ws = new WebSocket(this.url);
    this.ws.onopen = () => {
      // Połączono
    };
    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.listeners.forEach((cb) => cb(data));
      } catch (e) {
        // Błąd parsowania
      }
    };
    this.ws.onerror = () => {
      // Obsługa błędów
    };
    this.ws.onclose = () => {
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
// const ws = new WSClient('ws://localhost:8000/ws');
// ws.addListener((msg) => { ... });
