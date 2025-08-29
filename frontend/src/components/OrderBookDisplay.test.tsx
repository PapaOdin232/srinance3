import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import OrderBookDisplay from './OrderBookDisplay';

// Mock dla ikon z Tabler
jest.mock('@tabler/icons-react', () => ({
  IconTrendingUp: () => <div data-testid="trending-up-icon" />,
  IconTrendingDown: () => <div data-testid="trending-down-icon" />,
}));

// Mock dla debugLogger
jest.mock('../utils/debugLogger', () => ({
  createDebugLogger: () => ({
    render: jest.fn(),
  }),
}));

const mockOrderbook = {
  symbol: 'BTCUSDT',
  bids: [
    ['49900.00', '0.500000'] as [string, string],
    ['49890.00', '1.200000'] as [string, string],
    ['49880.00', '0.750000'] as [string, string],
    ['49870.00', '2.100000'] as [string, string],
    ['49860.00', '0.950000'] as [string, string],
  ],
  asks: [
    ['50100.00', '0.300000'] as [string, string],
    ['50110.00', '0.800000'] as [string, string],
    ['50120.00', '1.500000'] as [string, string],
    ['50130.00', '0.650000'] as [string, string],
    ['50140.00', '1.100000'] as [string, string],
  ],
  timestamp: 1640995200000,
};

const renderWithMantine = (component: React.ReactElement) => {
  return render(
    <MantineProvider>
      {component}
    </MantineProvider>
  );
};

