# 🤖 Architektura Bota Handlowego - SRinance3

## 📋 Przegląd Systemu

Bot handlowy SRinance3 to kompleksowy system składający się z:
- **Frontend React** (interfejs użytkownika)
- **Backend FastAPI** (WebSocket + REST API)
- **Trading Bot** (logika handlowa)
- **Binance Integration** (dane rynkowe i wykonywanie zleceń)

---

## 🔗 Przepływ Danych

```
┌─────────────────┐    WebSocket    ┌──────────────────┐    Queue    ┌─────────────┐
│   Binance API   │ ──────────────→ │  WebSocket       │ ──────────→ │ TradingBot  │
│   (Real-time)   │                 │  Client/Handler  │             │ (Strategies)│
└─────────────────┘                 └──────────────────┘             └─────────────┘
                                             │
                                             │ REST API
                                             ▼
                                    ┌──────────────────┐
                                    │   FastAPI        │
                                    │   (Config &      │
                                    │    Control)      │
                                    └──────────────────┘
                                             │
                                             │ WebSocket
                                             ▼
                                    ┌──────────────────┐
                                    │   Frontend       │
                                    │   (BotPanel)     │
                                    └──────────────────┘
```

---

## 🎯 Główne Komponenty

### 1. **Frontend (React)**
- **Plik**: `frontend/src/components/BotPanel.tsx`
- **Funkcja**: Interfejs użytkownika do kontroli bota
- **Komunikacja**: WebSocket (`ws://localhost:8001/ws/bot`)

#### Funkcjonalności:
- ✅ Start/Stop bota
- 📊 Monitoring logów w czasie rzeczywistym
- 📈 Wyświetlanie statusu bota
- ⚙️ Konfiguracja strategii handlowych

### 2. **Backend (FastAPI)**
- **Plik**: `backend/main.py`
- **Funkcja**: WebSocket endpoint + REST API
- **Port**: 8001

#### Endpointy:
- `POST /bot/start` - Uruchomienie bota
- `POST /bot/stop` - Zatrzymanie bota
- `GET /bot/status` - Status bota
- `WS /ws/bot` - WebSocket dla komunikacji real-time

### 3. **Trading Bot**
- **Plik**: `backend/bot/trading_bot.py`
- **Funkcja**: Główna logika handlowa
- **Klasa**: `TradingBot`

---

## 📊 Źródła Danych

### **Główne źródło: WebSocket Queue (Event-driven)**
```python
market_data_queue  # Queue z live market data z Binance
```

### **Obsługiwane formaty Binance WebSocket API:**

#### 1. **24hrTicker (Statystyki 24h)**
```json
{
  "e": "24hrTicker",
  "c": "50000.00",  // Cena zamknięcia
  "P": "2.50",      // Zmiana %
  "v": "1000.5"     // Wolumen
}
```

#### 2. **Order Book Updates**
```json
{
  "e": "depthUpdate",
  "b": [["50000", "1.5"]],  // Bids
  "a": [["50010", "2.0"]]   // Asks
}
```

#### 3. **Kline/Candlestick Data**
```json
{
  "e": "kline",
  "k": {
    "c": "50000.00",  // Cena zamknięcia
    "v": "1000.5",    // Wolumen
    "x": true         // Czy świeca zamknięta
  }
}
```

### **Fallback: Timer-based (Testing)**
- Interval: 2 sekundy
- Używany gdy brak live danych z Binance

---

## 🎯 Strategie Handlowe

Bot oferuje **4 główne strategie** konfigurowalnych przez UI:

### 1. **Simple Moving Average (simple_ma)**
```python
# Parametry
"ma_period": 20,        # Okres średniej (5-200)
"ma_type": "SMA"        # SMA lub EMA

# Sygnały
BUY:  cena > średnia * 1.001  # 0.1% powyżej
SELL: cena < średnia * 0.999  # 0.1% poniżej
```

