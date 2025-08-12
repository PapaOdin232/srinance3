import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import {
  Paper,
  Stack,
  Group,
  Text,
  Title,
  Badge,
  Alert,
  Loader,
  Button,
  Grid,
  Box,
} from '@mantine/core';
import { IconAlertCircle, IconRefresh } from '@tabler/icons-react';
import EnhancedWSClient, { ConnectionState, getConnectionStateDisplay } from '../services/wsClient';
import { getCurrentTicker, getOrderBook } from '../services/restClient';
import { fetchLightweightChartsKlines } from '../services/binanceAPI';
import BinanceWSClient from '../services/binanceWSClient';
import type { BinanceKlineData } from '../services/binanceWSClient';
import useLightweightChart from '../hooks/useLightweightChart';
import { useThrottledState } from '../hooks/useThrottledState';
import { useThrottledCallback } from '../hooks/useThrottledCallback';
import type { CandlestickData } from 'lightweight-charts';
import AssetSelector from './AssetSelector';
import PriceDisplay from './PriceDisplay';
import IntervalSelector, { type TimeInterval } from './IntervalSelector';
import IndicatorPanel from './IndicatorPanel';
import { useAssets } from '../hooks/useAssets';
import type { Asset } from '../types/asset';

interface TickerData {
  symbol: string;
  price: string;
  change: string;
  changePercent: string;
}

interface OrderBookData {
  symbol: string;
  bids: [string, string][];
  asks: [string, string][];
}

