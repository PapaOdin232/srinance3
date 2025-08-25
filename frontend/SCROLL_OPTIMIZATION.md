# Optymalizacje Wydajności Przewijania

## Problem
Komunikat w Chrome DevTools:
```
[Violation] Handling of 'wheel' input event was delayed for xxx ms due to main thread being busy. Consider marking event handler as 'passive' to make the page more responsive.
```

## Rozwiązania Zaimplementowane

### 1. Passive Event Listeners
- **Plik**: `src/utils/passiveListeners.ts`
- **Funkcja**: Automatycznie ustawia `passive: true` dla scroll-related events
- **Efekt**: Pozwala przeglądarce na natychmiastowe przewijanie bez czekania na event handler

### 2. Optymalizowane ScrollArea
- **Plik**: `src/components/common/OptimizedScrollArea.tsx`
- **Funkcja**: Wrapper dla Mantine ScrollArea z dodatkowymi optymalizacjami
- **Właściwości**:
  - `transform: translateZ(0)` - hardware acceleration
  - `overscrollBehavior: contain` - ogranicza overscroll
  - `contain: layout style paint` - Containment API

### 3. CSS Optymalizacje
- **Plik**: `src/optimizations.css`
- **Funkcja**: Globalne style dla lepszej wydajności scroll
- **Zawiera**:
  - Hardware acceleration dla ScrollArea
  - Optymalizacje dla Lightweight Charts
  - Containment API dla list

### 4. Throttling z requestAnimationFrame
- **Plik**: `src/hooks/useThrottledCallback.ts`
- **Funkcja**: Improved throttling using RAF for 60fps performance
- **Efekt**: Smoother animations and reduced CPU usage

### 5. Monitoring Wydajności
- **Plik**: `src/utils/scrollPerformanceMonitor.ts`
- **Funkcja**: Monitoruje metryki scroll performance w development mode
- **Loguje**: wheel events, delays, passive/active listeners count

### 6. Vite Build Optymalizacje
- **Plik**: `vite.config.ts`
- **Dodane**:
  - Manual chunks dla lepszego code splitting
  - Optymalizacja bundle size
  - Terser optimizations

## Jak Testować

### 1. Uruchom aplikację:
```bash
cd frontend
npm run dev
```

### 2. Otwórz Chrome DevTools:
- F12 → Console
- Sprawdź czy nie ma więcej komunikatów o passive listeners
- Sprawdź logi z monitoring wydajności (co 30s w dev mode)

### 3. Testuj przewijanie:
- Panel Orders - tabele z dużą ilością danych
- Panel Market - wykresy Lightweight Charts
- Długie listy w AssetSelector

### 4. Sprawdź Performance tab:
- F12 → Performance
- Nagrywanie podczas przewijania
- Sprawdź Frame Rate i Main Thread blocking

## Oczekiwane Rezultaty

### Przed optymalizacją:
- Komunikaty o non-passive listeners
- Opóźnienia 100-400ms w wheel events
- Frame drops podczas przewijania
- "Przytinanie" UI

### Po optymalizacji:
- Brak komunikatów o passive listeners
- Opóźnienia < 16ms (60fps)
- Płynne przewijanie
- Lepszy response na scroll

## Monitoring w Produkcji

Monitoring jest włączony tylko w development mode. W produkcji można włączyć selektywnie:

```typescript
import { scrollPerformanceMonitor } from './utils/scrollPerformanceMonitor';

// Włącz monitoring
scrollPerformanceMonitor.startMonitoring();

// Sprawdź metryki
console.log(scrollPerformanceMonitor.getMetrics());

// Wyłącz monitoring
scrollPerformanceMonitor.stopMonitoring();
```

## Dodatkowe Rekomendacje

### 1. Virtual Scrolling
Dla bardzo długich list (>1000 elementów) rozważ virtual scrolling:
```bash
npm install @tanstack/react-virtual
```

### 2. React.memo dla komponentów
Komponenty często re-renderowane powinny używać React.memo:
```typescript
export default React.memo(Component);
```

### 3. useMemo dla dużych obliczeń
```typescript
const expensiveValue = useMemo(() => {
  return computeExpensiveValue(data);
}, [data]);
```

### 4. Debouncing dla search
```typescript
const debouncedSearch = useMemo(
  () => debounce(search, 300),
  [search]
);
```

## Troubleshooting

### Jeśli nadal występują problemy:

1. **Sprawdź Browser Extensions**: Wyłącz wszystkie extensiony
2. **Hardware Acceleration**: Sprawdź chrome://settings/system
3. **Memory**: Monitor czy nie ma memory leaks
4. **Network**: Sprawdź czy nie ma problemów z WebSocket

### Debug Tools:
```javascript
// Console commands dla debugowania
scrollPerformanceMonitor.logMetrics();
performance.mark('scroll-start');
performance.mark('scroll-end');
performance.measure('scroll-duration', 'scroll-start', 'scroll-end');
```
