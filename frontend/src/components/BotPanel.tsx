import React, { useState, useEffect, useRef } from 'react';
import { createDebugLogger } from '../utils/debugLogger';
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
  Tabs,
} from '@mantine/core';
import {
  IconPlayerPlay,
  IconPlayerStop,
  IconTrash,
  IconRefresh,
  IconAlertCircle,
  IconRobot,
  IconCurrencyDollar,
  IconClock,
  IconSettings,
  IconChartLine,
} from '@tabler/icons-react';
import EnhancedWSClient, { ConnectionState, getConnectionStateDisplay } from '../services/wsClient';
import BotConfigPanel from './BotConfigPanel';
import { secureApiCall, API_CONFIG } from '../config/api';

interface BotStatus {
  running: boolean;
  symbol?: string;
  strategy?: string;
  balance?: number;
  position?: unknown;
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
  // Debug logger
  const logger = createDebugLogger('BotPanel');
  
  const [botStatus, setBotStatus] = useState<BotStatus>({ running: false });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [botConfig, setBotConfig] = useState<any>(null);

  const wsClientRef = useRef<EnhancedWSClient | null>(null);
  const logIdCounterRef = useRef(1);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const logsContainerRef = useRef<HTMLDivElement>(null);

  const formatBalance = (balance: number): string => {
    return balance.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  const requestStatus = () => {
    if (wsClientRef.current?.isConnected()) {
      wsClientRef.current.send({ type: 'get_status' });
    }
  };

  const loadBotConfig = async () => {
    try {
      const response = await secureApiCall(API_CONFIG.ENDPOINTS.BOT_CONFIG);
      const data = await response.json();
      setBotConfig(data.config || null);
    } catch (error) {
      console.error('Failed to load bot config:', error);
    }
  };

  // Auto-scroll logs to bottom (only within logs container)
  useEffect(() => {
    if (logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [logs]);

  // Connection state change handler
  const handleConnectionStateChange = (state: ConnectionState, error?: string) => {
    setConnectionState(state);
    setConnectionError(error || null);
    
    if (state === ConnectionState.CONNECTED) {
      setError(null);
      requestStatus();
      loadBotConfig(); // Załaduj konfigurację po połączeniu
    }
  };

  // Retry connection
  const handleRetryConnection = () => {
    if (wsClientRef.current) {
      wsClientRef.current.reconnect();
    }
  };

  // Handle incoming WebSocket messages
  const handleMessage = (message: any) => {
    try {
      switch (message.type) {
        case 'bot_status':
          logger.log('Received bot_status:', message); // Debug
          
          // Sprawdź czy running jest na najwyższym poziomie lub w status
          const running = message.running !== undefined ? message.running : message.status?.running;
          const statusData = {
            running: running,
            ...message.status
          };
          
          setBotStatus(statusData);
          
          // Reset loading states based on bot status
          if (running !== undefined) {
            if (running) {
              setIsStarting(false);
            } else {
              setIsStopping(false);
            }
          }
          break;
          
        case 'bot_log':
        case 'log':
          const logEntry: LogEntry = {
            id: logIdCounterRef.current++,
            message: message.message,
            timestamp: message.timestamp || new Date().toLocaleTimeString(),
            level: (message.level as LogEntry['level']) || extractLogLevel(message.message)
          };
          setLogs(prev => [...prev, logEntry]);
          break;
          
        case 'bot_error':
        case 'error':
          const errorMessage = message.error || message.message;
          setError(errorMessage);
          const errorLog: LogEntry = {
            id: logIdCounterRef.current++,
            message: `ERROR: ${errorMessage}`,
            timestamp: new Date().toLocaleTimeString(),
            level: 'ERROR'
          };
          setLogs(prev => [...prev, errorLog]);
          break;
          
        case 'bot_started':
          setIsStarting(false);
          const startedLog: LogEntry = {
            id: logIdCounterRef.current++,
            message: message.message,
            timestamp: new Date().toLocaleTimeString(),
            level: 'INFO'
          };
          setLogs(prev => [...prev, startedLog]);
          break;
          
        case 'bot_stopped':
          setIsStopping(false);
          const stoppedLog: LogEntry = {
            id: logIdCounterRef.current++,
            message: message.message,
            timestamp: new Date().toLocaleTimeString(),
            level: 'INFO'
          };
          setLogs(prev => [...prev, stoppedLog]);
          break;
          
        default:
          logger.log('Unknown message type:', message);
      }
    } catch (err) {
      console.error('Error handling WebSocket message:', err);
      setError('Błąd podczas przetwarzania wiadomości WebSocket');
    }
  };

  // Initialize WebSocket connection
  useEffect(() => {
    wsClientRef.current = new EnhancedWSClient('ws://localhost:8001/ws/bot');
    wsClientRef.current.addListener(handleMessage);
    wsClientRef.current.addStateListener(handleConnectionStateChange);

    return () => {
      if (wsClientRef.current) {
        wsClientRef.current.destroy();
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

    try {
      setIsStarting(true);
      setError(null);
      
      // Załaduj aktualną konfigurację przed uruchomieniem
      let currentConfig = botConfig;
      try {
        const response = await secureApiCall('/bot/config');
        const data = await response.json();
        currentConfig = data.config || null;
        setBotConfig(currentConfig);
      } catch (configError) {
        console.error('Failed to load config, using cached version:', configError);
      }
      
      const startCommand = {
        type: 'start_bot',
        symbol: currentConfig?.symbol || 'BTCUSDT',
        strategy: currentConfig?.type || 'simple_momentum'
      };
      
      logger.log('Sending start command with config:', { currentConfig, startCommand });
      wsClientRef.current.send(startCommand);
      
      // Add local log entry
      const startLog: LogEntry = {
        id: logIdCounterRef.current++,
        message: `Wysłano komendę uruchomienia bota z strategią ${startCommand.strategy} dla ${startCommand.symbol}...`,
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

    try {
      setIsStopping(true);
      setError(null);
      
      wsClientRef.current.send({
        type: 'stop_bot'
      });
      
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

  const connectionDisplay = getConnectionStateDisplay(connectionState);

  return (
    <Stack gap="md" p="md">
      <Tabs defaultValue="monitoring">
        <Tabs.List>
          <Tabs.Tab value="monitoring" leftSection={<IconChartLine size={14} />}>
            Monitoring & Control
          </Tabs.Tab>
          <Tabs.Tab value="configuration" leftSection={<IconSettings size={14} />}>
            Strategy Configuration
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="monitoring">
          <Stack gap="md">
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
              <Group justify="space-between" mb="md">
                <Group gap="xs" align="center">
                  <IconRobot size={24} />
                  <Text size="lg" fw={600}>Status Bota</Text>
                </Group>
                
                <Badge 
                  color={botStatus.running ? 'green' : 'gray'} 
                  size="lg"
                  variant={botStatus.running ? 'filled' : 'light'}
                >
                  {botStatus.running ? 'URUCHOMIONY' : 'ZATRZYMANY'}
                </Badge>
              </Group>
              
              <Grid>
                {botStatus.symbol && (
                  <Grid.Col span={6}>
                    <Stack gap={2}>
                      <Text size="sm" c="dimmed" fw={500}>Para</Text>
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
                          {formatBalance(botStatus.balance)}
                        </Text>
                      </Group>
                    </Stack>
                  </Grid.Col>
                )}
                
                {botStatus.last_action && (
                  <Grid.Col span={6}>
                    <Stack gap={2}>
                      <Text size="sm" c="dimmed" fw={500}>Ostatnia akcja</Text>
                      <Group gap="xs">
                        <IconClock size={16} color="var(--mantine-color-blue-6)" />
                        <Text fw={600}>{botStatus.last_action}</Text>
                      </Group>
                    </Stack>
                  </Grid.Col>
                )}
              </Grid>
            </Paper>

            {/* Bot Controls */}
            <Paper p="md" withBorder>
              <Group gap="md" justify="space-between">
                <Group gap="sm">
                  <Button
                    leftSection={<IconPlayerPlay size={16} />}
                    onClick={handleStartBot}
                    loading={isStarting}
                    disabled={botStatus.running || connectionState !== ConnectionState.CONNECTED}
                    color="green"
                  >
                    Uruchom Bota
                  </Button>

                  <Button
                    leftSection={<IconPlayerStop size={16} />}
                    onClick={handleStopBot}
                    loading={isStopping}
                    disabled={!botStatus.running || connectionState !== ConnectionState.CONNECTED}
                    color="red"
                    variant="outline"
                  >
                    Zatrzymaj Bota
                  </Button>
                </Group>

                <Group gap="sm">
                  <Button
                    leftSection={<IconTrash size={16} />}
                    onClick={() => setLogs([])}
                    disabled={logs.length === 0}
                    variant="light"
                    color="red"
                  >
                    Wyczyść Logi
                  </Button>

                  <Button
                    leftSection={<IconRefresh size={16} />}
                    onClick={() => requestStatus()}
                    variant="light"
                    disabled={connectionState !== ConnectionState.CONNECTED}
                  >
                    Odśwież
                  </Button>
                </Group>
              </Group>
            </Paper>

            {/* Logs Panel */}
            <Paper p="md" withBorder>
              <Stack gap="sm">
                <Group justify="space-between">
                  <Text size="lg" fw={600}>Logi Bota</Text>
                  {connectionState !== ConnectionState.CONNECTED && (
                    <Loader size="sm" />
                  )}
                </Group>
                
                <Box
                  ref={logsContainerRef}
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
        </Tabs.Panel>

        <Tabs.Panel value="configuration">
          <BotConfigPanel 
            isRunning={botStatus.running}
            onConfigUpdate={() => {
              // Refresh bot status and config after config update
              setTimeout(() => {
                requestStatus();
                loadBotConfig();
              }, 500);
            }}
          />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
};

export default BotPanel;
