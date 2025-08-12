# Bot handlowy Binance (srinance3)

## Cel projektu
Zaawansowana aplikacja do automatyzacji handlu na giełdzie Binance z wykorzy### Endpointy API

### REST API (FastAPI)
- `GET /account` - pobiera dane konta Binance (saldo, uprawnienia)
- `POST /ticker` - pobiera aktualną cenę symbolu (np. BTCUSDT)
- `GET /orderbook/{symbol}` - pobiera orderbook dla symbolu
- `GET /metrics/basic` - podstawowe metryki systemu i diagnostyka
- `POST /bot/start` - uruchamia trading bota
- `POST /bot/stop` - zatrzymuje trading bota
- `GET /bot/status` - pobiera status bota
- `GET /bot/logs` - pobiera logi bota

### Metryki systemu (/metrics/basic)

Panel diagnostyczny dostępny w zakładce "Diagnostyka" przedstawia kluczowe metryki systemu:

#### Metryki czasu rzeczywistego:
- **lastEventAgeMs** - wiek ostatniego eventu user stream (< 5s = dobry, 5-15s = uwaga, > 15s = problem)
- **lastKeepAliveAgeMs** - wiek ostatniego keepalive user stream (keepalive co 25 minut)
- **avgEventLatencyMs** - średnie opóźnienie przetwarzania eventów (< 100ms = dobry, 100-500ms = uwaga, > 500ms = problem)
- **userConnections** - liczba aktywnych połączeń WebSocket

#### Liczniki błędów:
- **keepaliveErrors** - błędy podczas wysyłania keepalive
- **userStreamRestarts** - restarty user data stream
- **connectionErrors** - błędy połączeń WebSocket
- **wsListenerErrors** - błędy w listenerze WebSocket
- **watchdogFallbacks** - fallbacki watchdog na REST API

#### Statystyki danych:
- **openOrders** - liczba aktywnych zleceń
- **ordersTotal** - całkowita liczba zleceń w pamięci
- **historySize** - rozmiar historii zleceń (max 200)
- **balancesCount** - liczba śledzonych aktywów

**Interpretacja kolorów:**
- 🟢 **Zielony**: Stan dobry (< 5s dla opóźnień, 0 błędów)
- 🟡 **Żółty**: Uwaga (5-15s dla opóźnień, < 5 błędów)
- 🔴 **Czerwony**: Problem (> 15s dla opóźnień, ≥ 5 błędów)

Metryki są automatycznie aktualizowane co 5 sekund i pomagają w monitorowaniu stabilności systemu.

### Real-time order flow

System został zoptymalizowany pod kątem wydajności i stabilności zarządzania zleceniami:

#### WebSocket-based updates:
- **Otwarte zlecenia**: Automatyczne aktualizacje przez user data stream WebSocket
- **Usunięto polling**: Brak automatycznych wywołań REST API dla zleceń
- **Real-time events**: Instant powiadomienia o nowych/anulowanych/wykonanych zleceniach

#### Manual refresh limitations:
- **Throttle 5s**: Maksymalnie jedno odświeżenie co 5 sekund
- **Resnapshot mechanism**: Wymuszone przeładowanie stanu user stream
- **Przycisk odświeżania**: Dostępny w panelu zarządzania zleceniami

**Korzyści optymalizacji:**
- 🚀 Niższe zużycie API limits
- ⚡ Instant updates przez WebSocket  
- 🛡️ Ochrona przed rate limiting
- 📊 Lepsza wydajność systemu

Poprzedni system polling został całkowicie zastąpiony real-time WebSocket connectionami.asnych strategii oraz panelu webowego do zarządzania i monitorowania bota w czasie rzeczywistym.

## Architektura
- **Backend**: FastAPI z WebSocket, SQLAlchemy, trading bot
- **Frontend**: React z TypeScript, lightweight-charts, real-time WebSocket
- **Baza danych**: SQLite z modelami dla zleceń, logów i historii
- **Testing**: pytest (backend), Jest/RTL + Cypress (frontend)

