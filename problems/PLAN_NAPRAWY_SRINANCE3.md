# Plan Naprawy Problemów Srinance 3

## Przegląd Problemów

Po kompleksowej analizie kodu (filesystem), kontroli jakości (Codacy) i dokumentacji, zidentyfikowałem następujące kluczowe problemy:

### 🔴 Krytyczne
1. **Brak adaptera daty Chart.js** - wykres nie wyświetla się z osią czasową
2. **Konflik async/sync w backend** - błąd 500 w `/ticker` endpoint
3. **Problemy z cyklem życia WebSocket** - wiele połączeń, brak zamykania

### 🟡 Średnie
4. **Potencjalne problemy z CORS** - blokowanie żądań międzydomenowych
5. **React Strict Mode conflicts** - podwójne wywoływanie useEffect
6. **Brak integracji danych UI** - dane WebSocket nie aktualizują interfejsu

---

## 1. 🛠️ Naprawa Chart.js - Adapter Daty

### Problem
Błąd: *"This method is not implemented: Check that a complete date adapter is provided"*

**Przyczyna**: W `MarketPanel.tsx` używana jest skala `type: 'time'`, ale brakuje adaptera daty w zależnościach.

### Rozwiązanie

#### Krok 1.1: Instalacja adaptera daty
```bash
cd /Users/michalstrzalkowski/srinance3/frontend
npm install chartjs-adapter-date-fns date-fns
```

#### Krok 1.2: Import adaptera w MarketPanel.tsx
```typescript
// Dodaj na początku pliku /frontend/src/components/MarketPanel.tsx
import 'chartjs-adapter-date-fns';
```

#### Krok 1.3: Aktualizacja konfiguracji Chart.js
```typescript
// W MarketPanel.tsx, zmień chartConfig:
const chartConfig: ChartConfiguration = {
  type: 'line',
  data: {
    labels: [],
    datasets: [{
      label: `${selectedSymbol} Price`,
      data: [],
      borderColor: '#10B981',
      backgroundColor: 'rgba(16, 185, 129, 0.1)',
      tension: 0.1,
      fill: true
    }]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top'
      }
    },
    scales: {
      x: {
        type: 'time',
        time: {
          unit: 'minute',
          displayFormats: {
            minute: 'HH:mm'
          }
        },
        adapters: {
          date: {
            locale: 'pl' // opcjonalnie
          }
        }
      },
      y: {
        beginAtZero: false,
        title: {
          display: true,
          text: 'Cena (USDT)'
        }
      }
    }
  }
};
```

#### Krok 1.4: Naprawa dodawania danych w czasie rzeczywistym
```typescript
// W MarketPanel.tsx, popraw metodę addDataPoint:
if (chartInstance) {
  const now = new Date();
  const priceValue = parseFloat(msg.price as string);
  addDataPoint(now, 0, priceValue, 100); // Date object zamiast string
}
```

---

## 2. 🔗 Naprawa Backend - Async/Sync Konflikt

### Problem
Endpoint `/ticker` zwraca błąd 500 przez konflikt async/sync w `BinanceClient`.

**Przyczyna**: W `main.py` wywoływane jest `await binance_client.get_ticker()`, ale implementacja w `BinanceRESTClient.get_ticker()` jest synchroniczna.

### Rozwiązanie

