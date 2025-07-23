import React, { useState, useEffect, useRef } from 'react';
import { Chart } from 'chart.js/auto';
import type { ChartConfiguration } from 'chart.js';
import EnhancedWSClient, { ConnectionState, getConnectionStateDisplay } from '../services/wsClient.enhanced';
import { getCurrentTicker, getOrderBook, getKlines } from '../services/restClient';

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
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstanceRef = useRef<Chart | null>(null);
  const retryTimeoutRef = useRef<number | null>(null);

  // Initialize chart
  useEffect(() => {
    if (chartRef.current && !chartInstanceRef.current) {
      const ctx = chartRef.current.getContext('2d');
      if (ctx) {
        const config: ChartConfiguration = {
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
                  unit: 'minute'
                }
              },
              y: {
                beginAtZero: false
              }
            }
          }
        };
        
        chartInstanceRef.current = new Chart(ctx, config);
      }
    }
    
    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
        chartInstanceRef.current = null;
      }
    };
  }, [selectedSymbol]);

  // Load historical data for chart
  const loadHistoricalData = async (symbol: string) => {
    try {
      setIsLoading(true);
      const klines = await getKlines(symbol, '1m', 100);
      
      if (chartInstanceRef.current && klines) {
        const labels = klines.map(k => new Date(k[0]));
        const prices = klines.map(k => parseFloat(k[4])); // Close price
        
        chartInstanceRef.current.data.labels = labels;
        chartInstanceRef.current.data.datasets[0].data = prices;
        chartInstanceRef.current.data.datasets[0].label = `${symbol} Price`;
        chartInstanceRef.current.update();
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
        setTicker(tickerData);
      }
      
      if (orderBookData) {
        setOrderBook(orderBookData);
      }
      
      await loadHistoricalData(symbol);
    } catch (err) {
      console.error('Failed to load initial data:', err);
      setError('Nie udało się załadować danych początkowych');
    } finally {
      setIsLoading(false);
    }
  };

  // Setup WebSocket connection
  useEffect(() => {
    let mounted = true;
    
    const setupWebSocket = () => {
      if (wsClientRef.current) {
        wsClientRef.current.destroy();
      }
      
      const wsClient = new EnhancedWSClient('ws://localhost:8000/ws/market', {
        reconnectInterval: 2000,
        maxReconnectInterval: 30000,
        maxReconnectAttempts: 10,
        heartbeatInterval: 30000,
        debug: true
      });
      
      wsClientRef.current = wsClient;
      
      // Connection state listener
      wsClient.addStateListener((state, error) => {
        if (!mounted) return;
        
        setConnectionState(state);
        setConnectionError(error || null);
        
        if (state === ConnectionState.CONNECTED) {
          // Subscribe to symbol when connected
          wsClient.send({ 
            type: 'subscribe', 
            symbol: selectedSymbol 
          });
        }
      });
      
      // Message listener
      wsClient.addListener((msg) => {
        if (!mounted) return;
        
        switch (msg.type) {
          case 'ticker':
            if (msg.symbol === selectedSymbol) {
              setTicker(prevTicker => ({
                symbol: msg.symbol,
                price: msg.price,
                change: prevTicker?.change || '0',
                changePercent: prevTicker?.changePercent || '0%'
              }));
              
              // Update chart with real-time price
              if (chartInstanceRef.current) {
                const now = new Date();
                const chart = chartInstanceRef.current;
                
                chart.data.labels?.push(now);
                chart.data.datasets[0].data.push(parseFloat(msg.price));
                
                // Keep only last 100 points
                if (chart.data.labels && chart.data.labels.length > 100) {
                  chart.data.labels.shift();
                  chart.data.datasets[0].data.shift();
                }
                
                chart.update('none');
              }
            }
            break;
            
          case 'orderbook':
            if (msg.symbol === selectedSymbol) {
              setOrderBook({
                symbol: msg.symbol,
                bids: msg.bids,
                asks: msg.asks
              });
            }
            break;
        }
      });
    };
    
    setupWebSocket();
    loadInitialData(selectedSymbol);
    
    return () => {
      mounted = false;
      if (wsClientRef.current) {
        wsClientRef.current.destroy();
        wsClientRef.current = null;
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, [selectedSymbol]);

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