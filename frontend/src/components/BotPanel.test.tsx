import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import BotPanel from './BotPanel';

// Mock WebSocket
const mockWebSocket = {
  send: jest.fn(),
  isConnected: jest.fn().mockReturnValue(true),
  destroy: jest.fn(),
  reconnect: jest.fn(),
  addStateListener: jest.fn(),
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
}));

// Mock scrollIntoView
Element.prototype.scrollIntoView = jest.fn();

const renderWithMantine = (component: React.ReactElement) => {
  return render(
    <MantineProvider>
      {component}
    </MantineProvider>
  );
};

describe('BotPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renderuje panel bota z nowym designem', async () => {
    renderWithMantine(<BotPanel />);
    
    await waitFor(() => {
      expect(screen.getByText('Panel Bota Tradingowego')).toBeInTheDocument();
      expect(screen.getByText('Status Bota')).toBeInTheDocument();
      expect(screen.getByText('Kontrola Bota')).toBeInTheDocument();
      expect(screen.getByText('Logi na żywo')).toBeInTheDocument();
    });
  });

  it('obsługuje start bota z nowym UI', async () => {
    mockWebSocket.send.mockReturnValue(true);
    renderWithMantine(<BotPanel />);
    
    await waitFor(() => {
      const startButton = screen.getByText('Uruchom Bota');
      fireEvent.click(startButton);
      expect(mockWebSocket.send).toHaveBeenCalledWith({
        type: 'start_bot',
        symbol: 'BTCUSDT',
        strategy: 'simple_momentum'
      });
    });
  });
});
