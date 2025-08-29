import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { PriceCell } from './PriceCell';

const renderWithMantine = (component: React.ReactElement) => {
  return render(
    <MantineProvider>
      {component}
    </MantineProvider>
  );
};

describe('PriceCell', () => {
  it('renderuje się poprawnie z podstawową ceną', () => {
    renderWithMantine(<PriceCell price={45000} />);
    
    expect(screen.getByText('$45000.0000')).toBeInTheDocument();
  });

  it('formatuje cenę z odpowiednią liczbą miejsc dziesiętnych', () => {
    renderWithMantine(<PriceCell price={45000.12345} decimals={2} />);
    
    expect(screen.getByText('$45000.12')).toBeInTheDocument();
  });

  it('wyświetla USDT jako $1.00', () => {
    renderWithMantine(<PriceCell price={1.0} isUSDT />);
    
    expect(screen.getByText('$1.00')).toBeInTheDocument();
  });

  it('ignoruje rzeczywistą cenę dla USDT', () => {
    renderWithMantine(<PriceCell price={123.456} isUSDT />);
    
    expect(screen.getByText('$1.00')).toBeInTheDocument();
    expect(screen.queryByText('$123.456')).not.toBeInTheDocument();
  });

  it('aplikuje styl animacji dla zmiany w górę', () => {
    renderWithMantine(<PriceCell price={45000} change="up" />);
    
  const priceElement = screen.getByTestId('price-cell-text');
    expect(priceElement).toHaveStyle({
      backgroundColor: '#4CAF5020',
      transition: 'background-color 0.3s ease',
    });
  });

  it('aplikuje styl animacji dla zmiany w dół', () => {
    renderWithMantine(<PriceCell price={45000} change="down" />);
    
  const priceElement = screen.getByTestId('price-cell-text');
    expect(priceElement).toHaveStyle({
      backgroundColor: '#f4433620',
      transition: 'background-color 0.3s ease',
    });
  });

  it('nie aplikuje stylu animacji bez zmiany', () => {
    renderWithMantine(<PriceCell price={45000} />);
    
  const priceElement = screen.getByTestId('price-cell-text');
    expect(priceElement).not.toHaveStyle({
      backgroundColor: '#4CAF5020',
    });
    expect(priceElement).not.toHaveStyle({
      backgroundColor: '#f4433620',
    });
  });

  it('używa domyślnego wyrównania do prawej', () => {
    renderWithMantine(<PriceCell price={45000} />);
    
  const priceElement = screen.getByTestId('price-cell-text');
  // Sprawdzamy dodany atrybut data-align
  expect(priceElement).toHaveAttribute('data-align', 'right');
  });

  it('obsługuje niestandardowe wyrównanie', () => {
    renderWithMantine(<PriceCell price={45000} ta="left" />);
    
  const priceElement = screen.getByTestId('price-cell-text');
  expect(priceElement).toHaveAttribute('data-align', 'left');
  });

  it('obsługuje wyrównanie do środka', () => {
    renderWithMantine(<PriceCell price={45000} ta="center" />);
    
  const priceElement = screen.getByTestId('price-cell-text');
  expect(priceElement).toHaveAttribute('data-align', 'center');
  });

  it('używa czcionki monospace', () => {
    renderWithMantine(<PriceCell price={45000} />);
    
  const priceElement = screen.getByTestId('price-cell-text');
  expect(priceElement).toHaveStyle({
      fontFamily: 'monospace',
    });
  });

  it('ma odpowiednie padding i rozmiar tekstu', () => {
    renderWithMantine(<PriceCell price={45000} />);
    
  const priceElement = screen.getByTestId('price-cell-text');
  expect(priceElement).toHaveAttribute('data-size', 'sm');
  });

  it('formatuje małe ceny poprawnie', () => {
    renderWithMantine(<PriceCell price={0.00001234} decimals={8} />);
    
    expect(screen.getByText('$0.00001234')).toBeInTheDocument();
  });

  it('formatuje duże ceny poprawnie', () => {
    renderWithMantine(<PriceCell price={1000000} decimals={0} />);
    
    expect(screen.getByText('$1000000')).toBeInTheDocument();
  });

  it('obsługuje zero jako cenę', () => {
    renderWithMantine(<PriceCell price={0} />);
    
    expect(screen.getByText('$0.0000')).toBeInTheDocument();
  });

  it('obsługuje ujemne ceny', () => {
    renderWithMantine(<PriceCell price={-123.45} decimals={2} />);
    
    expect(screen.getByText('$-123.45')).toBeInTheDocument();
  });

  it('łączy wszystkie właściwości poprawnie', () => {
    renderWithMantine(
      <PriceCell 
        price={3200.5678} 
        decimals={3} 
        change="up" 
        ta="center"
      />
    );
    
  const priceElement = screen.getByTestId('price-cell-text');
  expect(priceElement).toHaveAttribute('data-align', 'center');
  expect(priceElement).toHaveStyle({
      backgroundColor: '#4CAF5020',
      transition: 'background-color 0.3s ease',
    });
  });
});
