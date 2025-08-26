/**
 * Optimized MarketPanel - Using New Architecture
 * 
 * Refactored to use the new service-based architecture:
 * - MarketDataService for all market data (ticker, orderbook)
 * - ChartDataService for chart data
 * - No direct WebSocket or REST API calls
 * - Reduced complexity and improved performance
 */

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
  Box,
} from '@mantine/core';
import { IconAlertCircle, IconRefresh } from '@tabler/icons-react';
import { marketDataService, type MarketDataEvent } from '../services/market/MarketDataService';
import { chartDataService, type ChartDataSubscriber } from '../services/chart/ChartDataService';
import useLightweightChart from '../hooks/useLightweightChart';
// useThrottledState removed (ticker UI removed)
import type { CandlestickData } from 'lightweight-charts';
import AssetSelector from './AssetSelector';
// PriceDisplay and OrderBook removed per user request
import IntervalSelector, { type TimeInterval } from './IntervalSelector';
import IndicatorPanel from './IndicatorPanel';
import { useAssets } from '../hooks/useAssets';
import type { Asset } from '../types/asset';

// UI types for display
// Ticker UI removed

// OrderBook UI removed; OrderBookData type omitted

// Connection state for UI
interface ConnectionStatus {
  ticker: boolean;
  orderbook: boolean;
  chart: boolean;
}

