import { render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import TradingChart from './TradingChart';

// Mock fetch
global.fetch = jest.fn();

// Mock WebSocket
const mockWebSocket = {
  close: jest.fn(),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  onopen: jest.fn(),
  onclose: jest.fn(),
  onmessage: jest.fn(),
  onerror: jest.fn(),
  readyState: 1, // OPEN
  CLOSED: 3,
  OPEN: 1,
  CONNECTING: 0,
};

const WebSocketMock = jest.fn().mockImplementation(() => mockWebSocket);
(global as any).WebSocket = Object.assign(WebSocketMock, {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
});

// Mock dla lightweight-charts
const mockPriceScale = {
  applyOptions: jest.fn(),
};

const mockChart = {
  addSeries: jest.fn(),
  remove: jest.fn(),
  resize: jest.fn(),
  priceScale: jest.fn(() => mockPriceScale),
};

const mockSeries = {
  setData: jest.fn(),
  update: jest.fn(),
};

jest.mock('lightweight-charts', () => ({
  createChart: jest.fn(() => mockChart),
  CandlestickSeries: 'CandlestickSeries',
  HistogramSeries: 'HistogramSeries',
}));

const mockHistoricalData = [
  [1640995200000, '50000.00', '50500.00', '49500.00', '50200.00', '1000.00'],
  [1640995260000, '50200.00', '50800.00', '49800.00', '50600.00', '1200.00'],
  [1640995320000, '50600.00', '51000.00', '50300.00', '50800.00', '800.00'],
];

const renderWithMantine = (component: React.ReactElement) => {
  return render(
    <MantineProvider>
      {component}
    </MantineProvider>
  );
};

describe('TradingChart', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockChart.addSeries.mockReturnValue(mockSeries);
    (global.fetch as jest.Mock).mockResolvedValue({
      json: () => Promise.resolve(mockHistoricalData),
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renderuje się poprawnie z podstawowymi właściwościami', () => {
    renderWithMantine(<TradingChart symbol="BTCUSDT" interval="1h" />);
    
    expect(screen.getByText('BTCUSDT')).toBeInTheDocument();
    expect(screen.getByText('1h')).toBeInTheDocument();
  });

  it('tworzy wykres i serie po załadowaniu', async () => {
    renderWithMantine(<TradingChart symbol="BTCUSDT" interval="1h" />);
    
    await waitFor(() => {
      expect(mockChart.addSeries).toHaveBeenCalledTimes(2); // Candlestick + Volume
      expect(mockChart.addSeries).toHaveBeenCalledWith('CandlestickSeries', {});
      expect(mockChart.addSeries).toHaveBeenCalledWith('HistogramSeries', expect.objectContaining({
        priceFormat: { type: 'volume' },
        priceScaleId: '',
      }));
    });
  });

  it('konfiguruje skalę cen dla wolumenu', async () => {
    renderWithMantine(<TradingChart symbol="BTCUSDT" interval="1h" />);
    
    await waitFor(() => {
      expect(mockChart.priceScale).toHaveBeenCalledWith('');
      expect(mockPriceScale.applyOptions).toHaveBeenCalledWith({
        scaleMargins: {
          top: 0.7,
          bottom: 0,
        },
      });
    });
  });

  it('ładuje dane historyczne z API Binance', async () => {
    renderWithMantine(<TradingChart symbol="BTCUSDT" interval="1h" />);
    
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=500'
      );
    });
  });

  it('ustawia dane na seriach po załadowaniu', async () => {
    renderWithMantine(<TradingChart symbol="BTCUSDT" interval="1h" />);
    
    await waitFor(() => {
      expect(mockSeries.setData).toHaveBeenCalledTimes(2); // Candlestick + Volume data
    });
  });

  it('wyświetla aktualne dane OHLCV', async () => {
    renderWithMantine(<TradingChart symbol="BTCUSDT" interval="1h" />);
    
    await waitFor(() => {
      expect(screen.getByText('O: 50600.00')).toBeInTheDocument();
      expect(screen.getByText('H: 51000.00')).toBeInTheDocument();
      expect(screen.getByText('L: 50300.00')).toBeInTheDocument();
      expect(screen.getByText('C: 50800.00')).toBeInTheDocument();
      expect(screen.getByText('V: 800.00')).toBeInTheDocument();
    });
  });

  it('nie tworzy WebSocket połączenia w trybie development', () => {
    // Zapisz oryginalną wartość
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    renderWithMantine(<TradingChart symbol="BTCUSDT" interval="1h" />);
    
    expect(global.WebSocket).not.toHaveBeenCalled();
    
    // Przywróć oryginalną wartość
    process.env.NODE_ENV = originalEnv;
  });

  it('tworzy WebSocket połączenie w produkcji', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    renderWithMantine(<TradingChart symbol="BTCUSDT" interval="1h" />);
    
    expect(global.WebSocket).toHaveBeenCalledWith(
      'wss://data-stream.binance.vision/ws/btcusdt@kline_1h'
    );
    
    process.env.NODE_ENV = originalEnv;
  });

  it('obsługuje zmianę symbolu i interwału', async () => {
    const { rerender } = renderWithMantine(<TradingChart symbol="BTCUSDT" interval="1h" />);
    
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=500'
      );
    });

    // Zmień symbol i interwał
    rerender(<TradingChart symbol="ETHUSDT" interval="4h" />);
    
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.binance.com/api/v3/klines?symbol=ETHUSDT&interval=4h&limit=500'
      );
    });

    expect(screen.getByText('ETHUSDT')).toBeInTheDocument();
    expect(screen.getByText('4h')).toBeInTheDocument();
  });

  it('obsługuje błędy podczas ładowania danych historycznych', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

    renderWithMantine(<TradingChart symbol="BTCUSDT" interval="1h" />);
    
    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('Error loading historical data:', expect.any(Error));
    });

    consoleSpy.mockRestore();
  });

  it('konwertuje dane Binance do formatu wykresu poprawnie', async () => {
    const mockBinanceData = {
      e: 'kline',
      E: 1640995380000,
      s: 'BTCUSDT',
      k: {
        t: 1640995380000,
        T: 1640995439999,
        s: 'BTCUSDT',
        i: '1h',
        f: 123456,
        L: 123457,
        o: '50000.00',
        c: '50500.00',
        h: '50800.00',
        l: '49800.00',
        v: '1500.00',
        n: 100,
        x: true,
        q: '75750000.00',
        V: '750.00',
        Q: '37875000.00',
        B: '0',
      }
    };

    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    renderWithMantine(<TradingChart symbol="BTCUSDT" interval="1h" />);
    
    // Symuluj otrzymanie danych WebSocket
    await waitFor(() => {
      expect(global.WebSocket).toHaveBeenCalled();
    });

  // Symuluj message event na handlerze ustawionym przez komponent
  mockWebSocket.onmessage?.({ data: JSON.stringify(mockBinanceData) } as any);

    await waitFor(() => {
      expect(screen.getByText('O: 50000.00')).toBeInTheDocument();
      expect(screen.getByText('H: 50800.00')).toBeInTheDocument();
      expect(screen.getByText('L: 49800.00')).toBeInTheDocument();
      expect(screen.getByText('C: 50500.00')).toBeInTheDocument();
      expect(screen.getByText('V: 1500.00')).toBeInTheDocument();
    });

    process.env.NODE_ENV = originalEnv;
  });

  it('czyści zasoby przy unmount', () => {
    const { unmount } = renderWithMantine(<TradingChart symbol="BTCUSDT" interval="1h" />);
    
    unmount();
    
    expect(mockChart.remove).toHaveBeenCalled();
  });

  it('dodaje event listener dla resize', () => {
    const addEventListenerSpy = jest.spyOn(window, 'addEventListener');
    const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');

    const { unmount } = renderWithMantine(<TradingChart symbol="BTCUSDT" interval="1h" />);
    
    expect(addEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function));
    
    unmount();
    
    expect(removeEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function));

    addEventListenerSpy.mockRestore();
    removeEventListenerSpy.mockRestore();
  });

  it('obsługuje WebSocket błędy', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    renderWithMantine(<TradingChart symbol="BTCUSDT" interval="1h" />);
    
    await waitFor(() => {
      expect(global.WebSocket).toHaveBeenCalled();
    });

  // Symuluj błąd WebSocket na handlerze ustawionym przez komponent
  mockWebSocket.onerror?.(new Error('WebSocket error') as any);
  expect(consoleSpy).toHaveBeenCalledWith('WebSocket error:', expect.any(Error));

    process.env.NODE_ENV = originalEnv;
    consoleSpy.mockRestore();
  });

  it('obsługuje zamknięcie WebSocket połączenia', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    renderWithMantine(<TradingChart symbol="BTCUSDT" interval="1h" />);
    
    await waitFor(() => {
      expect(global.WebSocket).toHaveBeenCalled();
    });

  // Symuluj zamknięcie połączenia na handlerze ustawionym przez komponent
  mockWebSocket.onclose?.({ code: 1000, reason: 'Normal closure' } as any);
  expect(consoleSpy).toHaveBeenCalledWith('WebSocket connection closed', 1000, 'Normal closure');

    process.env.NODE_ENV = originalEnv;
    consoleSpy.mockRestore();
  });
});
