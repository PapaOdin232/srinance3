import { useState, useEffect, useCallback, useMemo } from 'react';
import { getAccount } from '../services/restClient';
import type { AccountResponse, Balance } from '../services/restClient';
import type { PortfolioBalance } from '../types/portfolio';
import { useAssets } from './useAssets';

export interface UsePortfolioReturn {
  balances: PortfolioBalance[];
  loading: boolean;
  error: string | null;
  accountData: AccountResponse | null;
  refetch: () => Promise<void>;
  totalValue: number;
  totalChange24h: number;
}

/**
 * Hook do zarządzania danymi portfolio użytkownika
 * Łączy dane z AccountPanel z cenami z MarketPanel
 */
export const usePortfolio = (): UsePortfolioReturn => {
  const [accountData, setAccountData] = useState<AccountResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Use the existing assets hook for market data
  const { assets: marketData } = useAssets();

  const fetchAccountData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getAccount();
      setAccountData(data);
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
      
      // Find market data for this asset
      const marketAsset = marketData.find(m => m.symbol === `${asset}USDT`);
      const currentPrice = asset === 'USDT' ? 1 : marketAsset?.price;
      const priceChange24h = asset === 'USDT' ? 0 : marketAsset?.priceChangePercent;
      
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
      };
    });
  }, [accountData?.balances, marketData]);

  // Calculate portfolio metrics
  const totalValue = useMemo(() => {
    return balances.reduce((total, balance) => total + (balance.valueUSD || 0), 0);
  }, [balances]);

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
    totalValue,
    totalChange24h,
  };
};
