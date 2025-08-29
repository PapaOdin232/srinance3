import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import IndicatorPanel from './IndicatorPanel';

// Mock dla ikon z Tabler
jest.mock('@tabler/icons-react', () => ({
  IconPlus: () => <div data-testid="plus-icon" />,
  IconEye: () => <div data-testid="eye-icon" />,
  IconEyeOff: () => <div data-testid="eye-off-icon" />,
  IconTrash: () => <div data-testid="trash-icon" />,
  IconChartLine: () => <div data-testid="chart-line-icon" />,
}));

// Mock dla hook useChartIndicators
const mockIndicators = [
  {
    id: 'rsi-1',
    type: 'RSI' as const,
    name: 'RSI (14)',
    series: [],
    visible: true,
    config: {}
  },
  {
    id: 'ma-1', 
    type: 'MA' as const,
    name: 'SMA (20)',
    series: [],
    visible: false,
    config: {}
  }
];

const mockUseChartIndicators = {
  indicators: [] as any[],
  addRSI: jest.fn(),
  addMovingAverage: jest.fn(),
  addMACD: jest.fn(),
  addBollingerBands: jest.fn(),
  removeIndicator: jest.fn(),
  toggleIndicator: jest.fn(),
  clearAllIndicators: jest.fn()
};

jest.mock('../hooks/useChartIndicators', () => ({
  useChartIndicators: jest.fn(() => mockUseChartIndicators)
}));

// Mock dla lightweight-charts
const mockChartInstance = {
  addSeries: jest.fn(),
  removeSeries: jest.fn(),
  timeScale: () => ({ fitContent: jest.fn() })
} as any;

const mockHistoricalData = [
  { time: 1640995200, open: 100, high: 105, low: 95, close: 102 },
  { time: 1640995260, open: 102, high: 108, low: 99, close: 106 },
  { time: 1640995320, open: 106, high: 110, low: 103, close: 108 }
];

const renderWithMantine = (component: React.ReactElement) => {
  return render(
    <MantineProvider>
      {component}
    </MantineProvider>
  );
};

