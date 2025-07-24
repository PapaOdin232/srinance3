# Plan Naprawy Wykresu Chart.js w Srinance 3

## Przegląd Problemu

**Problem**: Wykres w komponencie `MarketPanel.tsx` nie wyświetla danych mimo poprawnie działającego backendu FastAPI, WebSocket i REST API.

**Objawy**:
- Backend działa poprawnie (brak błędów 500, WebSocket funkcjonuje)
- Dane przychodzą przez WebSocket (widoczne w Network > WS)
- Wykres pozostaje pusty mimo odbierania danych ticker
- Brak błędów JavaScript w konsoli
- REST endpointy zwracają poprawne dane

---

## Wyniki Analizy Kodu

### ✅ Co Działa Poprawnie

**1. Zależności (package.json)**:
- `chart.js: ^4.5.0` ✅
- `chartjs-adapter-date-fns: ^3.0.0` ✅  
- `date-fns: ^4.1.0` ✅
- Wszystkie wymagane biblioteki są zainstalowane

**2. Import adaptera daty (MarketPanel.tsx)**:
```typescript
import 'chartjs-adapter-date-fns'; ✅
```

**3. Konfiguracja Chart.js**:
- Skala `type: 'time'` poprawnie skonfigurowana ✅
- Adapter date-fns ustawiony ✅
- Format wyświetlania poprawny ✅

**4. WebSocket Client**:
- Solidna implementacja z heartbeat i reconnect ✅
- Poprawna obsługa wiadomości typu `ticker` ✅
- Connection state management działa ✅

**5. Analiza jakości kodu (Codacy)**:
- ESLint: Brak błędów ✅
- Semgrep: Brak problemów bezpieczeństwa ✅
- Trivy: Brak podatności ✅

### ❌ Zidentyfikowane Problemy

**1. Potencjalny konflikt Chart.js**:
- Kod używa `chart.js/auto` bezpośrednio
- W package.json jest również `react-chartjs-2` (nieużywane)
- Może brakować rejestracji komponentów Chart.js

**2. Problem z dependencies w useEffect**:
```typescript
// W MarketPanel.tsx linia ~185
useEffect(() => {
  // setup WebSocket
}, [selectedSymbol, chartInstance, addDataPoint]); // ❌ Te dependencies mogą powodować problemy
```
- `chartInstance` i `addDataPoint` zmieniają się przy każdej rekonstrukcji
- Powoduje to ciągłe restartowanie WebSocket

**3. Potencjalny problem inicjalizacji Chart.js**:
- Chart.js v4 wymaga jawnej rejestracji niektórych komponentów
- Skala `time` może wymagać dodatkowej konfiguracji

---

## Plan Naprawy

### Priorytet 1: Rejestracja Komponentów Chart.js

#### Krok 1.1: Aktualizacja useChart.ts
Zmień import w `/frontend/src/hooks/useChart.ts`:

```typescript
// Zamień obecny import:
import { Chart } from 'chart.js/auto';

// Na jawną rejestrację komponentów:
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  TimeScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import 'chartjs-adapter-date-fns';

// Zarejestruj komponenty
ChartJS.register(
  CategoryScale,
  LinearScale,
  TimeScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

// Zamień wszystkie wystąpienia 'Chart' na 'ChartJS'
export function useChart(
  config: ChartConfiguration,
  dependencies: React.DependencyList = []
) {
  // ...
  chartInstanceRef.current = new ChartJS(chartRef.current, config);
  // ...
}
```

#### Krok 1.2: Dodaj debug log do useChart.ts
Dodaj logowanie w funkcji `addDataPoint`:

```typescript
const addDataPoint = useCallback((label: Date | string | number, datasetIndex: number, value: number | [number, number] | Point | BubbleDataPoint | null, maxPoints = 100) => {
  console.log(`[useChart] Adding data point: label=${label}, value=${value}, datasetIndex=${datasetIndex}`);
  
  if (chartInstanceRef.current && chartInstanceRef.current.data.datasets[datasetIndex]) {
    const chart = chartInstanceRef.current;
    
    // Add new data
    chart.data.labels?.push(label);
    chart.data.datasets[datasetIndex].data.push(value);
    
    console.log(`[useChart] Chart data after adding: labels=${chart.data.labels?.length}, data=${chart.data.datasets[datasetIndex].data.length}`);
    
    // Remove oldest data if exceeding maxPoints
    if (chart.data.labels && chart.data.labels.length > maxPoints) {
      chart.data.labels.shift();
      chart.data.datasets[datasetIndex].data.shift();
    }
    
    chart.update('none');
    console.log(`[useChart] Chart updated successfully`);
  } else {
    console.error(`[useChart] Cannot add data point: chart=${!!chartInstanceRef.current}, dataset=${chartInstanceRef.current?.data.datasets[datasetIndex] ? 'exists' : 'missing'}`);
  }
}, []);
```

### Priorytet 2: Optymalizacja Dependencies

#### Krok 2.1: Poprawa useEffect w MarketPanel.tsx
Zamień problematyczny useEffect:

