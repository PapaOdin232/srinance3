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
  Grid,
} from '@mantine/core';
import { IconAlertCircle, IconRefresh } from '@tabler/icons-react';
import { marketDataService, type MarketDataEvent } from '../services/market/MarketDataService';
import { chartDataService, type ChartDataSubscriber } from '../services/chart/ChartDataService';
import useLightweightChart from '../hooks/useLightweightChart';
import { createDebugLogger } from '../utils/debugLogger';
// useThrottledState removed (ticker UI removed)
import type { CandlestickData } from 'lightweight-charts';
import AssetSelector from './AssetSelector';
import PriceDisplay from './PriceDisplay';
import OrderBookDisplay from './OrderBookDisplay';
import IntervalSelector, { type TimeInterval } from './IntervalSelector';
import IndicatorPanel from './IndicatorPanel';
import { useAssets } from '../hooks/useAssets';
import type { Asset } from '../types/asset';

// UI types for display
interface TickerData {
  symbol: string;
  price: string;
  change: string;
  changePercent: string;
}

interface OrderBookData {
  symbol: string;
  bids: Array<[string, string]>; // [price, quantity]
  asks: Array<[string, string]>; // [price, quantity]
  timestamp?: number;
}

// OrderBook UI removed; OrderBookData type omitted

// Connection state for UI
interface ConnectionStatus {
  ticker: boolean;
  orderbook: boolean;
  chart: boolean;
}

