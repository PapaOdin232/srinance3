import { render, screen, waitFor, act } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import '@testing-library/jest-dom';
import MarketPanel from './MarketPanel';

// Ensure a basic import.meta.env exists (setupTests defines defaults)
(global as any).import = (global as any).import || { meta: { env: { DEV: false } } } as any;

// Mock ConnectionManager used by MarketDataService
jest.mock('../services/websocket/ConnectionManager', () => {
  const mm = {
    connect: jest.fn(() => 'ws://localhost:8001/ws/market'),
    subscribe: jest.fn(),
    unsubscribe: jest.fn(),
    send: jest.fn(),
    getState: jest.fn(() => 'CONNECTED')
  };
  return {
    __esModule: true,
    connectionManager: mm,
    ConnectionState: {
      CONNECTING: 'CONNECTING',
      CONNECTED: 'CONNECTED',
      DISCONNECTED: 'DISCONNECTED',
      RECONNECTING: 'RECONNECTING',
      ERROR: 'ERROR'
    }
  };
});

let mockConnectionManager: any;

// Mock BinanceWSClient used by ChartDataService with captured listener
let capturedBinanceListener: any = null;
const mockBinanceWSClient = {
  addListener: jest.fn((cb: any) => { capturedBinanceListener = cb; }),
  destroy: jest.fn()
};
jest.mock('../services/binanceWSClient', () => {
  const ctor = jest.fn(function (this: any, _symbol?: string, _interval?: string) {
    return mockBinanceWSClient;
  });
  return { __esModule: true, default: ctor, __getListener: () => capturedBinanceListener };
});

