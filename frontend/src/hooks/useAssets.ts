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

  const fetchAssets = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchAllTradingPairs();
      setAssets(data);
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
    fetchAssets();
    
    // Periodic refresh every 30 seconds for fallback
    const refreshInterval = setInterval(() => {
      console.log('[useAssets] Periodic refresh - fetching latest data');
      fetchAssets();
    }, 30000);
    
    // Cleanup WebSocket and intervals on unmount
    return () => {
      clearInterval(refreshInterval);
      if (wsClientRef.current) {
        console.log('[useAssets] Destroying WebSocket client');
        wsClientRef.current.destroy();
        wsClientRef.current = null;
      }
    };
  }, []);

  const refetch = () => {
    fetchAssets();
  };

  return {
    assets,
    loading,
    error,
    refetch,
    isConnected,
  };
};
