import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
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
});
