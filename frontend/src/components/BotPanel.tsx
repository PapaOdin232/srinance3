import React, { useState, useEffect, useRef } from 'react';
import {
  Paper,
  Stack,
  Group,
  Text,
  Title,
  Badge,
  Button,
  Alert,
  Loader,
  Grid,
  Box,
} from '@mantine/core';
import {
  IconPlayerPlay,
  IconPlayerStop,
  IconTrash,
  IconRefresh,
  IconAlertCircle,
  IconRobot,
  IconTrendingUp,
  IconCurrencyDollar,
  IconClock,
} from '@tabler/icons-react';
import EnhancedWSClient, { ConnectionState, getConnectionStateDisplay } from '../services/wsClient';

interface BotStatus {
  running: boolean;
  symbol?: string;
  strategy?: string;
  balance?: number;
  position?: unknown;  // Changed from any to unknown for safety
  last_action?: string;
  timestamp?: string;
}

interface LogEntry {
  id: number;
  message: string;
  timestamp: string;
  level?: 'INFO' | 'WARNING' | 'ERROR' | 'DEBUG';
}

// WebSocket message type definitions
interface BaseBotMessage {
  type: string;
}

interface BotStatusMessage extends BaseBotMessage {
  type: 'bot_status';
  running: boolean;
  status?: {
    symbol?: string;
    strategy?: string;
    balance?: number;
    position?: unknown;
    last_action?: string;
    timestamp?: string;
  };
}

interface BotLogMessage extends BaseBotMessage {
  type: 'log';
  message: string;
}

interface BotErrorMessage extends BaseBotMessage {
  type: 'error';
  message: string;
}

