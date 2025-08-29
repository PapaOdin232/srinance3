import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import TradingPanel from './TradingPanel';

// Mock dependencies
jest.mock('../services/restClient', () => ({
  placeOrder: jest.fn(),
  testOrder: jest.fn(),
  getCurrentTicker: jest.fn(),
}));

jest.mock('../hooks/useAssets', () => ({
  useAssets: jest.fn(),
}));

jest.mock('../hooks/usePortfolio', () => ({
  usePortfolio: jest.fn(),
}));

jest.mock('../store/userStream', () => ({
  useUserStream: jest.fn(),
}));

jest.mock('@tabler/icons-react', () => ({
  IconTrendingUp: () => <div data-testid="icon-trending-up" />,
  IconTrendingDown: () => <div data-testid="icon-trending-down" />,
  IconFlask: () => <div data-testid="icon-flask" />,
  IconAlertCircle: () => <div data-testid="icon-alert-circle" />,
  IconCheck: () => <div data-testid="icon-check" />,
  IconWallet: () => <div data-testid="icon-wallet" />,
}));

const mockAssets = [
  {
    symbol: 'BTCUSDT',
    baseAsset: 'BTC',
    quoteAsset: 'USDT',
    price: 45000,
    priceChange: 500,
    priceChangePercent: 1.12,
  },
  {
    symbol: 'ETHUSDT',
    baseAsset: 'ETH',
    quoteAsset: 'USDT',
    price: 3200,
    priceChange: -50,
    priceChangePercent: -1.54,
  },
];

const mockBalances = [
  { asset: 'USDT', free: 1000, locked: 0 },
  { asset: 'BTC', free: 0.5, locked: 0 },
  { asset: 'ETH', free: 2.5, locked: 0 },
];

const renderWithMantine = (component: React.ReactElement) => {
  return render(
    <MantineProvider>
      {component}
    </MantineProvider>
  );
};

const mockPlaceOrder = require('../services/restClient').placeOrder;
const mockTestOrder = require('../services/restClient').testOrder;
const mockGetCurrentTicker = require('../services/restClient').getCurrentTicker;
const mockUseAssets = require('../hooks/useAssets').useAssets;
const mockUsePortfolio = require('../hooks/usePortfolio').usePortfolio;
const mockUseUserStream = require('../store/userStream').useUserStream;