#### Krok 2.1: Popraw BinanceClient - używaj asyncio.to_thread
```python
# W /backend/binance_client.py, zmień klasę BinanceClient:
import asyncio
from typing import Optional, Dict, Any

class BinanceClient(BinanceRESTClient):
    """Enhanced Binance client with both REST and WebSocket support."""
    
    def __init__(self):
        super().__init__()
        self.ws_client = None
    
    async def initialize(self):
        """Initialize the client (placeholder for async initialization)"""
        print("[DEBUG] BinanceClient initialized")
    
    async def close(self):
        """Close the client and clean up resources"""
        if self.ws_client:
            self.ws_client.close()
    
    async def get_ticker(self, symbol: str) -> Optional[Dict[str, Any]]:
        """Async wrapper for get_ticker using thread executor"""
        try:
            # Uruchom synchroniczną funkcję w osobnym wątku
            result = await asyncio.to_thread(super().get_ticker, symbol)
            return result
        except Exception as e:
            print(f"[ERROR] get_ticker failed for {symbol}: {e}")
            return None
    
    async def get_order_book(self, symbol: str, limit: int = 20) -> Optional[Dict[str, Any]]:
        """Async wrapper for get_orderbook using thread executor"""
        try:
            result = await asyncio.to_thread(super().get_orderbook, symbol, limit)
            return result
        except Exception as e:
            print(f"[ERROR] get_order_book failed for {symbol}: {e}")
            return None

    async def get_account_info_async(self) -> Optional[Dict[str, Any]]:
        """Async wrapper for get_account_info"""
        try:
            result = await asyncio.to_thread(super().get_account_info)
            return result
        except Exception as e:
            print(f"[ERROR] get_account_info failed: {e}")
            return None
```

#### Krok 2.2: Dodaj error handling w REST endpoints
```python
# W /backend/main.py, zmień endpoint /ticker:
@app.get("/ticker")
async def get_ticker(symbol: str):
    """Get ticker information for a symbol"""
    try:
        if not binance_client:
            logger.error("Binance client not available")
            raise HTTPException(status_code=503, detail="Binance client not available")
        
        ticker = await binance_client.get_ticker(symbol)
        if ticker is None:
            logger.error(f"Failed to get ticker for {symbol}")
            raise HTTPException(status_code=404, detail=f"Ticker not found for symbol {symbol}")
        
        return ticker
    except HTTPException:
        raise  # Re-raise HTTP exceptions
    except Exception as e:
        logger.error(f"Ticker endpoint error for {symbol}: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")
```

#### Krok 2.3: Dodaj import brakujących modułów
```python
# Na początku /backend/main.py, dodaj:
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
```

---

## 3. 🌐 Naprawa WebSocket - Zarządzanie Połączeniami

### Problem
Aplikacja otwiera wiele połączeń WebSocket bez zamykania poprzednich, co powoduje wyczerpanie zasobów.

**Przyczyna**: React Strict Mode wywołuje useEffect dwukrotnie, a cleanup nie zawsze działa poprawnie.

### Rozwiązanie

#### Krok 3.1: Poprawa cleanup w MarketPanel.tsx
```typescript
// W /frontend/src/components/MarketPanel.tsx, zmień useEffect:
useEffect(() => {
  let mounted = true;
  let wsClientRef: EnhancedWSClient | null = null;
  
  const setupWebSocket = () => {
    // Cleanup poprzedniego połączenia
    if (wsClientRef) {
      wsClientRef.destroy();
      wsClientRef = null;
    }
    
    if (!mounted) return;
    
    const wsClient = new EnhancedWSClient('ws://localhost:8000/ws/market', {
      reconnectInterval: 2000,
      maxReconnectInterval: 30000,
      maxReconnectAttempts: 5,
      heartbeatInterval: 30000,
      debug: true
    });
    
    wsClientRef = wsClient;
    
    // Connection state listener
    wsClient.addStateListener((state, error) => {
      if (!mounted) return;
      
      setConnectionState(state);
      setConnectionError(error || null);
      
      if (state === ConnectionState.CONNECTED) {
        // Subscribe to symbol when connected
        wsClient.send({ 
          type: 'subscribe', 
          symbol: selectedSymbol 
        });
      }
    });
    
    // Message listener
    wsClient.addListener((msg) => {
      if (!mounted) return;
      
      switch (msg.type) {
        case 'ticker':
          if (msg.symbol === selectedSymbol) {
            setTicker(prevTicker => ({
              symbol: msg.symbol as string,
              price: msg.price as string,
              change: prevTicker?.change || '0',
              changePercent: prevTicker?.changePercent || '0%'
            }));
            
            // Update chart with real-time price
            if (chartInstance) {
              const now = new Date();
              addDataPoint(now, 0, parseFloat(msg.price as string), 100);
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
  
  // Delay to prevent rapid reconnections in React Strict Mode
  const timeoutId = setTimeout(() => {
    setupWebSocket();
    loadInitialData(selectedSymbol);
  }, 100);
  
  return () => {
    mounted = false;
    clearTimeout(timeoutId);
    if (wsClientRef) {
      wsClientRef.destroy();
      wsClientRef = null;
    }
  };
}, [selectedSymbol, chartInstance, addDataPoint]); // Dodaj chartInstance do dependencies
```

