import React from 'react';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

// Komponent testowy który rzuca błąd
const ThrowError: React.FC<{ shouldThrow?: boolean }> = ({ shouldThrow = false }) => {
  if (shouldThrow) {
    throw new Error('Test error message');
  }
  return <div>Normal component</div>;
};

// Konsola może wyświetlać błędy podczas testów, więc je wyciszamy
const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

describe('ErrorBoundary', () => {
  beforeEach(() => {
    consoleSpy.mockClear();
  });

  afterAll(() => {
    consoleSpy.mockRestore();
  });

  it('renderuje dzieci gdy nie ma błędów', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={false} />
      </ErrorBoundary>
    );
    
    expect(screen.getByText('Normal component')).toBeInTheDocument();
  });

  it('renderuje komunikat błędu gdy komponent dziecko rzuca błąd', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );
    
    expect(screen.getByText('Wystąpił błąd w komponencie.')).toBeInTheDocument();
    expect(screen.getByText('Test error message')).toBeInTheDocument();
  });

  it('ma odpowiedni styl dla komunikatu błędu', () => {
    const { container } = render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );
    
    const errorDiv = container.firstChild as HTMLElement;
    expect(errorDiv).toHaveStyle({
      color: 'red',
      padding: '16px',
      background: '#fee'
    });
  });

  it('wyświetla szczegóły błędu w elemencie pre', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );
    
    const preElement = screen.getByText('Test error message');
    expect(preElement.tagName).toBe('PRE');
  });

  it('łapie błędy z różnych komponentów dzieci', () => {
    const AnotherErrorComponent = () => {
      throw new Error('Different error');
    };

    render(
      <ErrorBoundary>
        <div>
          <span>Some content</span>
          <AnotherErrorComponent />
        </div>
      </ErrorBoundary>
    );
    
    expect(screen.getByText('Wystąpił błąd w komponencie.')).toBeInTheDocument();
    expect(screen.getByText('Different error')).toBeInTheDocument();
  });

  it('resetuje stan po ponownym renderowaniu z nowymi props', () => {
    const { rerender } = render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );
    
    // Sprawdź że błąd jest wyświetlany
    expect(screen.getByText('Wystąpił błąd w komponencie.')).toBeInTheDocument();
    
    // Ponowne renderowanie z komponentem, który nie rzuca błędu
    // Uwaga: ErrorBoundary nie resetuje się automatycznie - to jest ograniczenie React
    // W rzeczywistości trzeba by zmienić key, ale testujemy obecne zachowanie
    rerender(
      <ErrorBoundary>
        <ThrowError shouldThrow={false} />
      </ErrorBoundary>
    );
    
    // ErrorBoundary nadal będzie pokazywać błąd bo nie resetuje stanu
    expect(screen.getByText('Wystąpił błąd w komponencie.')).toBeInTheDocument();
  });

  it('obsługuje przypadek gdy error.message jest undefined', () => {
    const ComponentWithUndefinedError = () => {
      const error = new Error();
      error.message = undefined as any;
      throw error;
    };

    render(
      <ErrorBoundary>
        <ComponentWithUndefinedError />
      </ErrorBoundary>
    );
    
    expect(screen.getByText('Wystąpił błąd w komponencie.')).toBeInTheDocument();
    // Pre element nadal powinien być obecny, nawet jeśli message jest undefined
    const preElements = screen.getByRole('heading').parentElement?.querySelectorAll('pre');
    expect(preElements).toHaveLength(1);
  });
});
