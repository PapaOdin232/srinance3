import React, { useState, useEffect } from 'react';
import {
  Paper,
  Stack,
  Group,
  Text,
  Title,
  Badge,
  Grid,
  Card,
  Loader,
  Alert,
} from '@mantine/core';
import { IconActivity, IconAlertCircle, IconRefresh, IconClock } from '@tabler/icons-react';
import { getMetrics, type MetricsResponse } from '../services/restClient';

interface MetricCardProps {
  title: string;
  value: string | number;
  description: string;
  color?: string;
  icon?: React.ReactNode;
  unit?: string;
}

const MetricCard: React.FC<MetricCardProps> = ({ title, value, description, color = 'blue', icon, unit }) => (
  <Card withBorder p="md">
    <Stack gap="xs">
      <Group justify="space-between" align="flex-start">
        <Group gap="xs">
          {icon}
          <Text size="sm" fw={600} c="dimmed">
            {title}
          </Text>
        </Group>
        <Badge color={color} variant="light" size="sm">
          {value}{unit}
        </Badge>
      </Group>
      <Text size="xs" c="dimmed" style={{ lineHeight: 1.4 }}>
        {description}
      </Text>
    </Stack>
  </Card>
);

const DiagnosticsPanel: React.FC = () => {
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchMetrics = async () => {
    try {
      setError(null);
      const data = await getMetrics();
      if (data) {
        setMetrics(data);
        setLastUpdate(new Date());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Błąd pobierania metryk');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
    
    // Aktualizacja co 5 sekund
    const interval = setInterval(fetchMetrics, 5000);
    
    return () => clearInterval(interval);
  }, []);

  const getLatencyColor = (ageMs: number | null): string => {
    if (ageMs === null) return 'gray';
    if (ageMs < 5000) return 'teal'; // <5s zielony
    if (ageMs < 15000) return 'yellow'; // 5-15s żółty
    return 'red'; // >15s czerwony
  };

  const formatLatency = (ageMs: number | null): string => {
    if (ageMs === null) return 'N/A';
    if (ageMs < 1000) return `${Math.round(ageMs)}ms`;
    return `${(ageMs / 1000).toFixed(1)}s`;
  };

  const getErrorColor = (count: number): string => {
    if (count === 0) return 'teal';
    if (count < 5) return 'yellow';
    return 'red';
  };

  if (loading) {
    return (
      <Paper p="xl" withBorder>
        <Group justify="center" gap="md">
          <Loader size="md" />
          <Text>Ładowanie metryk systemu...</Text>
        </Group>
      </Paper>
    );
  }

  if (error) {
    return (
      <Alert
        icon={<IconAlertCircle size={16} />}
        title="Błąd ładowania metryk"
        color="red"
        variant="light"
      >
        {error}
      </Alert>
    );
  }

  return (
    <Stack gap="md" p="md">
      {/* Header */}
      <Paper p="md" withBorder>
        <Group justify="space-between">
          <Group gap="xs">
            <IconActivity size={20} />
            <Title order={2}>Diagnostyka i Metryki Systemu</Title>
          </Group>
          <Group gap="xs">
            <Badge
              color={metrics?.listenKeyActive ? 'teal' : 'red'}
              variant="light"
              leftSection={<IconClock size={12} />}
            >
              {metrics?.listenKeyActive ? 'User Stream Aktywny' : 'User Stream Nieaktywny'}
            </Badge>
            {lastUpdate && (
              <Text size="xs" c="dimmed">
                Ostatnia aktualizacja: {lastUpdate.toLocaleTimeString()}
              </Text>
            )}
          </Group>
        </Group>
      </Paper>

      {/* Metryki czasu rzeczywistego */}
      <Paper p="md" withBorder>
        <Text size="lg" fw={600} mb="md">Metryki Czasu Rzeczywistego</Text>
        <Grid>
          <Grid.Col span={6}>
            <MetricCard
              title="Wiek Ostatniego Eventu"
              value={formatLatency(metrics?.lastEventAgeMs || null)}
              description="Czas od ostatniego eventu user stream. <5s = dobry, 5-15s = uwaga, >15s = problem"
              color={getLatencyColor(metrics?.lastEventAgeMs || null)}
              icon={<IconClock size={16} />}
            />
          </Grid.Col>
          <Grid.Col span={6}>
            <MetricCard
              title="Wiek Ostatniego Keepalive"
              value={formatLatency(metrics?.lastKeepAliveAgeMs || null)}
              description="Czas od ostatniego keepalive user stream. Keepalive wysyłany co 25 minut"
              color={getLatencyColor(metrics?.lastKeepAliveAgeMs || null)}
              icon={<IconClock size={16} />}
            />
          </Grid.Col>
          <Grid.Col span={6}>
            <MetricCard
              title="Średnie Opóźnienie Eventów"
              value={metrics?.avgEventLatencyMs ? Math.round(metrics.avgEventLatencyMs) : 'N/A'}
              description="Średnie opóźnienie przetwarzania eventów. <100ms = dobry, 100-500ms = uwaga, >500ms = problem"
              color={
                metrics?.avgEventLatencyMs === null ? 'gray' :
                (metrics?.avgEventLatencyMs || 0) < 100 ? 'teal' :
                (metrics?.avgEventLatencyMs || 0) < 500 ? 'yellow' : 'red'
              }
              icon={<IconActivity size={16} />}
              unit="ms"
            />
          </Grid.Col>
          <Grid.Col span={6}>
            <MetricCard
              title="Aktywne Połączenia"
              value={metrics?.userConnections || 0}
              description="Liczba aktywnych połączeń WebSocket użytkowników"
              color={metrics?.userConnections ? 'teal' : 'gray'}
              icon={<IconActivity size={16} />}
            />
          </Grid.Col>
        </Grid>
      </Paper>

      {/* Liczniki błędów */}
      <Paper p="md" withBorder>
        <Text size="lg" fw={600} mb="md">Liczniki Błędów i Restartów</Text>
        <Grid>
          <Grid.Col span={4}>
            <MetricCard
              title="Błędy Keepalive"
              value={metrics?.keepaliveErrors || 0}
              description="Liczba błędów podczas wysyłania keepalive"
              color={getErrorColor(metrics?.keepaliveErrors || 0)}
              icon={<IconAlertCircle size={16} />}
            />
          </Grid.Col>
          <Grid.Col span={4}>
            <MetricCard
              title="Restarty User Stream"
              value={metrics?.userStreamRestarts || 0}
              description="Liczba restartów user data stream"
              color={getErrorColor(metrics?.userStreamRestarts || 0)}
              icon={<IconRefresh size={16} />}
            />
          </Grid.Col>
          <Grid.Col span={4}>
            <MetricCard
              title="Błędy Połączeń"
              value={metrics?.connectionErrors || 0}
              description="Liczba błędów połączeń WebSocket"
              color={getErrorColor(metrics?.connectionErrors || 0)}
              icon={<IconAlertCircle size={16} />}
            />
          </Grid.Col>
          <Grid.Col span={4}>
            <MetricCard
              title="Błędy WS Listener"
              value={metrics?.wsListenerErrors || 0}
              description="Błędy w listenerze WebSocket"
              color={getErrorColor(metrics?.wsListenerErrors || 0)}
              icon={<IconAlertCircle size={16} />}
            />
          </Grid.Col>
          <Grid.Col span={4}>
            <MetricCard
              title="Fallbacki Watchdog"
              value={metrics?.watchdogFallbacks || 0}
              description="Liczba fallbacków watchdog na REST API"
              color={getErrorColor(metrics?.watchdogFallbacks || 0)}
              icon={<IconRefresh size={16} />}
            />
          </Grid.Col>
          <Grid.Col span={4}>
            <MetricCard
              title="Paczki Wysłane"
              value={metrics?.batchesSent || 0}
              description="Liczba paczek danych wysłanych do klientów"
              color="blue"
              icon={<IconActivity size={16} />}
            />
          </Grid.Col>
        </Grid>
      </Paper>

      {/* Statystyki danych */}
      <Paper p="md" withBorder>
        <Text size="lg" fw={600} mb="md">Statystyki Danych</Text>
        <Grid>
          <Grid.Col span={3}>
            <MetricCard
              title="Otwarte Zlecenia"
              value={metrics?.openOrders || 0}
              description="Liczba aktywnych zleceń w systemie"
              color="blue"
              icon={<IconActivity size={16} />}
            />
          </Grid.Col>
          <Grid.Col span={3}>
            <MetricCard
              title="Łączna Liczba Zleceń"
              value={metrics?.ordersTotal || 0}
              description="Całkowita liczba zleceń w pamięci"
              color="blue"
              icon={<IconActivity size={16} />}
            />
          </Grid.Col>
          <Grid.Col span={3}>
            <MetricCard
              title="Rozmiar Historii"
              value={metrics?.historySize || 0}
              description="Liczba zleceń w historii (max 200)"
              color="blue"
              icon={<IconActivity size={16} />}
            />
          </Grid.Col>
          <Grid.Col span={3}>
            <MetricCard
              title="Salda Aktywów"
              value={metrics?.balancesCount || 0}
              description="Liczba śledzonych aktywów w portfelu"
              color="blue"
              icon={<IconActivity size={16} />}
            />
          </Grid.Col>
        </Grid>
      </Paper>

      {/* Interpretacja kolorów */}
      <Paper p="sm" withBorder bg="gray.0">
        <Text size="sm" fw={600} mb="xs">Interpretacja kolorów:</Text>
        <Group gap="lg">
          <Group gap="xs">
            <Badge color="teal" variant="light" size="xs">Zielony</Badge>
            <Text size="xs" c="dimmed">Dobry stan (&lt;5s dla opóźnień, 0 błędów)</Text>
          </Group>
          <Group gap="xs">
            <Badge color="yellow" variant="light" size="xs">Żółty</Badge>
            <Text size="xs" c="dimmed">Uwaga (5-15s dla opóźnień, &lt;5 błędów)</Text>
          </Group>
          <Group gap="xs">
            <Badge color="red" variant="light" size="xs">Czerwony</Badge>
            <Text size="xs" c="dimmed">Problem (&gt;15s dla opóźnień, ≥5 błędów)</Text>
          </Group>
        </Group>
      </Paper>
    </Stack>
  );
};

export default DiagnosticsPanel;
