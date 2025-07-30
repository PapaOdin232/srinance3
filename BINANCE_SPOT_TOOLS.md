# Binance Spot API – Narzędzia do Spot Tradingu

Poniżej znajduje się szczegółowe zestawienie dostępnych narzędzi do spot tradingu na Binance, na podstawie oficjalnej dokumentacji REST API oraz WebSocket API.

---

## 1. REST API – Narzędzia Tradingowe

### 📈 Dane Rynkowe (Market Data)
- **Order Book** – aktualne zlecenia kupna/sprzedaży
- **Recent Trades** – ostatnie transakcje
- **Historical Trades** – historia transakcji
- **Aggregate Trades** – zagregowane transakcje
- **Klines/Candlesticks** – świece cenowe (1s-1M)
- **UI Klines** – zoptymalizowane świece do wyświetlania
- **Current Average Price** – średnia cena
- **24hr Ticker Statistics** – statystyki 24h
- **Trading Day Ticker** – statystyki dnia handlowego
- **Rolling Window Statistics** – statystyki okna czasowego
- **Symbol Price Ticker** – aktualne ceny symboli
- **Symbol Order Book Ticker** – najlepsze oferty bid/ask

### 💼 Zarządzanie Zleceniami
- **Place New Order** – składanie nowych zleceń
- **Test New Order** – testowanie zleceń
- **Cancel Order** – anulowanie zleceń
- **Cancel and Replace Order** – anulowanie i zastąpienie
- **Order Amend Keep Priority** – modyfikacja z zachowaniem priorytetu
- **Cancel Open Orders** – anulowanie wszystkich otwartych zleceń

### 📋 Typy Zleceń
- **LIMIT** – zlecenie limitowe
- **LIMIT_MAKER** – zlecenie post-only
- **MARKET** – zlecenie rynkowe
- **STOP_LOSS** – stop loss
- **STOP_LOSS_LIMIT** – stop loss z limitem
- **TAKE_PROFIT** – take profit
- **TAKE_PROFIT_LIMIT** – take profit z limitem
- **Trailing Stop** – trailing stop

### 🔗 Zaawansowane Zlecenia (Order Lists)
- **OCO (One-Cancels-Other)** – jedno anuluje drugie
- **OTO (One-Triggers-Other)** – jedno uruchamia drugie
- **OTOCO (One-Triggers-OCO)** – jedno uruchamia OCO
- **SOR (Smart Order Routing)** – inteligentne trasowanie zleceń

### 👤 Zarządzanie Kontem
- **Account Information** – informacje o koncie
- **Query Order** – sprawdzanie statusu zlecenia
- **Current Open Orders** – aktualne otwarte zlecenia
- **Account Order History** – historia zleceń
- **Account Trade History** – historia transakcji
- **Account Allocations** – alokacje konta
- **Account Commission Rates** – stawki prowizji
- **Unfilled Order Count** – liczba nierealizowanych zleceń

---

## 2. WebSocket API – Real-time Trading

### 📊 Streaming Market Data
- **Real-time Order Placement** – składanie zleceń w czasie rzeczywistym
- **Order Management** – zarządzanie zleceniami przez WebSocket
- **Account Updates** – aktualizacje konta
- **User Data Stream** – strumień danych użytkownika

---

## 3. WebSocket Streams – Market Data

### 📈 Strumienie Cenowe
- **Aggregate Trade Streams** – `<symbol>@aggTrade`
- **Trade Streams** – `<symbol>@trade`
- **Kline/Candlestick Streams** – `<symbol>@kline_<interval>`
- **Mini Ticker Streams** – `<symbol>@miniTicker`
- **Full Ticker Streams** – `<symbol>@ticker`
- **Rolling Window Ticker** – `<symbol>@ticker_<window_size>`

### 📖 Order Book Streams
- **Partial Book Depth** – `<symbol>@depth<levels>`
- **Diff Depth Stream** – `<symbol>@depth`
- **Book Ticker** – `<symbol>@bookTicker`

### 📊 Statystyki Rynkowe
- **Average Price** – `<symbol>@avgPrice`
- **All Market Tickers** – `!ticker@arr`
- **All Market Mini Tickers** – `!miniTicker@arr`

---

## 4. Bezpieczeństwo i Autoryzacja

### 🔐 Metody Uwierzytelniania
- **HMAC SHA256** – podpis HMAC
- **RSA Keys** – klucze RSA
- **Ed25519 Keys** – klucze Ed25519

### ⚡ Rate Limiting
- **IP Limits** – limity na IP
- **Request Weight** – waga zapytań
- **Order Count Limits** – limity liczby zleceń

---

## 5. Dodatkowe Funkcje

### 🛡️ Self-Trade Prevention (STP)
- Zapobieganie transakcjom własnym
- Różne tryby STP

### 📦 Iceberg Orders
- Zlecenia ukryte (fragmentowane)

### ⏱️ Time in Force
- **GTC** – Good Till Canceled
- **IOC** – Immediate or Cancel
- **FOK** – Fill or Kill

### 🌍 Multi-timezone Support
- UTC timestamps
- Timezone offsets dla klines

---

## 6. Endpoints i Połączenia

### 🌐 REST API Endpoints
- `api.binance.com`
- `api-gcp.binance.com`
- `api1.binance.com` – `api4.binance.com`

### 🔌 WebSocket Endpoints
- `wss://stream.binance.com:9443`
- `wss://ws-api.binance.com:443`
- `wss://data-stream.binance.vision`