// Mock hooks and REST utils used elsewhere by MarketPanel
jest.mock('../services/restClient', () => ({
  getCurrentTicker: jest.fn(async (symbol: string) => ({ symbol, price: '45000.00', change: '1000.00', changePercent: '2.27%' })),
  getOrderBook: jest.fn(async (symbol: string) => ({ symbol, bids: [['45000.00','1.0']], asks: [['45001.00','1.5']] }))
}));
jest.mock('../hooks/useAssets', () => ({
  useAssets: () => ({
    assets: [{ symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT', price: 45000, priceChange: 1000, priceChangePercent: 2.27, volume: 1_000_000, count: 1, status: 'TRADING' }],
    loading: false,
    error: null,
    refetch: jest.fn(),
    isConnected: true,
    setPreferredQuotes: jest.fn()
  })
}));

// Mock SimpleChart to capture props
let lastSimpleChartProps: any = null;
jest.mock('./SimpleChart', () => ({
  __esModule: true,
  default: (props: any) => {
    lastSimpleChartProps = props;
    return <div data-testid="simple-chart" />;
  }
}));

// Mock lightweight-charts to avoid any side-effects if imported indirectly
jest.mock('lightweight-charts', () => ({
  createChart: jest.fn(() => ({
    addCandlestickSeries: jest.fn(() => ({ setData: jest.fn(), update: jest.fn(), applyOptions: jest.fn() })),
    timeScale: jest.fn(() => ({ fitContent: jest.fn() })),
    remove: jest.fn(),
    applyOptions: jest.fn(),
  })),
}));

jest.mock('../services/binanceAPI', () => ({
  fetchLightweightChartsKlines: jest.fn(async (_symbol: string, _interval: string, limit: number) => Array.from({ length: limit }, (_, i) => ({
    time: 1700000000 + i * 60,
    open: 100 + i,
    high: 101 + i,
    low: 99 + i,
    close: 100.5 + i,
  }))),
  convertToLightweightChartsFormat: jest.requireActual('../services/binanceAPI').convertToLightweightChartsFormat
}));

describe('MarketPanel - Ticker and OrderBook Integration', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  (process as any).env.VITE_ENABLE_BINANCE_STREAMS = 'true';
  lastSimpleChartProps = null;
  mockConnectionManager = require('../services/websocket/ConnectionManager').connectionManager;

    // Mock fetch for Binance REST endpoints used by MarketDataService
    (global as any).fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : (input as any).url || String(input);
      if (url.includes('/api/v3/klines')) {
        // Return Binance-like array of arrays
        const now = Date.now();
        const data = Array.from({ length: 5 }, (_, i) => {
          const openTime = now - (5 - i) * 60_000;
          const closeTime = openTime + 60_000;
          const open = 44000 + i * 10;
          const high = open + 20;
          const low = open - 20;
          const close = open + 5;
          const volume = 1 + i;
          return [
            openTime,              // 0 open time
            String(open),          // 1 open
            String(high),          // 2 high
            String(low),           // 3 low
            String(close),         // 4 close
            String(volume),        // 5 volume
            closeTime,             // 6 close time
          ];
        });
        return { ok: true, json: async () => data } as any;
      }
      if (url.includes('/api/v3/ticker/24hr')) {
        return { ok: true, json: async () => ({
          lastPrice: '45000.00', priceChange: '1000.00', priceChangePercent: '2.27', volume: '0', highPrice: '0', lowPrice: '0'
        }) } as any;
      }
      if (url.includes('/api/v3/depth')) {
        return { ok: true, json: async () => ({
          bids: [['45000.00','1.0'], ['44999.00','2.0']],
          asks: [['45001.00','1.5'], ['45002.00','0.5']]
        }) } as any;
      }
      return { ok: true, json: async () => ({}) } as any;
    });

    // Ensure historical klines are non-empty via marketDataService spy
    const mds = require('../services/market/MarketDataService');
    const base = Date.now() - 5 * 60_000;
    const klines = Array.from({ length: 5 }, (_, i) => ({
      symbol: 'BTCUSDT',
      interval: '5m',
      openTime: base + i * 60_000,
      closeTime: base + (i + 1) * 60_000,
      open: 44000 + i * 10,
      high: 44020 + i * 10,
      low: 43980 + i * 10,
      close: 44005 + i * 10,
      volume: 1 + i,
      timestamp: Date.now()
    }));
    jest.spyOn(mds.marketDataService, 'getKlines').mockResolvedValue(klines);
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  const renderWithTimers = () => {
    render(<MantineProvider><MarketPanel /></MantineProvider>);
    act(() => {
      jest.runAllTimers();
    });
  };

  test('should handle ticker message from backend WebSocket', async () => {
  renderWithTimers();
    
  // Wait for backend WS subscription via ConnectionManager
  await waitFor(() => expect(mockConnectionManager.subscribe).toHaveBeenCalled());
  const subscribed = mockConnectionManager.subscribe.mock.calls.find((c: any[]) => typeof c[1]?.onMessage === 'function');
  const wsListener = subscribed?.[1]?.onMessage;
  expect(typeof wsListener).toBe('function');
    
    // Simulate receiving ticker message
    const tickerMessage = {
      type: 'ticker',
      symbol: 'BTCUSDT',
      price: '45000.00',
      change: '1000.00',
      changePercent: '2.27'
    };
    
    act(() => {
      wsListener(tickerMessage);
    });
    
    // Wait for state updates
  // Poczekaj aż główny widok wyjdzie z ekranu ładowania
  await waitFor(() => expect(screen.getByText('Panel Rynkowy')).toBeInTheDocument());
  // PriceDisplay rozbija dane na różne elementy - sprawdzamy symbol i cenę oddzielnie
  expect(screen.getByText('BTC/USDT')).toBeInTheDocument();
  // Cena może pojawić się też w OrderBook – dopuszczamy wiele trafień
  expect(screen.getAllByText('$45,000.00').length).toBeGreaterThan(0);
  expect(screen.getByText('+1,000.00')).toBeInTheDocument();
  });

  test('should handle orderbook message from backend WebSocket', async () => {
  renderWithTimers();
  await waitFor(() => expect(mockConnectionManager.subscribe).toHaveBeenCalled());
  const subscribed = mockConnectionManager.subscribe.mock.calls.find((c: any[]) => typeof c[1]?.onMessage === 'function');
  const wsListener = subscribed?.[1]?.onMessage;
  expect(typeof wsListener).toBe('function');
    // Provide ticker first so panel can exit initializing state
    act(() => {
      wsListener({
        type: 'ticker',
        symbol: 'BTCUSDT',
        price: '45000.00',
        change: '1000.00',
        changePercent: '2.27'
      });
    });
    
    // Simulate receiving orderbook message
    const orderbookMessage = {
      type: 'orderbook',
      symbol: 'BTCUSDT',
      bids: [['45000.00', '1.0'], ['44999.00', '2.0']],
      asks: [['45001.00', '1.5'], ['45002.00', '0.5']]
    };
    
    act(() => {
      wsListener(orderbookMessage);
    });
    
    // Wait for state updates
  await waitFor(() => expect(screen.getByText('Panel Rynkowy')).toBeInTheDocument());
  // Nagłówek i symbol są w oddzielnych elementach
  expect(screen.getByText('Księga Zleceń')).toBeInTheDocument();
  expect(screen.getAllByText('BTCUSDT').length).toBeGreaterThan(0);
  // Ceny w OrderBook są sformatowane z symbolem dolara i separatorami
  expect(screen.getAllByText('$45,000.00').length).toBeGreaterThan(0);
  expect(screen.getAllByText('$45,001.00').length).toBeGreaterThan(0);
  });

  test('should filter out ticker messages for unselected symbols', async () => {
  renderWithTimers();
  await waitFor(() => expect(mockConnectionManager.subscribe).toHaveBeenCalled());
  const subscribed = mockConnectionManager.subscribe.mock.calls.find((c: any[]) => typeof c[1]?.onMessage === 'function');
  const wsListener = subscribed?.[1]?.onMessage;
  expect(typeof wsListener).toBe('function');
    
    // Simulate receiving ticker message for different symbol
    const tickerMessage = {
      type: 'ticker',
      symbol: 'ETHUSDT',
      price: '3000.00',
      change: '100.00',
      changePercent: '3.45'
    };
    
    act(() => {
      wsListener(tickerMessage);
    });
    
    // Should not update UI for unselected symbol
    await waitFor(() => {
      expect(screen.queryByText(/ETHUSDT/)).not.toBeInTheDocument();
    });
  });

  test('should update chart with Binance kline data', async () => {
  renderWithTimers();
  // Złap backend listener i wyślij ticker+orderbook, aby wyjść z inicjalizacji
  await waitFor(() => expect(mockConnectionManager.subscribe).toHaveBeenCalled());
  const subscribed = mockConnectionManager.subscribe.mock.calls.find((c: any[]) => typeof c[1]?.onMessage === 'function');
  const wsListener = subscribed?.[1]?.onMessage;
  expect(typeof wsListener).toBe('function');
  act(() => {
    wsListener({ type: 'ticker', symbol: 'BTCUSDT', price: '45000.00', change: '1000.00', changePercent: '2.27' });
    wsListener({ type: 'orderbook', symbol: 'BTCUSDT', bids: [['45000.00','1.0']], asks: [['45001.00','1.5']] });
  });
  // Upewnij się, że panel wyszedł ze stanu inicjalizacji i SimpleChart jest wyrenderowany
  await waitFor(() => expect(screen.getByText('Panel Rynkowy')).toBeInTheDocument());
  // ChartDataService uruchamia WS z opóźnieniem ~200ms – przesuwamy zegar
  act(() => {
    jest.advanceTimersByTime(300);
  });
  // Pobierz listener z mocka
  const { __getListener } = require('../services/binanceWSClient');
  await waitFor(() => expect(__getListener()).toBeTruthy());
  const binanceListener = __getListener();
  expect(typeof binanceListener).toBe('function');
    
    // Simulate receiving kline data
    const klineData = {
      e: 'kline',
      s: 'BTCUSDT',
      k: {
        t: 1640995200000, // open time
        T: 1640995500000, // close time (t + 5m)
        i: '5m', // interval required by service
        o: '44000.00',
        h: '45000.00',
        l: '43500.00',
        c: '44800.00',
        v: '12.34',
        x: true // kline closed
      }
    };
    
    act(() => {
      binanceListener(klineData);
    });
    
    // Verify SimpleChart received realtimeCandle via props
    await waitFor(() => {
      expect(lastSimpleChartProps?.realtimeCandle).toEqual({
        time: 1640995200,
        open: 44000.0,
        high: 45000.0,
        low: 43500.0,
        close: 44800.0,
        volume: expect.any(Number)
      });
    });
  });
});
