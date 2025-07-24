import React, { useState, useEffect, useRef, useMemo } from 'react';
import 'chartjs-adapter-date-fns';
import type { ChartConfiguration } from 'chart.js';
import EnhancedWSClient, { ConnectionState, getConnectionStateDisplay } from '../services/wsClient';
import { getCurrentTicker, getOrderBook, getKlines } from '../services/restClient';
import useChart from '../hooks/useChart';

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
  
  // WebSocket connection state
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  
  const wsClientRef = useRef<EnhancedWSClient | null>(null);

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

  // Chart configuration - zmemoizowane aby zapobiec re-renderom
  const chartConfig: ChartConfiguration = useMemo(() => ({
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: `${selectedSymbol} Price`,
        data: [],
        borderColor: '#10B981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        tension: 0.1,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'top'
        }
      },
      scales: {
        x: {
          type: 'time',
          time: {
            unit: 'minute',
            displayFormats: {
              minute: 'HH:mm'
            }
          }
        },
        y: {
          beginAtZero: false
        }
      }
    }
  }), [selectedSymbol]);

  // Use custom chart hook
  const { chartRef, chartInstance, addDataPoint, updateChart } = useChart(
    chartConfig, 
    [selectedSymbol]
  );

  // Load historical data for chart
  const loadHistoricalData = async (symbol: string) => {
    try {
      setIsLoading(true);
      console.log(`[MarketPanel] Loading historical data for ${symbol}`);
      const klines = await getKlines(symbol, '1m', 100);
      
      if (klines && klines.length > 0) {
        console.log(`[MarketPanel] Got ${klines.length} historical data points`);
        const labels = klines.map(k => new Date(k[0]));
        const prices = klines.map(k => parseFloat(k[4])); // Close price
        console.log(`[MarketPanel] Price range: ${Math.min(...prices)} - ${Math.max(...prices)}`);
        
        if (chartInstance) {
          console.log(`[MarketPanel] Chart instance available, updating chart`);
          // Update chart using the hook's method
          updateChart({
            labels,
            datasets: [{
              label: `${symbol} Price`,
              data: prices,
              borderColor: '#10B981',
              backgroundColor: 'rgba(16, 185, 129, 0.1)',
              tension: 0.1,
              fill: true
            }]
          });
        } else {
          console.warn(`[MarketPanel] Chart instance not available yet, data will be loaded later`);
        }
      } else {
        console.warn(`[MarketPanel] No historical data received`);
      }
    } catch (err) {
      console.error('Failed to load historical data:', err);
      setError('Nie udało się załadować danych historycznych');
    } finally {
      setIsLoading(false);
    }
  };

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
      
      await loadHistoricalData(symbol);
    } catch (err) {
      console.error('Failed to load initial data:', err);
      setError('Nie udało się załadować danych początkowych');
    } finally {
      setIsLoading(false);
    }
  };

  // Załaduj dane historyczne gdy chart będzie gotowy
  useEffect(() => {
    if (chartInstance) {
      console.log(`[MarketPanel] Chart instance ready, loading historical data for ${selectedSymbol}`);
      loadHistoricalData(selectedSymbol);
    }
  }, [chartInstance, selectedSymbol]);

  // Setup WebSocket connection
  useEffect(() => {
    let mounted = true;
    let wsClientLocal: EnhancedWSClient | null = null;

    const setupWebSocket = () => {
      // Cleanup poprzedniego połączenia
      if (wsClientRef.current) {
        wsClientRef.current.destroy();
        wsClientRef.current = null;
      }

      if (!mounted) return;

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
        setConnectionState(state);
        setConnectionError(error || null);
        if (state === ConnectionState.CONNECTED) {
          wsClient.send({ type: 'subscribe', symbol: selectedSymbol });
        }
      });

      wsClient.addListener((msg) => {
        if (!mounted) return;
        switch (msg.type) {
          case 'ticker':
            if (msg.symbol === selectedSymbol) {
              console.log(`[MarketPanel] Received ticker for ${msg.symbol}: ${msg.price}`);
              setTicker(prevTicker => ({
                symbol: msg.symbol as string,
                price: msg.price as string,
                change: prevTicker?.change || '0',
                changePercent: prevTicker?.changePercent || '0%'
              }));
              if (chartInstance) {
                const now = new Date();
                const priceValue = parseFloat(msg.price as string);
                console.log(`[MarketPanel] Adding data point to chart: ${priceValue} at ${now.toISOString()}`);
                addDataPoint(now, 0, priceValue, 100);
              } else {
                console.warn(`[MarketPanel] Chart instance not available for adding data point`);
              }
            }
            break;
          case 'orderbook':
            if (msg.symbol === selectedSymbol) {
              setOrderBook({
                symbol: msg.symbol as string,
                bids: msg.bids as [string, string][],
                asks: msg.asks as [string, string][]
              });
            }
            break;
        }
      });
    };

    // Opóźnienie setupWebSocket, aby zapobiec podwójnym połączeniom w Strict Mode
    const timeoutId = setTimeout(() => {
      setupWebSocket();
      loadInitialData(selectedSymbol);
    }, 100);

    return () => {
      mounted = false;
      clearTimeout(timeoutId);
      if (wsClientLocal) {
        wsClientLocal.destroy();
        wsClientLocal = null;
      }
      if (wsClientRef.current) {
        wsClientRef.current.destroy();
        wsClientRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSymbol, chartInstance, addDataPoint]);

  const handleSymbolChange = (newSymbol: string) => {
    setSelectedSymbol(newSymbol);
    setTicker(null);
    setOrderBook(null);
    setError(null);
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
          color: '#6B7280' 
        }}>
          Ładowanie danych...
        </div>
      )}
      
      {/* Ticker Display */}
      {ticker && (
        <div className="ticker-section" style={{ marginBottom: '20px' }}>
          <h3>Aktualna Cena</h3>
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
      <div className="chart-section" style={{ marginBottom: '20px' }}>
        <h3>Wykres Cen</h3>
        <div style={{ height: '300px', position: 'relative' }}>
          <canvas ref={chartRef}></canvas>
        </div>
      </div>
      
      {/* Order Book */}
      {orderBook && (
        <div className="orderbook-section">
          <h3>Księga Zleceń - {orderBook.symbol}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <div>
              <h4 style={{ color: '#EF4444' }}>Asks (Sprzedaż)</h4>
              <div style={{ fontSize: '12px' }}>
                {orderBook.asks.slice(0, 10).map((ask, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{parseFloat(ask[0]).toFixed(2)}</span>
                    <span>{parseFloat(ask[1]).toFixed(6)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h4 style={{ color: '#10B981' }}>Bids (Kupno)</h4>
              <div style={{ fontSize: '12px' }}>
                {orderBook.bids.slice(0, 10).map((bid, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{parseFloat(bid[0]).toFixed(2)}</span>
                    <span>{parseFloat(bid[1]).toFixed(6)}</span>
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