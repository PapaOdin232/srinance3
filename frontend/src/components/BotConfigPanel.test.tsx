import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithMantine } from '../testUtils/renderWithMantine';
import BotConfigPanel from './BotConfigPanel';
import * as apiConfig from '../config/api';

// Mock ikon z Tabler
jest.mock('@tabler/icons-react', () => ({
  IconSettings: () => <div data-testid="settings-icon" />,
  IconRefresh: () => <div data-testid="refresh-icon" />,
  IconCheck: () => <div data-testid="check-icon" />,
  IconX: () => <div data-testid="x-icon" />,
  IconInfoCircle: () => <div data-testid="info-icon" />,
}));

// Mock API config
jest.mock('../config/api', () => ({
  secureApiCall: jest.fn(),
  API_CONFIG: {
    BASE_URL: 'http://localhost:8000',
    ENDPOINTS: {
      BOT_CONFIG: '/api/bot/config',
      BOT_STRATEGIES: '/api/bot/strategies',
    },
  },
}));

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('BotConfigPanel', () => {
  const mockConfig = {
    type: 'simple_ma',
    symbol: 'BTCUSDT',
    timeframe: '1h',
    parameters: {
      ma_period: 20,
      threshold: 0.5,
    },
    risk_management: {
      max_position_size: 1000,
      stop_loss_percentage: 2,
      take_profit_percentage: 3,
    },
  };

  const mockStrategies = {
    simple_ma: { name: 'Simple Moving Average' },
    rsi: { name: 'RSI Strategy' },
    grid: { name: 'Grid Trading' },
    dca: { name: 'Dollar Cost Averaging' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Mock successful API calls
    (apiConfig.secureApiCall as jest.Mock).mockImplementation((endpoint: string) => {
      if (endpoint.includes('/config')) {
        return Promise.resolve({
          json: () => Promise.resolve({ config: mockConfig }),
        });
      }
      if (endpoint.includes('/strategies')) {
        return Promise.resolve({
          json: () => Promise.resolve({ strategies: mockStrategies }),
        });
      }
      return Promise.resolve({ json: () => Promise.resolve({}) });
    });

    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ success: true }),
    });
  });

  it('pokazuje stan ładowania gdy config nie jest załadowany', () => {
    (apiConfig.secureApiCall as jest.Mock).mockImplementation(() => new Promise(() => {}));
    
    renderWithMantine(<BotConfigPanel isRunning={false} />);
    
    expect(screen.getByText('Bot Configuration')).toBeInTheDocument();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renderuje konfigurację po załadowaniu', async () => {
    renderWithMantine(<BotConfigPanel isRunning={false} />);
    
    await waitFor(() => {
      expect(screen.getByText('Bot Configuration')).toBeInTheDocument();
      expect(screen.getByDisplayValue('BTCUSDT')).toBeInTheDocument();
      expect(screen.getByText('Current Configuration Summary')).toBeInTheDocument();
    });
  });

  it('pokazuje błąd gdy nie udaje się załadować konfiguracji', async () => {
    (apiConfig.secureApiCall as jest.Mock).mockRejectedValue(new Error('API Error'));
    
    renderWithMantine(<BotConfigPanel isRunning={false} />);
    
    await waitFor(() => {
      expect(screen.getByText('Failed to load strategies')).toBeInTheDocument();
    });
  });

  it('wyłącza kontrolki gdy bot jest uruchomiony', async () => {
    renderWithMantine(<BotConfigPanel isRunning={true} />);
    
    await waitFor(() => {
      expect(screen.getByText('Save Configuration')).toBeInTheDocument();
    });
    
    // Sprawdź czy przycisk Save jest wyłączony
    const saveButton = screen.getByText('Save Configuration');
    const buttonElement = saveButton.closest('button');
    expect(buttonElement).toHaveAttribute('disabled');
    
    // Sprawdź także czy jest wyświetlany komunikat ostrzeżenia
    expect(screen.getByText('Bot is running. Stop the bot to modify configuration.')).toBeInTheDocument();
  });

  it('pozwala na zmianę strategii', async () => {
    renderWithMantine(<BotConfigPanel isRunning={false} />);
    
    await waitFor(() => {
      expect(screen.getByDisplayValue('BTCUSDT')).toBeInTheDocument();
    });

    // Znajdź select strategii i zmień wartość
    const strategySelect = screen.getByDisplayValue('simple_ma');
    expect(strategySelect).toBeInTheDocument();
  });

  it('wyświetla parametry dla strategii RSI', async () => {
    const rsiConfig = {
      ...mockConfig,
      type: 'rsi',
      parameters: {
        rsi_period: 14,
        rsi_oversold: 30,
        rsi_overbought: 70,
      },
    };

    (apiConfig.secureApiCall as jest.Mock).mockImplementation((endpoint: string) => {
      if (endpoint.includes('/config')) {
        return Promise.resolve({
          json: () => Promise.resolve({ config: rsiConfig }),
        });
      }
      if (endpoint.includes('/strategies')) {
        return Promise.resolve({
          json: () => Promise.resolve({ strategies: mockStrategies }),
        });
      }
      return Promise.resolve({ json: () => Promise.resolve({}) });
    });

    renderWithMantine(<BotConfigPanel isRunning={false} />);
    
    await waitFor(() => {
      expect(screen.getByText('RSI Period')).toBeInTheDocument();
      expect(screen.getByText('RSI Oversold')).toBeInTheDocument();
      expect(screen.getByText('RSI Overbought')).toBeInTheDocument();
    });
  });

  it('wyświetla parametry dla strategii Grid', async () => {
    const gridConfig = {
      ...mockConfig,
      type: 'grid',
      parameters: {
        grid_levels: 10,
        grid_spacing: 1,
        grid_amount: 100,
      },
    };

    (apiConfig.secureApiCall as jest.Mock).mockImplementation((endpoint: string) => {
      if (endpoint.includes('/config')) {
        return Promise.resolve({
          json: () => Promise.resolve({ config: gridConfig }),
        });
      }
      if (endpoint.includes('/strategies')) {
        return Promise.resolve({
          json: () => Promise.resolve({ strategies: mockStrategies }),
        });
      }
      return Promise.resolve({ json: () => Promise.resolve({}) });
    });

    renderWithMantine(<BotConfigPanel isRunning={false} />);
    
    await waitFor(() => {
      expect(screen.getByText('Grid Levels')).toBeInTheDocument();
      expect(screen.getByText('Grid Spacing (%)')).toBeInTheDocument();
      expect(screen.getByText('Grid Amount ($)')).toBeInTheDocument();
    });
  });

  it('wyświetla parametry dla strategii DCA', async () => {
    const dcaConfig = {
      ...mockConfig,
      type: 'dca',
      parameters: {
        dca_interval: 3600,
        dca_amount: 50,
        dca_price_drop: 2,
      },
    };

    (apiConfig.secureApiCall as jest.Mock).mockImplementation((endpoint: string) => {
      if (endpoint.includes('/config')) {
        return Promise.resolve({
          json: () => Promise.resolve({ config: dcaConfig }),
        });
      }
      if (endpoint.includes('/strategies')) {
        return Promise.resolve({
          json: () => Promise.resolve({ strategies: mockStrategies }),
        });
      }
      return Promise.resolve({ json: () => Promise.resolve({}) });
    });

    renderWithMantine(<BotConfigPanel isRunning={false} />);
    
    await waitFor(() => {
      expect(screen.getByText('DCA Interval (seconds)')).toBeInTheDocument();
      expect(screen.getByText('DCA Amount ($)')).toBeInTheDocument();
      expect(screen.getByText('Price Drop Trigger (%)')).toBeInTheDocument();
    });
  });

  it('zapisuje konfigurację po kliknięciu Save', async () => {
    const onConfigUpdate = jest.fn();
    renderWithMantine(<BotConfigPanel isRunning={false} onConfigUpdate={onConfigUpdate} />);
    
    await waitFor(() => {
      expect(screen.getByText('Save Configuration')).toBeInTheDocument();
    });

    const saveButton = screen.getByText('Save Configuration');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8000/api/bot/config',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(mockConfig),
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Configuration updated successfully!')).toBeInTheDocument();
      expect(onConfigUpdate).toHaveBeenCalled();
    });
  });

  it('odświeża konfigurację po kliknięciu Refresh', async () => {
    renderWithMantine(<BotConfigPanel isRunning={false} />);
    
    await waitFor(() => {
      expect(screen.getByText('Refresh')).toBeInTheDocument();
    });

    const refreshButton = screen.getByText('Refresh');
    fireEvent.click(refreshButton);

    // Sprawdź czy API zostało wywołane ponownie
    await waitFor(() => {
      expect(apiConfig.secureApiCall).toHaveBeenCalledTimes(4); // 2 initial + 2 refresh
    });
  });

  it('wyświetla informację o braku parametrów dla nieznanych strategii', async () => {
    const unknownConfig = {
      ...mockConfig,
      type: 'unknown_strategy',
    };

    (apiConfig.secureApiCall as jest.Mock).mockImplementation((endpoint: string) => {
      if (endpoint.includes('/config')) {
        return Promise.resolve({
          json: () => Promise.resolve({ config: unknownConfig }),
        });
      }
      if (endpoint.includes('/strategies')) {
        return Promise.resolve({
          json: () => Promise.resolve({ strategies: mockStrategies }),
        });
      }
      return Promise.resolve({ json: () => Promise.resolve({}) });
    });

    renderWithMantine(<BotConfigPanel isRunning={false} />);
    
    await waitFor(() => {
      expect(screen.getByText('Parameters for "unknown_strategy" strategy are not yet implemented')).toBeInTheDocument();
    });
  });

  it('wyświetla sekcję risk management', async () => {
    renderWithMantine(<BotConfigPanel isRunning={false} />);
    
    await waitFor(() => {
      expect(screen.getByText('Risk Management')).toBeInTheDocument();
      expect(screen.getByText('Max Position Size ($)')).toBeInTheDocument();
      expect(screen.getByText('Stop Loss (%)')).toBeInTheDocument();
      expect(screen.getByText('Take Profit (%)')).toBeInTheDocument();
    });
  });

  it('obsługuje błędy zapisu konfiguracji', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    renderWithMantine(<BotConfigPanel isRunning={false} />);
    
    await waitFor(() => {
      expect(screen.getByText('Save Configuration')).toBeInTheDocument();
    });

    const saveButton = screen.getByText('Save Configuration');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText('Failed to update configuration')).toBeInTheDocument();
    });
  });
});
