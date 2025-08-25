import { useState, useEffect, useCallback, useMemo } from 'react';
import { getAccount } from '../services/restClient';
import type { AccountResponse, Balance } from '../services/restClient';
import type { PortfolioBalance, MiCAComplianceInfo } from '../types/portfolio';
import { useAssets } from './useAssets';
import { useThrottledState } from './useThrottledState';

export interface UsePortfolioReturn {
  balances: PortfolioBalance[];
  loading: boolean;
  error: string | null;
  accountData: AccountResponse | null;
  refetch: () => Promise<void>;
  totalValue: number;
  totalChange24h: number;
  isConnected: boolean;
  lastSyncTime: number | null;
}

/**
 * Hook do zarządzania danymi portfolio użytkownika
 * Łączy dane z AccountPanel z cenami z MarketPanel
 */
export const usePortfolio = (): UsePortfolioReturn => {
  const [accountData, setAccountData] = useState<AccountResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);
  
  // Use the existing assets hook for market data
  const { assets: marketData, isConnected } = useAssets();

  // MiCA compliance mapping for EU regulations
  const getMiCAComplianceStatus = useCallback((asset: string): MiCAComplianceInfo => {
    // MiCA-compliant stablecoins (remain available in EU)
    const MICA_COMPLIANT = new Set(['USDC']);
    
    // Non-compliant stablecoins (delisted from EU by March 31, 2025)
    const EU_DELISTING = new Set(['USDT', 'FDUSD', 'TUSD', 'USDP', 'DAI', 'AEUR', 'XUSD', 'PAXG']);

    if (MICA_COMPLIANT.has(asset)) {
      return {
        status: 'COMPLIANT',
        recommendation: 'MiCA-compliant, pozostanie dostępny w EU'
      };
    }

    if (EU_DELISTING.has(asset)) {
      return {
        status: 'DELISTING',
        delistingDate: '31 marca 2025',
        recommendation: 'Zostanie usunięty z Binance EU. Rozważ konwersję do USDC'
      };
    }

    return {
      status: 'UNKNOWN',
      recommendation: 'Status MiCA nieznany'
    };
  }, []);

  const fetchAccountData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getAccount();
      setAccountData(data);
      setLastSyncTime(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Błąd podczas pobierania danych portfolio');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchAccountData();
  }, [fetchAccountData]);

  // Fiat currencies that need special handling (inverted USD pairs)
  const FIAT_CURRENCIES = useMemo(() => new Set([
    'EUR', 'GBP', 'PLN', 'JPY', 'CNY', 'TRY', 'BRL', 'ARS', 'MXN', 'ZAR', 'UAH', 'RON',
    'KZT', 'NGN', 'CZK', 'CHF', 'SEK', 'NOK', 'DKK', 'HUF', 'AUD', 'NZD', 'CAD',
    'HKD', 'SGD', 'COP', 'CLP', 'PEN', 'PHP', 'IDR', 'INR', 'THB', 'VND', 'ILS',
    'AED', 'SAR', 'QAR', 'KRW', 'MYR'
  ]), []);

  // Helper function to find market data for any asset
  const findMarketPrice = useCallback((asset: string) => {
    // USDC is our new base currency (MiCA-compliant)
    if (asset === 'USDC') {
      return { price: 1, priceChangePercent: 0 };
    }

    // Major stablecoins - assume ~$1.00 for portfolio tracking
    // (exact spreads are not critical for portfolio valuation)
    const MAJOR_STABLECOINS = new Set(['USDT', 'DAI', 'TUSD', 'USDP', 'FDUSD']);
    if (MAJOR_STABLECOINS.has(asset)) {
      return { price: 1, priceChangePercent: 0 };
    }

    // First try standard format: {ASSET}USDC
    let marketAsset = marketData.find(m => m.symbol === `${asset}USDC`);
    if (marketAsset) {
      return { price: marketAsset.price, priceChangePercent: marketAsset.priceChangePercent };
    }

    // For fiat currencies, try different USDC-based formats (MiCA-compliant)
    if (FIAT_CURRENCIES.has(asset)) {
      // Try USDC{FIAT} format (e.g., USDCPLN, USDCTRY)
      marketAsset = marketData.find(m => m.symbol === `USDC${asset}`);
      if (marketAsset && marketAsset.price > 0) {
        // Invert the price: if USDCPLN = 4.0, then PLN price = 1/4.0 = 0.25 USD
        const invertedPrice = 1 / marketAsset.price;
        // For inverted pairs, we also need to invert the percentage change
        const invertedPriceChange = marketAsset.priceChangePercent ? -marketAsset.priceChangePercent : 0;
        return { price: invertedPrice, priceChangePercent: invertedPriceChange };
      }

      // Try {FIAT}USDC format (e.g., EURUSDC)
      marketAsset = marketData.find(m => m.symbol === `${asset}USDC`);
      if (marketAsset) {
        // Direct price: EURUSDC = 1.16 means 1 EUR = 1.16 USD
        return { price: marketAsset.price, priceChangePercent: marketAsset.priceChangePercent };
      }

      // Fallback for fiat: Try USDT{FIAT} format (e.g., USDTZAR, USDTUAH)
      marketAsset = marketData.find(m => m.symbol === `USDT${asset}`);
      if (marketAsset && marketAsset.price > 0) {
        // Invert the price: if USDTZAR = 18.0, then ZAR price = 1/18.0 = 0.056 USD
        const invertedPrice = 1 / marketAsset.price;
        // For inverted pairs, we also need to invert the percentage change
        const invertedPriceChange = marketAsset.priceChangePercent ? -marketAsset.priceChangePercent : 0;
        return { price: invertedPrice, priceChangePercent: invertedPriceChange };
      }

      // Fallback for fiat: Try {FIAT}USDT format (e.g., EURUSDT)
      marketAsset = marketData.find(m => m.symbol === `${asset}USDT`);
      if (marketAsset) {
        // Direct price: EURUSDT = 1.16 means 1 EUR = 1.16 USD
        return { price: marketAsset.price, priceChangePercent: marketAsset.priceChangePercent };
      }
    }

    // Fallback: Try {ASSET}USDT for assets that don't have USDC pairs yet
    // Note: This will be phased out as USDT pairs are delisted in EU
    marketAsset = marketData.find(m => m.symbol === `${asset}USDT`);
    if (marketAsset) {
      return { price: marketAsset.price, priceChangePercent: marketAsset.priceChangePercent };
    }

    return { price: undefined, priceChangePercent: undefined };
  }, [marketData, FIAT_CURRENCIES]);

  // Transform account balances to portfolio format with market data
  const balances: PortfolioBalance[] = useMemo(() => {
    if (!accountData?.balances || !Array.isArray(accountData.balances)) {
      return [];
    }
    
    return accountData.balances.map((balance: Balance) => {
      const asset = balance.asset;
      const free = parseFloat(balance.free);
      const locked = parseFloat(balance.locked);
      const total = free + locked;
      
      // Find market data for this asset (handles both crypto and fiat)
      const marketPrice = findMarketPrice(asset);
      const currentPrice = marketPrice.price;
      const priceChange24h = marketPrice.priceChangePercent;
      
      // Calculate USD values
      const valueUSD = currentPrice ? total * currentPrice : 0;
      const valueChange24h = currentPrice && priceChange24h 
        ? valueUSD * (priceChange24h / 100) 
        : 0;
      
      return {
        asset,
        free,
        locked,
        total,
        currentPrice,
        priceChange24h,
        valueUSD,
        valueChange24h,
        micaCompliance: getMiCAComplianceStatus(asset),
      };
    });
  }, [accountData?.balances, marketData, getMiCAComplianceStatus]);

  // Calculate portfolio metrics with throttling
  const totalValue = useMemo(() => {
    return balances.reduce((total, balance) => total + (balance.valueUSD || 0), 0);
  }, [balances]);

  // Use throttled state for total value to prevent excessive UI updates
  const [throttledTotalValue, setThrottledTotalValue] = useThrottledState(totalValue, 500);

  // Update throttled value when totalValue changes
  useEffect(() => {
    setThrottledTotalValue(totalValue);
  }, [totalValue, setThrottledTotalValue]);

  const totalChange24h = useMemo(() => {
    const totalCurrent = totalValue;
    const totalPrevious = balances.reduce((total, balance) => {
      const previousValue = (balance.valueUSD || 0) - (balance.valueChange24h || 0);
      return total + previousValue;
    }, 0);
    
    if (totalPrevious === 0) return 0;
    return ((totalCurrent - totalPrevious) / totalPrevious) * 100;
  }, [balances, totalValue]);

  return {
    balances,
    loading,
    error,
    accountData,
    refetch: fetchAccountData,
    totalValue: throttledTotalValue,
    totalChange24h,
    isConnected,
    lastSyncTime,
  };
};
