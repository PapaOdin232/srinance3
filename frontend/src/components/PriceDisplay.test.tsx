import React from 'react';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import PriceDisplay from './PriceDisplay';

// Mock dla ikon z Tabler
jest.mock('@tabler/icons-react', () => ({
  IconTrendingUp: () => <div data-testid="trending-up-icon" />,
  IconTrendingDown: () => <div data-testid="trending-down-icon" />,
}));

const mockTickerPositive = {
  symbol: 'BTCUSDT',
  price: '118129.36',
  change: '678.51',
  changePercent: '0.58%'
};

const mockTickerNegative = {
  symbol: 'ETHUSDT',
  price: '3245.67',
  change: '-125.89',
  changePercent: '-3.73%'
};

const renderWithMantine = (component: React.ReactElement) => {
  return render(
    <MantineProvider>
      {component}
    </MantineProvider>
  );
};

describe('PriceDisplay', () => {
  it('renderuje się poprawnie z pozytywną zmianą', () => {
    renderWithMantine(<PriceDisplay ticker={mockTickerPositive} />);
    
    expect(screen.getByText('Aktualna Cena')).toBeInTheDocument();
    expect(screen.getByText('BTC/USDT')).toBeInTheDocument();
    expect(screen.getByText('$118,129.36')).toBeInTheDocument();
    expect(screen.getByText('+678.51')).toBeInTheDocument();
    expect(screen.getByText('▲ 0.58%')).toBeInTheDocument();
    expect(screen.getByTestId('trending-up-icon')).toBeInTheDocument();
  });

  it('renderuje się poprawnie z negatywną zmianą', () => {
    renderWithMantine(<PriceDisplay ticker={mockTickerNegative} />);
    
    expect(screen.getByText('ETH/USDT')).toBeInTheDocument();
    expect(screen.getByText('$3,245.67')).toBeInTheDocument();
    expect(screen.getByText('-125.89')).toBeInTheDocument();
    expect(screen.getByText('▼ 3.73%')).toBeInTheDocument();
    expect(screen.getByTestId('trending-down-icon')).toBeInTheDocument();
  });

  it('używa niestandardowej waluty', () => {
    renderWithMantine(<PriceDisplay ticker={mockTickerPositive} currency="EUR" />);
    
    expect(screen.getByText('EUR')).toBeInTheDocument();
  });

  it('formatuje cenę z separatorami tysięcy', () => {
    const expensiveTicker = {
      symbol: 'BTCUSDT',
      price: '1234567.89',
      change: '0',
      changePercent: '0%'
    };
    
    renderWithMantine(<PriceDisplay ticker={expensiveTicker} />);
    expect(screen.getByText('$1,234,567.89')).toBeInTheDocument();
  });

  it('wyświetla dodatkowe informacje', () => {
    renderWithMantine(<PriceDisplay ticker={mockTickerPositive} />);
    
    expect(screen.getByText('24H')).toBeInTheDocument();
    expect(screen.getByText('Zmiana 24h')).toBeInTheDocument();
    expect(screen.getByText('Dane na żywo • Binance')).toBeInTheDocument();
  });
});