## Główne funkcjonalności
- ✅ Integracja z API Binance (REST i WebSocket)
- ✅ Panel użytkownika (saldo, historia, orderbook, wykresy real-time)
- ✅ Trading bot z możliwością start/stop i monitorowaniem logów
- ✅ Obsługa środowisk testnet/produkcyjne
- ✅ WebSocket połączenia dla live market data i bot status
- ✅ Kompleksowe testy jednostkowe, integracyjne i E2E
- ✅ Lightweight charts z danymi kline w czasie rzeczywistym

## Struktura projektu
```
backend/                    # FastAPI aplikacja
├── main.py                # Główna aplikacja z WebSocket endpointami
├── binance_client.py      # Klient Binance REST/WebSocket
├── config*.py             # Konfiguracja środowisk
├── bot/
│   └── trading_bot.py     # Logika trading bota
├── database/
│   ├── init_db.py         # Inicjalizacja bazy SQLite
│   ├── crud.py            # Operacje CRUD
│   └── bot.db             # Baza danych SQLite
├── models/                # Modele SQLAlchemy
│   ├── order.py           # Model zleceń
│   ├── log.py             # Model logów
│   └── history.py         # Model historii
└── tests/                 # Testy pytest

frontend/                   # React aplikacja
├── src/
│   ├── components/        # Komponenty React
│   │   ├── AccountPanel.tsx    # Panel konta
│   │   ├── MarketPanel.tsx     # Panel rynku z wykresami
│   │   └── BotPanel.tsx        # Panel zarządzania botem
│   ├── services/          # API i WebSocket klienty
│   │   ├── restClient.ts       # REST API klient
│   │   ├── binanceWSClient.ts  # Binance WebSocket
│   │   └── wsClient.ts         # Backend WebSocket
│   ├── hooks/             # React hooks
│   └── types/             # TypeScript typy
├── cypress/               # Testy E2E
└── package.json

database/                   # Pliki bazy danych i logów
├── bot.db                 # Główna baza SQLite
└── app.log                # Logi aplikacji
```

## Wymagania
- **Python 3.10+** z pip
- **Node.js 18+** z npm
- Klucze API Binance (testnet lub produkcyjne)

## Konfiguracja środowiska

### Klucze API Binance
Utwórz plik `.env` w katalogu `backend/`:

**Dla testnet:**
```bash
BINANCE_API_KEY=your_testnet_api_key
BINANCE_API_SECRET=your_testnet_secret
BINANCE_ENV=testnet
ENV=development
ADMIN_TOKEN=your_admin_token
```

**Dla produkcji:**
```bash
BINANCE_API_KEY=your_production_api_key
BINANCE_API_SECRET=your_production_secret
BINANCE_ENV=prod
ENV=production
ADMIN_TOKEN=your_admin_token
```

## Instalacja i uruchomienie

### 1. Sklonuj repozytorium
```bash
git clone https://github.com/PapaOdin232/srinance3.git
cd srinance3
```

### 2. Backend (Python)
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Na macOS/Linux
# lub: venv\Scripts\activate  # Na Windows
pip install -r requirements.txt

# Inicjalizacja bazy danych
python database/init_db.py
```

### 3. Frontend (Node.js)
```bash
cd frontend
npm install
```

### 4. Uruchomienie aplikacji
**Backend:**
```bash
cd backend
source venv/bin/activate
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**Frontend:**
```bash
cd frontend
npm run dev
```

Aplikacja będzie dostępna pod adresem: `http://localhost:5173`

## Endpointy API

### REST API (FastAPI)
- `GET /account` - pobiera dane konta Binance (saldo, uprawnienia)
- `POST /ticker` - pobiera aktualną cenę symbolu (np. BTCUSDT)
- `GET /orderbook/{symbol}` - pobiera orderbook dla symbolu
- `POST /bot/start` - uruchamia trading bota
- `POST /bot/stop` - zatrzymuje trading bota
- `GET /bot/status` - pobiera status bota
- `GET /bot/logs` - pobiera logi bota

