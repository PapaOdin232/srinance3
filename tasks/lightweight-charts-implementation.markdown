# Implementacja lightweight-charts w projekcie SRInance3

## Analizowane repozytoria
- **[TradingView](https://github.com/tradingview)**: Zawiera bibliotekę lightweight-charts, która służy do tworzenia wydajnych wykresów finansowych, oraz przykłady integracji z React w repozytorium `charting-library-examples`.
- **[Binance](https://github.com/binance)**: Dostarcza dokumentację API Binance oraz biblioteki takie jak `binance-connector-python`, używane w backendzie projektu SRInance3 do pobierania danych.

## Instrukcja krok po kroku
Poniżej znajdziesz szczegółową instrukcję, jak zaimplementować lightweight-charts w projekcie SRInance3, zastępując dotychczasowy kod Chart.js. Każdy krok zawiera odnośnik do oficjalnej dokumentacji, aby agent AI mógł dokładnie zweryfikować szczegóły implementacji.

### Krok 1: Instalacja lightweight-charts
Przejdź do katalogu frontendowego projektu SRInance3 i zainstaluj bibliotekę za pomocą npm:
```bash
cd frontend
npm install lightweight-charts
```
**Dokumentacja:** [Lightweight Charts - Getting Started](https://tradingview.github.io/lightweight-charts/docs)

### Krok 2: Importowanie biblioteki
W pliku `MarketPanel.tsx` (lub innym komponencie, gdzie znajduje się wykres), usuń importy Chart.js i dodaj importy dla lightweight-charts:
```typescript
import { createChart, IChartApi, ISeriesApi } from 'lightweight-charts';
```
**Dokumentacja:** [API Reference - createChart](https://tradingview.github.io/lightweight-charts/docs/api#createchart)

### Krok 3: Tworzenie kontenera dla wykresu
W JSX komponentu `MarketPanel.tsx` dodaj element `div`, który będzie kontenerem dla wykresu. Użyj `useRef` do uzyskania referencji:
```typescript
const chartContainerRef = useRef<HTMLDivElement>(null);

// W JSX:
<div ref={chartContainerRef} style={{ width: '100%', height: '400px' }} />
```
Upewnij się, że kontener ma zdefiniowane wymiary.

### Krok 4: Inicjalizacja wykresu
W hooku `useEffect` zainicjuj wykres, korzystając z referencji do kontenera:
```typescript
useEffect(() => {
  if (chartContainerRef.current) {
    const chart: IChartApi = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
      layout: {
        backgroundColor: '#ffffff',
        textColor: '#333',
      },
      grid: {
        vertLines: { color: '#e1e1e1' },
        horzLines: { color: '#e1e1e1' },
      },
    });
    // Dodanie serii danych w następnym kroku
  }
}, []);
```
**Dokumentacja:** [API Reference - createChart](https://tradingview.github.io/lightweight-charts/docs/api#createchart)

### Krok 5: Dodanie serii danych (świecznikowej)
Dodaj serię typu świece japońskie, która jest odpowiednia dla danych finansowych z Binance:
```typescript
const candlestickSeries: ISeriesApi<'Candlestick'> = chart.addCandlestickSeries({
  upColor: '#26a69a',
  downColor: '#ef5350',
  borderVisible: false,
  wickUpColor: '#26a69a',
  wickDownColor: '#ef5350',
});
```
**Dokumentacja:** [Series Types - Candlestick](https://tradingview.github.io/lightweight-charts/docs/series-types#candlestick)

### Krok 6: Pobranie danych z WebSocket
W SRInance3 dane są już pobierane za pomocą WebSocket (np. w pliku `wsClient.ts`). Upewnij się, że komponent nasłuchuje na dane w formacie zgodnym z lightweight-charts:
```typescript
{ time: '2019-04-11', open: 10, high: 10.5, low: 9.5, close: 10.2 }
```
Dostosuj istniejący kod WebSocket do tego formatu, jeśli to konieczne.

### Krok 7: Aktualizacja wykresu w czasie rzeczywistym
Gdy nowe dane przychodzą z WebSocket, zaktualizuj serię wykresu za pomocą metody `update`:
```typescript
wsClient.addListener((msg) => {
  if (msg.type === 'kline') {  // Przykład dla strumienia kline z Binance
    const newCandle = {
      time: msg.data.k.t / 1000,  // Konwersja timestampu na sekundy
      open: parseFloat(msg.data.k.o),
      high: parseFloat(msg.data.k.h),
      low: parseFloat(msg.data.k.l),
      close: parseFloat(msg.data.k.c),
    };
    candlestickSeries.update(newCandle);
  }
});
```
**Dokumentacja:** [Real-time Updates Tutorial](https://tradingview.github.io/lightweight-charts/tutorials/demos/realtime-updates)

### Krok 8: Obsługa osi czasowych
Lightweight-charts natywnie obsługuje dane czasowe. Upewnij się, że pole `time` w danych jest w formacie 'YYYY-MM-DD' lub jako znacznik czasu Unix (w sekundach):
```typescript
{ time: 1555000000, open: 10, high: 10.5, low: 9.5, close: 10.2 }
```
**Dokumentacja:** [Time Scale](https://tradingview.github.io/lightweight-charts/docs/time-scale)

### Krok 9: Czyszczenie po odmontowaniu komponentu
Dodaj funkcję czyszczącą w `useEffect`, aby uniknąć wycieków pamięci:
```typescript
useEffect(() => {
  // Inicjalizacja wykresu i serii
  return () => {
    chart.remove();
  };
}, []);
```

## Dodatkowe uwagi
- **Usunięcie Chart.js**: Wyczyść kod w `MarketPanel.tsx`, usuwając wszystkie importy i logikę związaną z Chart.js.
- **Stylizacja**: Dostosuj kolory i inne opcje wykresu (np. `backgroundColor`, `upColor`) do stylu SRInance3.
- **Testowanie**: Po implementacji przetestuj aktualizacje w czasie rzeczywistym, aby upewnić się, że dane z WebSocket są poprawnie wyświetlane.

Dzięki tej instrukcji Twój agent AI będzie w stanie zaimplementować lightweight-charts w projekcie SRInance3, korzystając z oficjalnej dokumentacji i przykładów.