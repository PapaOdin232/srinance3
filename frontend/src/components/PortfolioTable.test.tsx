import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import PortfolioTable from './PortfolioTable';
import type { PortfolioBalance } from '../types/portfolio';

// Helper to extract asset order from rendered table
const getRenderedAssetOrder = (container: HTMLElement): string[] => {
  const rows = Array.from(container.querySelectorAll('tbody tr'));
  return rows.map(r => {
    const assetEl = r.querySelector('[data-testid^="asset-"]');
    return (assetEl?.textContent || '').trim();
  });
};

const balances: PortfolioBalance[] = [
  { asset: 'BTC', free: 0.5, locked: 0, total: 0.5, currentPrice: 40000, priceChange24h: 5, valueUSD: 20000, valueChange24h: 1000 },
  { asset: 'ETH', free: 1, locked: 0, total: 1, currentPrice: 1500, priceChange24h: 2, valueUSD: 1500, valueChange24h: 30 },
  { asset: 'PLN', free: 100, locked: 0, total: 100, currentPrice: 0, priceChange24h: 0, valueUSD: 0, valueChange24h: 0 }, // fiat zero value
  { asset: 'XYZ', free: 50, locked: 0, total: 50, currentPrice: 0, priceChange24h: 0, valueUSD: 0, valueChange24h: 0 }, // crypto with zero value
  { asset: 'USDT', free: 3000, locked: 0, total: 3000, currentPrice: 1, priceChange24h: 0, valueUSD: 3000, valueChange24h: 0 },
];

describe('PortfolioTable zero-value sorting', () => {
  it('keeps zero valueUSD rows at the bottom for both desc and asc sorts', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <MantineProvider>
        <PortfolioTable balances={balances} hideZeroBalances={false} />
      </MantineProvider>
    );

    // Initial sort: valueUSD desc (default state)
    let order = getRenderedAssetOrder(container);
    // Expect last two to be zero-value assets (PLN, XYZ in any order)
    const lastTwo = order.slice(-2);
    expect(lastTwo.sort()).toEqual(['PLN', 'XYZ'].sort());

    // Click header 'Wartość USD' to toggle to asc
    const valueHeader = screen.getByText('Wartość USD');
    await user.click(valueHeader);
    order = getRenderedAssetOrder(container);
    // Still expect zeros at bottom
    const lastTwoAsc = order.slice(-2);
    expect(lastTwoAsc.sort()).toEqual(['PLN', 'XYZ'].sort());

  // (Opcjonalny trzeci toggle do desc pominięty – testujemy dwa kierunki: initial desc & asc)
  });

  it('keeps zero currentPrice rows at the bottom when sorting by Cena', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <MantineProvider>
        <PortfolioTable balances={balances} hideZeroBalances={false} />
      </MantineProvider>
    );

    // Sort by Cena (currentPrice) ascending then descending
    const priceHeader = screen.getByText('Cena');
    await user.click(priceHeader); // first click sorts asc
    let order = getRenderedAssetOrder(container);
    let lastTwo = order.slice(-2);
    expect(lastTwo.sort()).toEqual(['PLN', 'XYZ'].sort());

    await user.click(priceHeader); // second click sorts desc
    order = getRenderedAssetOrder(container);
    lastTwo = order.slice(-2);
    expect(lastTwo.sort()).toEqual(['PLN', 'XYZ'].sort());
  });

  it('keeps zero allocation rows at the bottom when sorting by %', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <MantineProvider>
        <PortfolioTable balances={balances} hideZeroBalances={false} />
      </MantineProvider>
    );

    const percentHeader = screen.getByText('%');
    await user.click(percentHeader); // asc
    let order = getRenderedAssetOrder(container);
    let lastTwo = order.slice(-2);
    expect(lastTwo.sort()).toEqual(['PLN', 'XYZ'].sort());

    await user.click(percentHeader); // desc
    order = getRenderedAssetOrder(container);
    lastTwo = order.slice(-2);
    expect(lastTwo.sort()).toEqual(['PLN', 'XYZ'].sort());
  });
});
