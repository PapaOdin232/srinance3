import React from 'react';
import { Group, Button, Paper, Text } from '@mantine/core';
import { IconClock } from '@tabler/icons-react';

export type TimeInterval = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

interface IntervalSelectorProps {
  selectedInterval: TimeInterval;
  onIntervalChange: (interval: TimeInterval) => void;
  disabled?: boolean;
}

const INTERVALS: { value: TimeInterval; label: string; description: string }[] = [
  { value: '1m', label: '1M', description: '1 minuta' },
  { value: '5m', label: '5M', description: '5 minut' },
  { value: '15m', label: '15M', description: '15 minut' },
  { value: '1h', label: '1H', description: '1 godzina' },
  { value: '4h', label: '4H', description: '4 godziny' },
  { value: '1d', label: '1D', description: '1 dzień' },
];

const IntervalSelector: React.FC<IntervalSelectorProps> = ({
  selectedInterval,
  onIntervalChange,
  disabled = false,
}) => {
  return (
    <Paper p="sm" withBorder>
      <Group gap="xs" align="center">
        <Group gap="xs" align="center">
          <IconClock size={16} />
          <Text size="sm" fw={500}>
            Interwał:
          </Text>
        </Group>
        
        <Group gap="xs">
          {INTERVALS.map((interval) => (
            <Button
              key={interval.value}
              variant={selectedInterval === interval.value ? 'filled' : 'outline'}
              color={selectedInterval === interval.value ? 'blue' : 'gray'}
              size="xs"
              onClick={() => onIntervalChange(interval.value)}
              disabled={disabled}
              title={interval.description}
              styles={{
                root: {
                  minWidth: '40px',
                  fontWeight: 600,
                }
              }}
            >
              {interval.label}
            </Button>
          ))}
        </Group>
        
        <Text size="xs" c="dimmed" ml="auto">
          {INTERVALS.find(i => i.value === selectedInterval)?.description}
        </Text>
      </Group>
    </Paper>
  );
};

export default IntervalSelector;
