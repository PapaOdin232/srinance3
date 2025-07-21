# Binance Spot API – Podstawowe endpointy i WebSockety

## 1. Pobieranie danych rynkowych
- **REST API:**
  - `/api/v3/ticker/price` – aktualne ceny
  - `/api/v3/depth` – orderbook
  - `/api/v3/klines` – świece
- **WebSocket:**
  - `wss://stream.binance.com:9443/ws/<symbol>@ticker` – ceny
  - `wss://stream.binance.com:9443/ws/<symbol>@depth` – orderbook
  - `wss://stream.binance.com:9443/ws/<symbol>@kline_<interval>` – świece

## 2. Pobieranie danych o koncie
- **REST API:**
  - `/api/v3/account` – saldo konta (wymaga autoryzacji)
  - `/api/v3/myTrades` – historia transakcji
  - `/api/v3/openOrders` – otwarte zlecenia
- **WebSocket:**
  - `wss://stream.binance.com:9443/ws/<listenKey>` – User Data Stream (po utworzeniu listenKey przez REST API)

## 3. Obsługa zleceń
- **REST API:**
  - `/api/v3/order` – składanie i anulowanie zleceń (wymaga autoryzacji)
  - `/api/v3/order/test` – testowe zlecenie
  - `/api/v3/openOrders`, `/api/v3/allOrders` – przeglądanie zleceń
- **WebSocket:**
  - User Data Stream (`wss://stream.binance.com:9443/ws/<listenKey>`) – powiadomienia o statusie zleceń

---
Szczegóły i przykłady znajdziesz w oficjalnej dokumentacji Binance Spot API.