const MarketPanel: React.FC = () => {
  // Debug logger
  const logger = createDebugLogger('MarketPanel');
  
  const [tickerData, setTickerData] = useState<TickerData | null>(null);
  const [orderbookData, setOrderbookData] = useState<OrderBookData | null>(null);
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
          logger.log(`Received ${data.length} historical data points`);
          setHistoricalData(data);
          setCandlestickData(data);
          fitContent();
          setConnectionStatus(prev => ({ ...prev, chart: true }));
        },
        onUpdate: (data: CandlestickData) => {
          logger.log(`Chart update - Price: ${data.close}`);
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
          logger.error(`Chart error:`, error);
          setError(`Błąd wykresu: ${error.message}`);
          setConnectionStatus(prev => ({ ...prev, chart: false }));
        }
      };
    }
  }, [setHistoricalData, fitContent, updateCandlestick]);

  // Market data event handler
  const handleMarketDataEvent = useCallback((event: MarketDataEvent) => {
    const currentSymbol = selectedSymbolRef.current;
    logger.log(`handleMarketDataEvent:`, { 
      eventType: event.type, 
      currentSymbol,
      fullEvent: event
    });
    
    switch (event.type) {
      case 'ticker':
        logger.log(`Setting ticker data:`, event);
        logger.log(`NEW TICKER STATE:`, {
          symbol: event.data.symbol,
          price: event.data.price,
          change: event.data.change,
          changePercent: event.data.changePercent
        });
        if (event.data.symbol === currentSymbol) {
          const newTickerData = {
            symbol: event.data.symbol,
            price: event.data.price.toString(),
            change: event.data.change.toString(),
            changePercent: event.data.changePercent.toString()
          };
          setTickerData(newTickerData);
          logger.log(`STATE UPDATED! tickerData set to:`, newTickerData);
          setConnectionStatus(prev => ({ ...prev, ticker: true }));
        }
        break;
        
      case 'orderbook':
        logger.log(`Setting orderbook data:`, event);
        logger.log(`NEW ORDERBOOK STATE:`, {
          symbol: event.data.symbol,
          bidsCount: event.data.bids.length,
          asksCount: event.data.asks.length,
          timestamp: event.data.timestamp
        });
        if (event.data.symbol === currentSymbol) {
          const newOrderbookData = {
            symbol: event.data.symbol,
            bids: event.data.bids.map(([price, qty]) => [price.toString(), qty.toString()] as [string, string]),
            asks: event.data.asks.map(([price, qty]) => [price.toString(), qty.toString()] as [string, string]),
            timestamp: event.data.timestamp
          };
          setOrderbookData(newOrderbookData);
          logger.log(`STATE UPDATED! orderbookData set to:`, newOrderbookData);
          setConnectionStatus(prev => ({ ...prev, orderbook: true }));
        }
        break;
        
      case 'connection':
        logger.connection(event.state, event.url);
        break;
        
      case 'error':
        logger.error(`Market data error:`, event.error);
        setError(`Błąd danych rynkowych: ${event.context}`);
        break;
    }
  }, [logger]);

  // Setup market data subscription
  const setupMarketDataSubscription = useCallback(async (symbol: string) => {
    logger.log(`setupMarketDataSubscription called for ${symbol}, current: ${selectedSymbolRef.current}, ref: ${marketDataSubscriptionRef.current}`);
    
    if (!symbol) {
      logger.warn('Skipping market data subscription: empty symbol');
      return;
    }
    if (marketDataSubscriptionRef.current && selectedSymbolRef.current === symbol) {
      logger.log('Already subscribed to this symbol, skipping');
      return; // already subscribed
    }
    try {
      setIsLoading(true);
      setError(null);
  setConnectionStatus(prev => ({ ...prev, ticker: false, orderbook: false }));
      
      logger.log(`Setting up market data subscription for ${symbol}`);
      
      // Clean up previous subscription (let service resolve symbol from subscriber id)
      if (marketDataSubscriptionRef.current) {
        marketDataService.unsubscribe(marketDataSubscriptionRef.current);
        marketDataSubscriptionRef.current = null;
      }
      
      // Create new subscription
      const subscriptionId = marketDataService.subscribe(
        {
          symbol,
          includeTicker: true,
          includeOrderbook: true,
          includeKlines: false, // Chart data is handled separately
        },
        {
          id: `market-panel-${symbol}`,
          onEvent: handleMarketDataEvent
        }
      );
      
      marketDataSubscriptionRef.current = subscriptionId;
      
  // Load initial data (ticker and orderbook)
  const tickerData = await marketDataService.getTicker(symbol);
  const orderbookData = await marketDataService.getOrderBook(symbol);
      
  if (tickerData) {
    setTickerData({
      symbol: tickerData.symbol,
      price: tickerData.price.toString(),
      change: tickerData.change.toString(),
      changePercent: tickerData.changePercent.toString() + '%'
    });
    setConnectionStatus(prev => ({ ...prev, ticker: true }));
  }

  if (orderbookData) {
    setOrderbookData({
      symbol: orderbookData.symbol,
      bids: orderbookData.bids.map(([price, qty]) => [price.toString(), qty.toString()]),
      asks: orderbookData.asks.map(([price, qty]) => [price.toString(), qty.toString()]),
      timestamp: orderbookData.timestamp
    });
    setConnectionStatus(prev => ({ ...prev, orderbook: true }));
  }
      
    } catch (error) {
      logger.error(`Failed to setup market data for ${symbol}:`, error);
      setError(`Nie udało się załadować danych dla ${symbol}`);
    } finally {
      setIsLoading(false);
    }
  }, [handleMarketDataEvent, logger]);

  // Setup chart data subscription  
  const setupChartDataSubscription = useCallback(async (symbol: string, interval: TimeInterval) => {
    if (!symbol) {
      logger.warn('Skipping chart subscription: empty symbol');
      return;
    }
    try {
      logger.log(`Setting up chart subscription for ${symbol} ${interval}`);
      
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
      logger.error(`Failed to setup chart data for ${symbol} ${interval}:`, error);
      setError(`Nie udało się załadować wykresu dla ${symbol}`);
    }
  }, [setHistoricalData, logger]); // Remove chartDataSubscriber dependency

  // Handle symbol changes
  useEffect(() => {
    setupMarketDataSubscription(selectedSymbol);
  }, [selectedSymbol]); // Remove setupMarketDataSubscription from deps to prevent cycle

  // Handle interval changes
  useEffect(() => {
    setupChartDataSubscription(selectedSymbol, selectedInterval);
  }, [selectedSymbol, selectedInterval]); // Remove setupChartDataSubscription from deps to prevent cycle

  // Cleanup on unmount
  useEffect(() => {
    let isMounted = true;
    
    return () => {
      isMounted = false;
      
      // In development/StrictMode, avoid cleanup to prevent double mounting issues
      const isDevelopment = import.meta.env.DEV;
      if (isDevelopment) {
        logger.log('Skipping cleanup in development mode (StrictMode protection)');
        return;
      }
      
      // Only cleanup in production after a delay to ensure component is truly unmounting
      window.setTimeout(() => {
        if (!isMounted) {
          logger.log('Cleaning up subscriptions (production)');
          if (marketDataSubscriptionRef.current) {
            marketDataService.unsubscribe(marketDataSubscriptionRef.current);
            marketDataSubscriptionRef.current = null;
          }
          if (chartDataSubscriptionRef.current) {
            chartDataService.unsubscribe(chartDataSubscriptionRef.current);
            chartDataSubscriptionRef.current = null;
          }
        }
      }, 500);
    };
  }, []); // Empty dependency array - cleanup only on unmount

  const handleSymbolChange = useCallback((newSymbol: string) => {
    logger.log(`Symbol changed: ${selectedSymbolRef.current} -> ${newSymbol}`);
  setSelectedSymbol(newSymbol);
    setError(null);
    setConnectionStatus({ ticker: false, orderbook: false, chart: false });
  }, [logger]); // Remove selectedSymbol dependency to prevent cycle

  const handleIntervalChange = useCallback((newInterval: TimeInterval) => {
    logger.log(`Interval changed: ${selectedSymbolRef.current} -> ${newInterval}`);
    setSelectedInterval(newInterval);
    setConnectionStatus(prev => ({ ...prev, chart: false }));
  }, [logger]); // Remove selectedInterval dependency to prevent cycle

  const handleAssetSelect = useCallback((asset: Asset) => {
    handleSymbolChange(asset.symbol);
  }, [handleSymbolChange]);

  const handleRetryConnection = useCallback(async () => {
    logger.log('Retrying connections');
    await Promise.all([
      setupMarketDataSubscription(selectedSymbol),
      setupChartDataSubscription(selectedSymbol, selectedInterval)
    ]);
  }, [selectedSymbol, selectedInterval, logger, setupMarketDataSubscription, setupChartDataSubscription]); // Remove function deps to prevent cycles

  const handleRefreshChart = useCallback(async () => {
    try {
      await chartDataService.refreshData(selectedSymbol, selectedInterval);
    } catch (error) {
      logger.error('Failed to refresh chart:', error);
      setError('Nie udało się odświeżyć wykresu');
    }
  }, [selectedSymbol, selectedInterval, logger]);

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

  // Debug log for re-renders
  logger.render(`RENDER:`, {
    tickerData,
    orderbookData,
    connectionStatus,
    selectedSymbol,
    renderTime: new Date().toISOString()
  });

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
      
      {/* Market Data Display */}
      <Grid>
        <Grid.Col span={6}>
          {tickerData ? (
            <PriceDisplay 
              key={`ticker-${tickerData.symbol}-${tickerData.price}`} 
              ticker={tickerData} 
            />
          ) : (
            <Paper p="xl" withBorder>
              <Group justify="center" gap="md">
                <Loader size="md" />
                <Text>Ładowanie danych cenowych...</Text>
              </Group>
            </Paper>
          )}
        </Grid.Col>
        <Grid.Col span={6}>
          {orderbookData ? (
            <OrderBookDisplay 
              key={`orderbook-${orderbookData.symbol}-${orderbookData.timestamp}`} 
              orderbook={orderbookData} 
              maxRows={8} 
            />
          ) : (
            <Paper p="xl" withBorder>
              <Group justify="center" gap="md">
                <Loader size="md" />
                <Text>Ładowanie księgi zleceń...</Text>
              </Group>
            </Paper>
          )}
        </Grid.Col>
      </Grid>
      
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