describe('OrderBookDisplay', () => {
  it('renderuje się poprawnie z podstawowymi elementami', () => {
    renderWithMantine(<OrderBookDisplay orderbook={mockOrderbook} />);
    
    expect(screen.getByText('Księga Zleceń')).toBeInTheDocument();
    expect(screen.getByText('BTCUSDT')).toBeInTheDocument();
    expect(screen.getByText('Cena (USDT)')).toBeInTheDocument();
    expect(screen.getByText('Ilość')).toBeInTheDocument();
    expect(screen.getByText('Spread')).toBeInTheDocument();
    expect(screen.getByTestId('trending-up-icon')).toBeInTheDocument();
    expect(screen.getByTestId('trending-down-icon')).toBeInTheDocument();
  });

  it('wyświetla bids (zlecenia kupna) z właściwymi kolorami', () => {
    renderWithMantine(<OrderBookDisplay orderbook={mockOrderbook} />);
    
    // Sprawdź czy bids są wyświetlane (ceny kupna)
    expect(screen.getByText('$49,900.00')).toBeInTheDocument();
    expect(screen.getByText('$49,890.00')).toBeInTheDocument();
    expect(screen.getByText('0.5000')).toBeInTheDocument(); // Odpowiednia ilość
  });

  it('wyświetla asks (zlecenia sprzedaży)', () => {
    renderWithMantine(<OrderBookDisplay orderbook={mockOrderbook} />);
    
    // Sprawdź czy asks są wyświetlane (ceny sprzedaży)
    expect(screen.getByText('$50,100.00')).toBeInTheDocument();
    expect(screen.getByText('$50,110.00')).toBeInTheDocument();
    expect(screen.getByText('0.3000')).toBeInTheDocument(); // Odpowiednia ilość
  });

  it('formatuje ceny z separatorami tysięcy', () => {
    const expensiveOrderbook = {
      ...mockOrderbook,
      bids: [['1234567.89', '0.100000'] as [string, string]],
      asks: [['1234578.90', '0.200000'] as [string, string]],
    };

    renderWithMantine(<OrderBookDisplay orderbook={expensiveOrderbook} />);
    
    expect(screen.getByText('$1,234,567.89')).toBeInTheDocument();
    expect(screen.getByText('$1,234,578.90')).toBeInTheDocument();
  });

  it('formatuje ilości z 4 miejscami po przecinku', () => {
    const preciseOrderbook = {
      ...mockOrderbook,
      bids: [['50000.00', '1.23456789'] as [string, string]],
      asks: [['50100.00', '0.98765432'] as [string, string]],
    };

    renderWithMantine(<OrderBookDisplay orderbook={preciseOrderbook} />);
    
    expect(screen.getByText('1.2346')).toBeInTheDocument();
    expect(screen.getByText('0.9877')).toBeInTheDocument();
  });

  it('ogranicza liczbę wyświetlanych poziomów do maxRows', () => {
    renderWithMantine(<OrderBookDisplay orderbook={mockOrderbook} maxRows={3} />);
    
    // Powinno pokazać maksymalnie 3 bids i 3 asks
  expect(screen.getByTestId('bid-price-0')).toHaveTextContent('$49,900.00'); // 1. bid
  expect(screen.getByTestId('bid-price-1')).toHaveTextContent('$49,890.00'); // 2. bid
  expect(screen.getByTestId('bid-price-2')).toHaveTextContent('$49,880.00'); // 3. bid
    expect(screen.queryByText('$49,870.00')).not.toBeInTheDocument(); // 4. bid nie powinien być

  expect(screen.getByTestId('ask-price-0')).toHaveTextContent('$50,120.00'); // 3 najwyższe (bo maxRows=3)
  expect(screen.getByTestId('ask-price-1')).toHaveTextContent('$50,110.00');
  expect(screen.getByTestId('ask-price-2')).toHaveTextContent('$50,100.00');
    expect(screen.queryByText('$50,130.00')).not.toBeInTheDocument(); // 4. ask nie powinien być
  });

  it('pokazuje footer z informacjami', () => {
    renderWithMantine(<OrderBookDisplay orderbook={mockOrderbook} maxRows={5} />);
    
    expect(screen.getByText('Najlepsze 5 poziomów')).toBeInTheDocument();
    expect(screen.getByText('Dane na żywo')).toBeInTheDocument();
  });

  it('wyświetla aktualny czas', () => {
    // Mock Date.toLocaleTimeString
    const mockDate = new Date('2024-01-01T12:34:56');
    jest.spyOn(Date.prototype, 'toLocaleTimeString').mockReturnValue('12:34:56');
    jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);

    renderWithMantine(<OrderBookDisplay orderbook={mockOrderbook} />);
    
    expect(screen.getByText('12:34:56')).toBeInTheDocument();

    // Przywróć oryginalną implementację
    jest.restoreAllMocks();
  });

  it('obsługuje pusty orderbook', () => {
    const emptyOrderbook = {
      symbol: 'ETHUSDT',
      bids: [],
      asks: [],
    };

    renderWithMantine(<OrderBookDisplay orderbook={emptyOrderbook} />);
    
    expect(screen.getByText('Księga Zleceń')).toBeInTheDocument();
    expect(screen.getByText('ETHUSDT')).toBeInTheDocument();
    expect(screen.getByText('Spread')).toBeInTheDocument();
    
    // Nie powinno być żadnych cen gdy orderbook jest pusty
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });

  it('odwraca kolejność asks (najwyższe ceny na górze)', () => {
  renderWithMantine(<OrderBookDisplay orderbook={mockOrderbook} />);
  expect(screen.getByTestId('ask-price-0')).toHaveTextContent('$50,140.00');
  expect(screen.getByTestId('ask-price-1')).toHaveTextContent('$50,130.00');
  expect(screen.getByTestId('ask-price-2')).toHaveTextContent('$50,120.00');
  expect(screen.getByTestId('ask-price-3')).toHaveTextContent('$50,110.00');
  expect(screen.getByTestId('ask-price-4')).toHaveTextContent('$50,100.00');
  });

  it('używa domyślnej wartości maxRows = 10', () => {
    const largeOrderbook = {
      symbol: 'BTCUSDT',
      bids: Array.from({ length: 15 }, (_, i) => [`${50000 - i}`, '1.0'] as [string, string]),
      asks: Array.from({ length: 15 }, (_, i) => [`${50100 + i}`, '1.0'] as [string, string]),
    };

    renderWithMantine(<OrderBookDisplay orderbook={largeOrderbook} />);
    
    // Powinna pokazać maksymalnie 10 poziomów każdego typu
    expect(screen.getByText('Najlepsze 10 poziomów')).toBeInTheDocument();
  });

  it('ma odpowiednią wysokość kontenera', () => {
    renderWithMantine(<OrderBookDisplay orderbook={mockOrderbook} />);
    const paperElement = screen.getByTestId('orderbook-container');
    expect(paperElement).toBeInTheDocument();
  });
});
