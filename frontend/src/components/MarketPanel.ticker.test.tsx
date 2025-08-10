import { render, screen, waitFor, act } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import '@testing-library/jest-dom';
import MarketPanel from './MarketPanel';

// Mock dependencies
jest.mock('../services/wsClient', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => mockEnhancedWSClient),
  ConnectionState: {
    CONNECTED: 'CONNECTED',
    DISCONNECTED: 'DISCONNECTED',
    ERROR: 'ERROR'
  },
  getConnectionStateDisplay: jest.fn(() => ({ icon: '🟢', text: 'Połączony', color: '#4CAF50' }))
}));
jest.mock('../services/binanceWSClient');
jest.mock('../hooks/useLightweightChart');
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
jest.mock('lightweight-charts', () => ({
  createChart: jest.fn(() => ({
    addSeries: jest.fn(() => ({ setData: jest.fn(), update: jest.fn(), applyOptions: jest.fn() })),
    addCandlestickSeries: jest.fn(() => ({ setData: jest.fn(), update: jest.fn(), applyOptions: jest.fn() })),
    timeScale: jest.fn(() => ({ fitContent: jest.fn() })),
    remove: jest.fn(),
    applyOptions: jest.fn(),
  })),
  CandlestickSeries: jest.fn(),
}));
jest.mock('../services/binanceAPI', () => ({
  fetchLightweightChartsKlines: jest.fn(async (_symbol: string, _interval: string, limit: number) => Array.from({ length: limit }, (_, i) => ({
    time: 1700000000 + i * 60,
    open: 100 + i,
    high: 101 + i,
    low: 99 + i,
    close: 100.5 + i,
  })))
}));

const mockEnhancedWSClient = {
  addListener: jest.fn(),
  addStateListener: jest.fn((cb?: any) => cb && cb('CONNECTED')),
  send: jest.fn(),
  destroy: jest.fn(),
  isConnected: jest.fn(() => true)
};

const mockBinanceWSClient = {
  addListener: jest.fn(),
  destroy: jest.fn(),
};

const mockChart = {
  chartContainerRef: { current: null },
  setHistoricalData: jest.fn(),
  updateCandlestick: jest.fn(),
  fitContent: jest.fn(),
};

describe('MarketPanel - Ticker and OrderBook Integration', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    // EnhancedWSClient mock already provided by jest.mock above
    // Mock BinanceWSClient
    require('../services/binanceWSClient').default = jest.fn(() => mockBinanceWSClient);
    
    // Mock chart hook
    require('../hooks/useLightweightChart').default = jest.fn(() => mockChart);
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  const renderWithTimers = () => {
    process.env.VITE_ENABLE_BINANCE_STREAMS = 'true';
    render(<MantineProvider><MarketPanel /></MantineProvider>);
    act(() => {
      jest.runAllTimers();
    });
  };

  test('should handle ticker message from backend WebSocket', async () => {
  renderWithTimers();
    
  // Wait for listener attachment
  await waitFor(() => expect(mockEnhancedWSClient.addListener).toHaveBeenCalled());
  const wsListener = mockEnhancedWSClient.addListener.mock.calls[0]?.[0];
  expect(wsListener).toBeDefined();
    
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
  // PriceDisplay rozbija dane na różne elementy - sprawdzamy symbol i cenę oddzielnie
  await waitFor(() => expect(screen.getByText('BTC/USDT')).toBeInTheDocument());
  expect(screen.getByText('$45,000.00')).toBeInTheDocument();
  expect(screen.getByText('+1,000.00')).toBeInTheDocument();
  });

  test('should handle orderbook message from backend WebSocket', async () => {
  renderWithTimers();
  await waitFor(() => expect(mockEnhancedWSClient.addListener).toHaveBeenCalled());
  const wsListener = mockEnhancedWSClient.addListener.mock.calls[0]?.[0];
  expect(wsListener).toBeDefined();
    
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
  await waitFor(() => expect(screen.getByText('Księga Zleceń - BTCUSDT')).toBeInTheDocument());
  expect(screen.getAllByText('45000.00').length).toBeGreaterThan(0);
  expect(screen.getAllByText('45001.00').length).toBeGreaterThan(0);
  });

  test('should filter out ticker messages for unselected symbols', async () => {
  renderWithTimers();
  await waitFor(() => expect(mockEnhancedWSClient.addListener).toHaveBeenCalled());
  const wsListener = mockEnhancedWSClient.addListener.mock.calls[0]?.[0];
  expect(wsListener).toBeDefined();
    
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
  await waitFor(() => expect(mockBinanceWSClient.addListener).toHaveBeenCalled());
  const binanceListener = mockBinanceWSClient.addListener.mock.calls[0]?.[0];
  expect(binanceListener).toBeDefined();
    
    // Simulate receiving kline data
    const klineData = {
      s: 'BTCUSDT',
      k: {
        t: 1640995200000, // timestamp
        o: '44000.00',
        h: '45000.00',
        l: '43500.00',
        c: '44800.00',
        x: true // kline closed
      }
    };
    
    act(() => {
      binanceListener(klineData);
    });
    
    // Verify chart update was called
    expect(mockChart.updateCandlestick).toHaveBeenCalledWith({
      time: 1640995200, // converted to seconds
      open: 44000.00,
      high: 45000.00,
      low: 43500.00,
      close: 44800.00
    });
  });
});