const MarketPanel: React.FC = () => {
  const [ticker, setTicker] = useThrottledState<TickerData | null>(null, 150); // Throttle ticker updates
  const [orderBook, setOrderBook] = useState<OrderBookData | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState('BTCUSDT');
  const [selectedInterval, setSelectedInterval] = useState<TimeInterval>('1m');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState<string | null>(null); // Track which symbol has history loaded
  const [candlestickData, setCandlestickData] = useState<any[]>([]); // Store historical data for indicators
  
  // Hook do zarządzania aktywami z Binance API
  const { assets, loading: assetsLoading, error: assetsError, refetch: refetchAssets, isConnected } = useAssets();
  
  // WebSocket connection state
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  
  const wsClientRef = useRef<EnhancedWSClient | null>(null);
  const selectedSymbolRef = useRef<string>(selectedSymbol);

  // Throttled orderbook updates to prevent excessive re-renders
  const setOrderBookThrottled = useThrottledCallback((newOrderBook: OrderBookData | null) => {
    setOrderBook(newOrderBook);
  }, 100); // Limit to ~10 updates per second

  // Keep selectedSymbolRef in sync with selectedSymbol
  useEffect(() => {
    selectedSymbolRef.current = selectedSymbol;
  }, [selectedSymbol]);

  // Debugowanie setup/cleanup WebSocket
  useEffect(() => {
    console.log(`[MarketPanel] Setting up WebSocket for ${selectedSymbol}`);
    return () => {
      console.log(`[MarketPanel] Cleaning up WebSocket for ${selectedSymbol}`);
    };
  }, [selectedSymbol]);

  // Monitoring stanu połączenia
  useEffect(() => {
    console.log(`[MarketPanel] Connection state changed: ${connectionState}`);
    if (connectionError) {
      console.error(`[MarketPanel] Connection error: ${connectionError}`);
    }
  }, [connectionState, connectionError]);

  // Use lightweight charts hook
  const { chartContainerRef, chartInstance, setHistoricalData, updateCandlestick, fitContent } = useLightweightChart();
  
  // Binance WebSocket client for real-time kline data
  const binanceWSClientRef = useRef<BinanceWSClient | null>(null);

  // Load historical data for chart - using Binance API directly
  const loadHistoricalData = useCallback(async (symbol: string, interval: TimeInterval = '1m') => {
    try {
      setIsLoading(true);
      console.log(`[MarketPanel] Loading historical data for ${symbol} (${interval}) from Binance API`);
      
      const candlestickData = await fetchLightweightChartsKlines(symbol, interval, 100);
      
      if (candlestickData && candlestickData.length > 0) {
        console.log(`[MarketPanel] Got ${candlestickData.length} historical data points`);
        console.log(`[MarketPanel] Price range: ${Math.min(...candlestickData.map(c => c.low))} - ${Math.max(...candlestickData.map(c => c.high))}`);
        
        // Set historical data using lightweight-charts (cast time to any for compatibility)
        const chartData: CandlestickData[] = candlestickData.map(d => ({
          ...d,
          time: d.time as any
        }));
        setHistoricalData(chartData);
        setCandlestickData(candlestickData); // Store for indicators
        fitContent(); // Fit chart to content
        setHistoryLoaded(`${symbol}_${interval}`); // Mark history as loaded for this symbol and interval
      } else {
        console.warn(`[MarketPanel] No historical data received`);
      }
    } catch (err) {
      console.error('Failed to load historical data:', err);
      setError('Nie udało się załadować danych historycznych');
    } finally {
      setIsLoading(false);
    }
  }, [setHistoricalData, fitContent]);

  // Load initial data
  const loadInitialData = async (symbol: string) => {
    try {
      setIsLoading(true);
      setError(null);
      // Prefer ticker data from assets hook (WebSocket) to reduce REST calls
      let localTicker: any = null;
      const asset = assets.find(a => a.symbol === symbol);
      if (asset) {
        localTicker = {
            symbol: asset.symbol,
            price: asset.price?.toString() || '0',
            change: asset.priceChange?.toString() || '0',
            changePercent: `${asset.priceChangePercent?.toFixed(2) || '0'}%`
        };
      }

      if (!localTicker) {
        try {
          localTicker = await getCurrentTicker(symbol);
        } catch (e) {
          console.warn('[MarketPanel] REST ticker fallback failed:', e);
        }
      }

      if (localTicker) {
        setTicker({
          symbol: localTicker.symbol,
          price: localTicker.price,
          change: localTicker.change || '0',
          changePercent: localTicker.changePercent || '0%'
        });
      }

      const orderBookData = await getOrderBook(symbol);
      if (orderBookData) {
        setOrderBook({
          symbol: symbol,
          bids: Array.isArray(orderBookData.bids) ? orderBookData.bids : [],
          asks: Array.isArray(orderBookData.asks) ? orderBookData.asks : []
        });
      }
      
      // Nie ładuj danych historycznych tutaj - zostanie to zrobione w useEffect gdy chart będzie gotowy
    } catch (err) {
      console.error('Failed to load initial data:', err);
      setError('Nie udało się załadować danych początkowych');
    } finally {
      setIsLoading(false);
    }
  };

  // Load historical data when component mounts or symbol/interval changes
  useEffect(() => {
    const historyKey = `${selectedSymbol}_${selectedInterval}`;
    if (historyLoaded !== historyKey) {
      console.log(`[MarketPanel] Loading historical data for ${selectedSymbol} (${selectedInterval})`);
      loadHistoricalData(selectedSymbol, selectedInterval);
    }
  }, [selectedSymbol, selectedInterval, historyLoaded, loadHistoricalData]);

  // Setup Binance WebSocket for real-time kline data
  useEffect(() => {
    let mounted = true;
    
    // Check if Binance streams are enabled
    const binanceStreamsEnabled = ((typeof process !== 'undefined' && (process as any).env?.VITE_ENABLE_BINANCE_STREAMS) === 'true');
    
    if (!binanceStreamsEnabled) {
      return;
    }
    
    // Create new Binance WebSocket client for kline data
    const binanceClient = new BinanceWSClient(selectedSymbol, selectedInterval);
    binanceWSClientRef.current = binanceClient;
    
    binanceClient.addListener((data: BinanceKlineData) => {
      if (!mounted) return;
      
      // Convert to lightweight-charts format and update chart
      const candlestick: CandlestickData = {
        time: Math.floor(data.k.t / 1000) as any, // Convert milliseconds to seconds
        open: parseFloat(data.k.o),
        high: parseFloat(data.k.h),
        low: parseFloat(data.k.l),
        close: parseFloat(data.k.c)
      };
      
      updateCandlestick(candlestick);
      
      // Nie aktualizuj tickera tutaj - ticker pochodzi z backend WebSocket
    });
    
    return () => {
      mounted = false;
      console.log(`[MarketPanel] Cleaning up Binance WebSocket for ${selectedSymbol} (${selectedInterval})`);
      if (binanceWSClientRef.current) {
        binanceWSClientRef.current.destroy();
        binanceWSClientRef.current = null;
      }
    };
  }, [selectedSymbol, selectedInterval]);

  // Setup WebSocket connection for orderbook and other data (keep existing backend connection)
  useEffect(() => {
    let mounted = true;
    let wsClientLocal: EnhancedWSClient | null = null;

    const setupWebSocket = () => {
      if (wsClientRef.current) {
        console.log('[MarketPanel] WebSocket connection already exists, skipping setup');
        return;
      }

      if (!mounted) return;

      console.log('[MarketPanel] Setting up persistent WebSocket connection for orderbook/ticker');
      const wsClient = new EnhancedWSClient('ws://localhost:8001/ws/market', {
        reconnectInterval: 2000,
        maxReconnectInterval: 30000,
        maxReconnectAttempts: 5,
        heartbeatInterval: 30000,
        debug: true
      });

      wsClientRef.current = wsClient;
      wsClientLocal = wsClient;

      wsClient.addStateListener((state, error) => {
        if (!mounted) return;
        console.log(`[MarketPanel] WebSocket state changed: ${state}`);
        setConnectionState(state);
        setConnectionError(error || null);
      });

      wsClient.addListener((msg) => {
        if (!mounted) return;
        const currentSelectedSymbol = selectedSymbolRef.current;
        
        switch (msg.type) {
          case 'ticker':
            // Filter: only process ticker for currently selected symbol
            if (msg.symbol === currentSelectedSymbol) {
              setTicker({
                symbol: msg.symbol as string,
                price: msg.price as string,
                change: msg.change as string,
                changePercent: msg.changePercent as string
              });
            }
            break;
          case 'orderbook':
            // Filter: only process orderbook for currently selected symbol
            if (msg.symbol === currentSelectedSymbol) {
              setOrderBookThrottled({
                symbol: msg.symbol as string,
                bids: Array.isArray(msg.bids) ? (msg.bids as [string, string][]) : [],
                asks: Array.isArray(msg.asks) ? (msg.asks as [string, string][]) : []
              });
            }
            break;
        }
      });
    };

    // Delay to prevent double connections in Strict Mode
    const timeoutId = setTimeout(setupWebSocket, 100);

    return () => {
      mounted = false;
      clearTimeout(timeoutId);
      if (wsClientLocal) {
        console.log('[MarketPanel] Destroying WebSocket connection on component unmount');
        wsClientLocal.destroy();
        wsClientLocal = null;
      }
      if (wsClientRef.current) {
        wsClientRef.current.destroy();
        wsClientRef.current = null;
      }
    };
  }, []); // NO dependencies - persistent connection

  // Handle symbol subscription changes for orderbook
  useEffect(() => {
    if (!wsClientRef.current || connectionState !== ConnectionState.CONNECTED) {
      console.log(`[MarketPanel] WebSocket not ready for subscription. State: ${connectionState}`);
      return;
    }

    console.log(`[MarketPanel] Subscribing to ${selectedSymbol} via existing WebSocket connection`);
    
    // Send subscription message for new symbol
    wsClientRef.current.send({ 
      type: 'subscribe', 
      symbol: selectedSymbol 
    });

    // Load initial data for new symbol
    loadInitialData(selectedSymbol);

  }, [selectedSymbol, connectionState]); // Only depend on symbol and connection state

  const handleSymbolChange = (newSymbol: string) => {
    setSelectedSymbol(newSymbol);
    setTicker(null);
    setOrderBook(null);
    setError(null);
    setHistoryLoaded(null); // Reset history loaded flag
  };

  const handleIntervalChange = (newInterval: TimeInterval) => {
    setSelectedInterval(newInterval);
    setHistoryLoaded(null); // Reset history loaded flag to force reload
  };

  // Nowa funkcja obsługi wyboru aktywa z AssetSelector
  const handleAssetSelect = (asset: Asset) => {
    handleSymbolChange(asset.symbol);
  };

  const handleRetryConnection = () => {
    if (wsClientRef.current) {
      wsClientRef.current.reconnect();
    }
  };

  const connectionDisplay = getConnectionStateDisplay(connectionState);

  return (
    <Stack gap="md" p="md">
      <Title order={2}>Panel Rynkowy</Title>
      
      {/* Connection Status */}
      <Paper p="md" withBorder>
        <Group justify="space-between">
          <Group gap="xs">
            <Text size="lg">{connectionDisplay.icon}</Text>
            <Text fw={600} c={connectionDisplay.color === '#4CAF50' ? 'teal' : 'red'}>
              {connectionDisplay.text}
            </Text>
            {connectionError && (
              <Text size="sm" c="red">
                ({connectionError})
              </Text>
            )}
          </Group>
          
          {(connectionState === ConnectionState.ERROR || connectionState === ConnectionState.DISCONNECTED) && (
            <Button
              size="xs"
              variant="outline"
              leftSection={<IconRefresh size={14} />}
              onClick={handleRetryConnection}
            >
              Ponów połączenie
            </Button>
          )}
        </Group>
      </Paper>
      
      {/* Asset Selection - Nowy komponent z TanStack Table + Mantine */}
      <AssetSelector
        selectedAsset={selectedSymbol}
        onAssetSelect={handleAssetSelect}
        assets={assets}
        loading={assetsLoading}
        error={assetsError}
      />

      {/* Dodatkowe informacje o załadowaniu aktywów */}
      {!assetsLoading && !assetsError && assets.length > 0 && (
        <Paper p="xs" withBorder>
          <Group justify="center" gap="md">
            <Text size="xs" c="dimmed">
              Załadowano {assets.length} par trading z Binance API
            </Text>
            <Badge color={isConnected ? 'teal' : 'red'} variant="light" size="xs">
              {isConnected ? 'LIVE' : 'OFFLINE'}
            </Badge>
            <Button
              size="xs"
              variant="outline"
              leftSection={<IconRefresh size={12} />}
              onClick={refetchAssets}
            >
              Odśwież
            </Button>
          </Group>
        </Paper>
      )}
      
      {/* Error Display */}
      {error && (
        <Alert 
          icon={<IconAlertCircle size={16} />}
          title="Błąd"
          color="red"
          variant="light"
        >
          {error}
        </Alert>
      )}
      
      {/* Loading Indicator */}
      {isLoading && (
        <Paper p="xl" withBorder>
          <Group justify="center" gap="md">
            <Loader size="md" />
            <Text>Ładowanie danych...</Text>
          </Group>
        </Paper>
      )}
      
      {/* Price Display - Enhanced */}
      {ticker && (
        <PriceDisplay ticker={ticker} />
      )}
      
      {/* Chart Controls */}
      <IntervalSelector 
        selectedInterval={selectedInterval}
        onIntervalChange={handleIntervalChange}
        disabled={isLoading}
      />
      
      {/* Price Chart */}
      <Paper p="md" withBorder>
        <Stack gap="md">
          <Group justify="space-between" align="center">
            <Title order={3}>Wykres Cen</Title>
            <Badge variant="light" color="blue" size="sm">
              {selectedInterval.toUpperCase()} • Żywo
            </Badge>
          </Group>
          <Box ref={chartContainerRef} style={{ width: '100%', height: '500px', borderRadius: '8px' }} />
        </Stack>
      </Paper>
      
      {/* Technical Indicators Panel */}
      <IndicatorPanel 
        chartInstance={chartInstance} 
        historicalData={candlestickData}
      />
      
      {/* Order Book */}
      {orderBook && (
        <Paper p="md" withBorder>
          <Stack gap="md">
            <Title order={3}>Księga Zleceń - {orderBook.symbol}</Title>
            <Grid>
              <Grid.Col span={6}>
                <Stack gap="xs">
                  <Text fw={600} c="red">Asks (Sprzedaż)</Text>
                  <Stack gap={2}>
                    {(orderBook.asks || []).slice(0, 10).map((ask, i) => (
                      <Group key={i} justify="space-between">
                        <Text size="sm" ff="monospace" c="red" fw={600}>
                          {parseFloat(ask[0]).toFixed(2)}
                        </Text>
                        <Text size="sm" ff="monospace">
                          {parseFloat(ask[1]).toFixed(6)}
                        </Text>
                      </Group>
                    ))}
                  </Stack>
                </Stack>
              </Grid.Col>
              <Grid.Col span={6}>
                <Stack gap="xs">
                  <Text fw={600} c="teal">Bids (Kupno)</Text>
                  <Stack gap={2}>
                    {(orderBook.bids || []).slice(0, 10).map((bid, i) => (
                      <Group key={i} justify="space-between">
                        <Text size="sm" ff="monospace" c="teal" fw={600}>
                          {parseFloat(bid[0]).toFixed(2)}
                        </Text>
                        <Text size="sm" ff="monospace">
                          {parseFloat(bid[1]).toFixed(6)}
                        </Text>
                      </Group>
                    ))}
                  </Stack>
                </Stack>
              </Grid.Col>
            </Grid>
          </Stack>
        </Paper>
      )}
    </Stack>
  );
};

export default memo(MarketPanel);