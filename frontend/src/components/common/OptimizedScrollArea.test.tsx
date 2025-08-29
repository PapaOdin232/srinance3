import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { OptimizedScrollArea } from './OptimizedScrollArea';

const renderWithMantine = (component: React.ReactElement) => {
  return render(
    <MantineProvider>
      {component}
    </MantineProvider>
  );
};

describe('OptimizedScrollArea', () => {
  it('renderuje się poprawnie z podstawową zawartością', () => {
    renderWithMantine(
      <OptimizedScrollArea>
        <div>Test content</div>
      </OptimizedScrollArea>
    );
    
    expect(screen.getByText('Test content')).toBeInTheDocument();
  });

  it('przekazuje wszystkie props do ScrollArea', () => {
    const testProps = {
      'data-testid': 'scroll-area',
      h: 300,
      w: 500,
    };
    
    renderWithMantine(
      <OptimizedScrollArea {...testProps}>
        <div>Content</div>
      </OptimizedScrollArea>
    );
    
    expect(screen.getByTestId('scroll-area')).toBeInTheDocument();
  });

  it('dodaje klasę dla optymalizacji długich list', () => {
    renderWithMantine(
      <OptimizedScrollArea optimizeForLongLists data-testid="scroll-area">
        <div>Long list content</div>
      </OptimizedScrollArea>
    );
    
    const scrollArea = screen.getByTestId('scroll-area');
    expect(scrollArea).toHaveClass('virtualized-list');
  });

  it('dodaje klasę dla optymalizacji częstych aktualizacji', () => {
    renderWithMantine(
      <OptimizedScrollArea optimizeForFrequentUpdates data-testid="scroll-area">
        <div>Frequently updated content</div>
      </OptimizedScrollArea>
    );
    
    const scrollArea = screen.getByTestId('scroll-area');
    expect(scrollArea).toHaveClass('frequent-updates');
  });

  it('łączy klasy gdy włączone są obie optymalizacje', () => {
    renderWithMantine(
      <OptimizedScrollArea 
        optimizeForLongLists 
        optimizeForFrequentUpdates 
        data-testid="scroll-area"
      >
        <div>Optimized content</div>
      </OptimizedScrollArea>
    );
    
    const scrollArea = screen.getByTestId('scroll-area');
    expect(scrollArea).toHaveClass('virtualized-list');
    expect(scrollArea).toHaveClass('frequent-updates');
  });

  it('zachowuje istniejące klasy CSS', () => {
    renderWithMantine(
      <OptimizedScrollArea 
        className="custom-class" 
        optimizeForLongLists 
        data-testid="scroll-area"
      >
        <div>Content</div>
      </OptimizedScrollArea>
    );
    
    const scrollArea = screen.getByTestId('scroll-area');
    expect(scrollArea).toHaveClass('custom-class');
    expect(scrollArea).toHaveClass('virtualized-list');
  });

  it('aplikuje style optymalizujące wydajność', () => {
    renderWithMantine(
      <OptimizedScrollArea data-testid="scroll-area">
        <div>Content</div>
      </OptimizedScrollArea>
    );
    
    const scrollArea = screen.getByTestId('scroll-area');
    
    // Sprawdź czy zostały zastosowane optymalizacje
    expect(scrollArea.style.transform).toBe('translateZ(0)');
    expect(scrollArea.style.willChange).toBe('scroll-position');
    expect(scrollArea.style.overscrollBehavior).toBe('contain');
    expect((scrollArea.style as any).WebkitOverflowScrolling).toBe('touch');
    expect(scrollArea.style.contain).toBe('layout style paint');
  });

  it('łączy style niestandardowe ze stylami optymalizującymi', () => {
    const customStyles = { 
      backgroundColor: 'red',
      padding: '10px' 
    };
    
    renderWithMantine(
      <OptimizedScrollArea style={customStyles} data-testid="scroll-area">
        <div>Content</div>
      </OptimizedScrollArea>
    );
    
    const scrollArea = screen.getByTestId('scroll-area');
    
    // Sprawdź style niestandardowe
    expect(scrollArea.style.backgroundColor).toBe('red');
    expect(scrollArea.style.padding).toBe('10px');
    
    // Sprawdź style optymalizujące
    expect(scrollArea.style.transform).toBe('translateZ(0)');
    expect(scrollArea.style.willChange).toBe('scroll-position');
  });

  it('ma poprawne displayName', () => {
    expect(OptimizedScrollArea.displayName).toBe('OptimizedScrollArea');
  });

  it('obsługuje ref poprawnie', () => {
    let refElement: HTMLDivElement | null = null;
    
    renderWithMantine(
      <OptimizedScrollArea 
        ref={(el) => { refElement = el; }}
        data-testid="scroll-area"
      >
        <div>Content</div>
      </OptimizedScrollArea>
    );
    
    expect(refElement).toBeInstanceOf(HTMLDivElement);
  });

  it('renderuje się bez optymalizacji domyślnie', () => {
    renderWithMantine(
      <OptimizedScrollArea data-testid="scroll-area">
        <div>Default content</div>
      </OptimizedScrollArea>
    );
    
    const scrollArea = screen.getByTestId('scroll-area');
    expect(scrollArea).not.toHaveClass('virtualized-list');
    expect(scrollArea).not.toHaveClass('frequent-updates');
  });

  it('obsługuje wiele dzieci', () => {
    renderWithMantine(
      <OptimizedScrollArea>
        <div>First child</div>
        <div>Second child</div>
        <div>Third child</div>
      </OptimizedScrollArea>
    );
    
    expect(screen.getByText('First child')).toBeInTheDocument();
    expect(screen.getByText('Second child')).toBeInTheDocument();
    expect(screen.getByText('Third child')).toBeInTheDocument();
  });

  it('obsługuje złożone komponenty jako dzieci', () => {
    const ComplexChild = () => (
      <div>
        <h2>Complex Component</h2>
        <p>With multiple elements</p>
        <button>And interactions</button>
      </div>
    );
    
    renderWithMantine(
      <OptimizedScrollArea>
        <ComplexChild />
      </OptimizedScrollArea>
    );
    
    expect(screen.getByText('Complex Component')).toBeInTheDocument();
    expect(screen.getByText('With multiple elements')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'And interactions' })).toBeInTheDocument();
  });
});
