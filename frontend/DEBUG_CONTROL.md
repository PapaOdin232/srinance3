# Kontrola Logów Debug 🔧

Ta aplikacja została zaktualizowana z ulepszoną kontrolą logów debug. Wszystkie console.log zostały zastąpione inteligentnym systemem debugowania.

## 🎛️ Jak kontrolować logi

### Wyłączenie wszystkich logów
```javascript
localStorage.setItem('debug:enabled', 'false')
// Następnie odśwież stronę
```

### Włączenie wszystkich logów
```javascript
localStorage.removeItem('debug:enabled')  
// Następnie odśwież stronę
```

### Wyłączenie konkretnych komponentów
```javascript
// Wyłącz logi MarketPanel (największa liczba logów)
localStorage.setItem('debug:MarketPanel', 'false')

// Wyłącz logi MarketDataService 
localStorage.setItem('debug:MarketDataService', 'false')

// Wyłącz logi renderowania komponentów (PriceDisplay, OrderBookDisplay)
localStorage.setItem('debug:components', 'false')

// Wyłącz logi wykresów
localStorage.setItem('debug:useLightweightChart', 'false')

// Wyłącz logi wydajności scrollowania
localStorage.setItem('debug:performance', 'false')

// Wyłącz logi połączeń WebSocket (Binance etc.) - zmień poziom na 'error'
localStorage.setItem('LOG_LEVEL', 'error')
```

### Włączenie konkretnych komponentów
```javascript
// Usuń flagę wyłączenia dla konkretnego komponentu
localStorage.removeItem('debug:MarketPanel')
localStorage.removeItem('debug:MarketDataService')
localStorage.removeItem('debug:components')
```

## 🚀 Szybkie komendy

W konsoli przeglądarki:

```javascript
// Wyłącz WSZYSTKIE logi debug
disableAllDebugLogs()

// Włącz wszystkie logi debug
enableAllDebugLogs() 

// Wyłącz tylko logi renderowania komponentów
disableComponentRenderLogs()

// Wyłącz logi wydajności (scroll performance)
disablePerformanceLogs()

// Wyłącz logi połączeń Binance WebSocket
disableBinanceLogs()

// Włącz szczegółowe logi debug (binance, websocket etc.)
enableDebugLogs()
```

## 📊 Co oznaczają różne prefiksy logów

- `[MarketPanel]` - główne wydarzenia w komponencie rynkowym
- `[MarketDataService]` - notifikacje i przetwarzanie danych rynkowych  
- `[PriceDisplay]` - renderowanie komponentu ceny
- `[OrderBookDisplay]` - renderowanie księgi zleceń
- `[useLightweightChart]` - operacje na wykresach
- `[binance:ticker]` - połączenia WebSocket z Binance
- `PortfolioTable.tsx ⏱` - performance tabel (TanStack Table debug)
- `📊 Scroll Performance Metrics` - metryki wydajności scrollowania

## 🎯 Zalecenia

### Dla zwykłego użytkowania (najczytsza konsola):
```javascript
disableAllDebugLogs()      // Wyłącza nasze logi
disableBinanceLogs()       // Wyłącza logi WebSocket
disablePerformanceLogs()   // Wyłącza metryki wydajności
```

### Dla debugowania problemów z cenami:
```javascript
disableComponentRenderLogs()       // Wyłącz częste logi renderowania
disablePerformanceLogs()           // Wyłącz metryki wydajności  
disableBinanceLogs()               // Wyłącz WebSocket logi
// Pozostaw MarketPanel i MarketDataService włączone
```

### Dla debugowania problemów z wykresami:
```javascript
disableComponentRenderLogs()       // Wyłącz logi renderowania
disablePerformanceLogs()           // Wyłącz metryki wydajności
localStorage.setItem('debug:MarketPanel', 'false')  // Wyłącz MarketPanel logi
// Pozostaw useLightweightChart i MarketDataService włączone
```

## 🔄 Pamiętaj o odświeżeniu strony!

Wszystkie zmiany w localStorage wymagają odświeżenia strony aby zostały zastosowane.

## 🎨 Status w środowisku produkcyjnym

W wersji produkcyjnej (BUILD) wszystkie logi debug są automatycznie wyłączone, niezależnie od ustawień localStorage.
