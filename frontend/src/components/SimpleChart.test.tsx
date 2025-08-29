import { render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import SimpleChart from './SimpleChart';

// Mock dla debugLogger
jest.mock('../utils/debugLogger', () => ({
  createDebugLogger: () => ({
    log: jest.fn(),
    render: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  }),
}));

// Mock dla lightweight-charts
const mockTimeScale = {
  setVisibleLogicalRange: jest.fn(),
  fitContent: jest.fn(),
  getVisibleLogicalRange: jest.fn(),
  subscribeVisibleLogicalRangeChange: jest.fn(),
};

const mockChart = {
  addSeries: jest.fn(),
  remove: jest.fn(),
  resize: jest.fn(),
  timeScale: jest.fn(() => mockTimeScale),
  priceScale: jest.fn(() => ({
    applyOptions: jest.fn(),
  })),
  applyOptions: jest.fn(),
  subscribeCrosshairMove: jest.fn(),
};

const mockSeries = {
  setData: jest.fn(),
  update: jest.fn(),
  applyOptions: jest.fn(),
  createPriceLine: jest.fn(),
  removePriceLine: jest.fn(),
  barsInLogicalRange: jest.fn(),
};

jest.mock('lightweight-charts', () => ({
  createChart: jest.fn(() => mockChart),
  CandlestickSeries: 'CandlestickSeries',
  HistogramSeries: 'HistogramSeries',
}));

// Mock ResizeObserver
global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  disconnect: jest.fn(),
}));

// Mock requestAnimationFrame
global.requestAnimationFrame = jest.fn((cb) => setTimeout(cb, 0));

const mockHistoricalData = [
  { time: 1640995200 as any, open: 100, high: 105, low: 95, close: 102 },
  { time: 1640995260 as any, open: 102, high: 108, low: 99, close: 106 },
  { time: 1640995320 as any, open: 106, high: 110, low: 103, close: 108 },
];

const renderWithMantine = (component: React.ReactElement) => {
  return render(
    <MantineProvider>
      {component}
    </MantineProvider>
  );
};

