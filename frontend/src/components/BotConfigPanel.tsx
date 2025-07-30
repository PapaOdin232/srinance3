import React, { useState, useEffect } from 'react';
import {
  Paper,
  Stack,
  Group,
  Text,
  Title,
  Button,
  Select,
  NumberInput,
  TextInput,
  Grid,
  Badge,
  Alert,
  Card,
  Accordion,
} from '@mantine/core';
import {
  IconSettings,
  IconRefresh,
  IconCheck,
  IconX,
  IconInfoCircle,
} from '@tabler/icons-react';
import axios from 'axios';

interface StrategyConfig {
  type: string;
  symbol: string;
  timeframe: string;
  parameters: {
    period?: number;
    rsi_period?: number;
    rsi_lower?: number;
    rsi_upper?: number;
    sma_period?: number;
    threshold?: number;
  };
  risk_management: {
    max_position_size: number;
    stop_loss_percentage: number;
    take_profit_percentage: number;
  };
}

interface BotConfigPanelProps {
  isRunning: boolean;
  onConfigUpdate?: () => void;
}

const BotConfigPanel: React.FC<BotConfigPanelProps> = ({ isRunning, onConfigUpdate }) => {
  const [config, setConfig] = useState<StrategyConfig | null>(null);
  const [strategies, setStrategies] = useState<Array<{value: string, label: string}>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const loadBotConfig = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await axios.get('http://localhost:8001/bot/config');
      console.log('Bot config response:', response.data);
      if (response.data && (response.data as any).config) {
        setConfig((response.data as any).config);
      }
    } catch (error) {
      console.error('Failed to load bot config:', error);
      setError('Failed to load configuration');
    } finally {
      setLoading(false);
    }
  };

  const loadStrategies = async () => {
    try {
      const response = await axios.get('http://localhost:8001/bot/strategies');
      console.log('Strategies response:', response.data);
      if (response.data && (response.data as any).strategies) {
        // Przekształć obiekt strategii na tablicę dla Select komponentu
        const strategiesObj = (response.data as any).strategies;
        const strategiesArray = Object.keys(strategiesObj).map(key => ({
          value: key,
          label: strategiesObj[key].name || key
        }));
        setStrategies(strategiesArray);
      }
    } catch (error) {
      console.error('Failed to load strategies:', error);
      setError('Failed to load strategies');
    }
  };

  const updateConfig = async () => {
    if (!config) return;
    
    try {
      setLoading(true);
      setError(null);
      setSuccess(false);
      
      console.log('Sending config update:', config);
      const response = await axios.post('http://localhost:8001/bot/config', config);
      console.log('Config update response:', response.data);
      
      setSuccess(true);
      if (onConfigUpdate) {
        onConfigUpdate();
      }
      
      setTimeout(() => setSuccess(false), 3000);
    } catch (error: any) {
      console.error('Failed to update config:', error);
      setError(error.response?.data?.detail || 'Failed to update configuration');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBotConfig();
    loadStrategies();
  }, []);

  if (!config) {
    return (
      <Paper p="md">
        <Stack>
          <Group>
            <IconSettings size={24} />
            <Title order={3}>Bot Configuration</Title>
          </Group>
          {loading && <Text>Loading...</Text>}
          {error && <Alert color="red" icon={<IconX size={16} />}>{error}</Alert>}
        </Stack>
      </Paper>
    );
  }

  return (
    <Paper p="md">
      <Stack>
        <Group justify="space-between">
          <Group>
            <IconSettings size={24} />
            <Title order={3}>Bot Configuration</Title>
          </Group>
          <Group>
            <Button 
              variant="light" 
              leftSection={<IconRefresh size={16} />}
              onClick={() => { loadBotConfig(); loadStrategies(); }}
              loading={loading}
            >
              Refresh
            </Button>
            <Button 
              onClick={updateConfig}
              loading={loading}
              disabled={isRunning}
              leftSection={<IconCheck size={16} />}
            >
              Save Configuration
            </Button>
          </Group>
        </Group>

        {error && (
          <Alert color="red" icon={<IconX size={16} />}>
            {error}
          </Alert>
        )}

        {success && (
          <Alert color="green" icon={<IconCheck size={16} />}>
            Configuration updated successfully!
          </Alert>
        )}

        {isRunning && (
          <Alert color="orange" icon={<IconInfoCircle size={16} />}>
            Bot is running. Stop the bot to modify configuration.
          </Alert>
        )}

        <Grid>
          <Grid.Col span={6}>
            <Select
              label="Strategy Type"
              placeholder="Select strategy"
              data={strategies}
              value={config.type}
              onChange={(value) => setConfig({ ...config, type: value || '' })}
              disabled={isRunning}
            />
          </Grid.Col>
          <Grid.Col span={6}>
            <TextInput
              label="Symbol"
              placeholder="e.g., BTCUSDT"
              value={config.symbol}
              onChange={(event) => setConfig({ ...config, symbol: event.target.value })}
              disabled={isRunning}
            />
          </Grid.Col>
          <Grid.Col span={6}>
            <Select
              label="Timeframe"
              placeholder="Select timeframe"
              data={['1m', '5m', '15m', '1h', '4h', '1d']}
              value={config.timeframe}
              onChange={(value) => setConfig({ ...config, timeframe: value || '1m' })}
              disabled={isRunning}
            />
          </Grid.Col>
        </Grid>

        <Accordion defaultValue="risk">
          <Accordion.Item value="strategy">
            <Accordion.Control>Strategy Parameters</Accordion.Control>
            <Accordion.Panel>
              <Grid>
                {config.type === 'simple_ma' && (
                  <>
                    <Grid.Col span={6}>
                      <NumberInput
                        label="SMA Period"
                        value={config.parameters.sma_period || 20}
                        onChange={(value) => setConfig({
                          ...config,
                          parameters: { ...config.parameters, sma_period: Number(value) }
                        })}
                        disabled={isRunning}
                        min={5}
                        max={100}
                      />
                    </Grid.Col>
                    <Grid.Col span={6}>
                      <NumberInput
                        label="Threshold (%)"
                        value={config.parameters.threshold || 0.5}
                        onChange={(value) => setConfig({
                          ...config,
                          parameters: { ...config.parameters, threshold: Number(value) }
                        })}
                        disabled={isRunning}
                        min={0.1}
                        max={5}
                        step={0.1}
                      />
                    </Grid.Col>
                  </>
                )}
                
                {config.type === 'rsi_strategy' && (
                  <>
                    <Grid.Col span={4}>
                      <NumberInput
                        label="RSI Period"
                        value={config.parameters.rsi_period || 14}
                        onChange={(value) => setConfig({
                          ...config,
                          parameters: { ...config.parameters, rsi_period: Number(value) }
                        })}
                        disabled={isRunning}
                        min={5}
                        max={50}
                      />
                    </Grid.Col>
                    <Grid.Col span={4}>
                      <NumberInput
                        label="RSI Lower"
                        value={config.parameters.rsi_lower || 30}
                        onChange={(value) => setConfig({
                          ...config,
                          parameters: { ...config.parameters, rsi_lower: Number(value) }
                        })}
                        disabled={isRunning}
                        min={10}
                        max={40}
                      />
                    </Grid.Col>
                    <Grid.Col span={4}>
                      <NumberInput
                        label="RSI Upper"
                        value={config.parameters.rsi_upper || 70}
                        onChange={(value) => setConfig({
                          ...config,
                          parameters: { ...config.parameters, rsi_upper: Number(value) }
                        })}
                        disabled={isRunning}
                        min={60}
                        max={90}
                      />
                    </Grid.Col>
                  </>
                )}
              </Grid>
            </Accordion.Panel>
          </Accordion.Item>

          <Accordion.Item value="risk">
            <Accordion.Control>Risk Management</Accordion.Control>
            <Accordion.Panel>
              <Grid>
                <Grid.Col span={4}>
                  <NumberInput
                    label="Max Position Size ($)"
                    value={config.risk_management.max_position_size}
                    onChange={(value) => setConfig({
                      ...config,
                      risk_management: { 
                        ...config.risk_management, 
                        max_position_size: Number(value) 
                      }
                    })}
                    disabled={isRunning}
                    min={1}
                    max={10000}
                  />
                </Grid.Col>
                <Grid.Col span={4}>
                  <NumberInput
                    label="Stop Loss (%)"
                    value={config.risk_management.stop_loss_percentage}
                    onChange={(value) => setConfig({
                      ...config,
                      risk_management: { 
                        ...config.risk_management, 
                        stop_loss_percentage: Number(value) 
                      }
                    })}
                    disabled={isRunning}
                    min={0.1}
                    max={10}
                    step={0.1}
                  />
                </Grid.Col>
                <Grid.Col span={4}>
                  <NumberInput
                    label="Take Profit (%)"
                    value={config.risk_management.take_profit_percentage}
                    onChange={(value) => setConfig({
                      ...config,
                      risk_management: { 
                        ...config.risk_management, 
                        take_profit_percentage: Number(value) 
                      }
                    })}
                    disabled={isRunning}
                    min={0.1}
                    max={20}
                    step={0.1}
                  />
                </Grid.Col>
              </Grid>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>

        <Card withBorder>
          <Stack gap="xs">
            <Text size="sm" fw={500}>Current Configuration Summary</Text>
            <Group>
              <Badge color="blue">{config.type}</Badge>
              <Badge color="green">{config.symbol}</Badge>
              <Badge color="orange">{config.timeframe}</Badge>
            </Group>
            <Text size="xs" c="dimmed">
              Risk: ${config.risk_management.max_position_size} max, 
              {config.risk_management.stop_loss_percentage}% SL, 
              {config.risk_management.take_profit_percentage}% TP
            </Text>
          </Stack>
        </Card>
      </Stack>
    </Paper>
  );
};

export default BotConfigPanel;
