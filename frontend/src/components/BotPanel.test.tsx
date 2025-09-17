import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithMantine } from '../testUtils/renderWithMantine';
import axios from 'axios';
jest.mock('axios');
import BotPanel from './BotPanel';
// Stub PredefinedStrategies to avoid rendering complexity & icon issues in test
jest.mock('./PredefinedStrategies', () => () => <div data-testid="predefined-strategies" />);

// Mock WebSocket
const mockWebSocket = {
  send: jest.fn(),
  isConnected: jest.fn().mockReturnValue(true),
  destroy: jest.fn(),
  reconnect: jest.fn(),
  addStateListener: jest.fn((cb?: any) => cb && cb('CONNECTED')),
  addListener: jest.fn(),
};

jest.mock('../services/wsClient', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => mockWebSocket),
  ConnectionState: {
    CONNECTED: 'CONNECTED',
    DISCONNECTED: 'DISCONNECTED',
    ERROR: 'ERROR'
  },
  getConnectionStateDisplay: jest.fn().mockReturnValue({
    icon: '🟢',
    text: 'Połączony',
    color: '#4CAF50'
  })
}));

// Mock useAssets aby uniknąć realnych wywołań axios z fetchAllTradingPairs
jest.mock('../hooks/useAssets', () => ({
  useAssets: () => ({
    assets: [{ symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT', price: 50000, priceChange: 100, priceChangePercent: 2, volume: 1000000, count: 1, status: 'TRADING' }],
    loading: false,
    error: null,
    refetch: jest.fn(),
  isConnected: true,
  setPreferredQuotes: jest.fn()
  })
}));

// Mock dla ikon z Tabler
jest.mock('@tabler/icons-react', () => ({
  IconPlayerPlay: () => <div data-testid="play-icon" />,
  IconPlayerStop: () => <div data-testid="stop-icon" />,
  IconTrash: () => <div data-testid="trash-icon" />,
  IconRefresh: () => <div data-testid="refresh-icon" />,
  IconAlertCircle: () => <div data-testid="alert-icon" />,
  IconRobot: () => <div data-testid="robot-icon" />,
  IconTrendingUp: () => <div data-testid="trending-up-icon" />,
  IconCurrencyDollar: () => <div data-testid="currency-icon" />,
  IconClock: () => <div data-testid="clock-icon" />,
  IconSettings: () => <div data-testid="settings-icon" />,
  IconChartLine: () => <div data-testid="chart-icon" />,
}));

// Mock scrollIntoView
Element.prototype.scrollIntoView = jest.fn();

  const customRender = (component: React.ReactElement) => {
    (axios.get as jest.Mock).mockResolvedValue({ data: {} });
    (axios.post as jest.Mock).mockResolvedValue({ data: {} });
    return renderWithMantine(component);
  };

describe('BotPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Zapewnij że po każdym czyszczeniu ponownie ustawiamy natychmiastową zmianę stanu na CONNECTED
    mockWebSocket.addStateListener.mockImplementation((cb?: any) => cb && cb('CONNECTED'));
    mockWebSocket.isConnected.mockReturnValue(true);
    // Mock fetch dla secureApiCall (ładowanie configu oraz w handleStartBot)
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({ config: { symbol: 'BTCUSDT', type: 'simple_momentum' } })
    }) as any;
  });

  it('renderuje podstawowe elementy', async () => {
  customRender(<BotPanel />);
    await waitFor(() => {
      expect(screen.getByText('Panel Bota Tradingowego')).toBeInTheDocument();
      expect(screen.getByText('Status Bota')).toBeInTheDocument();
      expect(screen.getByText(/Status Bota/)).toBeInTheDocument();
    });
  });

  it('obsługuje start bota z nowym UI', async () => {
  customRender(<BotPanel />);
    const listener = mockWebSocket.addListener.mock.calls[0]?.[0];
    expect(listener).toBeDefined();
    mockWebSocket.send.mockImplementation((msg) => {
      if (msg.type === 'start_bot') {
  // Symulacja asynchronicznej odpowiedzi statusowej bota
  setTimeout(() => listener && listener({ type: 'bot_status', running: true, status: { running: true, symbol: msg.symbol, strategy: msg.strategy } }), 0);
      }
      return true;
    });
    const startButton = await screen.findByText('Uruchom Bota');
    fireEvent.click(startButton);
    await waitFor(() => expect(mockWebSocket.send).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText('URUCHOMIONY')).toBeInTheDocument());
  });

  it('obsługuje zatrzymanie bota', async () => {
    customRender(<BotPanel />);
    const listener = mockWebSocket.addListener.mock.calls[0]?.[0];
    expect(listener).toBeDefined();
    mockWebSocket.send.mockImplementation((msg) => {
      if (msg.type === 'start_bot') {
        setTimeout(() => listener && listener({ type: 'bot_status', running: true, status: { running: true, symbol: msg.symbol, strategy: msg.strategy } }), 0);
      }
      if (msg.type === 'stop_bot') {
        setTimeout(() => listener && listener({ type: 'bot_status', running: false, status: { running: false, symbol: 'BTCUSDT', strategy: 'simple_momentum' } }), 0);
      }
      return true;
    });
    const startButton = await screen.findByText('Uruchom Bota');
    fireEvent.click(startButton);
    await waitFor(() => expect(screen.getByText('URUCHOMIONY')).toBeInTheDocument());
    const stopButton = await screen.findByText('Zatrzymaj Bota');
    fireEvent.click(stopButton);
    // Może wystąpić dodatkowe wywołanie 'get_status' po połączeniu, więc sprawdzamy typy zamiast liczby
    await waitFor(() => {
      const types = mockWebSocket.send.mock.calls.map(c => c[0]?.type);
      expect(types).toContain('start_bot');
      expect(types).toContain('stop_bot');
    });
    await waitFor(() => expect(screen.getByText('ZATRZYMANY')).toBeInTheDocument());
  });
});