describe('IndicatorPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseChartIndicators.indicators = [];
  });

  it('renderuje się poprawnie z podstawowymi elementami', () => {
    renderWithMantine(
      <IndicatorPanel 
        chartInstance={mockChartInstance} 
        historicalData={mockHistoricalData} 
      />
    );
    
    expect(screen.getByText('Wskaźniki Techniczne')).toBeInTheDocument();
    // Upewnij się, że jest label akordeonu lub przycisk dodawania (unikając kolizji)
    expect(screen.getByTestId('add-indicator-accordion')).toBeInTheDocument();
    expect(screen.getByTestId('chart-line-icon')).toBeInTheDocument();
  });

  it('pokazuje komunikat gdy brak wskaźników', () => {
    renderWithMantine(
      <IndicatorPanel 
        chartInstance={mockChartInstance} 
        historicalData={mockHistoricalData} 
      />
    );
    
    expect(screen.getByText('Brak aktywnych wskaźników. Dodaj wskaźnik powyżej.')).toBeInTheDocument();
  });

  it('pokazuje listę dostępnych wskaźników w select', async () => {
    const user = userEvent.setup();
    renderWithMantine(
      <IndicatorPanel 
        chartInstance={mockChartInstance} 
        historicalData={mockHistoricalData} 
      />
    );
    
    // Kliknij select aby go otworzyć
    const selectInput = screen.getByTestId('indicator-select');
    await user.click(selectInput);
    
    await waitFor(() => {
      expect(screen.getByText('RSI (Relative Strength Index)')).toBeInTheDocument();
      expect(screen.getByText('Moving Average')).toBeInTheDocument();
      expect(screen.getByText('MACD')).toBeInTheDocument();
      expect(screen.getByText('Bollinger Bands')).toBeInTheDocument();
    });
  });

  it('pokazuje konfigurację RSI po wybraniu', async () => {
    const user = userEvent.setup();
    renderWithMantine(
      <IndicatorPanel 
        chartInstance={mockChartInstance} 
        historicalData={mockHistoricalData} 
      />
    );
    
    const selectInput = screen.getByTestId('indicator-select');
    await user.click(selectInput);
    await user.click(screen.getByText('RSI (Relative Strength Index)'));
    
    expect(screen.getByText('Okres')).toBeInTheDocument();
    expect(screen.getByText('Wykupienie')).toBeInTheDocument();
    expect(screen.getByText('Wyprzedanie')).toBeInTheDocument();
  });

  it('pokazuje konfigurację Moving Average po wybraniu', async () => {
    const user = userEvent.setup();
    renderWithMantine(
      <IndicatorPanel 
        chartInstance={mockChartInstance} 
        historicalData={mockHistoricalData} 
      />
    );
    
    const selectInput = screen.getByTestId('indicator-select');
    await user.click(selectInput);
    await user.click(screen.getByText('Moving Average'));
    
    expect(screen.getByText('Okres')).toBeInTheDocument();
    expect(screen.getByText('Typ')).toBeInTheDocument();
  });

  it('pokazuje konfigurację MACD po wybraniu', async () => {
    const user = userEvent.setup();
    renderWithMantine(
      <IndicatorPanel 
        chartInstance={mockChartInstance} 
        historicalData={mockHistoricalData} 
      />
    );
    
    const selectInput = screen.getByTestId('indicator-select');
    await user.click(selectInput);
    await user.click(screen.getByText('MACD'));
    
    expect(screen.getByText('Szybka EMA')).toBeInTheDocument();
    expect(screen.getByText('Wolna EMA')).toBeInTheDocument();
    expect(screen.getByText('Sygnał')).toBeInTheDocument();
  });

  it('pokazuje konfigurację Bollinger Bands po wybraniu', async () => {
    const user = userEvent.setup();
    renderWithMantine(
      <IndicatorPanel 
        chartInstance={mockChartInstance} 
        historicalData={mockHistoricalData} 
      />
    );
    
    const selectInput = screen.getByTestId('indicator-select');
    await user.click(selectInput);
    await user.click(screen.getByText('Bollinger Bands'));
    
    expect(screen.getByText('Okres')).toBeInTheDocument();
    expect(screen.getByText('Mnożnik')).toBeInTheDocument();
  });

  it('wyłącza przycisk dodawania gdy brak wybranego wskaźnika', () => {
    renderWithMantine(
      <IndicatorPanel 
        chartInstance={mockChartInstance} 
        historicalData={mockHistoricalData} 
      />
    );
    
    const addButton = screen.getByTestId('add-indicator-button');
    expect(addButton).toBeDisabled();
  });

  it('wyłącza przycisk dodawania gdy brak instancji wykresu', () => {
    renderWithMantine(
      <IndicatorPanel 
        chartInstance={null} 
        historicalData={mockHistoricalData} 
      />
    );
    
    const addButton = screen.getByTestId('add-indicator-button');
    expect(addButton).toBeDisabled();
  });

  it('wyłącza przycisk dodawania gdy brak danych historycznych', () => {
    renderWithMantine(
      <IndicatorPanel 
        chartInstance={mockChartInstance} 
        historicalData={[]} 
      />
    );
    
    const addButton = screen.getByTestId('add-indicator-button');
    expect(addButton).toBeDisabled();
  });

  it('wywołuje addRSI po kliknięciu dodaj dla RSI', async () => {
    const user = userEvent.setup();
    renderWithMantine(
      <IndicatorPanel 
        chartInstance={mockChartInstance} 
        historicalData={mockHistoricalData} 
      />
    );
    
    // Wybierz RSI
    const selectInput = screen.getByTestId('indicator-select');
    await user.click(selectInput);
    await user.click(screen.getByText('RSI (Relative Strength Index)'));
    
    // Kliknij dodaj
    const addButton = screen.getByTestId('add-indicator-button');
    await user.click(addButton);
    
    expect(mockUseChartIndicators.addRSI).toHaveBeenCalledWith(
      mockHistoricalData,
      {
        period: 14,
        overbought: 70,
        oversold: 30
      }
    );
  });

  it('wywołuje addMovingAverage po kliknięciu dodaj dla MA', async () => {
    const user = userEvent.setup();
    renderWithMantine(
      <IndicatorPanel 
        chartInstance={mockChartInstance} 
        historicalData={mockHistoricalData} 
      />
    );
    
    // Wybierz MA
    const selectInput = screen.getByTestId('indicator-select');
    await user.click(selectInput);
    await user.click(screen.getByText('Moving Average'));
    
    // Kliknij dodaj
    const addButton = screen.getByTestId('add-indicator-button');
    await user.click(addButton);
    
    expect(mockUseChartIndicators.addMovingAverage).toHaveBeenCalledWith(
      mockHistoricalData,
      {
        period: 20,
        type: 'SMA'
      }
    );
  });

  it('pokazuje aktywne wskaźniki gdy są dostępne', () => {
    mockUseChartIndicators.indicators = mockIndicators;
    
    renderWithMantine(
      <IndicatorPanel 
        chartInstance={mockChartInstance} 
        historicalData={mockHistoricalData} 
      />
    );
    
    expect(screen.getByText('Aktywne wskaźniki (2)')).toBeInTheDocument();
    expect(screen.getByText('RSI (14)')).toBeInTheDocument();
    expect(screen.getByText('SMA (20)')).toBeInTheDocument();
  });

  it('pokazuje przycisk usuń wszystkie gdy są wskaźniki', () => {
    mockUseChartIndicators.indicators = mockIndicators;
    
    renderWithMantine(
      <IndicatorPanel 
        chartInstance={mockChartInstance} 
        historicalData={mockHistoricalData} 
      />
    );
    
    expect(screen.getByText('Usuń wszystkie')).toBeInTheDocument();
  });

  it('wywołuje clearAllIndicators po kliknięciu usuń wszystkie', async () => {
    const user = userEvent.setup();
    mockUseChartIndicators.indicators = mockIndicators;
    
    renderWithMantine(
      <IndicatorPanel 
        chartInstance={mockChartInstance} 
        historicalData={mockHistoricalData} 
      />
    );
    
    const clearButton = screen.getByText('Usuń wszystkie');
    await user.click(clearButton);
    
    expect(mockUseChartIndicators.clearAllIndicators).toHaveBeenCalled();
  });

  it('wywołuje toggleIndicator po kliknięciu ikonę oka', async () => {
    const user = userEvent.setup();
    mockUseChartIndicators.indicators = mockIndicators;
    
    renderWithMantine(
      <IndicatorPanel 
        chartInstance={mockChartInstance} 
        historicalData={mockHistoricalData} 
      />
    );
    
    // Kliknij pierwszą ikonę oka (widoczny wskaźnik)
    const eyeIcons = screen.getAllByTestId('eye-icon');
    await user.click(eyeIcons[0]);
    
    expect(mockUseChartIndicators.toggleIndicator).toHaveBeenCalledWith('rsi-1');
  });

  it('wywołuje removeIndicator po kliknięciu ikonę kosza', async () => {
    const user = userEvent.setup();
    mockUseChartIndicators.indicators = mockIndicators;
    
    renderWithMantine(
      <IndicatorPanel 
        chartInstance={mockChartInstance} 
        historicalData={mockHistoricalData} 
      />
    );
    
    // Kliknij ikonę kosza dla pierwszego wskaźnika rsi-1
    const trashIcon = screen.getByTestId('trash-icon-rsi-1');
    await user.click(trashIcon);
    
    expect(mockUseChartIndicators.removeIndicator).toHaveBeenCalledWith('rsi-1');
  });

  it('pozwala na zmianę konfiguracji RSI', async () => {
    const user = userEvent.setup();
    renderWithMantine(
      <IndicatorPanel 
        chartInstance={mockChartInstance} 
        historicalData={mockHistoricalData} 
      />
    );
    
    // Wybierz RSI
    const selectInput = screen.getByTestId('indicator-select');
    await user.click(selectInput);
    await user.click(screen.getByText('RSI (Relative Strength Index)'));
    
    // Zmień wartość okresu
    const periodInput = screen.getByDisplayValue('14');
    await user.clear(periodInput);
    await user.type(periodInput, '21');
    
    // Kliknij dodaj
    const addButton = screen.getByTestId('add-indicator-button');
    await user.click(addButton);
    
    expect(mockUseChartIndicators.addRSI).toHaveBeenCalledWith(
      mockHistoricalData,
      expect.objectContaining({
        period: 21
      })
    );
  });
});
