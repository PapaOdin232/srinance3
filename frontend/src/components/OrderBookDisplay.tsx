import React from 'react';
import { Paper, Stack, Group, Text, Badge, Box, ScrollArea } from '@mantine/core';
import { IconTrendingUp, IconTrendingDown } from '@tabler/icons-react';
import { createDebugLogger } from '../utils/debugLogger';

const logger = createDebugLogger('OrderBookDisplay');

interface OrderBookData {
  symbol: string;
  bids: Array<[string, string]>; // [price, quantity]
  asks: Array<[string, string]>; // [price, quantity]
  timestamp?: number;
}

interface OrderBookDisplayProps {
  orderbook: OrderBookData;
  maxRows?: number;
}

const OrderBookDisplay: React.FC<OrderBookDisplayProps> = ({ orderbook, maxRows = 10 }) => {
  // Debug log to see if component re-renders
  logger.render(`Rendering with orderbook: ${orderbook.symbol} ${orderbook.timestamp}`);
  
  // Format price and quantity with proper decimals
  const formatPrice = (price: string): string => {
    const num = parseFloat(price);
    return num.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const formatQuantity = (quantity: string): string => {
    const num = parseFloat(quantity);
    return num.toLocaleString('en-US', {
      minimumFractionDigits: 4,
      maximumFractionDigits: 4,
    });
  };

  // Take only the specified number of rows
  const bids = orderbook.bids.slice(0, maxRows);
  const asks = orderbook.asks.slice(0, maxRows).reverse(); // Show highest asks first

  return (
    <Paper p="md" withBorder shadow="sm" h="400" data-testid="orderbook-container">
      <Stack gap="sm" h="100%">
        {/* Header */}
        <Group justify="space-between" align="center">
          <Text size="lg" fw={500}>
            Księga Zleceń
          </Text>
          <Group gap="xs">
            <Badge variant="light" color="blue" size="sm">
              {orderbook.symbol}
            </Badge>
            <Text size="xs" c="dimmed">
              {new Date().toLocaleTimeString()}
            </Text>
          </Group>
        </Group>

        {/* Column Headers */}
        <Group justify="space-between" px="xs">
          <Text size="xs" c="dimmed" fw={500}>Cena (USDT)</Text>
          <Text size="xs" c="dimmed" fw={500}>Ilość</Text>
        </Group>

        <ScrollArea flex={1} type="never">
          <Stack gap="xs">
            {/* Asks (Sell Orders) - Red */}
    {asks.map(([price, quantity], index) => (
              <Group key={`ask-${index}`} justify="space-between" px="xs" py={2}>
                <Text 
                  size="sm" 
                  ff="monospace" 
                  c="red.6" 
                  fw={500}
      data-testid={`ask-price-${index}`}
                >
                  ${formatPrice(price)}
                </Text>
                <Text 
                  size="sm" 
                  ff="monospace" 
                  c="dimmed"
      data-testid={`ask-qty-${index}`}
                >
                  {formatQuantity(quantity)}
                </Text>
              </Group>
            ))}

            {/* Spread Indicator */}
            <Box py="xs" bg="gray.1" style={{ borderRadius: '4px' }}>
              <Group justify="center" gap="xs">
                <IconTrendingUp size={16} color="var(--mantine-color-teal-6)" />
                <Text size="sm" fw={500} c="dimmed" ta="center">
                  Spread
                </Text>
                <IconTrendingDown size={16} color="var(--mantine-color-red-6)" />
              </Group>
            </Box>

            {/* Bids (Buy Orders) - Green */}
    {bids.map(([price, quantity], index) => (
              <Group key={`bid-${index}`} justify="space-between" px="xs" py={2}>
                <Text 
                  size="sm" 
                  ff="monospace" 
                  c="teal.6" 
                  fw={500}
      data-testid={`bid-price-${index}`}
                >
                  ${formatPrice(price)}
                </Text>
                <Text 
                  size="sm" 
                  ff="monospace" 
                  c="dimmed"
      data-testid={`bid-qty-${index}`}
                >
                  {formatQuantity(quantity)}
                </Text>
              </Group>
            ))}
          </Stack>
        </ScrollArea>

        {/* Footer */}
        <Group justify="space-between" pt="xs">
          <Text size="xs" c="dimmed">
            Najlepsze {maxRows} poziomów
          </Text>
          <Text size="xs" c="dimmed">
            Dane na żywo
          </Text>
        </Group>
      </Stack>
    </Paper>
  );
};

export default OrderBookDisplay;
