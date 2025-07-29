import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import MarketPanel from './MarketPanel';

// Mock dependencies
jest.mock('../services/wsClient');
jest.mock('../services/binanceWSClient');
jest.mock('../hooks/useLightweightChart');

const mockEnhancedWSClient = {
  addListener: jest.fn(),
  addStateListener: jest.fn(),
  send: jest.fn(),
  destroy: jest.fn(),
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
    jest.clearAllMocks();
    
    // Mock EnhancedWSClient
    require('../services/wsClient').EnhancedWSClient = jest.fn(() => mockEnhancedWSClient);
    
    // Mock BinanceWSClient
    require('../services/binanceWSClient').default = jest.fn(() => mockBinanceWSClient);
    
    // Mock chart hook
    require('../hooks/useLightweightChart').default = jest.fn(() => mockChart);
  });

  test('should handle ticker message from backend WebSocket', async () => {
    render(<MarketPanel />);
    
    // Get the WebSocket listener that was added
    const wsListener = mockEnhancedWSClient.addListener.mock.calls[0][0];
    
    // Simulate receiving ticker message
    const tickerMessage = {
      type: 'ticker',
      symbol: 'BTCUSDT',
      price: '45000.00',
      change: '1000.00',
      changePercent: '2.27'
    };
    
    wsListener(tickerMessage);
    
    // Wait for state updates
    await waitFor(() => {
      expect(screen.getByText(/BTCUSDT: \$45000.00/)).toBeInTheDocument();
      expect(screen.getByText(/\+1000.00 \(2.27\)/)).toBeInTheDocument();
    });
  });

  test('should handle orderbook message from backend WebSocket', async () => {
    render(<MarketPanel />);
    
    // Get the WebSocket listener that was added
    const wsListener = mockEnhancedWSClient.addListener.mock.calls[0][0];
    
    // Simulate receiving orderbook message
    const orderbookMessage = {
      type: 'orderbook',
      symbol: 'BTCUSDT',
      bids: [['45000.00', '1.0'], ['44999.00', '2.0']],
      asks: [['45001.00', '1.5'], ['45002.00', '0.5']]
    };
    
    wsListener(orderbookMessage);
    
    // Wait for state updates
    await waitFor(() => {
      expect(screen.getByText('Księga Zleceń - BTCUSDT')).toBeInTheDocument();
      expect(screen.getByText('45000.00')).toBeInTheDocument();
      expect(screen.getByText('45001.00')).toBeInTheDocument();
    });
  });

  test('should filter out ticker messages for unselected symbols', async () => {
    render(<MarketPanel />);
    
    // Get the WebSocket listener that was added
    const wsListener = mockEnhancedWSClient.addListener.mock.calls[0][0];
    
    // Simulate receiving ticker message for different symbol
    const tickerMessage = {
      type: 'ticker',
      symbol: 'ETHUSDT',
      price: '3000.00',
      change: '100.00',
      changePercent: '3.45'
    };
    
    wsListener(tickerMessage);
    
    // Should not update UI for unselected symbol
    await waitFor(() => {
      expect(screen.queryByText(/ETHUSDT/)).not.toBeInTheDocument();
    });
  });

  test('should update chart with Binance kline data', async () => {
    render(<MarketPanel />);
    
    // Get the Binance WebSocket listener that was added
    const binanceListener = mockBinanceWSClient.addListener.mock.calls[0][0];
    
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
    
    binanceListener(klineData);
    
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
