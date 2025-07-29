import React, { useState, useEffect, useRef, useCallback } from 'react';
import EnhancedWSClient, { ConnectionState, getConnectionStateDisplay } from '../services/wsClient';
import { getCurrentTicker, getOrderBook } from '../services/restClient';
import { fetchLightweightChartsKlines } from '../services/binanceAPI';
import BinanceWSClient from '../services/binanceWSClient';
import type { BinanceKlineData } from '../services/binanceWSClient';
import useLightweightChart from '../hooks/useLightweightChart';
import type { CandlestickData } from 'lightweight-charts';

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
  const [ticker, setTicker] = useState<TickerData | null>(null);
  const [orderBook, setOrderBook] = useState<OrderBookData | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState('BTCUSDT');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState<string | null>(null); // Track which symbol has history loaded
  
  // WebSocket connection state
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  
  const wsClientRef = useRef<EnhancedWSClient | null>(null);
  const selectedSymbolRef = useRef<string>(selectedSymbol);

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
  const { chartContainerRef, setHistoricalData, updateCandlestick, fitContent } = useLightweightChart();
  
  // Binance WebSocket client for real-time kline data
  const binanceWSClientRef = useRef<BinanceWSClient | null>(null);

  // Load historical data for chart - using Binance API directly
  const loadHistoricalData = useCallback(async (symbol: string) => {
    try {
      setIsLoading(true);
      console.log(`[MarketPanel] Loading historical data for ${symbol} from Binance API`);
      
      const candlestickData = await fetchLightweightChartsKlines(symbol, '1m', 100);
      
      if (candlestickData && candlestickData.length > 0) {
        console.log(`[MarketPanel] Got ${candlestickData.length} historical data points`);
        console.log(`[MarketPanel] Price range: ${Math.min(...candlestickData.map(c => c.low))} - ${Math.max(...candlestickData.map(c => c.high))}`);
        
        // Set historical data using lightweight-charts (cast time to any for compatibility)
        const chartData: CandlestickData[] = candlestickData.map(d => ({
          ...d,
          time: d.time as any
        }));
        setHistoricalData(chartData);
        fitContent(); // Fit chart to content
        setHistoryLoaded(symbol); // Mark history as loaded for this symbol
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
      
      const [tickerData, orderBookData] = await Promise.all([
        getCurrentTicker(symbol),
        getOrderBook(symbol)
      ]);
      
      if (tickerData) {
        setTicker({
          symbol: tickerData.symbol,
          price: tickerData.price,
          change: tickerData.change || '0',
          changePercent: tickerData.changePercent || '0%'
        });
      }
      
      if (orderBookData) {
        setOrderBook({
          symbol: symbol,
          bids: orderBookData.bids,
          asks: orderBookData.asks
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

  // Load historical data when component mounts or symbol changes
  useEffect(() => {
    if (historyLoaded !== selectedSymbol) {
      console.log(`[MarketPanel] Loading historical data for ${selectedSymbol}`);
      loadHistoricalData(selectedSymbol);
    }
  }, [selectedSymbol, historyLoaded, loadHistoricalData]);

  // Setup Binance WebSocket for real-time kline data
  useEffect(() => {
    let mounted = true;
    
    console.log(`[MarketPanel] Setting up Binance WebSocket for ${selectedSymbol} klines`);
    
    // Create new Binance WebSocket client for kline data
    const binanceClient = new BinanceWSClient(selectedSymbol, '1m');
    binanceWSClientRef.current = binanceClient;
    
    binanceClient.addListener((data: BinanceKlineData) => {
      if (!mounted) return;
      
      console.log(`[MarketPanel] Received kline data for ${data.s}:`, {
        time: new Date(data.k.t).toISOString(),
        open: data.k.o,
        high: data.k.h,
        low: data.k.l,
        close: data.k.c,
        isClosed: data.k.x
      });
      
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
      console.log(`[MarketPanel] Cleaning up Binance WebSocket for ${selectedSymbol}`);
      if (binanceWSClientRef.current) {
        binanceWSClientRef.current.destroy();
        binanceWSClientRef.current = null;
      }
    };
  }, [selectedSymbol]);

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
      const wsClient = new EnhancedWSClient('ws://localhost:8000/ws/market', {
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
        console.log('[MarketPanel] Received WebSocket message:', msg); // Debug log
        switch (msg.type) {
          case 'ticker':
            // Filter: only process ticker for currently selected symbol
            if (msg.symbol === currentSelectedSymbol) {
              console.log('[MarketPanel] Processing ticker update:', msg);
              setTicker({
                symbol: msg.symbol as string,
                price: msg.price as string,
                change: msg.change as string,
                changePercent: msg.changePercent as string
              });
            } else {
              console.log(`[MarketPanel] Filtered out ticker for ${msg.symbol} (selected: ${currentSelectedSymbol})`);
            }
            break;
          case 'orderbook':
            // Filter: only process orderbook for currently selected symbol
            if (msg.symbol === currentSelectedSymbol) {
              setOrderBook({
                symbol: msg.symbol as string,
                bids: msg.bids as [string, string][],
                asks: msg.asks as [string, string][]
              });
            } else {
              console.log(`[MarketPanel] Filtered out orderbook for ${msg.symbol} (selected: ${currentSelectedSymbol})`);
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

  const handleRetryConnection = () => {
    if (wsClientRef.current) {
      wsClientRef.current.reconnect();
    }
  };

  const connectionDisplay = getConnectionStateDisplay(connectionState);

  return (
    <div className="market-panel">
      <h2>Panel Rynkowy</h2>
      
      {/* Connection Status */}
      <div className="connection-status" style={{ 
        padding: '10px', 
        borderRadius: '5px', 
        backgroundColor: '#f8f9fa',
        marginBottom: '20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '16px' }}>{connectionDisplay.icon}</span>
          <span style={{ color: connectionDisplay.color, fontWeight: 'bold' }}>
            {connectionDisplay.text}
          </span>
          {connectionError && (
            <span style={{ color: '#EF4444', fontSize: '14px' }}>
              ({connectionError})
            </span>
          )}
        </div>
        
        {(connectionState === ConnectionState.ERROR || connectionState === ConnectionState.DISCONNECTED) && (
          <button 
            onClick={handleRetryConnection}
            style={{
              padding: '5px 10px',
              backgroundColor: '#3B82F6',
              color: 'white',
              border: 'none',
              borderRadius: '3px',
              cursor: 'pointer'
            }}
          >
            Ponów połączenie
          </button>
        )}
      </div>
      
      {/* Symbol Selection */}
      <div className="symbol-selection" style={{ marginBottom: '20px' }}>
        <label htmlFor="symbol-select">Symbol: </label>
        <select 
          id="symbol-select"
          value={selectedSymbol} 
          onChange={(e) => handleSymbolChange(e.target.value)}
          style={{ padding: '5px', marginLeft: '10px' }}
        >
          <option value="BTCUSDT">BTC/USDT</option>
          <option value="ETHUSDT">ETH/USDT</option>
          <option value="ADAUSDT">ADA/USDT</option>
          <option value="DOTUSDT">DOT/USDT</option>
          <option value="LINKUSDT">LINK/USDT</option>
        </select>
      </div>
      
      {/* Error Display */}
      {error && (
        <div style={{ 
          color: '#EF4444', 
          backgroundColor: '#FEF2F2', 
          padding: '10px', 
          borderRadius: '5px',
          marginBottom: '20px' 
        }}>
          {error}
        </div>
      )}
      
      {/* Loading Indicator */}
      {isLoading && (
        <div style={{ 
          padding: '20px', 
          textAlign: 'center',
          color: '#ffffff',
          backgroundColor: 'rgba(255, 255, 255, 0.05)',
          borderRadius: '8px'
        }}>
          Ładowanie danych...
        </div>
      )}
      
      {/* Ticker Display */}
      {ticker && (
        <div className="ticker-section" style={{ 
          marginBottom: '20px',
          backgroundColor: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '8px',
          padding: '16px'
        }}>
          <h3 style={{ color: '#ffffff', marginBottom: '12px' }}>Aktualna Cena</h3>
          <div style={{ 
            fontSize: '24px', 
            fontWeight: 'bold',
            color: '#10B981' 
          }}>
            {ticker.symbol}: ${parseFloat(ticker.price).toFixed(2)}
          </div>
          {ticker.change && (
            <div style={{ 
              fontSize: '14px',
              color: parseFloat(ticker.change) >= 0 ? '#10B981' : '#EF4444'
            }}>
              {parseFloat(ticker.change) >= 0 ? '+' : ''}{ticker.change} ({ticker.changePercent})
            </div>
          )}
        </div>
      )}
      
      {/* Price Chart */}
      <div className="chart-section" style={{ 
        marginBottom: '20px',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '8px',
        padding: '16px'
      }}>
        <h3 style={{ color: '#ffffff', marginBottom: '16px' }}>Wykres Cen</h3>
        <div ref={chartContainerRef} style={{ width: '100%', height: '400px' }} />
      </div>
      
      {/* Order Book */}
      {orderBook && (
        <div className="orderbook-section" style={{ 
          backgroundColor: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '8px',
          padding: '16px'
        }}>
          <h3 style={{ color: '#ffffff', marginBottom: '16px' }}>Księga Zleceń - {orderBook.symbol}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <div>
              <h4 style={{ color: '#EF4444' }}>Asks (Sprzedaż)</h4>
              <div style={{ fontSize: '12px', color: '#ffffff' }}>
                {orderBook.asks.slice(0, 10).map((ask, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                    <span style={{ color: '#EF4444', fontWeight: 'bold' }}>{parseFloat(ask[0]).toFixed(2)}</span>
                    <span style={{ color: '#ffffff' }}>{parseFloat(ask[1]).toFixed(6)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h4 style={{ color: '#10B981' }}>Bids (Kupno)</h4>
              <div style={{ fontSize: '12px', color: '#ffffff' }}>
                {orderBook.bids.slice(0, 10).map((bid, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                    <span style={{ color: '#10B981', fontWeight: 'bold' }}>{parseFloat(bid[0]).toFixed(2)}</span>
                    <span style={{ color: '#ffffff' }}>{parseFloat(bid[1]).toFixed(6)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MarketPanel;