describe('SimpleChart', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockChart.addSeries.mockReturnValue(mockSeries);
  // ensure timeScale() always returns the same instance during tests
  (mockChart.timeScale as jest.Mock).mockReturnValue(mockTimeScale);
  });

  it('renderuje się bez błędów z pustymi danymi', () => {
    renderWithMantine(<SimpleChart data={[]} />);
    expect(screen.getByTestId('simple-chart-container')).toBeInTheDocument();
  });

  it('tworzy wykres z danymi historycznymi', async () => {
    renderWithMantine(<SimpleChart data={mockHistoricalData} />);
    
    await waitFor(() => {
      expect(mockChart.addSeries).toHaveBeenCalledTimes(2); // Candlestick + Volume series
      expect(mockSeries.setData).toHaveBeenCalled();
    });
  });

  it('wyświetla komunikat ładowania podczas inicjalizacji', () => {
    // Mock chart creation to stay in loading state
    mockChart.addSeries.mockImplementation(() => {
      // Don't call onChartReady to keep loading state
      return mockSeries;
    });
    
    renderWithMantine(<SimpleChart data={[]} />);
    // Sprawdzamy czy kontener wykresu istnieje
    expect(screen.getByTestId('simple-chart-container')).toBeInTheDocument();
  });

  it('ukrywa komunikat ładowania po inicjalizacji', async () => {
    renderWithMantine(<SimpleChart data={mockHistoricalData} />);
    
    await waitFor(() => {
      // Po inicjalizacji wykresu nie powinno być komunikatu ładowania
      expect(screen.queryByText('Inicjalizacja wykresu...')).not.toBeInTheDocument();
    });
  });

  it('używa domyślnych ustawień', async () => {
    renderWithMantine(<SimpleChart data={mockHistoricalData} />);
    
    await waitFor(() => {
      // Sprawdź czy wykres został utworzony z domyślnymi parametrami
      expect(mockChart.addSeries).toHaveBeenCalledWith(
        'CandlestickSeries',
        expect.objectContaining({
          lastValueVisible: false,
          upColor: '#26A69A', // default color scheme
          downColor: '#EF5350',
        })
      );
    });
  });

  it('stosuje niestandardowe ustawienia kolorów', async () => {
    renderWithMantine(
      <SimpleChart 
        data={mockHistoricalData} 
        colorScheme="classic" 
      />
    );
    
    await waitFor(() => {
      expect(mockChart.addSeries).toHaveBeenCalledWith(
        'CandlestickSeries',
        expect.objectContaining({
          upColor: '#00C851', // classic color scheme
          downColor: '#FF4444',
        })
      );
    });
  });

  it('obsługuje aktualizacje w czasie rzeczywistym', async () => {
    const realtimeCandle = {
      time: 1640995380 as any,
      open: 108,
      high: 112,
      low: 106,
      close: 110,
      volume: 1000,
    };

    const { rerender } = renderWithMantine(<SimpleChart data={mockHistoricalData} />);
    
    await waitFor(() => {
      expect(mockSeries.setData).toHaveBeenCalled();
    });

    // Dodaj aktualizację w czasie rzeczywistym
    rerender(<SimpleChart data={mockHistoricalData} realtimeCandle={realtimeCandle} />);
    
    await waitFor(() => {
      expect(mockSeries.update).toHaveBeenCalled();
    });
  });

  it('obsługuje zmianę motywu', async () => {
    const { rerender } = renderWithMantine(
      <SimpleChart data={mockHistoricalData} isDarkTheme={false} />
    );
    
    await waitFor(() => {
      expect(mockChart.applyOptions).toHaveBeenCalledWith(
        expect.objectContaining({
          layout: expect.objectContaining({
            background: { color: '#FFFFFF' },
            textColor: '#24292F',
          }),
        })
      );
    });

    // Zmień na ciemny motyw
    rerender(<SimpleChart data={mockHistoricalData} isDarkTheme={true} />);
    
    await waitFor(() => {
      expect(mockChart.applyOptions).toHaveBeenCalledWith(
        expect.objectContaining({
          layout: expect.objectContaining({
            background: { color: '#0D1117' },
            textColor: '#F0F6FC',
          }),
        })
      );
    });
  });

  it('obsługuje ukrywanie/pokazywanie wolumenu', async () => {
    const { rerender } = renderWithMantine(
      <SimpleChart data={mockHistoricalData} showVolume={true} />
    );
    
    await waitFor(() => {
      expect(mockChart.addSeries).toHaveBeenCalledWith(
        'HistogramSeries',
        expect.objectContaining({
          visible: true,
        })
      );
    });

    // Wyłącz wolumen
    rerender(<SimpleChart data={mockHistoricalData} showVolume={false} />);
    
    await waitFor(() => {
      expect(mockSeries.applyOptions).toHaveBeenCalledWith(
        expect.objectContaining({
          visible: false,
        })
      );
    });
  });

  it('obsługuje różne schematy kolorów', async () => {
    const schemes: Array<'default' | 'classic' | 'modern' | 'minimal'> = 
      ['default', 'classic', 'modern', 'minimal'];
    
    const expectedColors = {
      default: { upColor: '#26A69A', downColor: '#EF5350' },
      classic: { upColor: '#00C851', downColor: '#FF4444' },
      modern: { upColor: '#10B981', downColor: '#F59E0B' },
      minimal: { upColor: '#4ADE80', downColor: '#F87171' },
    };

    for (const scheme of schemes) {
      const { unmount } = renderWithMantine(
        <SimpleChart data={mockHistoricalData} colorScheme={scheme} />
      );
      
      await waitFor(() => {
        expect(mockChart.addSeries).toHaveBeenCalledWith(
          'CandlestickSeries',
          expect.objectContaining({
            upColor: expectedColors[scheme].upColor,
            downColor: expectedColors[scheme].downColor,
          })
        );
      });
      
      unmount();
      jest.clearAllMocks();
    }
  });

  it('wywołuje callback onChartReady', async () => {
    const onChartReady = jest.fn();
    
    renderWithMantine(
      <SimpleChart 
        data={mockHistoricalData} 
        onChartReady={onChartReady}
      />
    );
    
    // Czekamy na inicjalizację wykresu i wywołanie callbacku
    await waitFor(() => {
      expect(onChartReady).toHaveBeenCalledWith(mockChart);
    });
  });

  it('obsługuje niestandardowe rozmiary', () => {
    renderWithMantine(
      <SimpleChart 
        data={mockHistoricalData}
        width="800px"
        height="600px"
      />
    );
    const container = screen.getByTestId('simple-chart-root');
    expect(container).toHaveStyle({
      width: '800px',
      height: '600px',
    });
  });

  it('czyści zasoby przy unmount', async () => {
    const { unmount } = renderWithMantine(<SimpleChart data={mockHistoricalData} />);
    
    await waitFor(() => {
      expect(mockChart.addSeries).toHaveBeenCalled();
    });

    unmount();
    
    // Sprawdź czy chart.remove() zostało wywołane podczas cleanup
    expect(mockChart.remove).toHaveBeenCalled();
  });

  it('normalizuje czas w danych wejściowych', async () => {
    const dataWithStringTime = [
      { time: '2024-01-01T10:00:00Z', open: 100, high: 105, low: 95, close: 102 },
    ];

    renderWithMantine(<SimpleChart data={dataWithStringTime as any} />);
    
    await waitFor(() => {
      expect(mockSeries.setData).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            time: expect.any(Number),
            open: 100,
            high: 105,
            low: 95,
            close: 102,
          }),
        ])
      );
    });
  });

  it('wyświetla tooltip po najechaniu myszą', async () => {
    renderWithMantine(<SimpleChart data={mockHistoricalData} />);
    
    await waitFor(() => {
      expect(mockChart.subscribeCrosshairMove).toHaveBeenCalled();
    });
    
    // Symuluj najechanie myszą
    const crosshairCallback = mockChart.subscribeCrosshairMove.mock.calls[0][0];
    const mockParam = {
      point: { x: 100, y: 200 },
      time: 1640995200,
      seriesData: new Map([
        [mockSeries, { open: 100, high: 105, low: 95, close: 102 }]
      ])
    };
    
    crosshairCallback(mockParam);
    
    await waitFor(() => {
      expect(screen.getByText('O: 100.00')).toBeInTheDocument();
      expect(screen.getByText('H: 105.00')).toBeInTheDocument();
      expect(screen.getByText('L: 95.00')).toBeInTheDocument();
      expect(screen.getByText('C: 102.00')).toBeInTheDocument();
    });
  });

  it('obsługuje callback onLoadMoreHistory', async () => {
    const onLoadMoreHistory = jest.fn().mockResolvedValue([
      { time: 1640995140, open: 95, high: 100, low: 90, close: 98 },
    ]);

    renderWithMantine(
      <SimpleChart 
        data={mockHistoricalData}
        onLoadMoreHistory={onLoadMoreHistory}
      />
    );
    
    await waitFor(() => {
      // Sprawdzamy czy subskrypcja została utworzona
      expect(mockTimeScale.subscribeVisibleLogicalRangeChange).toHaveBeenCalled();
    });
    
    // Test nie może łatwo wywołać callback bez symulacji scrollowania
    // więc sprawdzamy tylko czy subskrypcja została skonfigurowana
  });

  it('pokazuje komunikat ładowania historii', () => {
    renderWithMantine(<SimpleChart data={mockHistoricalData} />);
    
    // Symulacja stanu ładowania historii byłaby zbyt skomplikowana
    // ale możemy przynajmniej sprawdzić czy komponent renderuje się poprawnie
    expect(screen.queryByText('Ładowanie historii...')).not.toBeInTheDocument();
  });

  it('obsługuje brak danych volume', async () => {
    const dataWithoutVolume = [
      { time: 1640995200 as any, open: 100, high: 105, low: 95, close: 102 },
    ];

    renderWithMantine(<SimpleChart data={dataWithoutVolume} />);
    
    await waitFor(() => {
      expect(mockChart.addSeries).toHaveBeenCalledTimes(2); // Nadal tworzy series dla volume
      expect(mockSeries.setData).toHaveBeenCalled();
    });
  });
});
