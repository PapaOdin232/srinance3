# Propozycje ulepszeń wykresów TradingView dla projektu

## 📊 Obecny stan
- Lightweight Charts (TradingView) – wykresy świecowe, dane z Binance WebSocket
- Wybór interwałów, par handlowych, księga zleceń

---

## 🚀 Propozycje ulepszeń (checklista)

### Faza 1: Wskaźniki techniczne ✅ UKOŃCZONE
- [x] Dodanie wskaźnika RSI (Relative Strength Index)
- [x] Dodanie Moving Averages (SMA, EMA)
- [x] Dodanie MACD
- [x] Dodanie Bollinger Bands
- [x] Overlay wskaźników na wykresie
- [x] Panel zarządzania wskaźnikami
- [x] Konfiguracja parametrów wskaźników

### Faza 2: Integracja z botem
- [ ] Oznaczenia sygnałów wejścia/wyjścia na wykresie
- [ ] Wizualizacja poziomów stop-loss i take-profit
- [ ] Real-time tracking pozycji na wykresie

### Faza 3: Widżety i dodatki TradingView
- [ ] Market Overview Widget
- [ ] Crypto Screener Widget
- [ ] Economic Calendar Widget
- [ ] Ticker Tape Widget

### Faza 4: Zaawansowane funkcje wykresów
- [ ] Różne typy wykresów (liniowe, obszarowe, Heikin-Ashi, wolumenowe)
- [ ] Narzędzia rysowania (linie trendu, poziomy S/R)
- [ ] Porównywanie wielu instrumentów na jednym wykresie
- [ ] System alertów cenowych
- [ ] Eksport danych historycznych

### Faza 5: Wykorzystanie pełnego API Binance
- [ ] UI Klines (zoptymalizowane świece)
- [ ] 24h Statistics
- [ ] Rolling Window Statistics
- [ ] Average Price
- [ ] Aggregate Trades

---

## 💡 Korzyści
- Profesjonalny wygląd i UX
- Lepsza analiza i sygnały tradingowe
- Większa funkcjonalność platformy
- Intuicyjne narzędzia dla użytkownika

**Rekomendacja:** Zacznij od Fazy 1 (wskaźniki techniczne) – największy wpływ na trading i analizę.

---

## ✅ FAZA 1 UKOŃCZONA - Wskaźniki Techniczne

### 🎯 Zaimplementowane funkcjonalności:

#### Wskaźniki dostępne:
- **RSI (Relative Strength Index)** - wykrywanie wykupienia/wyprzedania
- **Moving Averages** - SMA i EMA z konfigurowalnymi okresami
- **MACD** - Moving Average Convergence Divergence z sygnałami
- **Bollinger Bands** - pasma cenowe z odchyleniem standardowym

#### Panel zarządzania:
- Dodawanie wskaźników z konfiguracją parametrów
- Zarządzanie widocznością wskaźników
- Usuwanie pojedynczych wskaźników lub wszystkich
- Kod kolorowy dla różnych typów wskaźników

### 📁 Struktura kodu:
```
frontend/src/
├── indicators/
│   ├── index.ts              # Eksporty i domyślne konfiguracje
│   ├── types.ts              # Typy TypeScript dla wskaźników
│   ├── rsi.ts               # Implementacja RSI
│   ├── movingAverage.ts     # SMA i EMA
│   ├── macd.ts              # MACD z sygnałami
│   └── bollingerBands.ts    # Bollinger Bands
├── hooks/
│   └── useChartIndicators.ts # Hook do zarządzania wskaźnikami
└── components/
    └── IndicatorPanel.tsx    # UI panel wskaźników
```

### 🚀 Jak używać:
1. Przejdź do panelu Market
2. Pod wykresem znajdziesz panel "Wskaźniki Techniczne"
3. Kliknij "Dodaj wskaźnik" i wybierz żądany wskaźnik
4. Skonfiguruj parametry (okresy, progi, etc.)
5. Kliknij "Dodaj wskaźnik" - pojawi się na wykresie
6. Używaj ikon oka 👁️ do włączania/wyłączania
7. Używaj ikony kosza 🗑️ do usuwania

### 🔧 Parametry domyślne:
- **RSI**: okres=14, wykupienie=70, wyprzedanie=30
- **MACD**: szybka=12, wolna=26, sygnał=9
- **Bollinger Bands**: okres=20, mnożnik=2.0
- **Moving Average**: okres=20, typ=SMA
