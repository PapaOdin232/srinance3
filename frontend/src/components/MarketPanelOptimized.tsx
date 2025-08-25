/**
 * Optimized MarketPanel - Using New Architecture
 * 
 * Refactored to use the new service-based architecture:
 * - MarketDataService for all market data (ticker, orderbook)
 * - ChartDataService for chart data
 * - No direct WebSocket or REST API calls
 * - Reduced complexity and improved performance
 */

import React, { useState, useEffect, useRef, useCallback, memo, useMemo } from 'react';
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
import { marketDataService, type MarketDataEvent } from '../services/market/MarketDataService';
import { chartDataService, type ChartDataSubscriber } from '../services/chart/ChartDataService';
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

// UI-specific (display) data shapes (stringified for formatting ease)
interface UITickerData {
  symbol: string;
  price: string;
  change: string;
  changePercent: string; // already with % sign
}

interface UIOrderBookData {
  symbol: string;
  bids: [string, string][]; // [price, qty] as strings for easy formatting
  asks: [string, string][];
}

// Connection state for UI
interface ConnectionStatus {
  ticker: boolean;
  orderbook: boolean;
  chart: boolean;
}

const MarketPanel: React.FC = () => {
  const [ticker, setTicker] = useThrottledState<UITickerData | null>(null, 150);
  const [orderBook, setOrderBook] = useState<UIOrderBookData | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState('BTCUSDT');
  const [selectedInterval, setSelectedInterval] = useState<TimeInterval>('1m');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candlestickData, setCandlestickData] = useState<CandlestickData[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    ticker: false,
    orderbook: false,
    chart: false
  });
  
  // Hook do zarządzania aktywami z Binance API (keeping existing assets functionality)
  const { assets, loading: assetsLoading, error: assetsError, refetch: refetchAssets, isConnected } = useAssets();
  
  // Refs for cleanup
  const marketDataSubscriptionRef = useRef<string | null>(null);
  const chartDataSubscriptionRef = useRef<string | null>(null);
  const selectedSymbolRef = useRef<string>(selectedSymbol);

  // Throttled orderbook updates to prevent excessive re-renders
  const setOrderBookThrottled = useThrottledCallback((newOrderBook: UIOrderBookData | null) => {
    setOrderBook(newOrderBook);
  }, 100);

  // Keep selectedSymbolRef in sync
  useEffect(() => {
    selectedSymbolRef.current = selectedSymbol;
  }, [selectedSymbol]);

  // Use lightweight charts hook
  const { chartContainerRef, chartInstance, setHistoricalData, updateCandlestick, fitContent } = useLightweightChart();

  // Chart data subscriber implementation (memoized to avoid identity changes each render)
  const chartDataSubscriber: ChartDataSubscriber = useMemo(() => ({
    // Ensure id is unique and valid even if symbol/interval are temporarily empty
    id: `market-panel-chart-${selectedSymbol || 'none'}-${selectedInterval || 'none'}`,
    onHistoricalData: (data: CandlestickData[]) => {
      const currentSymbol = selectedSymbolRef.current;
      console.log(`[MarketPanel] Received ${data.length} historical data points for ${currentSymbol} ${selectedInterval}`);
      setHistoricalData(data);
      setCandlestickData(data);
      fitContent();
      setConnectionStatus(prev => ({ ...prev, chart: true }));
    },
    onUpdate: (data: CandlestickData) => {
      const currentSymbol = selectedSymbolRef.current;
      console.log(`[MarketPanel] Chart update: ${currentSymbol} ${selectedInterval} - Price: ${data.close}`);
      updateCandlestick(data);
      setCandlestickData(prev => {
        const updated = [...prev];
        const existingIndex = updated.findIndex(item => item.time === data.time);
        if (existingIndex >= 0) {
          updated[existingIndex] = data;
        } else {
          updated.push(data);
        }
        return updated.slice(-1000);
      });
    },
    onError: (error: Error) => {
      console.error(`[MarketPanel] Chart error:`, error);
      setError(`Błąd wykresu: ${error.message}`);
      setConnectionStatus(prev => ({ ...prev, chart: false }));
    }
  }), [selectedSymbol, selectedInterval, setHistoricalData, fitContent, updateCandlestick]);

  // Market data event handler
  const handleMarketDataEvent = useCallback((event: MarketDataEvent) => {
    const currentSymbol = selectedSymbolRef.current;
    
    switch (event.type) {
      case 'ticker':
        if (event.data.symbol === currentSymbol) {
          setTicker({
            symbol: event.data.symbol,
            price: event.data.price.toString(),
            change: event.data.change.toString(),
            changePercent: `${event.data.changePercent.toFixed(2)}%`
          });
          setConnectionStatus(prev => ({ ...prev, ticker: true }));
        }
        break;
        
      case 'orderbook':
        if (event.data.symbol === currentSymbol) {
          setOrderBookThrottled({
            symbol: event.data.symbol,
            bids: event.data.bids.map(([price, qty]) => [price.toString(), qty.toString()]),
            asks: event.data.asks.map(([price, qty]) => [price.toString(), qty.toString()])
          });
          setConnectionStatus(prev => ({ ...prev, orderbook: true }));
        }
        break;
        
      case 'connection':
        console.log(`[MarketPanel] Connection state changed: ${event.state} for ${event.url}`);
        break;
        
      case 'error':
        console.error(`[MarketPanel] Market data error:`, event.error);
        setError(`Błąd danych rynkowych: ${event.context}`);
        break;
    }
  }, [setTicker, setOrderBookThrottled]);

  // Setup market data subscription
  const setupMarketDataSubscription = useCallback(async (symbol: string) => {
    if (!symbol) {
      console.warn('[MarketPanel] Skipping market data subscription: empty symbol');
      return;
    }
    // Avoid duplicate subscribe for same symbol
    if (marketDataSubscriptionRef.current && selectedSymbolRef.current === symbol) {
      // Already have a subscription for this symbol
      return;
    }
    try {
      setIsLoading(true);
      setError(null);
  // Reset ticker/orderbook flags until fresh data arrives
  setConnectionStatus(prev => ({ ...prev, ticker: false, orderbook: false }));
      
      console.log(`[MarketPanel] Setting up market data subscription for ${symbol}`);
      
      // Clean up previous subscription
      if (marketDataSubscriptionRef.current) {
        marketDataService.unsubscribe(marketDataSubscriptionRef.current, selectedSymbolRef.current);
      }
      
      // Create new subscription
      const subscriptionId = marketDataService.subscribe(
        {
          symbol,
          includeTicker: true,
          includeOrderbook: true,
          includeKlines: false, // Chart data is handled separately
          orderbookLimit: 100
        },
        {
          id: `market-panel-${symbol}`,
          onEvent: handleMarketDataEvent
        }
      );
      
      marketDataSubscriptionRef.current = subscriptionId;
      
      // Load initial data
      const [tickerData, orderbookData] = await Promise.all([
        marketDataService.getTicker(symbol),
        marketDataService.getOrderBook(symbol)
      ]);
      
      if (tickerData) {
        setTicker({
          symbol: tickerData.symbol,
            price: tickerData.price.toString(),
            change: tickerData.change.toString(),
            changePercent: `${tickerData.changePercent.toFixed(2)}%`
        });
  setConnectionStatus(prev => ({ ...prev, ticker: true })); // mark snapshot as connected
      }
      
      if (orderbookData) {
        setOrderBook({
          symbol: orderbookData.symbol,
          bids: orderbookData.bids.map(([price, qty]) => [price.toString(), qty.toString()]),
          asks: orderbookData.asks.map(([price, qty]) => [price.toString(), qty.toString()])
        });
  setConnectionStatus(prev => ({ ...prev, orderbook: true }));
      }
      
    } catch (error) {
      console.error(`[MarketPanel] Failed to setup market data for ${symbol}:`, error);
      setError(`Nie udało się załadować danych dla ${symbol}`);
    } finally {
      setIsLoading(false);
    }
  }, [handleMarketDataEvent, setTicker]);

  // Setup chart data subscription  
  const setupChartDataSubscription = useCallback(async (symbol: string, interval: TimeInterval) => {
    if (!symbol) {
      console.warn('[MarketPanel] Skipping chart subscription: empty symbol.');
      // Ensure chart is marked as disconnected if there's no symbol
      setConnectionStatus(prev => ({ ...prev, chart: false }));
      return;
    }

    const expectedId = `market-panel-chart-${symbol}-${interval}`;
    if (chartDataSubscriptionRef.current === expectedId) {
      console.log(`[MarketPanel] Skipping chart subscription: already subscribed with id ${expectedId}`);
      return;
    }

    try {
      console.log(`[MarketPanel] Setting up chart subscription for ${symbol} ${interval}`);
      
      // Clean up previous subscription
      if (chartDataSubscriptionRef.current) {
        chartDataService.unsubscribe(chartDataSubscriptionRef.current);
        console.log(`[MarketPanel] Unsubscribed from ${chartDataSubscriptionRef.current}`);
      }
      
      // Reset chart state before new subscription
      setConnectionStatus(prev => ({ ...prev, chart: false }));
      setHistoricalData([]);
      setCandlestickData([]);
      
      // Create new subscription
      await chartDataService.subscribe(
        {
          symbol,
          interval,
          historicalLimit: 500,
          enableRealTime: true,
          preloadIntervals: ['1m', '5m', '15m', '1h'] // Preload common intervals
        },
        chartDataSubscriber
      );
      
      chartDataSubscriptionRef.current = chartDataSubscriber.id;
      console.log(`[MarketPanel] Subscribed to chart with id ${chartDataSubscriptionRef.current}`);
      
    } catch (error) {
      console.error(`[MarketPanel] Failed to setup chart data for ${symbol} ${interval}:`, error);
      setError(`Nie udało się załadować wykresu dla ${symbol}`);
      setConnectionStatus(prev => ({ ...prev, chart: false }));
    }
  }, [chartDataSubscriber, setHistoricalData]);

  // Handle symbol changes
  useEffect(() => {
    console.log(`[MarketPanel SYMBOL useEffect] Triggered. Symbol: "${selectedSymbol}"`);
    if (!selectedSymbol || !selectedSymbol.trim()) {
      console.warn('[MarketPanel SYMBOL useEffect] Skipping market data subscription: symbol is empty or whitespace');
      return;
    }
    setupMarketDataSubscription(selectedSymbol);
  }, [selectedSymbol, setupMarketDataSubscription]);

  // Handle interval changes
  useEffect(() => {
    console.log(`[MarketPanel INTERVAL useEffect] Triggered. Symbol: "${selectedSymbol}", Interval: "${selectedInterval}"`);
    if (!selectedSymbol || !selectedSymbol.trim()) {
      console.warn('[MarketPanel INTERVAL useEffect] Skipping chart subscription: symbol is empty or whitespace');
      // If we have no symbol, we should ensure the chart is seen as disconnected.
      setConnectionStatus(prev => ({ ...prev, chart: false }));
      return;
    }
    setupChartDataSubscription(selectedSymbol, selectedInterval);
  }, [selectedSymbol, selectedInterval, setupChartDataSubscription]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log('[MarketPanel] Cleaning up subscriptions');
      if (marketDataSubscriptionRef.current) {
        marketDataService.unsubscribe(marketDataSubscriptionRef.current, selectedSymbol);
      }
      if (chartDataSubscriptionRef.current) {
        chartDataService.unsubscribe(chartDataSubscriptionRef.current);
      }
    };
  }, [selectedSymbol]);

  const handleSymbolChange = useCallback((newSymbol: string | undefined) => {
    if (!newSymbol) {
      console.warn('[MarketPanel] handleSymbolChange called with an empty symbol. Ignoring.');
      return;
    }
    console.log(`[MarketPanel] Symbol changed: ${selectedSymbolRef.current} -> ${newSymbol}`);
    // Prevent re-subscribing if the symbol is the same
    if (newSymbol && newSymbol !== selectedSymbolRef.current) {
      setSelectedSymbol(newSymbol);
      setTicker(null);
      setOrderBook(null);
      setError(null);
      setConnectionStatus({ ticker: false, orderbook: false, chart: false });
    }
  }, [setTicker]); // setTicker from useThrottledState should be stable

  const handleIntervalChange = useCallback((newInterval: TimeInterval) => {
    console.log(`[MarketPanel] Interval changed to: ${newInterval}`);
    // Only change the interval state. The useEffect will handle the subscription.
    setSelectedInterval(newInterval);
  }, []); // State setters are stable

  const handleAssetSelect = useCallback((asset: Asset | undefined) => {
    handleSymbolChange(asset?.symbol);
  }, [handleSymbolChange]);

  const handleRetryConnection = useCallback(async () => {
    console.log('[MarketPanel] Retrying connections');
    await Promise.all([
      setupMarketDataSubscription(selectedSymbol),
      setupChartDataSubscription(selectedSymbol, selectedInterval)
    ]);
  }, [selectedSymbol, selectedInterval, setupMarketDataSubscription, setupChartDataSubscription]);

  const handleRefreshChart = useCallback(async () => {
    try {
      await chartDataService.refreshData(selectedSymbol, selectedInterval);
    } catch (error) {
      console.error('[MarketPanel] Failed to refresh chart:', error);
      setError('Nie udało się odświeżyć wykresu');
    }
  }, [selectedSymbol, selectedInterval]);

  // Connection status display
  const getConnectionDisplay = () => {
    const connected = Object.values(connectionStatus).every(status => status);
    const partial = Object.values(connectionStatus).some(status => status);
    
    if (connected) {
      return { text: 'Połączono', color: 'teal', icon: '🟢' };
    } else if (partial) {
      return { text: 'Częściowo połączono', color: 'yellow', icon: '🟡' };
    } else {
      return { text: 'Rozłączono', color: 'red', icon: '🔴' };
    }
  };

  const connectionDisplay = getConnectionDisplay();

  return (
    <Stack gap="md" p="md">
      <Title order={2}>Panel Rynkowy</Title>
      
      {/* Enhanced Connection Status */}
      <Paper p="md" withBorder>
        <Group justify="space-between">
          <Group gap="xs">
            <Text size="lg">{connectionDisplay.icon}</Text>
            <Text fw={600} c={connectionDisplay.color}>
              {connectionDisplay.text}
            </Text>
            <Group gap="xs" ml="md">
              <Badge size="xs" variant="light" color={connectionStatus.ticker ? 'teal' : 'red'}>
                Ticker
              </Badge>
              <Badge size="xs" variant="light" color={connectionStatus.orderbook ? 'teal' : 'red'}>
                OrderBook
              </Badge>
              <Badge size="xs" variant="light" color={connectionStatus.chart ? 'teal' : 'red'}>
                Chart
              </Badge>
            </Group>
          </Group>
          
          <Button
            size="xs"
            variant="outline"
            leftSection={<IconRefresh size={14} />}
            onClick={handleRetryConnection}
            loading={isLoading}
          >
            Ponów połączenie
          </Button>
        </Group>
      </Paper>
      
      {/* Asset Selection */}
      <AssetSelector
        selectedAsset={selectedSymbol}
        onAssetSelect={handleAssetSelect}
        assets={assets}
        loading={assetsLoading}
        error={assetsError}
      />

      {/* Assets info */}
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
          withCloseButton
          onClose={() => setError(null)}
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
      
      {/* Price Display */}
      {ticker && (
        <PriceDisplay ticker={ticker} />
      )}
      
      {/* Chart Controls */}
      <Group justify="space-between">
        <IntervalSelector 
          selectedInterval={selectedInterval}
          onIntervalChange={handleIntervalChange}
          disabled={isLoading}
        />
        <Button
          size="xs"
          variant="light"
          leftSection={<IconRefresh size={14} />}
          onClick={handleRefreshChart}
        >
          Odśwież wykres
        </Button>
      </Group>
      
      {/* Price Chart */}
      <Paper p="md" withBorder>
        <Stack gap="md">
          <Group justify="space-between" align="center">
            <Title order={3}>Wykres Cen</Title>
            <Group gap="xs">
              <Badge variant="light" color="blue" size="sm">
                {selectedInterval.toUpperCase()}
              </Badge>
              <Badge 
                variant="light" 
                color={connectionStatus.chart ? 'teal' : 'red'} 
                size="sm"
              >
                {connectionStatus.chart ? 'LIVE' : 'OFFLINE'}
              </Badge>
            </Group>
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
            <Group justify="space-between" align="center">
              <Title order={3}>Księga Zleceń - {orderBook.symbol}</Title>
              <Badge 
                variant="light" 
                color={connectionStatus.orderbook ? 'teal' : 'red'} 
                size="sm"
              >
                {connectionStatus.orderbook ? 'LIVE' : 'OFFLINE'}
              </Badge>
            </Group>
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
      
      {/* Debug Info in Development */}
      {import.meta.env.DEV && (
        <Paper p="sm" withBorder bg="gray.0">
          <Text size="xs" c="dimmed">
            Debug: Market={marketDataSubscriptionRef.current} | 
            Chart={chartDataSubscriptionRef.current} | 
            Connections: T={connectionStatus.ticker ? '✓' : '✗'} 
            O={connectionStatus.orderbook ? '✓' : '✗'} 
            C={connectionStatus.chart ? '✓' : '✗'}
          </Text>
        </Paper>
      )}
    </Stack>
  );
};

export default memo(MarketPanel);
