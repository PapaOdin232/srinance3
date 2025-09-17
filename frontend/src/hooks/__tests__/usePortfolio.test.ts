import { renderHook, waitFor } from '@testing-library/react';
import { usePortfolio } from '../usePortfolio';
import * as restClient from '../../services/restClient';
import * as useAssetsModule from '../useAssets';
import type { AccountResponse, Balance } from '../../services/restClient';
import type { Asset } from '../../types/asset';

// Mock the dependencies
jest.mock('../../services/restClient');
jest.mock('../useAssets');
jest.mock('../useThrottledState', () => ({
  useThrottledState: jest.fn((initialValue: any) => [initialValue, jest.fn()]),
}));

const mockGetAccount = restClient.getAccount as jest.MockedFunction<typeof restClient.getAccount>;
const mockUseAssets = useAssetsModule.useAssets as jest.MockedFunction<typeof useAssetsModule.useAssets>;

describe('usePortfolio', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Suppress console.log in tests
    jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const createMockBalance = (asset: string, free: string, locked: string = '0'): Balance => ({
    asset,
    free,
    locked,
  });

  const createMockAsset = (symbol: string, baseAsset: string, quoteAsset: string, price: number): Asset => ({
    symbol,
    baseAsset,
    quoteAsset,
    price,
    priceChange: 0,
    priceChangePercent: 2.5,
    volume: 1000000,
    count: 1000,
    status: 'TRADING',
    highPrice: price * 1.1,
    lowPrice: price * 0.9,
    openPrice: price * 0.98,
    prevClosePrice: price * 0.98,
    weightedAvgPrice: price,
    bidPrice: price * 0.999,
    askPrice: price * 1.001,
    bidQty: 100,
    askQty: 100,
  });

  const createMockAccountResponse = (balances: Balance[]): AccountResponse => ({
    makerCommission: 10,
    takerCommission: 10,
    buyerCommission: 0,
    sellerCommission: 0,
    commissionRates: {
      maker: '0.001',
      taker: '0.001',
      buyer: '0.000',
      seller: '0.000',
    },
    canTrade: true,
    canWithdraw: true,
    canDeposit: true,
    brokered: false,
    requireSelfTradePrevention: false,
    preventSor: false,
    updateTime: Date.now(),
    accountType: 'SPOT',
    balances,
    permissions: ['SPOT'],
    uid: 12345,
  });

  test('should calculate totalValue correctly without double-counting', async () => {
    // Mock balances with different asset types
    const mockBalances: Balance[] = [
      createMockBalance('BTC', '1.0', '0'), // 1 BTC
      createMockBalance('ETH', '10.0', '0'), // 10 ETH
      createMockBalance('USDC', '1000.0', '0'), // 1000 USDC (base currency)
      createMockBalance('USDT', '500.0', '0'), // 500 USDT (stablecoin)
    ];

    // Mock market data with USDC-based pairs (preferred) and USDT fallbacks
    const mockAssets: Asset[] = [
      createMockAsset('BTCUSDC', 'BTC', 'USDC', 45000), // BTC = $45,000
      createMockAsset('ETHUSDC', 'ETH', 'USDC', 3000),  // ETH = $3,000
      // Note: USDC and USDT are treated as $1.00 stablecoins
    ];

    // Setup mocks
    mockGetAccount.mockResolvedValue(createMockAccountResponse(mockBalances));
    mockUseAssets.mockReturnValue({
      assets: mockAssets,
      loading: false,
      error: null,
      refetch: jest.fn(),
      isConnected: true,
      setPreferredQuotes: jest.fn(),
    });

    // Render the hook
    const { result } = renderHook(() => usePortfolio());

    // Wait for the async operations to complete
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Verify totalValue calculation
    // Expected: 1 BTC * $45,000 + 10 ETH * $3,000 + 1000 USDC * $1 + 500 USDT * $1
    // = $45,000 + $30,000 + $1,000 + $500 = $76,500
    expect(result.current.totalValue).toBe(76500);
  });

  test('should handle stablecoins correctly to prevent double-counting', async () => {
    // Test case with multiple stablecoins that should all be valued at $1
    const mockBalances: Balance[] = [
      createMockBalance('USDC', '1000.0'),
      createMockBalance('USDT', '2000.0'),
      createMockBalance('DAI', '500.0'),
      createMockBalance('FDUSD', '300.0'),
    ];

    const mockAssets: Asset[] = [
      // No market data needed for stablecoins - they should all default to $1.00
    ];

    mockGetAccount.mockResolvedValue(createMockAccountResponse(mockBalances));
    mockUseAssets.mockReturnValue({
      assets: mockAssets,
      loading: false,
      error: null,
      refetch: jest.fn(),
      isConnected: true,
      setPreferredQuotes: jest.fn(),
    });

    const { result } = renderHook(() => usePortfolio());
    
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // All stablecoins should be valued at $1.00 each
    // Expected: 1000 + 2000 + 500 + 300 = $3,800
    expect(result.current.totalValue).toBe(3800);
  });

  test('should use single price path per asset (USDC preferred over USDT)', async () => {
    // Test that when both USDC and USDT pairs exist, USDC is preferred
    const mockBalances: Balance[] = [
      createMockBalance('BTC', '1.0'),
    ];

    const mockAssets: Asset[] = [
      createMockAsset('BTCUSDC', 'BTC', 'USDC', 45000), // Should use this
      createMockAsset('BTCUSDT', 'BTC', 'USDT', 44500), // Should ignore this
    ];

    mockGetAccount.mockResolvedValue(createMockAccountResponse(mockBalances));
    mockUseAssets.mockReturnValue({
      assets: mockAssets,
      loading: false,
      error: null,
      refetch: jest.fn(),
      isConnected: true,
      setPreferredQuotes: jest.fn(),
    });

    const { result } = renderHook(() => usePortfolio());
    
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Should use BTCUSDC price ($45,000), not BTCUSDT price ($44,500)
    expect(result.current.totalValue).toBe(45000);
  });

  test('should handle BTC pairs conversion correctly', async () => {
    // Test BTC pairs conversion to USD
    const mockBalances: Balance[] = [
      createMockBalance('ETH', '10.0'), // No direct USDC/USDT pair for ETH in this test
    ];

    const mockAssets: Asset[] = [
      createMockAsset('ETHBTC', 'ETH', 'BTC', 0.067), // ETH = 0.067 BTC
      createMockAsset('BTCUSDC', 'BTC', 'USDC', 45000), // BTC = $45,000
    ];

    mockGetAccount.mockResolvedValue(createMockAccountResponse(mockBalances));
    mockUseAssets.mockReturnValue({
      assets: mockAssets,
      loading: false,
      error: null,
      refetch: jest.fn(),
      isConnected: true,
      setPreferredQuotes: jest.fn(),
    });

    const { result } = renderHook(() => usePortfolio());
    
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Should convert: 10 ETH * 0.067 BTC/ETH * $45,000/BTC = $30,150
    expect(result.current.totalValue).toBe(30150);
  });

  test('should ignore zero balances in totalValue calculation', async () => {
    const mockBalances: Balance[] = [
      createMockBalance('BTC', '1.0'),
      createMockBalance('ETH', '0.0'), // Zero balance - should be ignored
      createMockBalance('USDC', '0.00000001'), // Below threshold - should be ignored
    ];

    const mockAssets: Asset[] = [
      createMockAsset('BTCUSDC', 'BTC', 'USDC', 45000),
      createMockAsset('ETHUSDC', 'ETH', 'USDC', 3000),
    ];

    mockGetAccount.mockResolvedValue(createMockAccountResponse(mockBalances));
    mockUseAssets.mockReturnValue({
      assets: mockAssets,
      loading: false,
      error: null,
      refetch: jest.fn(),
      isConnected: true,
      setPreferredQuotes: jest.fn(),
    });

    const { result } = renderHook(() => usePortfolio());
    
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Only BTC should contribute: 1 * $45,000 = $45,000
    expect(result.current.totalValue).toBe(45000);
  });

  test('should handle assets with no market data gracefully', async () => {
    const mockBalances: Balance[] = [
      createMockBalance('BTC', '1.0'),
      createMockBalance('UNKNOWN_COIN', '1000.0'), // No market data available
    ];

    const mockAssets: Asset[] = [
      createMockAsset('BTCUSDC', 'BTC', 'USDC', 45000),
      // No market data for UNKNOWN_COIN
    ];

    mockGetAccount.mockResolvedValue(createMockAccountResponse(mockBalances));
    mockUseAssets.mockReturnValue({
      assets: mockAssets,
      loading: false,
      error: null,
      refetch: jest.fn(),
      isConnected: true,
      setPreferredQuotes: jest.fn(),
    });

    const { result } = renderHook(() => usePortfolio());
    
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Only BTC should contribute: 1 * $45,000 = $45,000
    // UNKNOWN_COIN should be valued at $0 due to no market data
    expect(result.current.totalValue).toBe(45000);
  });
});