type BotMessage = BotStatusMessage | BotLogMessage | BotErrorMessage;

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
        
        const message = msg as BotMessage;
        
        switch (message.type) {
          case 'bot_status': {
            const statusMsg = message as BotStatusMessage;
            setBotStatus({
              running: statusMsg.running,
              symbol: statusMsg.status?.symbol,
              strategy: statusMsg.status?.strategy,
              balance: statusMsg.status?.balance,
              position: statusMsg.status?.position,
              last_action: statusMsg.status?.last_action,
              timestamp: statusMsg.status?.timestamp
            });
            
            // Reset loading states when status changes
            if (statusMsg.running !== undefined) {
              setIsStarting(false);
              setIsStopping(false);
            }
            break;
          }
            
          case 'log': {
            const logMsg = message as BotLogMessage;
            const newLog: LogEntry = {
              id: logIdCounterRef.current++,
              message: logMsg.message || 'Empty log message',
              timestamp: new Date().toLocaleTimeString(),
              level: extractLogLevel(logMsg.message || '')
            };
            
            setLogs(prevLogs => {
              const updatedLogs = [...prevLogs, newLog];
              // Keep only last 1000 logs to prevent memory issues
              return updatedLogs.slice(-1000);
            });
            break;
          }
            
          case 'error': {
            const errorMsg = message as BotErrorMessage;
            setError(errorMsg.message || 'Unknown error occurred');
            setIsStarting(false);
            setIsStopping(false);
            break;
          }
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

  // Format balance similar to PriceDisplay
  const formatBalance = (balance: number): string => {
    return balance.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  return (
    <Stack gap="md" p="md">
      <Title order={2}>Panel Bota Tradingowego</Title>
      
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
      
      {/* Bot Status */}
      <Paper p="md" withBorder>
        <Stack gap="sm">
          <Group justify="space-between" align="center">
            <Group gap="xs">
              <IconRobot size={20} />
              <Title order={3}>Status Bota</Title>
            </Group>
            <Badge 
              color={botStatus.running ? 'teal' : 'gray'}
              variant="filled"
              size="lg"
              leftSection={botStatus.running ? <IconTrendingUp size={14} /> : null}
            >
              {botStatus.running ? 'Uruchomiony' : 'Zatrzymany'}
            </Badge>
          </Group>
          
          <Grid>
            {botStatus.symbol && (
              <Grid.Col span={6}>
                <Stack gap={2}>
                  <Text size="sm" c="dimmed" fw={500}>Symbol</Text>
                  <Text fw={600}>{botStatus.symbol}</Text>
                </Stack>
              </Grid.Col>
            )}
            
            {botStatus.strategy && (
              <Grid.Col span={6}>
                <Stack gap={2}>
                  <Text size="sm" c="dimmed" fw={500}>Strategia</Text>
                  <Text fw={600}>{botStatus.strategy}</Text>
                </Stack>
              </Grid.Col>
            )}
            
            {botStatus.balance !== undefined && (
              <Grid.Col span={6}>
                <Stack gap={2}>
                  <Text size="sm" c="dimmed" fw={500}>Saldo</Text>
                  <Group gap="xs">
                    <IconCurrencyDollar size={16} color="var(--mantine-color-teal-6)" />
                    <Text fw={700} ff="monospace" size="lg">
                      ${formatBalance(botStatus.balance)}
                    </Text>
                  </Group>
                </Stack>
              </Grid.Col>
            )}
            
            {botStatus.last_action && (
              <Grid.Col span={6}>
                <Stack gap={2}>
                  <Text size="sm" c="dimmed" fw={500}>Ostatnia akcja</Text>
                  <Text fw={600}>{botStatus.last_action}</Text>
                </Stack>
              </Grid.Col>
            )}
            
            {botStatus.timestamp && (
              <Grid.Col span={12}>
                <Stack gap={2}>
                  <Text size="sm" c="dimmed" fw={500}>Ostatnia aktualizacja</Text>
                  <Group gap="xs">
                    <IconClock size={14} />
                    <Text size="sm">{new Date(botStatus.timestamp).toLocaleString()}</Text>
                  </Group>
                </Stack>
              </Grid.Col>
            )}
          </Grid>
        </Stack>
      </Paper>
      
      {/* Bot Controls */}
      <Paper p="md" withBorder>
        <Stack gap="sm">
          <Title order={4}>Kontrola Bota</Title>
          <Group gap="sm">
            <Button
              leftSection={isStarting ? <Loader size={16} /> : <IconPlayerPlay size={16} />}
              onClick={() => void handleStartBot()}
              disabled={botStatus.running || isStarting || !wsClientRef.current?.isConnected()}
              color="teal"
              variant={botStatus.running || isStarting ? "light" : "filled"}
              size="md"
            >
              {isStarting ? 'Uruchamianie...' : 'Uruchom Bota'}
            </Button>
            
            <Button
              leftSection={isStopping ? <Loader size={16} /> : <IconPlayerStop size={16} />}
              onClick={() => void handleStopBot()}
              disabled={!botStatus.running || isStopping || !wsClientRef.current?.isConnected()}
              color="red"
              variant={(!botStatus.running || isStopping) ? "light" : "filled"}
              size="md"
            >
              {isStopping ? 'Zatrzymywanie...' : 'Zatrzymaj Bota'}
            </Button>
            
            <Button
              leftSection={<IconTrash size={16} />}
              onClick={handleClearLogs}
              color="gray"
              variant="outline"
              size="md"
            >
              Wyczyść Logi
            </Button>
          </Group>
        </Stack>
      </Paper>
      
      {/* Live Logs */}
      <Paper p="md" withBorder>
        <Stack gap="sm">
          <Group justify="space-between" align="center">
            <Title order={4}>Logi na żywo</Title>
            <Badge color="blue" variant="light" size="lg">
              {logs.length}
            </Badge>
          </Group>
          
          <Box
            style={{ 
              height: '400px', 
              overflow: 'auto', 
              backgroundColor: '#1a1b1e', 
              color: '#ffffff', 
              padding: '12px',
              borderRadius: '8px',
              fontFamily: 'var(--mantine-font-family-monospace)',
              fontSize: '13px',
              border: '1px solid var(--mantine-color-gray-3)',
            }}
          >
            {logs.length === 0 ? (
              <Text c="dimmed" fs="italic">
                Brak logów. Uruchom bota aby zobaczyć aktywność.
              </Text>
            ) : (
              logs.map((log) => (
                <Group key={log.id} gap="sm" align="flex-start" wrap="nowrap" mb="xs">
                  <Text c="dimmed" size="xs" style={{ minWidth: '80px', fontFamily: 'monospace' }}>
                    [{log.timestamp}]
                  </Text>
                  <Text 
                    size="xs"
                    fw={700}
                    c={getLogLevelColor(log.level)}
                    style={{ minWidth: '70px' }}
                  >
                    {log.level}:
                  </Text>
                  <Text size="xs" style={{ wordBreak: 'break-word', flex: 1 }}>
                    {log.message}
                  </Text>
                </Group>
              ))
            )}
            <div ref={logsEndRef} />
          </Box>
        </Stack>
      </Paper>
    </Stack>
  );
};

export default BotPanel;