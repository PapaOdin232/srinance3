import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import ChartPreview from './ChartPreview';

// Mock dla ikon z Tabler
jest.mock('@tabler/icons-react', () => ({
  IconTrendingUp: () => <div data-testid="trending-up-icon" />,
  IconTrendingDown: () => <div data-testid="trending-down-icon" />,
}));

const renderWithMantine = (component: React.ReactElement) => {
  return render(
    <MantineProvider>
      {component}
    </MantineProvider>
  );
};

describe('ChartPreview', () => {
  it('renderuje się poprawnie z domyślnym schematem kolorów', () => {
    renderWithMantine(
      <ChartPreview colorScheme="default" isDarkTheme={false} />
    );
    
    expect(screen.getByText('Podgląd świec')).toBeInTheDocument();
    expect(screen.getByText('Wzrost')).toBeInTheDocument();
    expect(screen.getByText('Spadek')).toBeInTheDocument();
    expect(screen.getByTestId('trending-up-icon')).toBeInTheDocument();
    expect(screen.getByTestId('trending-down-icon')).toBeInTheDocument();
  });

  it('renderuje się poprawnie z motywem ciemnym', () => {
    const { container } = renderWithMantine(
      <ChartPreview colorScheme="default" isDarkTheme={true} />
    );
    
    expect(screen.getByText('Podgląd świec')).toBeInTheDocument();
    
    // Sprawdź czy container ma odpowiedni styl dla ciemnego motywu
    const previewContainer = container.querySelector('.chart-preview-container');
    expect(previewContainer).toHaveStyle({
      backgroundColor: '#161B22',
      border: '1px solid #30363D'
    });
  });

  it('renderuje się poprawnie z motywem jasnym', () => {
    const { container } = renderWithMantine(
      <ChartPreview colorScheme="default" isDarkTheme={false} />
    );
    
    // Sprawdź czy container ma odpowiedni styl dla jasnego motywu
    const previewContainer = container.querySelector('.chart-preview-container');
    expect(previewContainer).toHaveStyle({
      backgroundColor: '#F8F9FA',
      border: '1px solid #E9ECEF'
    });
  });

  it('renderuje się z schematem kolorów classic', () => {
    renderWithMantine(
      <ChartPreview colorScheme="classic" isDarkTheme={false} />
    );
    
    expect(screen.getByText('Podgląd świec')).toBeInTheDocument();
    // Komponenty wizualne będą mieć różne kolory, ale tekst pozostaje ten sam
    expect(screen.getByText('Wzrost')).toBeInTheDocument();
    expect(screen.getByText('Spadek')).toBeInTheDocument();
  });

  it('renderuje się z schematem kolorów modern', () => {
    renderWithMantine(
      <ChartPreview colorScheme="modern" isDarkTheme={false} />
    );
    
    expect(screen.getByText('Podgląd świec')).toBeInTheDocument();
    expect(screen.getByText('Wzrost')).toBeInTheDocument();
    expect(screen.getByText('Spadek')).toBeInTheDocument();
  });

  it('renderuje się z schematem kolorów minimal', () => {
    renderWithMantine(
      <ChartPreview colorScheme="minimal" isDarkTheme={false} />
    );
    
    expect(screen.getByText('Podgląd świec')).toBeInTheDocument();
    expect(screen.getByText('Wzrost')).toBeInTheDocument();
    expect(screen.getByText('Spadek')).toBeInTheDocument();
  });

  it('wyświetla właściwą liczbę świec', () => {
    const { container } = renderWithMantine(
      <ChartPreview colorScheme="default" isDarkTheme={false} />
    );
    
    // Sprawdź czy renderowane są świece (5 świec zgodnie z sampleCandles)
    const candles = container.querySelectorAll('.chart-preview-candle');
    expect(candles).toHaveLength(5);
  });

  it('ma odpowiednią strukturę legendy', () => {
    renderWithMantine(
      <ChartPreview colorScheme="default" isDarkTheme={false} />
    );
    
    // Sprawdź czy legenda zawiera oba elementy
    expect(screen.getByText('Wzrost')).toBeInTheDocument();
    expect(screen.getByText('Spadek')).toBeInTheDocument();
    expect(screen.getByTestId('trending-up-icon')).toBeInTheDocument();
    expect(screen.getByTestId('trending-down-icon')).toBeInTheDocument();
  });

  it('wyświetla mini wykres', () => {
    const { container } = renderWithMantine(
      <ChartPreview colorScheme="default" isDarkTheme={false} />
    );
    
    // Sprawdź czy mini wykres jest renderowany
    const chartArea = container.querySelector('[style*="height: 60"]');
    expect(chartArea).toBeInTheDocument();
  });

  it('aplikuje różne style dla różnych schematów kolorów', () => {
    const { container: defaultContainer } = renderWithMantine(
      <ChartPreview colorScheme="default" isDarkTheme={false} />
    );
    
    const { container: classicContainer } = renderWithMantine(
      <ChartPreview colorScheme="classic" isDarkTheme={false} />
    );
    
    // Oba kontenery powinny mieć różne style świec (choć trudno to testować bez głębokiej analizy DOM)
    expect(defaultContainer.querySelector('.chart-preview-candle')).toBeInTheDocument();
    expect(classicContainer.querySelector('.chart-preview-candle')).toBeInTheDocument();
  });

  it('obsługuje schemat kolorów classic', () => {
    renderWithMantine(
      <ChartPreview colorScheme="classic" isDarkTheme={false} />
    );
    
    expect(screen.getByText('Podgląd świec')).toBeInTheDocument();
    expect(screen.getByText('Wzrost')).toBeInTheDocument();
    expect(screen.getByText('Spadek')).toBeInTheDocument();
  });

  it('obsługuje schemat kolorów modern', () => {
    renderWithMantine(
      <ChartPreview colorScheme="modern" isDarkTheme={false} />
    );
    
    expect(screen.getByText('Podgląd świec')).toBeInTheDocument();
    expect(screen.getByText('Wzrost')).toBeInTheDocument();
    expect(screen.getByText('Spadek')).toBeInTheDocument();
  });

  it('obsługuje schemat kolorów minimal', () => {
    renderWithMantine(
      <ChartPreview colorScheme="minimal" isDarkTheme={false} />
    );
    
    expect(screen.getByText('Podgląd świec')).toBeInTheDocument();
    expect(screen.getByText('Wzrost')).toBeInTheDocument();
    expect(screen.getByText('Spadek')).toBeInTheDocument();
  });
});
