import React, { useState, useEffect, useRef } from 'react';
import EnhancedWSClient, { ConnectionState, getConnectionStateDisplay } from '../services/wsClient.enhanced';

interface BotStatus {
  running: boolean;
  symbol?: string;
  strategy?: string;
  balance?: number;
  position?: any;
  last_action?: string;
  timestamp?: string;
}

interface LogEntry {
  id: number;
  message: string;
  timestamp: string;
  level?: 'INFO' | 'WARNING' | 'ERROR' | 'DEBUG';
}

const BotPanel: React.FC = () => {
  const [botStatus, setBotStatus] = useState<BotStatus>({ running: false });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // WebSocket connection state
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  
  const wsClientRef = useRef<EnhancedWSClient | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const logIdCounterRef = useRef(1);

  // Auto scroll to bottom of logs
  const scrollToBottom = () => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [logs]);

  // Setup WebSocket connection
  useEffect(() => {
    let mounted = true;
    
    const setupWebSocket = () => {
      if (wsClientRef.current) {
        wsClientRef.current.destroy();
      }
      
      const wsClient = new EnhancedWSClient('ws://localhost:8000/ws/bot', {
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
          // Request current bot status when connected
          wsClient.send({ type: 'get_status' });
        }
      });
      
      // Message listener
      wsClient.addListener((msg) => {
        if (!mounted) return;
        
        console.log('[BotPanel] Received message:', msg);
        
        switch (msg.type) {
          case 'bot_status':
            setBotStatus({
              running: msg.running || false,
              symbol: msg.status?.symbol,
              strategy: msg.status?.strategy,
              balance: msg.status?.balance,
              position: msg.status?.position,
              last_action: msg.status?.last_action,
              timestamp: msg.status?.timestamp
            });
            
            // Reset loading states when status changes
            if (msg.running !== undefined) {
              setIsStarting(false);
              setIsStopping(false);
            }
            break;
            
          case 'log':
            const newLog: LogEntry = {
              id: logIdCounterRef.current++,
              message: msg.message || 'Empty log message',
              timestamp: new Date().toLocaleTimeString(),
              level: extractLogLevel(msg.message || '')
            };
            
            setLogs(prevLogs => {
              const updatedLogs = [...prevLogs, newLog];
              // Keep only last 1000 logs to prevent memory issues
              return updatedLogs.slice(-1000);
            });
            break;
            
          case 'error':
            setError(msg.message || 'Unknown error occurred');
            setIsStarting(false);
            setIsStopping(false);
            break;
        }
      });
    };
    
    setupWebSocket();
    
    return () => {
      mounted = false;
      if (wsClientRef.current) {
        wsClientRef.current.destroy();
        wsClientRef.current = null;
      }
    };
  }, []);

  // Extract log level from message
  const extractLogLevel = (message: string): LogEntry['level'] => {
    const upperMessage = message.toUpperCase();
    if (upperMessage.includes('ERROR')) return 'ERROR';
    if (upperMessage.includes('WARNING') || upperMessage.includes('WARN')) return 'WARNING';
    if (upperMessage.includes('DEBUG')) return 'DEBUG';
    return 'INFO';
  };

  // Get log level color
  const getLogLevelColor = (level?: LogEntry['level']): string => {
    switch (level) {
      case 'ERROR': return '#EF4444';
      case 'WARNING': return '#F59E0B';
      case 'DEBUG': return '#6B7280';
      default: return '#374151';
    }
  };

  const handleStartBot = async () => {
    if (!wsClientRef.current?.isConnected()) {
      setError('WebSocket nie jest połączony');
      return;
    }
    
    setIsStarting(true);
    setError(null);
    
    try {
      const success = wsClientRef.current.send({
        type: 'start_bot',
        symbol: 'BTCUSDT',
        strategy: 'simple_momentum'
      });
      
      if (!success) {
        throw new Error('Nie udało się wysłać komendy start');
      }
      
      // Add local log entry
      const startLog: LogEntry = {
        id: logIdCounterRef.current++,
        message: 'Wysłano komendę uruchomienia bota...',
        timestamp: new Date().toLocaleTimeString(),
        level: 'INFO'
      };
      setLogs(prev => [...prev, startLog]);
      
    } catch (err) {
      console.error('Failed to start bot:', err);
      setError(err instanceof Error ? err.message : 'Nie udało się uruchomić bota');
      setIsStarting(false);
    }
  };

  const handleStopBot = async () => {
    if (!wsClientRef.current?.isConnected()) {
      setError('WebSocket nie jest połączony');
      return;
    }
    
    setIsStopping(true);
    setError(null);
    
    try {
      const success = wsClientRef.current.send({ type: 'stop_bot' });
      
      if (!success) {
        throw new Error('Nie udało się wysłać komendy stop');
      }
      
      // Add local log entry
      const stopLog: LogEntry = {
        id: logIdCounterRef.current++,
        message: 'Wysłano komendę zatrzymania bota...',
        timestamp: new Date().toLocaleTimeString(),
        level: 'INFO'
      };
      setLogs(prev => [...prev, stopLog]);
      
    } catch (err) {
      console.error('Failed to stop bot:', err);
      setError(err instanceof Error ? err.message : 'Nie udało się zatrzymać bota');
      setIsStopping(false);
    }
  };

  const handleClearLogs = () => {
    setLogs([]);
    setError(null);
  };

  const handleRetryConnection = () => {
    if (wsClientRef.current) {
      wsClientRef.current.reconnect();
    }
  };

  const connectionDisplay = getConnectionStateDisplay(connectionState);

  return (
    <div className="bot-panel">
      <h2>Panel Bota Tradingowego</h2>
      
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
      
      {/* Error Display */}
      {error && (
        <div style={{ 
          color: '#EF4444', 
          backgroundColor: '#FEF2F2', 
          padding: '10px', 
          borderRadius: '5px',
          marginBottom: '20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span>{error}</span>
          <button 
            onClick={() => setError(null)}
            style={{ 
              background: 'none', 
              border: 'none', 
              color: '#EF4444', 
              cursor: 'pointer',
              fontSize: '16px'
            }}
          >
            ×
          </button>
        </div>
      )}
      
      {/* Bot Status */}
      <div className="bot-status" style={{ 
        padding: '15px', 
        backgroundColor: '#f8f9fa', 
        borderRadius: '8px',
        marginBottom: '20px'
      }}>
        <h3>Status Bota</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '10px', alignItems: 'center' }}>
          <strong>Status:</strong>
          <span style={{ 
            color: botStatus.running ? '#10B981' : '#6B7280',
            fontWeight: 'bold'
          }}>
            {botStatus.running ? '🟢 Uruchomiony' : '⚫ Zatrzymany'}
          </span>
          
          {botStatus.symbol && (
            <>
              <strong>Symbol:</strong>
              <span>{botStatus.symbol}</span>
            </>
          )}
          
          {botStatus.strategy && (
            <>
              <strong>Strategia:</strong>
              <span>{botStatus.strategy}</span>
            </>
          )}
          
          {botStatus.balance !== undefined && (
            <>
              <strong>Saldo:</strong>
              <span>${botStatus.balance.toFixed(2)}</span>
            </>
          )}
          
          {botStatus.last_action && (
            <>
              <strong>Ostatnia akcja:</strong>
              <span>{botStatus.last_action}</span>
            </>
          )}
          
          {botStatus.timestamp && (
            <>
              <strong>Ostatnia aktualizacja:</strong>
              <span>{new Date(botStatus.timestamp).toLocaleString()}</span>
            </>
          )}
        </div>
      </div>
      
      {/* Bot Controls */}
      <div className="bot-controls" style={{ 
        marginBottom: '20px',
        display: 'flex',
        gap: '10px',
        alignItems: 'center'
      }}>
        <button
          onClick={handleStartBot}
          disabled={botStatus.running || isStarting || !wsClientRef.current?.isConnected()}
          style={{
            padding: '10px 20px',
            backgroundColor: botStatus.running || isStarting ? '#9CA3AF' : '#10B981',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: (botStatus.running || isStarting || !wsClientRef.current?.isConnected()) ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '5px'
          }}
        >
          {isStarting ? '⏳' : '▶️'} 
          {isStarting ? 'Uruchamianie...' : 'Uruchom Bota'}
        </button>
        
        <button
          onClick={handleStopBot}
          disabled={!botStatus.running || isStopping || !wsClientRef.current?.isConnected()}
          style={{
            padding: '10px 20px',
            backgroundColor: (!botStatus.running || isStopping) ? '#9CA3AF' : '#EF4444',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: (!botStatus.running || isStopping || !wsClientRef.current?.isConnected()) ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '5px'
          }}
        >
          {isStopping ? '⏳' : '⏹️'} 
          {isStopping ? 'Zatrzymywanie...' : 'Zatrzymaj Bota'}
        </button>
        
        <button
          onClick={handleClearLogs}
          style={{
            padding: '10px 20px',
            backgroundColor: '#6B7280',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer'
          }}
        >
          🗑️ Wyczyść Logi
        </button>
      </div>
      
      {/* Live Logs */}
      <div className="bot-logs">
        <h3>Logi na żywo ({logs.length})</h3>
        <div style={{ 
          height: '400px', 
          overflow: 'auto', 
          backgroundColor: '#000', 
          color: '#fff', 
          padding: '10px',
          borderRadius: '5px',
          fontFamily: 'monospace',
          fontSize: '12px',
          border: '1px solid #374151'
        }}>
          {logs.length === 0 ? (
            <div style={{ color: '#6B7280', fontStyle: 'italic' }}>
              Brak logów. Uruchom bota aby zobaczyć aktywność.
            </div>
          ) : (
            logs.map((log) => (
              <div key={log.id} style={{ 
                marginBottom: '4px',
                display: 'flex',
                gap: '8px'
              }}>
                <span style={{ color: '#6B7280', minWidth: '80px' }}>
                  [{log.timestamp}]
                </span>
                <span style={{ 
                  color: getLogLevelColor(log.level),
                  minWidth: '60px',
                  fontWeight: 'bold'
                }}>
                  {log.level}:
                </span>
                <span style={{ wordBreak: 'break-word' }}>
                  {log.message}
                </span>
              </div>
            ))
          )}
          <div ref={logsEndRef} />
        </div>
      </div>
    </div>
  );
};

export default BotPanel;