const MarketPanel: React.FC = () => {
  // ticker state removed (UI removed)
  // OrderBook state removed
  const [selectedSymbol, setSelectedSymbol] = useState('BTCUSDT');
  const [selectedInterval, setSelectedInterval] = useState<TimeInterval>('5m');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candlestickData, setCandlestickData] = useState<CandlestickData[]>([]);
  // debug counter removed
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
  const chartDataSubscriberRef = useRef<ChartDataSubscriber | null>(null);

  // OrderBook throttling removed

  // Keep selectedSymbolRef in sync
  useEffect(() => {
    selectedSymbolRef.current = selectedSymbol;
  }, [selectedSymbol]);

  // Use lightweight charts hook
  const { chartContainerRef, chartInstance, setHistoricalData, updateCandlestick, fitContent } = useLightweightChart();

  // Initialize chart data subscriber once
  useEffect(() => {
    if (!chartDataSubscriberRef.current) {
      chartDataSubscriberRef.current = {
        id: `market-panel-chart-${Date.now()}`,
        onHistoricalData: (data: CandlestickData[]) => {
          console.log(`[MarketPanel] Received ${data.length} historical data points`);
          setHistoricalData(data);
          setCandlestickData(data);
          fitContent();
          setConnectionStatus(prev => ({ ...prev, chart: true }));
        },
        onUpdate: (data: CandlestickData) => {
          console.log(`[MarketPanel] Chart update - Price: ${data.close}`);
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
      };
    }
  }, [setHistoricalData, fitContent, updateCandlestick]);

  // Market data event handler
  const handleMarketDataEvent = useCallback((event: MarketDataEvent) => {
  // debug logging removed
    const currentSymbol = selectedSymbolRef.current;
    
    switch (event.type) {
      case 'ticker':
        if (event.data.symbol === currentSymbol) {
          // ticker UI removed — just update connection status
          setConnectionStatus(prev => ({ ...prev, ticker: true }));
        }
        break;
        
  // orderbook events intentionally ignored (UI removed)
        
      case 'connection':
        console.log(`[MarketPanel] Connection state changed: ${event.state} for ${event.url}`);
        break;
        
      case 'error':
        console.error(`[MarketPanel] Market data error:`, event.error);
        setError(`Błąd danych rynkowych: ${event.context}`);
        break;
    }
  }, []);

  // Setup market data subscription
  const setupMarketDataSubscription = useCallback(async (symbol: string) => {
    if (!symbol) {
      console.warn('[MarketPanel] Skipping market data subscription: empty symbol');
      return;
    }
    if (marketDataSubscriptionRef.current && selectedSymbolRef.current === symbol) {
      return; // already subscribed
    }
    try {
      setIsLoading(true);
      setError(null);
  setConnectionStatus(prev => ({ ...prev, ticker: false, orderbook: false }));
      
      console.log(`[MarketPanel] Setting up market data subscription for ${symbol}`);
      
      // Clean up previous subscription (let service resolve symbol from subscriber id)
      if (marketDataSubscriptionRef.current) {
        marketDataService.unsubscribe(marketDataSubscriptionRef.current);
      }
      
      // Create new subscription
      const subscriptionId = marketDataService.subscribe(
        {
          symbol,
          includeTicker: true,
          includeOrderbook: false, // orderbook UI removed, backend subscription disabled
          includeKlines: false, // Chart data is handled separately
        },
        {
          id: `market-panel-${symbol}`,
          onEvent: handleMarketDataEvent
        }
      );
      
      marketDataSubscriptionRef.current = subscriptionId;
      
  // Load initial data (ticker only)
  const tickerData = await marketDataService.getTicker(symbol);
      
  if (tickerData) {
    setConnectionStatus(prev => ({ ...prev, ticker: true }));
  }
      
    } catch (error) {
      console.error(`[MarketPanel] Failed to setup market data for ${symbol}:`, error);
      setError(`Nie udało się załadować danych dla ${symbol}`);
    } finally {
      setIsLoading(false);
    }
  }, [handleMarketDataEvent]);

  // Setup chart data subscription  
  const setupChartDataSubscription = useCallback(async (symbol: string, interval: TimeInterval) => {
    if (!symbol) {
      console.warn('[MarketPanel] Skipping chart subscription: empty symbol');
      return;
    }
    try {
      console.log(`[MarketPanel] Setting up chart subscription for ${symbol} ${interval}`);
      
      // Clean up previous subscription
      if (chartDataSubscriptionRef.current) {
        chartDataService.unsubscribe(chartDataSubscriptionRef.current);
      }
      
      // Clear existing chart data
      setHistoricalData([]);
      setCandlestickData([]);
      
      // Create new subscription
    await chartDataService.subscribe(
        {
          symbol,
          interval,
          historicalLimit: 500,
          enableRealTime: true,
      // No preloading of other intervals at init to reduce REST load
        },
        chartDataSubscriberRef.current!
      );
      
      chartDataSubscriptionRef.current = chartDataSubscriberRef.current!.id;
      
    } catch (error) {
      console.error(`[MarketPanel] Failed to setup chart data for ${symbol} ${interval}:`, error);
      setError(`Nie udało się załadować wykresu dla ${symbol}`);
    }
  }, [setHistoricalData]); // Remove chartDataSubscriber dependency

  // Handle symbol changes
  useEffect(() => {
    setupMarketDataSubscription(selectedSymbol);
  }, [selectedSymbol, setupMarketDataSubscription]);

  // Handle interval changes
  useEffect(() => {
    setupChartDataSubscription(selectedSymbol, selectedInterval);
  }, [selectedSymbol, selectedInterval, setupChartDataSubscription]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log('[MarketPanel] Cleaning up subscriptions');
      if (marketDataSubscriptionRef.current) {
        marketDataService.unsubscribe(marketDataSubscriptionRef.current);
      }
      if (chartDataSubscriptionRef.current) {
        chartDataService.unsubscribe(chartDataSubscriptionRef.current);
      }
    };
  }, [selectedSymbol]);

  const handleSymbolChange = useCallback((newSymbol: string) => {
    console.log(`[MarketPanel] Symbol changed: ${selectedSymbolRef.current} -> ${newSymbol}`);
  setSelectedSymbol(newSymbol);
    setError(null);
    setConnectionStatus({ ticker: false, orderbook: false, chart: false });
  }, []); // Remove selectedSymbol dependency to prevent cycle

  const handleIntervalChange = useCallback((newInterval: TimeInterval) => {
    console.log(`[MarketPanel] Interval changed: ${selectedSymbolRef.current} -> ${newInterval}`);
    setSelectedInterval(newInterval);
    setConnectionStatus(prev => ({ ...prev, chart: false }));
  }, []); // Remove selectedInterval dependency to prevent cycle

  const handleAssetSelect = useCallback((asset: Asset) => {
    handleSymbolChange(asset.symbol);
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
      
  {/* Price Display removed */}
      
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
      
  {/* Order Book removed */}
      
  {/* Debug removed */}
    </Stack>
  );
};

export default memo(MarketPanel);