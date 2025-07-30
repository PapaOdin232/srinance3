import React from 'react';
import { Paper, Stack, Group, Text, Badge, Box } from '@mantine/core';
import { IconTrendingUp, IconTrendingDown } from '@tabler/icons-react';

interface TickerData {
  symbol: string;
  price: string;
  change: string;
  changePercent: string;
}

interface PriceDisplayProps {
  ticker: TickerData;
  currency?: string;
}

const PriceDisplay: React.FC<PriceDisplayProps> = ({ ticker, currency = 'USDT' }) => {
  const price = parseFloat(ticker.price);
  const change = parseFloat(ticker.change);
  const isPositive = change >= 0;
  
  // Format price with proper thousands separators
  const formatPrice = (value: number): string => {
    return value.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  // Format change with proper sign and decimals
  const formatChange = (value: number): string => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  // Extract percentage value from string (remove %)
  const getPercentageValue = (percentStr: string): number => {
    return parseFloat(percentStr.replace('%', ''));
  };

  const percentValue = getPercentageValue(ticker.changePercent);

  return (
    <Paper p="xl" withBorder shadow="sm">
      <Stack gap="md">
        <Group justify="space-between" align="center">
          <Text size="lg" fw={500} c="dimmed">
            Aktualna Cena
          </Text>
          <Badge 
            variant="light" 
            color="blue"
            size="sm"
          >
            24H
          </Badge>
        </Group>
        
        <Group align="baseline" gap="md">
          {/* Main Price Display */}
          <Box>
            <Group align="baseline" gap="xs">
              <Text size="sm" c="dimmed" fw={500}>
                {ticker.symbol.replace('USDT', '/USDT')}
              </Text>
            </Group>
            <Group align="baseline" gap="xs">
              <Text size="2.5rem" fw={700} c="dark" ff="monospace">
                ${formatPrice(price)}
              </Text>
              <Text size="lg" c="dimmed" fw={500}>
                {currency}
              </Text>
            </Group>
          </Box>
        </Group>

        {/* 24h Change Display */}
        <Group gap="sm" align="center">
          <Badge
            size="lg"
            variant="filled"
            color={isPositive ? 'teal' : 'red'}
            leftSection={
              isPositive ? 
                <IconTrendingUp size={16} /> : 
                <IconTrendingDown size={16} />
            }
            styles={{
              root: {
                paddingLeft: '8px',
                paddingRight: '12px',
              }
            }}
          >
            {formatChange(change)}
          </Badge>
          
          <Badge
            size="lg"
            variant="light"
            color={isPositive ? 'teal' : 'red'}
            styles={{
              root: {
                fontWeight: 600,
              }
            }}
          >
            {isPositive ? '▲' : '▼'} {Math.abs(percentValue).toFixed(2)}%
          </Badge>
        </Group>

        {/* Additional Info */}
        <Group gap="md" justify="apart">
          <Text size="xs" c="dimmed">
            Zmiana 24h
          </Text>
          <Text size="xs" c="dimmed" ta="right">
            Dane na żywo • Binance
          </Text>
        </Group>
      </Stack>
    </Paper>
  );
};

export default PriceDisplay;
