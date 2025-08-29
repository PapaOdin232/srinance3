import React, { useState } from 'react';
import {
  Paper,
  Stack,
  Group,
  Text,
  Button,
  Select,
  NumberInput,
  Badge,
  ActionIcon,
  Accordion,
  Grid,
  Divider
} from '@mantine/core';
import { IconPlus, IconEye, IconEyeOff, IconTrash, IconChartLine } from '@tabler/icons-react';
import { useChartIndicators } from '../hooks/useChartIndicators';
import type { IChartApi } from 'lightweight-charts';

interface IndicatorPanelProps {
  chartInstance: IChartApi | null;
  historicalData: any[];
}

const IndicatorPanel: React.FC<IndicatorPanelProps> = ({ chartInstance, historicalData }) => {
  const {
    indicators,
    addRSI,
    addMovingAverage,
    addMACD,
    addBollingerBands,
    removeIndicator,
    toggleIndicator,
    clearAllIndicators
  } = useChartIndicators(chartInstance);

  const [selectedIndicator, setSelectedIndicator] = useState<string>('');
  
  // RSI Configuration
  const [rsiPeriod, setRsiPeriod] = useState(14);
  const [rsiOverbought, setRsiOverbought] = useState(70);
  const [rsiOversold, setRsiOversold] = useState(30);

  // Moving Average Configuration
  const [maPeriod, setMaPeriod] = useState(20);
  const [maType, setMaType] = useState<'SMA' | 'EMA'>('SMA');

  // MACD Configuration
  const [macdFast, setMacdFast] = useState(12);
  const [macdSlow, setMacdSlow] = useState(26);
  const [macdSignal, setMacdSignal] = useState(9);

  // Bollinger Bands Configuration
  const [bbPeriod, setBbPeriod] = useState(20);
  const [bbMultiplier, setBbMultiplier] = useState(2);

  const handleAddIndicator = () => {
    if (!historicalData || historicalData.length === 0) {
      console.warn('No historical data available for indicators');
      return;
    }

    switch (selectedIndicator) {
      case 'RSI':
        addRSI(historicalData, {
          period: rsiPeriod,
          overbought: rsiOverbought,
          oversold: rsiOversold
        });
        break;
      case 'MA':
        addMovingAverage(historicalData, {
          period: maPeriod,
          type: maType
        });
        break;
      case 'MACD':
        addMACD(historicalData, {
          fastPeriod: macdFast,
          slowPeriod: macdSlow,
          signalPeriod: macdSignal
        });
        break;
      case 'BB':
        addBollingerBands(historicalData, {
          period: bbPeriod,
          multiplier: bbMultiplier
        });
        break;
    }
    setSelectedIndicator('');
  };

  const getIndicatorColor = (type: string) => {
    switch (type) {
      case 'RSI': return 'orange';
      case 'MA': return 'blue';
      case 'MACD': return 'teal';
      case 'BB': return 'violet';
      default: return 'gray';
    }
  };

  return (
    <Paper p="md" withBorder>
      <Stack gap="md">
        <Group justify="space-between">
          <Group gap="xs">
            <IconChartLine size={20} />
            <Text fw={600} size="lg">Wskaźniki Techniczne</Text>
          </Group>
          {indicators.length > 0 && (
            <Button
              size="xs"
              variant="outline"
              color="red"
              leftSection={<IconTrash size={14} />}
              onClick={clearAllIndicators}
            >
              Usuń wszystkie
            </Button>
          )}
        </Group>

        <Divider />

        {/* Add Indicator Section */}
        <Accordion defaultValue="add-indicator">
          <Accordion.Item value="add-indicator">
            <Accordion.Control data-testid="add-indicator-accordion">Dodaj wskaźnik</Accordion.Control>
            <Accordion.Panel>
              <Stack gap="md">
                <Select
                  label="Wybierz wskaźnik"
                  placeholder="Wybierz wskaźnik do dodania"
                  value={selectedIndicator}
                  onChange={(value) => setSelectedIndicator(value || '')}
                  data={[
                    { value: 'RSI', label: 'RSI (Relative Strength Index)' },
                    { value: 'MA', label: 'Moving Average' },
                    { value: 'MACD', label: 'MACD' },
                    { value: 'BB', label: 'Bollinger Bands' }
                  ]}
                  data-testid="indicator-select"
                />

                {/* RSI Configuration */}
                {selectedIndicator === 'RSI' && (
                  <Grid>
                    <Grid.Col span={4}>
                      <NumberInput
                        label="Okres"
                        value={rsiPeriod}
                        onChange={(value) => setRsiPeriod(Number(value))}
                        min={2}
                        max={50}
                      />
                    </Grid.Col>
                    <Grid.Col span={4}>
                      <NumberInput
                        label="Wykupienie"
                        value={rsiOverbought}
                        onChange={(value) => setRsiOverbought(Number(value))}
                        min={50}
                        max={90}
                      />
                    </Grid.Col>
                    <Grid.Col span={4}>
                      <NumberInput
                        label="Wyprzedanie"
                        value={rsiOversold}
                        onChange={(value) => setRsiOversold(Number(value))}
                        min={10}
                        max={50}
                      />
                    </Grid.Col>
                  </Grid>
                )}

                {/* Moving Average Configuration */}
                {selectedIndicator === 'MA' && (
                  <Grid>
                    <Grid.Col span={6}>
                      <NumberInput
                        label="Okres"
                        value={maPeriod}
                        onChange={(value) => setMaPeriod(Number(value))}
                        min={2}
                        max={200}
                      />
                    </Grid.Col>
                    <Grid.Col span={6}>
                      <Select
                        label="Typ"
                        value={maType}
                        onChange={(value) => setMaType(value as 'SMA' | 'EMA')}
                        data={[
                          { value: 'SMA', label: 'Simple MA' },
                          { value: 'EMA', label: 'Exponential MA' }
                        ]}
                      />
                    </Grid.Col>
                  </Grid>
                )}

                {/* MACD Configuration */}
                {selectedIndicator === 'MACD' && (
                  <Grid>
                    <Grid.Col span={4}>
                      <NumberInput
                        label="Szybka EMA"
                        value={macdFast}
                        onChange={(value) => setMacdFast(Number(value))}
                        min={2}
                        max={50}
                      />
                    </Grid.Col>
                    <Grid.Col span={4}>
                      <NumberInput
                        label="Wolna EMA"
                        value={macdSlow}
                        onChange={(value) => setMacdSlow(Number(value))}
                        min={10}
                        max={100}
                      />
                    </Grid.Col>
                    <Grid.Col span={4}>
                      <NumberInput
                        label="Sygnał"
                        value={macdSignal}
                        onChange={(value) => setMacdSignal(Number(value))}
                        min={2}
                        max={20}
                      />
                    </Grid.Col>
                  </Grid>
                )}

                {/* Bollinger Bands Configuration */}
                {selectedIndicator === 'BB' && (
                  <Grid>
                    <Grid.Col span={6}>
                      <NumberInput
                        label="Okres"
                        value={bbPeriod}
                        onChange={(value) => setBbPeriod(Number(value))}
                        min={2}
                        max={50}
                      />
                    </Grid.Col>
                    <Grid.Col span={6}>
                      <NumberInput
                        label="Mnożnik"
                        value={bbMultiplier}
                        onChange={(value) => setBbMultiplier(Number(value))}
                        min={0.5}
                        max={4}
                        step={0.1}
                      />
                    </Grid.Col>
                  </Grid>
                )}

                <Button
                  leftSection={<IconPlus size={16} />}
                  onClick={handleAddIndicator}
                  disabled={!selectedIndicator || !chartInstance || !historicalData.length}
                  fullWidth
                  data-testid="add-indicator-button"
                >
                  Dodaj wskaźnik
                </Button>
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>

        {/* Active Indicators */}
        {indicators.length > 0 && (
          <Stack gap="xs">
            <Text fw={500} size="sm">Aktywne wskaźniki ({indicators.length})</Text>
            {indicators.map((indicator) => (
              <Paper key={indicator.id} p="xs" withBorder>
                <Group justify="space-between">
                  <Group gap="xs">
                    <Badge
                      color={getIndicatorColor(indicator.type)}
                      variant="light"
                      size="sm"
                    >
                      {indicator.type}
                    </Badge>
                    <Text size="sm" fw={500}>
                      {indicator.name}
                    </Text>
                  </Group>
                  <Group gap="xs">
                    <ActionIcon
                      size="sm"
                      variant="subtle"
                      color={indicator.visible ? 'blue' : 'gray'}
                      onClick={() => toggleIndicator(indicator.id)}
                      data-testid="eye-icon"
                    >
                      {indicator.visible ? <IconEye size={14} /> : <IconEyeOff size={14} />}
                    </ActionIcon>
                    <ActionIcon
                      size="sm"
                      variant="subtle"
                      color="red"
                      onClick={() => removeIndicator(indicator.id)}
                      data-testid={`trash-icon-${indicator.id}`}
                    >
                      <IconTrash size={14} />
                    </ActionIcon>
                  </Group>
                </Group>
              </Paper>
            ))}
          </Stack>
        )}

        {/* Info when no indicators */}
        {indicators.length === 0 && (
          <Text size="sm" c="dimmed" ta="center" py="md">
            Brak aktywnych wskaźników. Dodaj wskaźnik powyżej.
          </Text>
        )}
      </Stack>
    </Paper>
  );
};

export default IndicatorPanel;
