import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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

  const fetchAccountData = useCallback(async (opts?: { force?: boolean; signal?: AbortSignal }) => {
    try {
      setLoading(true);
      setError(null);
      const data = await getAccount({ force: opts?.force, signal: opts?.signal });
      setAccountData(data);
      setLastSyncTime(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Błąd podczas pobierania danych portfolio');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch (guarded for React.StrictMode double-invoke in DEV)
  const didInitRef = useRef(false);
  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;
  fetchAccountData();
  }, [fetchAccountData]);

  // Fiat currencies that need special handling (inverted USD pairs)
  const FIAT_CURRENCIES = useMemo(() => new Set([
    'EUR', 'GBP', 'PLN', 'JPY', 'CNY', 'TRY', 'BRL', 'ARS', 'MXN', 'ZAR', 'UAH', 'RON',
    'KZT', 'NGN', 'CZK', 'CHF', 'SEK', 'NOK', 'DKK', 'HUF', 'AUD', 'NZD', 'CAD',
    'HKD', 'SGD', 'COP', 'CLP', 'PEN', 'PHP', 'IDR', 'INR', 'THB', 'VND', 'ILS',
    'AED', 'SAR', 'QAR', 'KRW', 'MYR'
  ]), []);

  // Helper function to find market data for any asset - FIXED for single USD valuation path
  const findMarketPrice = useCallback((asset: string) => {
    console.log(`[Portfolio] Finding price for asset: ${asset}`);
    
    // USDC is our base currency (MiCA-compliant) - always 1 USD
    if (asset === 'USDC') {
      console.log(`[Portfolio] ${asset}: Using base price 1.0 USD`);
      return { price: 1, priceChangePercent: 0 };
    }

    // Major stablecoins - treat as 1 USD (avoid double-counting via different pairs)
    const MAJOR_STABLECOINS = new Set(['USDT', 'DAI', 'TUSD', 'USDP', 'FDUSD']);
    if (MAJOR_STABLECOINS.has(asset)) {
      console.log(`[Portfolio] ${asset}: Using stablecoin price 1.0 USD`);
      return { price: 1, priceChangePercent: 0 };
    }

    // SINGLE PATH STRATEGY: Use hierarchy to ensure each asset has only ONE price path
    // Priority: USDC pairs > USDT pairs > BTC pairs > ETH pairs
    
    // 1. First try USDC pairs (MiCA-compliant, preferred)
    let marketAsset = marketData.find(m => m.symbol === `${asset}USDC`);
    if (marketAsset) {
      console.log(`[Portfolio] ${asset}: Found ${asset}USDC = ${marketAsset.price} USD`);
      return { price: marketAsset.price, priceChangePercent: marketAsset.priceChangePercent };
    }

    // For fiat currencies, try USDC-based formats
    if (FIAT_CURRENCIES.has(asset)) {
      // Try USDC{FIAT} format (e.g., USDCPLN, USDCTRY) - INVERTED
      marketAsset = marketData.find(m => m.symbol === `USDC${asset}`);
      if (marketAsset && marketAsset.price > 0) {
        const invertedPrice = 1 / marketAsset.price;
        const invertedPriceChange = marketAsset.priceChangePercent ? -marketAsset.priceChangePercent : 0;
        console.log(`[Portfolio] ${asset}: Found USDC${asset} = ${marketAsset.price}, inverted to ${invertedPrice} USD`);
        return { price: invertedPrice, priceChangePercent: invertedPriceChange };
      }

      // Try {FIAT}USDC format (e.g., EURUSDC) - DIRECT
      marketAsset = marketData.find(m => m.symbol === `${asset}USDC`);
      if (marketAsset) {
        console.log(`[Portfolio] ${asset}: Found ${asset}USDC = ${marketAsset.price} USD`);
        return { price: marketAsset.price, priceChangePercent: marketAsset.priceChangePercent };
      }
    }

    // 2. Fallback to USDT pairs ONLY if no USDC pair exists
    marketAsset = marketData.find(m => m.symbol === `${asset}USDT`);
    if (marketAsset) {
      console.log(`[Portfolio] ${asset}: Found ${asset}USDT = ${marketAsset.price} USD (USDT fallback)`);
      return { price: marketAsset.price, priceChangePercent: marketAsset.priceChangePercent };
    }

    // For fiat: USDT-based fallbacks
    if (FIAT_CURRENCIES.has(asset)) {
      // Try USDT{FIAT} format - INVERTED
      marketAsset = marketData.find(m => m.symbol === `USDT${asset}`);
      if (marketAsset && marketAsset.price > 0) {
        const invertedPrice = 1 / marketAsset.price;
        const invertedPriceChange = marketAsset.priceChangePercent ? -marketAsset.priceChangePercent : 0;
        console.log(`[Portfolio] ${asset}: Found USDT${asset} = ${marketAsset.price}, inverted to ${invertedPrice} USD (USDT fallback)`);
        return { price: invertedPrice, priceChangePercent: invertedPriceChange };
      }

      // Try {FIAT}USDT format - DIRECT
      marketAsset = marketData.find(m => m.symbol === `${asset}USDT`);
      if (marketAsset) {
        console.log(`[Portfolio] ${asset}: Found ${asset}USDT = ${marketAsset.price} USD (USDT fallback)`);
        return { price: marketAsset.price, priceChangePercent: marketAsset.priceChangePercent };
      }
    }

    // 3. BTC pairs as second fallback (convert BTC to USD)
    marketAsset = marketData.find(m => m.symbol === `${asset}BTC`);
    if (marketAsset) {
      const btcPrice = findBTCPriceInUSD();
      if (btcPrice !== undefined) {
        const usdPrice = marketAsset.price * btcPrice;
        console.log(`[Portfolio] ${asset}: Found ${asset}BTC = ${marketAsset.price} BTC, converted to ${usdPrice} USD`);
        return { price: usdPrice, priceChangePercent: marketAsset.priceChangePercent };
      }
    }

    console.log(`[Portfolio] ${asset}: No price found, returning undefined`);
    return { price: undefined, priceChangePercent: undefined };
  }, [marketData, FIAT_CURRENCIES]);

  // Helper to get BTC price in USD for conversion
  const findBTCPriceInUSD = useCallback(() => {
    // Try BTCUSDC first, then BTCUSDT
    let btcAsset = marketData.find(m => m.symbol === 'BTCUSDC');
    if (btcAsset) return btcAsset.price;
    
    btcAsset = marketData.find(m => m.symbol === 'BTCUSDT');
    if (btcAsset) return btcAsset.price;
    
    return undefined;
  }, [marketData]);

  // Transform account balances to portfolio format with market data
  const balances: PortfolioBalance[] = useMemo(() => {
    if (!accountData?.balances || !Array.isArray(accountData.balances)) {
      return [];
    }
    
    console.log(`[Portfolio] Processing ${accountData.balances.length} balances from account`);
    
    return accountData.balances.map((balance: Balance) => {
      const asset = balance.asset;
      const free = parseFloat(balance.free);
      const locked = parseFloat(balance.locked);
      const total = free + locked;
      
      // Skip zero balances to reduce noise
      if (total <= 0.00000001) {
        return {
          asset,
          free,
          locked,
          total: 0,
          currentPrice: undefined,
          priceChange24h: undefined,
          valueUSD: 0,
          valueChange24h: 0,
          micaCompliance: getMiCAComplianceStatus(asset),
        };
      }
      
      // Find market data for this asset (handles both crypto and fiat)
      const marketPrice = findMarketPrice(asset);
      const currentPrice = marketPrice.price;
      const priceChange24h = marketPrice.priceChangePercent;
      
      // Calculate USD values
      const valueUSD = currentPrice ? total * currentPrice : 0;
      const valueChange24h = currentPrice && priceChange24h 
        ? valueUSD * (priceChange24h / 100) 
        : 0;
      
      console.log(`[Portfolio] ${asset}: total=${total.toFixed(8)}, price=${currentPrice?.toFixed(6) || 'N/A'}, valueUSD=${valueUSD.toFixed(2)}`);
      
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
  }, [accountData?.balances, findMarketPrice, getMiCAComplianceStatus]);

  // Calculate portfolio metrics with detailed logging
  const totalValue = useMemo(() => {
    const nonZeroBalances = balances.filter(b => (b.valueUSD || 0) > 0);
    console.log(`[Portfolio] Calculating total from ${nonZeroBalances.length} non-zero balances:`);
    
    let sum = 0;
    nonZeroBalances.forEach(balance => {
      const value = balance.valueUSD || 0;
      console.log(`[Portfolio] ${balance.asset}: ${value.toFixed(2)} USD`);
      sum += value;
    });
    
    console.log(`[Portfolio] Total portfolio value: ${sum.toFixed(2)} USD`);
    return sum;
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
  refetch: () => fetchAccountData({ force: true }),
    totalValue: throttledTotalValue,
    totalChange24h,
    isConnected,
    lastSyncTime,
  };
};