```typescript
// Obecny kod (~linia 185):
useEffect(() => {
  // setup WebSocket
}, [selectedSymbol, chartInstance, addDataPoint]); // ❌ Problematyczne dependencies

// Zmień na:
useEffect(() => {
  let mounted = true;
  let wsClientLocal: EnhancedWSClient | null = null;

  const setupWebSocket = () => {
    // Cleanup poprzedniego połączenia
    if (wsClientRef.current) {
      wsClientRef.current.destroy();
      wsClientRef.current = null;
    }

    if (!mounted) return;

    const wsClient = new EnhancedWSClient('ws://localhost:8000/ws/market', {
      reconnectInterval: 2000,
      maxReconnectInterval: 30000,
      maxReconnectAttempts: 5,
      heartbeatInterval: 30000,
      debug: true
    });

    wsClientRef.current = wsClient;
    wsClientLocal = wsClient;

    wsClient.addStateListener((state, error) => {
      if (!mounted) return;
      setConnectionState(state);
      setConnectionError(error || null);
      if (state === ConnectionState.CONNECTED) {
        wsClient.send({ type: 'subscribe', symbol: selectedSymbol });
      }
    });

    wsClient.addListener((msg) => {
      if (!mounted) return;
      console.log(`[MarketPanel] Received WebSocket message:`, msg); // Debug log
      
      switch (msg.type) {
        case 'ticker':
          if (msg.symbol === selectedSymbol) {
            console.log(`[MarketPanel] Processing ticker for ${msg.symbol}: ${msg.price}`); // Debug log
            
            setTicker(prevTicker => ({
              symbol: msg.symbol as string,
              price: msg.price as string,
              change: prevTicker?.change || '0',
              changePercent: prevTicker?.changePercent || '0%'
            }));
            
            // Użyj ref do chartInstance i addDataPoint
            if (chartInstanceRef.current) {
              const now = new Date();
              const priceValue = parseFloat(msg.price as string);
              console.log(`[MarketPanel] Adding to chart: time=${now.toISOString()}, price=${priceValue}`); // Debug log
              
              // Bezpośrednie wywołanie zamiast przez hook
              const chart = chartInstanceRef.current;
              chart.data.labels?.push(now);
              chart.data.datasets[0].data.push(priceValue);
              
              // Usuń stare dane (max 100 punktów)
              if (chart.data.labels && chart.data.labels.length > 100) {
                chart.data.labels.shift();
                chart.data.datasets[0].data.shift();
              }
              
              chart.update('none');
              console.log(`[MarketPanel] Chart updated with new data`); // Debug log
            } else {
              console.warn(`[MarketPanel] Chart instance not available for data update`); // Debug log
            }
          }
          break;
          
        case 'orderbook':
          if (msg.symbol === selectedSymbol) {
            setOrderBook({
              symbol: msg.symbol as string,
              bids: msg.bids as [string, string][],
              asks: msg.asks as [string, string][]
            });
          }
          break;
      }
    });
  };

  // Opóźnienie setupWebSocket, aby zapobiec podwójnym połączeniom w Strict Mode
  const timeoutId = setTimeout(() => {
    setupWebSocket();
    loadInitialData(selectedSymbol);
  }, 100);

  return () => {
    mounted = false;
    clearTimeout(timeoutId);
    if (wsClientLocal) {
      wsClientLocal.destroy();
      wsClientLocal = null;
    }
    if (wsClientRef.current) {
      wsClientRef.current.destroy();
      wsClientRef.current = null;
    }
  };
}, [selectedSymbol]); // ✅ Tylko selectedSymbol jako dependency

// Dodaj osobny ref do chart instance
const chartInstanceRef = useRef<Chart | null>(null);

// Zaktualizuj useChart żeby zapisywał ref
const { chartRef, chartInstance, addDataPoint, updateChart } = useChart(
  chartConfig, 
  [selectedSymbol]
);

// Zapisz chart instance w ref
useEffect(() => {
  chartInstanceRef.current = chartInstance;
}, [chartInstance]);
```

### Priorytet 3: Alternatywne Rozwiązanie

#### Krok 3.1: Użycie react-chartjs-2 (jeśli powyższe nie zadziała)
Jeśli bezpośrednie użycie Chart.js nadal nie działa, przełącz na `react-chartjs-2`:

```typescript
// W MarketPanel.tsx, zamień import:
import { Line } from 'react-chartjs-2';

// Usuń useChart hook i zastąp wykres:
<div style={{ height: '300px', position: 'relative' }}>
  <Line 
    data={{
      labels: chartData.labels,
      datasets: chartData.datasets
    }}
    options={chartConfig.options}
  />
</div>

// Dodaj state dla danych wykresu:
const [chartData, setChartData] = useState({
  labels: [] as Date[],
  datasets: [{
    label: `${selectedSymbol} Price`,
    data: [] as number[],
    borderColor: '#10B981',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    tension: 0.1,
    fill: true
  }]
});

// W obsłudze WebSocket ticker:
setChartData(prev => {
  const newLabels = [...prev.labels, new Date()];
  const newData = [...prev.datasets[0].data, priceValue];
  
  // Ogranicz do 100 punktów
  if (newLabels.length > 100) {
    newLabels.shift();
    newData.shift();
  }
  
  return {
    labels: newLabels,
    datasets: [{
      ...prev.datasets[0],
      data: newData
    }]
  };
});
```