#### Krok 3.2: Dodaj connection pooling w backend
```python
# W /backend/main.py, dodaj limit połączeń:
class ConnectionManager:
    def __init__(self, max_connections: int = 10):
        self.market_connections: List[WebSocket] = []
        self.bot_connections: List[WebSocket] = []
        self.heartbeat_tasks: Dict[WebSocket, asyncio.Task] = {}
        self.max_connections = max_connections
    
    async def connect_market(self, websocket: WebSocket):
        # Sprawdź limit połączeń
        if len(self.market_connections) >= self.max_connections:
            await websocket.close(code=1008, reason="Connection limit exceeded")
            logger.warning(f"Market connection limit exceeded. Current: {len(self.market_connections)}")
            return 0
        
        await websocket.accept()
        self.market_connections.append(websocket)
        logger.info(f"Market WebSocket connected. Total connections: {len(self.market_connections)}")
        
        # Start heartbeat for this connection
        task = asyncio.create_task(self._heartbeat_loop(websocket))
        self.heartbeat_tasks[websocket] = task
        
        return len(self.market_connections)
```

---

## 4. 🔧 Naprawa CORS i Authorization

### Problem
Błędy CORS mogą blokować żądania, szczególnie z nagłówkami Authorization.

### Rozwiązanie

#### Krok 4.1: Sprawdź konfigurację CORS
```python
# W /backend/main.py, upewnij się że CORS jest poprawnie skonfigurowany:
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173", "http://127.0.0.1:3000", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"]
)
```

#### Krok 4.2: Usuń Authorization header z REST klienta
```typescript
// W /frontend/src/services/restClient.ts, zmień konfigurację:
const API_BASE_URL = getEnvVar('VITE_API_URL', 'http://localhost:8000');

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
    // Usuń Authorization header jeśli nie jest używany
    // 'Authorization': `Bearer ${AUTH_TOKEN}`,
  },
});

// Dodaj interceptor dla error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      console.error('Unauthorized access');
    } else if (error.response?.status === 403) {
      console.error('Forbidden access');
    } else if (error.response?.status >= 500) {
      console.error('Server error:', error.response?.data);
    }
    return Promise.reject(error);
  }
);
```

---

## 5. ⚛️ Naprawa React Issues i UI Updates

### Problem
Komponenty nie aktualizują się poprawnie z danymi WebSocket, React Strict Mode powoduje podwójne wywołania.

### Rozwiązanie

#### Krok 5.1: Popraw zarządzanie stanem w MarketPanel
```typescript
// W /frontend/src/components/MarketPanel.tsx, dodaj useMemo dla stabilnych referencji:
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';

const MarketPanel: React.FC = () => {
  // ... existing state ...

  // Stabilne referencje dla useEffect dependencies
  const stableAddDataPoint = useCallback((label: any, datasetIndex: number, value: any, maxPoints?: number) => {
    addDataPoint(label, datasetIndex, value, maxPoints);
  }, [addDataPoint]);

  const stableUpdateChart = useCallback((data: any, options?: any) => {
    updateChart(data, options);
  }, [updateChart]);

  // Memoized chart config
  const memoizedChartConfig = useMemo(() => ({
    type: 'line' as const,
    data: {
      labels: [],
      datasets: [{
        label: `${selectedSymbol} Price`,
        data: [],
        borderColor: '#10B981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        tension: 0.1,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        intersect: false,
        mode: 'index' as const,
      },
      plugins: {
        legend: {
          display: true,
          position: 'top' as const
        },
        tooltip: {
          mode: 'index' as const,
          intersect: false,
        }
      },
      scales: {
        x: {
          type: 'time' as const,
          time: {
            unit: 'minute' as const,
            displayFormats: {
              minute: 'HH:mm'
            }
          },
          title: {
            display: true,
            text: 'Czas'
          }
        },
        y: {
          beginAtZero: false,
          title: {
            display: true,
            text: 'Cena (USDT)'
          }
        }
      }
    }
  }), [selectedSymbol]);

  // Use memoized config in useChart
  const { chartRef, chartInstance, addDataPoint, updateChart } = useChart(
    memoizedChartConfig, 
    [selectedSymbol]
  );

  // ... rest of component with updated useEffect using stableAddDataPoint
};
```