describe('TradingPanel', () => {
  const mockAddPendingOrder = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockUseAssets.mockReturnValue({
      assets: mockAssets,
    });
    
    mockUsePortfolio.mockReturnValue({
      balances: mockBalances,
    });
    
    mockUseUserStream.mockReturnValue({
      addPendingOrder: mockAddPendingOrder,
    });

    mockGetCurrentTicker.mockResolvedValue({
      symbol: 'BTCUSDT',
      price: '45000.00',
    });

    mockTestOrder.mockResolvedValue({
      success: true,
      message: 'Test order validated successfully',
      test_result: { symbol: 'BTCUSDT', side: 'BUY' },
    });

    mockPlaceOrder.mockResolvedValue({
      success: true,
      message: 'Order placed successfully',
      order: { orderId: 12345, symbol: 'BTCUSDT', side: 'BUY' },
    });
  });

  it('renderuje się poprawnie z podstawowymi elementami', () => {
    renderWithMantine(<TradingPanel />);
    
    expect(screen.getByText('Panel Tradingowy')).toBeInTheDocument();
    expect(screen.getByText('Nowe Zlecenie')).toBeInTheDocument();
    expect(screen.getByText('Dostępne saldo')).toBeInTheDocument();
    expect(screen.getByText('Szybkie akcje')).toBeInTheDocument();
  });

  it('wyświetla dane tickera dla wybranego symbolu', async () => {
    renderWithMantine(<TradingPanel />);
    
    await waitFor(() => {
      expect(screen.getByText('BTCUSDT')).toBeInTheDocument();
      expect(screen.getByText('$45000.00')).toBeInTheDocument();
      expect(screen.getByText('TESTNET')).toBeInTheDocument();
    });
  });

  it('wyświetla dostępne salda', () => {
    renderWithMantine(<TradingPanel />);
    
    expect(screen.getByText('USDT:')).toBeInTheDocument();
    expect(screen.getByText('1000')).toBeInTheDocument();
    expect(screen.getByText('BTC:')).toBeInTheDocument();
    expect(screen.getByText('0.5')).toBeInTheDocument();
  });

  it('umożliwia wybór symbolu z listy', () => {
    renderWithMantine(<TradingPanel />);
    
    const symbolSelect = screen.getByDisplayValue('BTCUSDT');
    expect(symbolSelect).toBeInTheDocument();
  });

  it('umożliwia wybór typu zlecenia', () => {
    renderWithMantine(<TradingPanel />);
    
    const orderTypeSelect = screen.getByDisplayValue('MARKET');
    expect(orderTypeSelect).toBeInTheDocument();
    
    fireEvent.click(orderTypeSelect);
    expect(screen.getByText('Market (natychmiastowe)')).toBeInTheDocument();
    expect(screen.getByText('Limit (z ceną)')).toBeInTheDocument();
  });

  it('umożliwia wybór strony (BUY/SELL)', () => {
    renderWithMantine(<TradingPanel />);
    
    const sideSelect = screen.getByDisplayValue('BUY');
    expect(sideSelect).toBeInTheDocument();
  });

  it('wyświetla pole ceny tylko dla zleceń LIMIT', async () => {
    renderWithMantine(<TradingPanel />);
    
    // Initially MARKET order - no price field
    expect(screen.queryByLabelText(/Cena/)).not.toBeInTheDocument();
    
    // Change to LIMIT order
    const orderTypeSelect = screen.getByDisplayValue('MARKET');
    fireEvent.click(orderTypeSelect);
    fireEvent.click(screen.getByText('Limit (z ceną)'));
    
    await waitFor(() => {
      expect(screen.getByLabelText(/Cena/)).toBeInTheDocument();
    });
  });

  it('wyświetla Time in Force tylko dla zleceń LIMIT', async () => {
    renderWithMantine(<TradingPanel />);
    
    // Initially MARKET order - no Time in Force
    expect(screen.queryByLabelText(/Time in Force/)).not.toBeInTheDocument();
    
    // Change to LIMIT order
    const orderTypeSelect = screen.getByDisplayValue('MARKET');
    fireEvent.click(orderTypeSelect);
    fireEvent.click(screen.getByText('Limit (z ceną)'));
    
    await waitFor(() => {
      const timeInForceInputs = screen.getAllByLabelText(/Time in Force/);
      expect(timeInForceInputs.length).toBeGreaterThan(0);
    });
  });

  it('oblicza szacowaną wartość zlecenia', async () => {
    renderWithMantine(<TradingPanel />);
    
    const quantityInput = screen.getByLabelText(/Ilość/);
    fireEvent.change(quantityInput, { target: { value: '0.001' } });
    
    await waitFor(() => {
      expect(screen.getByText('$45.00 USDT')).toBeInTheDocument();
    });
  });

  it('dezaktywuje przyciski gdy formularz jest nieprawidłowy', () => {
    renderWithMantine(<TradingPanel />);
    
    const testButton = screen.getByText('Test Order').closest('button');
    const placeButton = screen.getByText('Kupuj').closest('button');
    
    expect(testButton).toBeDisabled();
    expect(placeButton).toBeDisabled();
  });

  it('aktywuje przyciski gdy formularz jest prawidłowy', async () => {
    renderWithMantine(<TradingPanel />);
    
    const quantityInput = screen.getByLabelText(/Ilość/);
    fireEvent.change(quantityInput, { target: { value: '0.001' } });
    
    await waitFor(() => {
      const testButton = screen.getByText('Test Order');
      const placeButton = screen.getByText('Kupuj');
      
      expect(testButton).not.toBeDisabled();
      expect(placeButton).not.toBeDisabled();
    });
  });

  it('wykonuje test zlecenia poprawnie', async () => {
    renderWithMantine(<TradingPanel />);
    
    const quantityInput = screen.getByLabelText(/Ilość/);
    fireEvent.change(quantityInput, { target: { value: '0.001' } });
    
    await waitFor(() => {
      const testButton = screen.getByText('Test Order');
      expect(testButton).not.toBeDisabled();
    });
    
    const testButton = screen.getByText('Test Order');
    fireEvent.click(testButton);
    
    await waitFor(() => {
      expect(mockTestOrder).toHaveBeenCalledWith({
        symbol: 'BTCUSDT',
        side: 'BUY',
        type: 'MARKET',
        quantity: '0.001',
        timeInForce: 'GTC',
      });
    });
    
    await waitFor(() => {
      expect(screen.getByText('Test Order - Sukces')).toBeInTheDocument();
      expect(screen.getByText('Test order validated successfully')).toBeInTheDocument();
    });
  });

  it('składa zlecenie poprawnie', async () => {
    renderWithMantine(<TradingPanel />);
    
    const quantityInput = screen.getByLabelText(/Ilość/);
    fireEvent.change(quantityInput, { target: { value: '0.001' } });
    
    await waitFor(() => {
      const placeButton = screen.getByText('Kupuj');
      expect(placeButton).not.toBeDisabled();
    });
    
    const placeButton = screen.getByText('Kupuj');
    fireEvent.click(placeButton);
    
    // Sprawdź optymistyczne dodanie zlecenia
    expect(mockAddPendingOrder).toHaveBeenCalled();
    
    await waitFor(() => {
      expect(mockPlaceOrder).toHaveBeenCalledWith({
        symbol: 'BTCUSDT',
        side: 'BUY',
        type: 'MARKET',
        quantity: '0.001',
        timeInForce: 'GTC',
      });
    });
    
    await waitFor(() => {
      expect(screen.getByText('Zlecenie złożone')).toBeInTheDocument();
      expect(screen.getByText('Order placed successfully!')).toBeInTheDocument();
    });
  });

  it('obsługuje błędy test zlecenia', async () => {
    mockTestOrder.mockRejectedValue(new Error('Test failed'));
    
    renderWithMantine(<TradingPanel />);
    
    const quantityInput = screen.getByLabelText(/Ilość/);
    fireEvent.change(quantityInput, { target: { value: '0.001' } });
    
    await waitFor(() => {
      const testButton = screen.getByText('Test Order');
      expect(testButton).not.toBeDisabled();
    });
    
    const testButton = screen.getByText('Test Order');
    fireEvent.click(testButton);
    
    await waitFor(() => {
      expect(screen.getByText('Błąd')).toBeInTheDocument();
      expect(screen.getByText('Test failed')).toBeInTheDocument();
    });
  });

  it('obsługuje błędy składania zlecenia', async () => {
    mockPlaceOrder.mockRejectedValue(new Error('Order failed'));
    
    renderWithMantine(<TradingPanel />);
    
    const quantityInput = screen.getByLabelText(/Ilość/);
    fireEvent.change(quantityInput, { target: { value: '0.001' } });
    
    await waitFor(() => {
      const placeButton = screen.getByText('Kupuj');
      expect(placeButton).not.toBeDisabled();
    });
    
    const placeButton = screen.getByText('Kupuj');
    fireEvent.click(placeButton);
    
    await waitFor(() => {
      expect(screen.getByText('Błąd')).toBeInTheDocument();
      expect(screen.getByText('Order failed')).toBeInTheDocument();
    });
  });

  it('działa z szybkimi akcjami', async () => {
    renderWithMantine(<TradingPanel />);
    
    const quickBuyButton = screen.getByText('Kup 0.001 BTC (Market)');
    fireEvent.click(quickBuyButton);
    
    await waitFor(() => {
      const quantityInput = screen.getByLabelText(/Ilość/) as HTMLInputElement;
      expect(quantityInput.value).toBe('0.001');
    });
    
    expect(screen.getByDisplayValue('MARKET')).toBeInTheDocument();
    expect(screen.getByDisplayValue('BUY')).toBeInTheDocument();
  });

  it('czyści formularz po użyciu przycisku reset', async () => {
    renderWithMantine(<TradingPanel />);
    
    // Ustaw jakieś wartości
    const quantityInput = screen.getByLabelText(/Ilość/);
    fireEvent.change(quantityInput, { target: { value: '0.001' } });
    
    const clearButton = screen.getByText('Wyczyść formularz');
    fireEvent.click(clearButton);
    
    await waitFor(() => {
      const quantityInputAfter = screen.getByLabelText(/Ilość/) as HTMLInputElement;
      expect(quantityInputAfter.value).toBe('');
    });
  });

  it('zmienia tekst przycisku w zależności od strony zlecenia', async () => {
    renderWithMantine(<TradingPanel />);
    
    // Initially BUY
    expect(screen.getByText('Kupuj')).toBeInTheDocument();
    
    // Change to SELL
    const sideSelect = screen.getByDisplayValue('BUY');
    fireEvent.click(sideSelect);
    fireEvent.click(screen.getByText('🔴 Sprzedaż (SELL)'));
    
    await waitFor(() => {
      expect(screen.getByText('Sprzedaj')).toBeInTheDocument();
    });
  });

  it('wyświetla fallback ticker gdy brak danych WebSocket', async () => {
    mockUseAssets.mockReturnValue({ assets: [] });
    
    renderWithMantine(<TradingPanel />);
    
    await waitFor(() => {
      expect(mockGetCurrentTicker).toHaveBeenCalledWith('BTCUSDT');
    });
  });

  it('resetuje formularz po udanym złożeniu zlecenia', async () => {
    renderWithMantine(<TradingPanel />);
    
    const quantityInput = screen.getByLabelText(/Ilość/);
    fireEvent.change(quantityInput, { target: { value: '0.001' } });
    
    const placeButton = screen.getByText('Kupuj');
    fireEvent.click(placeButton);
    
    await waitFor(() => {
      expect(screen.getByText('Order placed successfully!')).toBeInTheDocument();
    });
    
    // Sprawdź czy formularz został zresetowany
    await waitFor(() => {
      const quantityInputAfter = screen.getByLabelText(/Ilość/) as HTMLInputElement;
      expect(quantityInputAfter.value).toBe('');
    });
  });

  it('obsługuje zlecenia LIMIT z ceną', async () => {
    renderWithMantine(<TradingPanel />);
    
    // Change to LIMIT order
    const orderTypeSelect = screen.getByDisplayValue('MARKET');
    fireEvent.click(orderTypeSelect);
    fireEvent.click(screen.getByText('Limit (z ceną)'));
    
    await waitFor(() => {
      const quantityInput = screen.getByLabelText(/Ilość/);
      const priceInput = screen.getByLabelText(/Cena/);
      
      fireEvent.change(quantityInput, { target: { value: '0.001' } });
      fireEvent.change(priceInput, { target: { value: '44000' } });
    });
    
    const testButton = screen.getByText('Test Order');
    fireEvent.click(testButton);
    
    await waitFor(() => {
      expect(mockTestOrder).toHaveBeenCalledWith({
        symbol: 'BTCUSDT',
        side: 'BUY',
        type: 'LIMIT',
        quantity: '0.001',
        price: '44000',
        timeInForce: 'GTC',
      });
    });
  });
});
