// Mock dla react-chartjs-2 i chart.js, aby uniknąć problemów z canvas w jsdom
jest.mock('react-chartjs-2', () => ({
  Line: () => <div data-testid="mock-line-chart" />,
  Bar: () => <div data-testid="mock-bar-chart" />,
}));

jest.mock('chart.js', () => ({
  Chart: {
    register: jest.fn(),
  },
  LineController: {},
  LineElement: {},
  PointElement: {},
  LinearScale: {},
  CategoryScale: {},
  Title: {},
  Tooltip: {},
  Legend: {},
}));
// Mock lightweight-charts (mapped też przez moduleNameMapper)
jest.mock('lightweight-charts', () => ({
  createChart: jest.fn(() => ({
    addSeries: jest.fn(() => ({ setData: jest.fn(), update: jest.fn(), applyOptions: jest.fn() })),
    addCandlestickSeries: jest.fn(() => ({ setData: jest.fn(), update: jest.fn(), applyOptions: jest.fn() })),
    timeScale: jest.fn(() => ({ fitContent: jest.fn() })),
    remove: jest.fn(),
    applyOptions: jest.fn(),
  })),
  CandlestickSeries: jest.fn(),
}));
// Mock binanceAPI to uniknąć realnych wywołań i opóźnionych logów po zakończeniu testu
jest.mock('../services/binanceAPI', () => ({
  fetchLightweightChartsKlines: jest.fn(async (_symbol: string, _interval: string, limit: number) => {
    // deterministyczne dane świecowe
    return Array.from({ length: limit }, (_, i) => ({
      time: 1700000000 + i * 60,
      open: 100 + i,
      high: 101 + i,
      low: 99 + i,
      close: 100.5 + i,
    }));
  })
}));
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import MarketPanel from './MarketPanel';
import * as restClient from '../services/restClient';

jest.mock('../services/restClient', () => ({
  getCurrentTicker: jest.fn(async (symbol: string) => ({ symbol, price: '50000', change: '100', changePercent: '2.00%' })),
  getOrderBook: jest.fn(async (symbol: string) => ({ symbol, bids: [['49900','0.5']], asks: [['50100','0.3']] }))
}));
jest.mock('../hooks/useAssets');
jest.mock('../services/wsClient', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    addListener: jest.fn(),
    addStateListener: jest.fn((cb: any) => cb('CONNECTED')),
    send: jest.fn(),
    destroy: jest.fn(),
    reconnect: jest.fn(),
    isConnected: jest.fn().mockReturnValue(true)
  })),
  ConnectionState: {
    CONNECTED: 'CONNECTED',
    DISCONNECTED: 'DISCONNECTED',
    ERROR: 'ERROR'
  },
  getConnectionStateDisplay: jest.fn(() => ({ icon: '🟢', text: 'Połączony', color: '#4CAF50' }))
}));

const mockTicker = { symbol: 'BTCUSDT', price: '50000' };
const mockOrderbook = {
  bids: [['49900', '0.5']],
  asks: [['50100', '0.3']],
};

describe('MarketPanel', () => {
  beforeEach(() => {
  (restClient.getCurrentTicker as jest.Mock).mockResolvedValue(mockTicker);
  (restClient.getOrderBook as jest.Mock).mockResolvedValue(mockOrderbook);
    (require('../hooks/useAssets').useAssets as jest.Mock).mockReturnValue({
      assets: [{ symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT', price: 50000, priceChange: 100, priceChangePercent: 2, volume: 1000000, count: 1, status: 'TRADING' }],
      loading: false,
      error: null,
      refetch: jest.fn(),
      isConnected: true,
      setPreferredQuotes: jest.fn()
    });
  });

  it('renderuje ticker i orderbook', async () => {
    render(<MantineProvider><MarketPanel /></MantineProvider>);
    expect(await screen.findByText(/BTCUSDT/)).toBeInTheDocument();
  });
});
