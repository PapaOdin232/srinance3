import { render, screen, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import axios from 'axios';
jest.mock('axios');
import AssetSelector from './AssetSelector';
import type { Asset } from '../types/asset';

// Mock data
const mockAssets: Asset[] = [
  {
    symbol: 'BTCUSDT',
    baseAsset: 'BTC',
    quoteAsset: 'USDT',
    price: 45000.12,
    priceChange: 1200.50,
    priceChangePercent: 2.74,
    volume: 123456789,
    count: 789012,
    status: 'TRADING',
  },
  {
    symbol: 'ETHUSDT',
    baseAsset: 'ETH', 
    quoteAsset: 'USDT',
    price: 3200.45,
    priceChange: -85.30,
    priceChangePercent: -2.59,
    volume: 87654321,
    count: 456789,
    status: 'TRADING',
  },
  {
    symbol: 'ADAUSDT',
    baseAsset: 'ADA',
    quoteAsset: 'USDT', 
    price: 0.4567,
    priceChange: 0.0123,
    priceChangePercent: 2.77,
    volume: 45678901,
    count: 234567,
    status: 'TRADING',
  },
  {
    symbol: 'WBTCTAO',
    baseAsset: 'WBTC',
    quoteAsset: 'TAO',
    price: 0.9991,
    priceChange: 0.0001,
    priceChangePercent: 0.01,
    volume: 0.0048,
    count: 10,
    status: 'TRADING',
  },
];

describe('AssetSelector', () => {
  const mockOnAssetSelect = jest.fn();
  
  beforeEach(() => {
    mockOnAssetSelect.mockClear();
  });

  test('renders loading state', () => {
    render(
      <MantineProvider defaultColorScheme="dark">
        <AssetSelector
          selectedAsset={null}
          onAssetSelect={mockOnAssetSelect}
          assets={[]}
          loading={true}
        />
      </MantineProvider>
    );
    
    expect(screen.getByText('Ładowanie aktywów...')).toBeInTheDocument();
  });

  test('renders error state', () => {
    render(
      <MantineProvider defaultColorScheme="dark">
        <AssetSelector
          selectedAsset={null}
          onAssetSelect={mockOnAssetSelect}
          assets={[]}
          error="Network error"
        />
      </MantineProvider>
    );
    
    expect(screen.getByText('Błąd: Network error')).toBeInTheDocument();
  });

  // Uproszczony test sprawdzający czy komponent renderuje się z podstawowymi danymi
  test('renders basic component structure', () => {
    // Mock backend calls used by useAssets to avoid network
    (axios.get as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/api/exchangeInfo')) {
        return Promise.resolve({ data: { symbols: [] } });
      }
      if (url.includes('/api/24hr')) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({ data: {} });
    });

    render(
      <MantineProvider defaultColorScheme="dark">
        <AssetSelector
          selectedAsset={null}
          onAssetSelect={mockOnAssetSelect}
          assets={mockAssets}
        />
      </MantineProvider>
    );
    
    expect(screen.getByText('Wybór aktywa')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Szukaj par (np. BTC, ETH...)')).toBeInTheDocument();
  });

  test('formats small non-USDT market volume without forcing M suffix', () => {
    (axios.get as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/api/exchangeInfo')) return Promise.resolve({ data: { symbols: [] } });
      if (url.includes('/api/24hr')) return Promise.resolve({ data: [] });
      return Promise.resolve({ data: {} });
    });

    render(
      <MantineProvider defaultColorScheme="dark">
        <AssetSelector
          selectedAsset={null}
          onAssetSelect={mockOnAssetSelect}
          assets={mockAssets}
        />
      </MantineProvider>
    );

  // Zmień rynek na ALL aby pokazać aktywa spoza listy preferowanych quote (np. TAO)
  const marketSelect = screen.getByPlaceholderText('Rynek');
  fireEvent.mouseDown(marketSelect); // otwórz dropdown
  const allOption = screen.getByText('Wszystkie rynki');
  fireEvent.click(allOption);

    // Szukamy sformatowanej wartości 0.0048 lub w notacji naukowej (0.00e) zależnie od reguły
    expect(screen.getByText(/0\.0048|4\.80e-3/)).toBeInTheDocument();
  });
});
