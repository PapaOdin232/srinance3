import { useState, useEffect, useRef } from 'react';
import { fetchAllTradingPairs } from '../services/binanceAPI';
import BinanceTickerWSClient from '../services/BinanceTickerWSClient';
import type { BinanceTicker24hr } from '../services/BinanceTickerWSClient';
import type { Asset } from '../types/asset';

export interface UseAssetsReturn {
  assets: Asset[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
  isConnected: boolean;
}

/**
 * Hook do zarządzania danymi o aktywach z Binance API
 * Automatycznie pobiera dane przy pierwszym użyciu i subskrybuje live updates
 * @returns {UseAssetsReturn} Obiekt z danymi, loading state, błędami, funkcją refetch i status połączenia
 */
export const useAssets = (): UseAssetsReturn => {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  
  const wsClientRef = useRef<BinanceTickerWSClient | null>(null);
  const lastFetchRef = useRef<number>(0);
  const FETCH_COOLDOWN = 60000; // 1 minute cooldown between fetchAllTradingPairs calls

  const fetchAssets = async (forceFetch: boolean = false) => {
    const now = Date.now();
    
    // Skip if recently fetched (unless forced)
    if (!forceFetch && now - lastFetchRef.current < FETCH_COOLDOWN) {
      console.log('[useAssets] Skipping fetch - too recent');
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      const data = await fetchAllTradingPairs();
      setAssets(data);
      lastFetchRef.current = now;
      console.log('[useAssets] Fetched assets successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch assets');
      console.error('Error fetching assets:', err);
    } finally {
      setLoading(false);
    }
  };

  // Handle incoming ticker updates from WebSocket
  const handleTickerUpdates = (tickers: BinanceTicker24hr[]) => {
    setAssets(currentAssets => {
      // Create a map for quick lookups
      const tickerMap = new Map(tickers.map(ticker => [ticker.s, ticker]));
      
      // Update existing assets with new ticker data
      return currentAssets.map(asset => {
        const ticker = tickerMap.get(asset.symbol);
        if (ticker) {
          return {
            ...asset,
            price: parseFloat(ticker.c), // Last price
            change24h: parseFloat(ticker.P), // Price change percent
            volume24h: parseFloat(ticker.q), // Quote asset volume
            high24h: parseFloat(ticker.h), // High price
            low24h: parseFloat(ticker.l), // Low price
            lastUpdated: new Date().toISOString(),
          };
        }
        return asset;
      });
    });
  };

  useEffect(() => {
    // Initialize WebSocket client after initial data load
    if (!loading && assets.length > 0 && !wsClientRef.current) {
      console.log('[useAssets] Initializing WebSocket client for live updates');
      wsClientRef.current = new BinanceTickerWSClient();
      
      // Add listener for ticker updates
      wsClientRef.current.addListener(handleTickerUpdates);
      
      // Monitor connection status
      const checkConnection = () => {
        setIsConnected(wsClientRef.current?.isConnected ?? false);
      };
      
      // Check connection status periodically
      const connectionInterval = setInterval(checkConnection, 5000);
      
      // Initial connection check
      checkConnection();
      
      return () => {
        clearInterval(connectionInterval);
      };
    }
  }, [loading, assets.length]);

  useEffect(() => {
    // Initial data fetch
    fetchAssets(true); // Force initial fetch
    
    // Reduced periodic refresh - only if no WebSocket data
    const refreshInterval = setInterval(() => {
      if (!isConnected) {
        console.log('[useAssets] WebSocket disconnected - fallback fetch');
        fetchAssets(false); // Respect cooldown
      }
    }, 120000); // 2 minutes instead of 30 seconds
    
    // Cleanup WebSocket and intervals on unmount
    return () => {
      clearInterval(refreshInterval);
      if (wsClientRef.current) {
        console.log('[useAssets] Destroying WebSocket client');
        wsClientRef.current.destroy();
        wsClientRef.current = null;
      }
    };
  }, [isConnected]);

  const refetch = () => {
    fetchAssets(true); // Force refetch when requested manually
  };

  return {
    assets,
    loading,
    error,
    refetch,
    isConnected,
  };
};