### WebSocket Endpointy
- `ws://localhost:8000/ws/market` - live market data (ticker, orderbook)
- `ws://localhost:8000/ws/bot` - status bota i logi w czasie rzeczywistym

### WebSocket Message Format
**Market WebSocket:**
```json
{
  "type": "ticker",
  "data": {
    "symbol": "BTCUSDT",
    "price": "43250.50",
    "change": "1250.50",
    "changePercent": "2.98"
  }
}
```

**Bot WebSocket:**
```json
{
  "type": "status",
  "data": {
    "status": "running",
    "logs": ["Bot started at Mon Jul 29 10:30:00 2025"]
  }
}
```

## Komponenty Frontend

### MarketPanel
- Wyświetla live ticker (cena, zmiana %)
- Orderbook w czasie rzeczywistym
- Wykresy candlestick z lightweight-charts
- Wybór symboli handlowych

### BotPanel
- Start/stop trading bota
- Monitoring statusu w czasie rzeczywistym
- Wyświetlanie logów bota

### AccountPanel
- Informacje o koncie Binance
- Saldo w różnych walutach
- Uprawnienia API

## Testy

### Backend (pytest)
```bash
cd backend
source venv/bin/activate
pytest -v
pytest tests/test_binance_client.py -v  # Konkretny test
```

### Frontend (Jest)
```bash
cd frontend
npm test                    # Wszystkie testy
npm test MarketPanel        # Konkretny komponent
```

### E2E (Cypress)
```bash
cd frontend
npx cypress open           # Interfejs graficzny
npx cypress run            # Headless mode
```

## Lintery i formatowanie

### Backend (Python)
```bash
cd backend
black .                    # Formatowanie kodu
flake8 .                   # Linting
isort .                    # Sortowanie importów
```

### Frontend (TypeScript)
```bash
cd frontend
npx eslint .               # Linting
npx eslint . --fix         # Auto-fix
```

## Baza danych

Projekt wykorzystuje SQLite z modelami:
- **Order**: Zlecenia handlowe
- **Log**: Logi systemowe i bota
- **History**: Historia transakcji

```bash
# Inicjalizacja bazy danych
cd backend
python database/init_db.py
```

Baza jest automatycznie tworzona w `database/bot.db`

## Technologie

### Backend
- **FastAPI** - nowoczesny framework webowy
- **SQLAlchemy** - ORM dla bazy danych
- **WebSocket** - komunikacja w czasie rzeczywistym
- **Binance API** - integracja z giełdą
- **pytest** - framework testowy
- **SQLite** - baza danych

### Frontend
- **React 19** - biblioteka UI
- **TypeScript** - typowany JavaScript
- **Vite** - bundler i dev server
- **lightweight-charts** - wykresy finansowe
- **WebSocket** - real-time komunikacja
- **Jest/RTL** - testy jednostkowe
- **Cypress** - testy E2E
- **ESLint** - linting kodu

## Obsługa błędów

### Frontend
- **ErrorBoundary** - przechwytuje błędy React
- **Fallback UI** - komunikaty w przypadku błędów API/WebSocket
- **Auto-reconnect** - automatyczne przywracanie połączeń WebSocket
- **Loading states** - wskaźniki ładowania dla lepszego UX

### Backend
- **Structured logging** - logi w formacie JSON do `database/app.log`
- **Exception handling** - obsługa błędów API Binance
- **Connection limits** - zabezpieczenie przed przeciążeniem WebSocket
- **Heartbeat** - monitoring połączeń WebSocket

## Zmienne środowiskowe

### Backend (.env)
```bash
BINANCE_API_KEY=           # Klucz API Binance
BINANCE_API_SECRET=        # Secret API Binance
BINANCE_ENV=testnet        # testnet/prod
ENV=development            # development/production
ADMIN_TOKEN=               # Token autoryzacji
```

