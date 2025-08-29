import React from 'react';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { renderWithMantine } from '../testUtils/renderWithMantine';
import { UserStreamProvider } from '../store/userStream';
import OrdersPanel from './OrdersPanel';

// Mock WebSocket
const mockWebSocket = {
  close: jest.fn(),
  send: jest.fn(),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  readyState: 0,
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3
};
global.WebSocket = jest.fn().mockImplementation(() => mockWebSocket) as any;

jest.mock('../hooks/useAssets', () => ({
  useAssets: () => ({
    assets: [
      { symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT', price: 50000, priceChange: 0, priceChangePercent: 0, volume: 0, count: 0, status: 'TRADING' },
      { symbol: 'ETHUSDT', baseAsset: 'ETH', quoteAsset: 'USDT', price: 3000, priceChange: 0, priceChangePercent: 0, volume: 0, count: 0, status: 'TRADING' }
    ],
    loading: false,
    error: null,
    refetch: jest.fn(),
    isConnected: true,
    setPreferredQuotes: jest.fn()
  })
}));

jest.mock('../services/restClient', () => {
  const now = Date.now();
  return {
    getOpenOrders: jest.fn().mockResolvedValue({ orders: [
      { symbol: 'BTCUSDT', orderId: 1, orderListId: -1, clientOrderId: 'abc', price: '50000.00', origQty: '0.01000000', executedQty: '0.00000000', cummulativeQuoteQty: '0', status: 'NEW', timeInForce: 'GTC', type: 'LIMIT', side: 'BUY', time: now, updateTime: now, isWorking: true, origQuoteOrderQty: '0' },
      { symbol: 'ETHUSDT', orderId: 3, orderListId: -1, clientOrderId: 'ghi', price: '3000.00', origQty: '0.20000000', executedQty: '0.00000000', cummulativeQuoteQty: '0', status: 'NEW', timeInForce: 'GTC', type: 'LIMIT', side: 'SELL', time: now, updateTime: now, isWorking: true, origQuoteOrderQty: '0' }
    ] }),
    getOrdersHistory: jest.fn().mockImplementation((symbol: string) => {
      const baseOrderId = symbol === 'BTCUSDT' ? 2 : 4;
      return Promise.resolve({ orders: [
        { symbol, orderId: baseOrderId, orderListId: -1, clientOrderId: `hist-${symbol}`, price: '49900.00', origQty: '0.01000000', executedQty: '0.01000000', cummulativeQuoteQty: '0', status: 'FILLED', timeInForce: 'GTC', type: 'LIMIT', side: 'BUY', time: now - 1000, updateTime: now - 1000, isWorking: false, origQuoteOrderQty: '0' }
      ] });
    }),
    cancelOrder: jest.fn().mockResolvedValue({ success: true })
  };
});

const renderWithProviders = (component: React.ReactElement) => {
  return renderWithMantine(
    <UserStreamProvider>
      {component}
    </UserStreamProvider>
  );
};

describe('OrdersPanel', () => {
  it('renderuje i pokazuje otwarte zlecenia wszystkich symboli', async () => {
    renderWithProviders(<OrdersPanel />);
    await screen.findByText('Zarządzanie Zleceniami');
    await screen.findAllByText('Otwarte Zlecenia');
    await screen.findByText('BTCUSDT');
    await screen.findByText('ETHUSDT');
  });

  it('filtruje po symbolu', async () => {
    renderWithProviders(<OrdersPanel />);
    const select = await screen.findByTestId('filter-select');
    fireEvent.change(select, { target: { value: 'BTCUSDT' } });
    await waitFor(() => expect(screen.getByText('BTCUSDT')).toBeInTheDocument());
  });

  it('przełącza na historię zleceń', async () => {
    renderWithProviders(<OrdersPanel />);
    const historyTab = await screen.findByRole('tab', { name: 'Historia Zleceń' });
    fireEvent.click(historyTab);
    await screen.findAllByText('Historia Zleceń');
    
  // Stabilny selektor dla komunikatu o wybraniu symbolu
  expect(screen.getByTestId('history-hint')).toBeInTheDocument();
  });
});