### 2. **RSI Strategy (rsi)**
```python
# Parametry
"rsi_period": 14,           # Okres RSI (5-50)
"rsi_overbought": 70,       # Wykupienie (60-90)
"rsi_oversold": 30          # Wyprzedanie (10-40)

# Sygnały
BUY:  RSI < 30  # Wyprzedanie
SELL: RSI > 70  # Wykupienie
```

### 3. **Grid Trading (grid)**
```python
# Parametry
"grid_levels": 10,          # Liczba poziomów (5-50)
"grid_spacing": 0.01,       # 1% odstęp między poziomami
"grid_amount": 100          # 100 USDT na poziom

# Logika
- Siatka BUY poniżej ceny
- Siatka SELL powyżej ceny
- Auto-odtwarzanie zleceń
```

### 4. **Dollar Cost Averaging (dca)**
```python
# Parametry
"dca_interval": 3600,       # 1h między zakupami
"dca_amount": 50,           # 50 USDT na zakup
"dca_price_drop": 0.02      # 2% spadek dla dodatkowego zakupu

# Logika
- Regularne zakupy co X czasu
- Dodatkowe zakupy przy spadkach
```

---

## ⚡ Zarządzanie Ryzykiem

Wszystkie strategie używają wspólnego systemu risk management:

```python
"risk_management": {
    "max_position_size": 1000,    # Maksymalna pozycja (USDT)
    "stop_loss_pct": 0.05,        # 5% stop loss
    "take_profit_pct": 0.10,      # 10% take profit
    "max_daily_trades": 50,       # Limit dziennych transakcji
    "max_daily_loss": 500         # Maksymalna dzienna strata (USDT)
}
```

---

## 🔧 Konfiguracja

### **Domyślna konfiguracja strategii:**
```python
strategy_config = {
    "type": "simple_ma",
    "symbol": "BTCUSDT",
    "timeframe": "1m",
    "parameters": { ... },
    "risk_management": { ... }
}
```

### **Stan strategii (tracking):**
```python
strategy_state = {
    "position": {"size": 0, "entry_price": 0, "side": "none"},
    "indicators": {},
    "last_signal": "none",
    "daily_trades": 0,
    "daily_pnl": 0,
    "grid_orders": [],
    "last_dca_time": 0
}
```

---

## 🚀 Uruchamianie

### **Backend:**
```bash
cd backend
python main.py  # Port 8001
```

### **Frontend:**
```bash
cd frontend
npm run dev    # Port (Vite default)
```

### **Bot Control:**
- Frontend → WebSocket → Backend → TradingBot
- Real-time logs i status przez WebSocket
- Konfiguracja przez REST API

---

## 📁 Struktura Plików

```
backend/
├── bot/
│   └── trading_bot.py          # Główna logika bota
├── main.py                     # FastAPI + WebSocket endpoints
├── binance_client.py           # Integracja z Binance API
└── market_data_manager.py      # Zarządzanie danymi rynkowymi

frontend/
└── src/
    └── components/
        ├── BotPanel.tsx        # Główny UI bota
        └── BotConfigPanel.tsx  # Konfiguracja strategii
```

---

## 🔒 Bezpieczeństwo

- API keys w zmiennych środowiskowych
- Secure WebSocket connections
- Risk management na poziomie strategii
- Rate limiting dla API calls
- Error handling i logging

---

## 📈 Monitoring

- **Real-time logs** przez WebSocket
- **Status bota** (running/stopped, strategia, symbol)
- **P&L tracking** (dzienny profit/loss)
- **Trade counting** (limit dziennych transakcji)
- **Connection state** monitoring

---

## 🔮 Rozszerzenia

Bot został zaprojektowany jako **modularny system**, umożliwiający:
- ✅ Dodawanie nowych strategii
- ✅ Integrację z innymi giełdami
- ✅ Rozszerzenie risk management
- ✅ Zaawansowane analytics i backtesting
- ✅ Machine learning integration

---

*Dokumentacja wygenerowana: 17 września 2025*