### Przełączanie środowisk
- `BINANCE_ENV=testnet` - używa `config_testnet.py`
- `BINANCE_ENV=prod` - używa `config_prod.py`

### Frontend (.env)
```bash
VITE_API_URL=http://localhost:8001          # Backend REST API
VITE_WS_URL=ws://localhost:8001/ws          # Backend WebSocket
VITE_BINANCE_WS_URL=wss://data-stream.binance.vision/ws  # Binance market data WebSocket
VITE_ENABLE_BINANCE_STREAMS=true            # Enable/disable Binance real-time streams
```

**Uwagi:**
- `VITE_BINANCE_WS_URL` używa `data-stream.binance.vision` dla lepszej wydajności market data
- W przypadku problemów można zmienić na `wss://stream.binance.com:9443/ws`

## Rozwój projektu

### Ostatnie zmiany (lipiec 2025)
- ✅ **Usunięto integrację MCP** (Model Context Protocol)
- ✅ **Naprawiono MarketPanel** - ticker i orderbook z backendu
- ✅ **Dodano procentową zmianę ceny** w tickerze
- ✅ **Ulepszone WebSocket połączenia** z heartbeat
- ✅ **Rozszerzone testy** jednostkowe i E2E
- ✅ **Optymalizacja WebSocket połączeń** - przejście na `data-stream.binance.vision`

### Optymalizacja WebSocket Binance (31.07.2025)
Projekt został zoptymalizowany pod kątem WebSocket połączeń z Binance:

**Frontend:**
- Zmieniono endpoint z `wss://stream.binance.com:9443/ws` na `wss://data-stream.binance.vision/ws`
- Ujednolicono konfigurację WebSocket poprzez zmienne środowiskowe
- Usunięto hard-coded URL z `BinanceTickerWSClient`
- Ulepszone error handling i logging

**Backend:**
- Zaktualizowano `config_prod.py` do `data-stream.binance.vision`
- Zachowano `stream.testnet.binance.vision` dla środowiska testowego

**Korzyści:**
- `data-stream.binance.vision` jest zoptymalizowany tylko dla market data
- Lepsza stabilność i wydajność połączeń
- Centralna konfiguracja WebSocket endpoints
- Zgodność z najlepszymi praktykami Binance API

### Planowane funkcjonalności
- [ ] Zaawansowane strategie tradingowe
- [ ] Dashboard z metrykami performance
- [ ] Powiadomienia (email/Slack)
- [ ] API rate limiting
- [ ] Backup i restore konfiguracji

## Troubleshooting

### Błędy połączenia z Binance
```bash
# Sprawdź status API
curl https://testnet.binance.vision/api/v3/ping

# Sprawdź klucze API
cd backend
python -c "from config import BINANCE_API_KEY; print('OK' if BINANCE_API_KEY else 'Missing API key')"
```

### Problemy z WebSocket
- Sprawdź czy backend działa na porcie 8000
- Sprawdź logi w `database/app.log`
- Restart aplikacji może pomóc z connection pooling

### Problemy z frontendem
```bash
# Sprawdź zależności
npm audit

# Rebuild node_modules
rm -rf node_modules package-lock.json
npm install
```

## Licencja i wkład

Projekt jest rozwijany jako narzędzie edukacyjne do nauki algorytmicznego tradingu. 

**⚠️ Ostrzeżenie:** Trading na giełdach kryptowalut wiąże się z ryzykiem straty kapitału. Zawsze testuj strategie na testnet przed wdrożeniem na środowisko produkcyjne.

---

## Kontakt i dokumentacja

- **Repository**: [github.com/PapaOdin232/srinance3](https://github.com/PapaOdin232/srinance3)
- **Issues**: [GitHub Issues](https://github.com/PapaOdin232/srinance3/issues)
- **Documentation**: Sprawdź folder `docs/` dla szczegółowej dokumentacji

*Ostatnia aktualizacja: 29 lipca 2025*