---

## Testowanie

### Test 1: Rejestracja Komponentów Chart.js
```bash
cd frontend
npm run dev
# Otwórz DevTools > Console
# Sprawdź, czy nie ma błędów typu: "Cannot create scale of type 'time'"
```

### Test 2: Debug Logs WebSocket i Chart
```bash
# W DevTools > Console szukaj logów:
# [MarketPanel] Received WebSocket message: {type: "ticker", ...}
# [MarketPanel] Processing ticker for BTCUSDT: 50000.00
# [MarketPanel] Adding to chart: time=2025-07-24T..., price=50000
# [MarketPanel] Chart updated with new data
```

### Test 3: WebSocket Data Flow
```bash
# W DevTools > Network > WS sprawdź:
# 1. Połączenie do ws://localhost:8000/ws/market ✅
# 2. Wiadomość subscribe: {"type":"subscribe","symbol":"BTCUSDT"} ✅
# 3. Odpowiedzi ticker: {"type":"ticker","symbol":"BTCUSDT","price":"..."} ✅
```

### Test 4: Chart.js Canvas
```bash
# W DevTools > Elements sprawdź:
# <canvas> element istnieje ✅
# canvas ma width i height > 0 ✅
# Przez JavaScript: document.querySelector('canvas').getContext('2d') !== null ✅
```

### Test 5: Manual Chart Update Test
Dodaj do konsoli przeglądarki:
```javascript
// Test bezpośredniej aktualizacji wykresu
const canvas = document.querySelector('canvas');
if (canvas && window.Chart) {
  console.log('Chart.js dostępne, canvas znaleziony');
  // Sprawdź, czy Chart instance istnieje
  const chart = Chart.getChart(canvas);
  if (chart) {
    console.log('Chart instance istnieje:', chart);
    console.log('Chart data:', chart.data);
  } else {
    console.log('Brak Chart instance');
  }
}
```

---

## Checklist Weryfikacji

### Faza 1: Podstawowa Funkcjonalność
- [ ] **Wykres się wyświetla** (canvas visible, nie pusty)
- [ ] **Brak błędów Chart.js w konsoli** (rejestracja komponentów)
- [ ] **WebSocket połączenie działa** (statu "Połączony")
- [ ] **Dane ticker przychodzą** (debug logs w konsoli)

### Faza 2: Integracja Danych
- [ ] **addDataPoint wywołuje się** (debug logs)
- [ ] **Chart.update() wykonuje się** (bez błędów)
- [ ] **Dane wykresu się aktualizują** (liczba punktów rośnie)
- [ ] **Oś czasowa wyświetla się poprawnie** (HH:mm format)

### Faza 3: Optymalizacja
- [ ] **WebSocket nie restartuje się niepotrzebnie** (max 1 połączenie)
- [ ] **Chart performance jest OK** (< 100 punktów danych)
- [ ] **React Strict Mode nie powoduje problemów** (debouncing działa)
- [ ] **Zmiana symbolu aktualizuje wykres** (dane się czyszczą)

---

## Dalsze Kroki

### Po Naprawie Podstawowej Funkcjonalności:

**1. Performance Optimization**:
- Lazy loading komponentów Chart.js
- Virtualizacja danych (tylko widoczne punkty)
- WebWorker dla przetwarzania danych WebSocket

**2. Enhanced Features**:
- Zoom i pan w wykresie
- Różne timeframes (1m, 5m, 1h)
- Wskaźniki techniczne (SMA, EMA)
- Volume chart

**3. Testing Infrastructure**:
- Unit testy dla useChart hook
- Integration testy WebSocket + Chart
- E2E testy w Cypress dla całego flow

**4. Error Handling**:
- Graceful degradation gdy Chart.js nie działa
- Fallback na prostą tabelę danych
- User-friendly error messages

**5. Documentation**:
- JSDoc dla useChart hook
- README z instrukcjami setup Chart.js
- Troubleshooting guide

---

## Podsumowanie

**Główny problem**: Prawdopodobnie brak właściwej rejestracji komponentów Chart.js v4, szczególnie `TimeScale` wymaganej dla `type: 'time'`.

**Rozwiązanie**: Jawna rejestracja komponentów Chart.js zamiast `chart.js/auto`, optymalizacja dependencies w useEffect, dodanie debug logs.

**Alternatywa**: Użycie `react-chartjs-2` dla łatwiejszej integracji z React.

**Timeline**: 
- Krok 1-2: ~30 min implementacji + testowanie
- Krok 3 (jeśli potrzebny): ~15 min
- Łączny czas naprawy: < 1 godzina

---

*Plan wygenerowany przez GitHub Copilot z analizą MCP (filesystem, codacy, sequential thinking) - 24 lipca 2025*