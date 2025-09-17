import React, { useState, useEffect } from 'react';
import {
  Card,
  Button,
  Text,
  Stack,
  Group,
  Badge,
  Loader,
  Alert,
  Grid,
  Paper,
  Title
} from '@mantine/core';
import {
  IconCheck,
  IconAlertCircle,
  IconRocket,
  IconShield,
  IconTrendingUp,
  IconTarget
} from '@tabler/icons-react';
import { secureApiCall } from '../config/api';

interface Strategy {
  name: string;
  description: string;
  emoji: string;
  tags: string[];
}

interface PredefinedStrategiesProps {
  isRunning: boolean;
  onStrategySelect?: (strategyKey: string) => void;
}

// Icon mapping for different strategy types
const getStrategyIcon = (strategyKey: string) => {
  const iconMap: Record<string, React.ReactNode> = {
    'conservative_scalping': <IconShield size={20} />,
    'aggressive_momentum': <IconRocket size={20} />,
    'stable_dca': <IconTrendingUp size={20} />,
    'grid_ranging': <IconTarget size={20} />
  };
  return iconMap[strategyKey] || <IconTarget size={20} />;
};

// Color mapping for different strategy types
const getStrategyColor = (strategyKey: string) => {
  const colorMap: Record<string, string> = {
    'conservative_scalping': 'blue',
    'aggressive_momentum': 'red', 
    'stable_dca': 'green',
    'grid_ranging': 'orange'
  };
  return colorMap[strategyKey] || 'gray';
};

const PredefinedStrategies: React.FC<PredefinedStrategiesProps> = ({ 
  isRunning, 
  onStrategySelect 
}) => {
  const [strategies, setStrategies] = useState<Record<string, Strategy>>({});
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState<string | null>(null);
  const [selectedStrategy, setSelectedStrategy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadStrategies();
  }, []);

  const loadStrategies = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await secureApiCall('/bot/predefined-strategies');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('Loaded predefined strategies:', data);
      
      setStrategies(data.strategies || {});
    } catch (error) {
      console.error('Failed to load predefined strategies:', error);
      setError(error instanceof Error ? error.message : 'Failed to load strategies');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectStrategy = async (strategyKey: string) => {
    if (isRunning) return;
    
    setSelecting(strategyKey);
    setError(null);
    setSuccess(null);
    
    try {
      const response = await secureApiCall('/bot/select-strategy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ strategy_key: strategyKey })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || `HTTP ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      console.log('Strategy selection result:', result);
      
      setSelectedStrategy(strategyKey);
      setSuccess(result.message || `Strategy ${strategies[strategyKey]?.name} selected successfully`);
      
      // Call callback if provided
      if (onStrategySelect) {
        onStrategySelect(strategyKey);
      }
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
      
    } catch (error) {
      console.error('Failed to select strategy:', error);
      setError(error instanceof Error ? error.message : 'Failed to select strategy');
    } finally {
      setSelecting(null);
    }
  };

  if (loading) {
    return (
      <Paper p="md">
        <Stack align="center" gap="md">
          <Loader size="lg" />
          <Text>Loading predefined strategies...</Text>
        </Stack>
      </Paper>
    );
  }

  if (Object.keys(strategies).length === 0) {
    return (
      <Paper p="md">
        <Stack align="center" gap="md">
          <IconAlertCircle size={48} color="var(--mantine-color-gray-6)" />
          <Text size="lg" c="dimmed">No predefined strategies available</Text>
          <Button variant="light" onClick={loadStrategies}>
            Retry Loading
          </Button>
        </Stack>
      </Paper>
    );
  }

  return (
    <Paper p="md">
      <Stack gap="lg">
        {/* Header */}
        <Group justify="space-between">
          <Title order={3}>Predefined Trading Strategies</Title>
          <Button 
            variant="light" 
            size="sm"
            onClick={loadStrategies}
            loading={loading}
          >
            Refresh
          </Button>
        </Group>
        
        {/* Alerts */}
        {error && (
          <Alert color="red" icon={<IconAlertCircle size={16} />}>
            {error}
          </Alert>
        )}
        
        {success && (
          <Alert color="green" icon={<IconCheck size={16} />}>
            {success}
          </Alert>
        )}
        
        {isRunning && (
          <Alert color="orange" icon={<IconAlertCircle size={16} />}>
            Bot is currently running. Stop the bot to select a different strategy.
          </Alert>
        )}
        
        {/* Strategy Cards Grid */}
        <Grid>
          {Object.entries(strategies).map(([key, strategy]) => (
            <Grid.Col span={{ base: 12, md: 6 }} key={key}>
              <Card 
                shadow="sm" 
                padding="lg" 
                radius="md" 
                withBorder
                style={{
                  opacity: isRunning && selectedStrategy !== key ? 0.6 : 1,
                  cursor: isRunning && selectedStrategy !== key ? 'not-allowed' : 'pointer',
                  borderColor: selectedStrategy === key ? `var(--mantine-color-${getStrategyColor(key)}-6)` : undefined,
                  borderWidth: selectedStrategy === key ? 2 : 1
                }}
              >
                <Stack gap="md">
                  {/* Header */}
                  <Group justify="space-between">
                    <Group gap="sm">
                      <Text size="2xl">{strategy.emoji}</Text>
                      {getStrategyIcon(key)}
                      <Text fw={600} size="lg">{strategy.name}</Text>
                    </Group>
                    
                    {selectedStrategy === key && (
                      <Badge 
                        color={getStrategyColor(key)} 
                        variant="filled"
                        leftSection={<IconCheck size={12} />}
                      >
                        Active
                      </Badge>
                    )}
                  </Group>
                  
                  {/* Description */}
                  <Text size="sm" c="dimmed" style={{ minHeight: '40px' }}>
                    {strategy.description}
                  </Text>
                  
                  {/* Tags */}
                  {strategy.tags && strategy.tags.length > 0 && (
                    <Group gap="xs">
                      {strategy.tags.map((tag, index) => (
                        <Badge 
                          key={index}
                          size="sm" 
                          variant="light"
                          color={getStrategyColor(key)}
                        >
                          {tag}
                        </Badge>
                      ))}
                    </Group>
                  )}
                  
                  {/* Action Button */}
                  <Button
                    fullWidth
                    variant={selectedStrategy === key ? "filled" : "light"}
                    color={getStrategyColor(key)}
                    disabled={isRunning && selectedStrategy !== key}
                    loading={selecting === key}
                    onClick={() => handleSelectStrategy(key)}
                    leftSection={selectedStrategy === key ? <IconCheck size={16} /> : getStrategyIcon(key)}
                  >
                    {selectedStrategy === key ? "Currently Selected" : "Select Strategy"}
                  </Button>
                </Stack>
              </Card>
            </Grid.Col>
          ))}
        </Grid>
        
        {/* Info Footer */}
        <Card withBorder bg="var(--mantine-color-blue-0)">
          <Group gap="sm">
            <IconAlertCircle size={16} color="var(--mantine-color-blue-6)" />
            <Text size="sm" c="blue.6">
              Each strategy comes with pre-configured parameters and risk management settings 
              optimized for different market conditions and risk tolerance levels.
            </Text>
          </Group>
        </Card>
      </Stack>
    </Paper>
  );
};

export default PredefinedStrategies;