#### Krok 5.2: Dodaj debugowanie i monitoring
```typescript
// W /frontend/src/components/MarketPanel.tsx, dodaj console logs dla debugowania:
useEffect(() => {
  console.log(`[MarketPanel] Setting up WebSocket for ${selectedSymbol}`);
  // ... existing WebSocket setup ...
  
  return () => {
    console.log(`[MarketPanel] Cleaning up WebSocket for ${selectedSymbol}`);
    // ... existing cleanup ...
  };
}, [selectedSymbol, stableAddDataPoint]);

// Dodaj monitoring stanu połączenia
useEffect(() => {
  console.log(`[MarketPanel] Connection state changed: ${connectionState}`);
  if (connectionError) {
    console.error(`[MarketPanel] Connection error: ${connectionError}`);
  }
}, [connectionState, connectionError]);
```

---

## 6. 🏃‍♂️ Kroki Implementacji

### Priorytet 1 (Krytyczne - do zrobienia najpierw)
1. ✅ **Chart.js Date Adapter** (Kroki 1.1-1.4)
2. ✅ **Backend Async Fix** (Kroki 2.1-2.3)

### Priorytet 2 (Ważne - drugiej kolejności)
3. ✅ **WebSocket Cleanup** (Kroki 3.1-3.2)
4. ✅ **CORS Configuration** (Kroki 4.1-4.2)

### Priorytet 3 (Ulepszenia)
5. ✅ **React Optimizations** (Kroki 5.1-5.2)

---

## 7. 🧪 Testowanie

### Test 1: Chart.js
```bash
# Po instalacji adaptera, sprawdź czy wykres się wyświetla
cd frontend
npm run dev
# Otwórz http://localhost:5173, sprawdź Panel Rynkowy
```

### Test 2: Backend Endpoints
```bash
# Testuj endpoint ticker
curl -X GET "http://localhost:8000/ticker?symbol=BTCUSDT"
# Powinien zwrócić JSON z ceną, nie błąd 500
```

### Test 3: WebSocket
```bash
# Otwórz Developer Tools > Network > WS
# Sprawdź czy jest tylko jedno aktywne połączenie WebSocket
```

### Test 4: CORS
```bash
# W browser console, sprawdź czy nie ma błędów CORS
# Po naprawie powinny zniknąć błędy "Access-Control-Allow-Origin"
```

---

## 8. 📋 Checklist Weryfikacji

+ [x] **Chart.js wyświetla wykres z osią czasową**
+ [x] **Endpoint /ticker zwraca dane (nie błąd 500)**
+ [x] **WebSocket: tylko jedno połączenie w Network tab**
+ [x] **Brak błędów CORS w console**
+ [x] **Dane real-time aktualizują wykres**
+ [ ] **Panel konta wyświetla dane**
+ [ ] **Bot panel pokazuje status**
+ [ ] **Księga zleceń się aktualizuje**

---

## 9. 🔮 Następne Kroki (Po Naprawie)

1. **Performance**: Dodanie lazy loading dla komponentów
2. **Testing**: Unit tests dla WebSocket i REST API
3. **Security**: Implementacja proper authentication
4. **Monitoring**: Logging i error tracking
5. **Documentation**: API documentation z OpenAPI/Swagger

---

*Plan wygenerowany przez GitHub Copilot z analizą MCP (filesystem, codacy, sequential thinking) - 24 lipca 2025*