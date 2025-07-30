import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import IntervalSelector from './IntervalSelector';

// Mock dla ikon z Tabler
jest.mock('@tabler/icons-react', () => ({
  IconClock: () => <div data-testid="clock-icon" />,
}));

const renderWithMantine = (component: React.ReactElement) => {
  return render(
    <MantineProvider>
      {component}
    </MantineProvider>
  );
};

describe('IntervalSelector', () => {
  const mockOnIntervalChange = jest.fn();

  beforeEach(() => {
    mockOnIntervalChange.mockClear();
  });

  it('renderuje się poprawnie z domyślnie wybranym interwałem', () => {
    renderWithMantine(
      <IntervalSelector 
        selectedInterval="1m" 
        onIntervalChange={mockOnIntervalChange} 
      />
    );
    
    expect(screen.getByText('Interwał:')).toBeInTheDocument();
    expect(screen.getByTestId('clock-icon')).toBeInTheDocument();
    expect(screen.getByText('1 minuta')).toBeInTheDocument();
  });

  it('wyświetla wszystkie dostępne interwały', () => {
    renderWithMantine(
      <IntervalSelector 
        selectedInterval="1m" 
        onIntervalChange={mockOnIntervalChange} 
      />
    );
    
    const intervals = ['1M', '5M', '15M', '1H', '4H', '1D'];
    intervals.forEach(interval => {
      expect(screen.getByText(interval)).toBeInTheDocument();
    });
  });

  it('wywołuje onIntervalChange przy kliknięciu', () => {
    renderWithMantine(
      <IntervalSelector 
        selectedInterval="1m" 
        onIntervalChange={mockOnIntervalChange} 
      />
    );
    
    fireEvent.click(screen.getByText('5M'));
    expect(mockOnIntervalChange).toHaveBeenCalledWith('5m');
  });

  it('wyświetla poprawny opis dla wybranego interwału', () => {
    renderWithMantine(
      <IntervalSelector 
        selectedInterval="4h" 
        onIntervalChange={mockOnIntervalChange} 
      />
    );
    
    expect(screen.getByText('4 godziny')).toBeInTheDocument();
  });

  it('może być wyłączony', () => {
    renderWithMantine(
      <IntervalSelector 
        selectedInterval="1m" 
        onIntervalChange={mockOnIntervalChange}
        disabled={true}
      />
    );
    
    const buttons = screen.getAllByRole('button');
    buttons.forEach(button => {
      expect(button).toBeDisabled();
    });
  });

  it('wyróżnia aktualnie wybrany interwał', () => {
    renderWithMantine(
      <IntervalSelector 
        selectedInterval="15m" 
        onIntervalChange={mockOnIntervalChange} 
      />
    );
    
    const selectedButton = screen.getByText('15M').closest('button');
    expect(selectedButton).toHaveAttribute('data-variant', 'filled');
  });
});
