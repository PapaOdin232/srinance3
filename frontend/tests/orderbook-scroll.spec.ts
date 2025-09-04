import { test, expect } from '@playwright/test';

// Simple E2E check for scroll preservation in OrderBook
// Assumes dev server runs and MarketPanel is visible at '/'

test('orderbook scroll position is preserved across data updates', async ({ page }) => {
  await page.goto('/?e2e=1', { waitUntil: 'domcontentloaded' });

  // Wait for app root to be visible to avoid early detachment errors
  await expect(page.locator('#root')).toBeVisible({ timeout: 15000 });

  // Wait for orderbook container
  const container = page.locator('[data-testid="orderbook-container"]');
  await expect(container).toBeVisible();

  // Find Mantine ScrollArea viewport inside container
  // Use aria-label set on ScrollArea to target the scrollable region
  const viewport = page.getByLabel('Order book entries');
  await expect(viewport).toBeVisible({ timeout: 15000 });

  // Scroll to bottom
  await viewport.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });

  // Record current scrollTop
  const before2 = await viewport.evaluate((el) => el.scrollTop);

  // First update to ensure the component receives at least one data tick
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('test:update-orderbook'));
  });
  await page.waitForTimeout(500);

  // Now measure and trigger another update to verify preservation
  await viewport.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  const before = await viewport.evaluate((el) => el.scrollTop);
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('test:update-orderbook'));
  });

  // Wait a short time for UI to process updates
  await page.waitForTimeout(900);

  const after = await viewport.evaluate((el) => el.scrollTop);

  // Allow small tolerance due to layout rounding
  const diff = Math.abs(after - before2);
  expect(diff).toBeLessThanOrEqual(3);
});
