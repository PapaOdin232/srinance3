import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithMantine } from '../testUtils/renderWithMantine';
import PredefinedStrategies from './PredefinedStrategies';
import * as apiConfig from '../config/api';

// Mock API calls
jest.mock('../config/api', () => ({
  secureApiCall: jest.fn(),
}));

const mockSecureApiCall = apiConfig.secureApiCall as jest.Mock;

describe('PredefinedStrategies', () => {
  const mockStrategies = {
    conservative_scalping: {
      name: 'Conservative Scalping',
      description: 'Safe scalping strategy for small price movements',
      emoji: '🛡️',
      tags: ['Low Risk', 'Scalping', 'Fast']
    },
    aggressive_momentum: {
      name: 'Aggressive Momentum',
      description: 'High-risk strategy for strong trends',
      emoji: '🚀',
      tags: ['High Risk', 'Momentum', 'Trends']
    },
    stable_dca: {
      name: 'Stable DCA',
      description: 'Dollar Cost Averaging for long-term investors',
      emoji: '📈',
      tags: ['Long Term', 'DCA', 'Stable']
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock successful strategies loading by default
    mockSecureApiCall.mockImplementation((endpoint: string) => {
      if (endpoint.includes('predefined-strategies')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ strategies: mockStrategies })
        });
      }
      if (endpoint.includes('select-strategy')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ 
            message: 'Strategy applied successfully',
            strategy_key: 'conservative_scalping'
          })
        });
      }
      return Promise.resolve({ 
        ok: true, 
        json: () => Promise.resolve({}) 
      });
    });
  });

  it('renders loading state initially', () => {
    // Mock pending promise to keep loading state
    mockSecureApiCall.mockImplementation(() => new Promise(() => {}));
    
    renderWithMantine(<PredefinedStrategies isRunning={false} />);
    
    expect(screen.getByText('Loading predefined strategies...')).toBeInTheDocument();
    // Note: Mantine Loader doesn't have role="progressbar", so we just check for text
  });

  it('renders strategies after loading', async () => {
    renderWithMantine(<PredefinedStrategies isRunning={false} />);
    
    await waitFor(() => {
      expect(screen.getByText('Predefined Trading Strategies')).toBeInTheDocument();
      expect(screen.getByText('Conservative Scalping')).toBeInTheDocument();
      expect(screen.getByText('Aggressive Momentum')).toBeInTheDocument();
      expect(screen.getByText('Stable DCA')).toBeInTheDocument();
    });
  });

  it('displays strategy descriptions and tags', async () => {
    renderWithMantine(<PredefinedStrategies isRunning={false} />);
    
    await waitFor(() => {
      expect(screen.getByText('Safe scalping strategy for small price movements')).toBeInTheDocument();
      expect(screen.getByText('Low Risk')).toBeInTheDocument();
      expect(screen.getByText('Scalping')).toBeInTheDocument();
      expect(screen.getByText('High Risk')).toBeInTheDocument();
      expect(screen.getByText('Momentum')).toBeInTheDocument();
    });
  });

  it('allows selecting a strategy when bot is not running', async () => {
    const mockOnStrategySelect = jest.fn();
    
    renderWithMantine(
      <PredefinedStrategies 
        isRunning={false} 
        onStrategySelect={mockOnStrategySelect}
      />
    );
    
    await waitFor(() => {
      expect(screen.getByText('Conservative Scalping')).toBeInTheDocument();
    });
    
    const selectButton = screen.getAllByText('Select Strategy')[0];
    fireEvent.click(selectButton);
    
    await waitFor(() => {
      expect(mockSecureApiCall).toHaveBeenCalledWith('/bot/select-strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategy_key: 'conservative_scalping' })
      });
      expect(mockOnStrategySelect).toHaveBeenCalledWith('conservative_scalping');
    });
  });

  it('shows success message after selecting strategy', async () => {
    renderWithMantine(<PredefinedStrategies isRunning={false} />);
    
    await waitFor(() => {
      expect(screen.getByText('Conservative Scalping')).toBeInTheDocument();
    });
    
    const selectButton = screen.getAllByText('Select Strategy')[0];
    fireEvent.click(selectButton);
    
    await waitFor(() => {
      expect(screen.getByText('Strategy applied successfully')).toBeInTheDocument();
    });
  });

  it('disables strategy selection when bot is running', async () => {
    renderWithMantine(<PredefinedStrategies isRunning={true} />);
    
    await waitFor(() => {
      expect(screen.getByText('Bot is currently running. Stop the bot to select a different strategy.')).toBeInTheDocument();
    });
    
    const selectButtons = screen.getAllByText('Select Strategy');
    selectButtons.forEach(button => {
      expect(button.closest('button')).toBeDisabled();
    });
  });

  it('handles API errors gracefully', async () => {
    mockSecureApiCall.mockRejectedValue(new Error('Network error'));
    
    renderWithMantine(<PredefinedStrategies isRunning={false} />);
    
    await waitFor(() => {
      // The component shows "No predefined strategies available" when there's an error loading
      expect(screen.getByText('No predefined strategies available')).toBeInTheDocument();
    });
  });

  it('handles strategy selection errors', async () => {
    // Mock successful loading but failed selection
    mockSecureApiCall.mockImplementation((endpoint: string) => {
      if (endpoint.includes('predefined-strategies')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ strategies: mockStrategies })
        });
      }
      if (endpoint.includes('select-strategy')) {
        return Promise.resolve({
          ok: false,
          status: 400,
          statusText: 'Bad Request',
          json: () => Promise.resolve({ detail: 'Invalid strategy' })
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    
    renderWithMantine(<PredefinedStrategies isRunning={false} />);
    
    await waitFor(() => {
      expect(screen.getByText('Conservative Scalping')).toBeInTheDocument();
    });
    
    const selectButton = screen.getAllByText('Select Strategy')[0];
    fireEvent.click(selectButton);
    
    await waitFor(() => {
      expect(screen.getByText('Invalid strategy')).toBeInTheDocument();
    });
  });

  it('displays empty state when no strategies are available', async () => {
    mockSecureApiCall.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ strategies: {} })
    });
    
    renderWithMantine(<PredefinedStrategies isRunning={false} />);
    
    await waitFor(() => {
      expect(screen.getByText('No predefined strategies available')).toBeInTheDocument();
      expect(screen.getByText('Retry Loading')).toBeInTheDocument();
    });
  });

  it('allows refreshing strategies list', async () => {
    renderWithMantine(<PredefinedStrategies isRunning={false} />);
    
    await waitFor(() => {
      expect(screen.getByText('Predefined Trading Strategies')).toBeInTheDocument();
    });
    
    const refreshButton = screen.getByText('Refresh');
    fireEvent.click(refreshButton);
    
    // Should call API again
    expect(mockSecureApiCall).toHaveBeenCalledTimes(2); // Initial load + refresh
  });

  it('shows loading state for individual strategy selection', async () => {
    // Mock slow strategy selection
    mockSecureApiCall.mockImplementation((endpoint: string) => {
      if (endpoint.includes('predefined-strategies')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ strategies: mockStrategies })
        });
      }
      if (endpoint.includes('select-strategy')) {
        return new Promise(() => {}); // Never resolves to keep loading
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    
    renderWithMantine(<PredefinedStrategies isRunning={false} />);
    
    await waitFor(() => {
      expect(screen.getByText('Conservative Scalping')).toBeInTheDocument();
    });
    
    const selectButton = screen.getAllByText('Select Strategy')[0];
    fireEvent.click(selectButton);
    
    // Should show loading state on the button
    await waitFor(() => {
      const buttonElement = selectButton.closest('button');
      expect(buttonElement).toHaveAttribute('data-loading', 'true');
    });
  });

  it('displays strategy emojis and icons correctly', async () => {
    renderWithMantine(<PredefinedStrategies isRunning={false} />);
    
    await waitFor(() => {
      expect(screen.getByText('🛡️')).toBeInTheDocument(); // Conservative strategy emoji
      expect(screen.getByText('🚀')).toBeInTheDocument(); // Aggressive strategy emoji
      expect(screen.getByText('📈')).toBeInTheDocument(); // DCA strategy emoji
    });
  });

  it('highlights selected strategy correctly', async () => {
    renderWithMantine(<PredefinedStrategies isRunning={false} />);
    
    await waitFor(() => {
      expect(screen.getByText('Conservative Scalping')).toBeInTheDocument();
    });
    
    const selectButton = screen.getAllByText('Select Strategy')[0];
    fireEvent.click(selectButton);
    
    await waitFor(() => {
      expect(screen.getByText('Currently Selected')).toBeInTheDocument();
      expect(screen.getByText('Active')).toBeInTheDocument();
    });
  });
});