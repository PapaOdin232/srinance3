import React, { useState, useEffect, memo } from 'react';
import {
  Paper,
  Stack,
  Group,
  Text,
  Title,
  Button,
  NumberInput,
  Select,
  Alert,
  Badge,
  Divider,
  Grid,
  Tooltip,
} from '@mantine/core';
import { 
  IconTrendingUp, 
  IconTrendingDown, 
  IconFlask,
  IconAlertCircle,
  IconCheck,
  IconWallet,
} from '@tabler/icons-react';
import { placeOrder, testOrder, type PlaceOrderRequest } from '../services/restClient';
import { getCurrentTicker } from '../services/restClient';
import { useAssets } from '../hooks/useAssets';
import { useUserStream } from '../store/userStream';
import { usePortfolio } from '../hooks/usePortfolio';
import { formatCrypto } from '../types/portfolio';

interface TickerData {
  symbol: string;
  price: string;
  change: string;
  changePercent: string;
}

const TradingPanel: React.FC = () => {
  // Form state
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT'>('MARKET');
  const [quantity, setQuantity] = useState<number | string>('');
  const [price, setPrice] = useState<number | string>('');
  const [timeInForce, setTimeInForce] = useState<'GTC' | 'IOC' | 'FOK'>('GTC');

  // UI state
  const [loading, setLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [ticker, setTicker] = useState<TickerData | null>(null);

  // Assets hook for symbol selection and real-time ticker data
  const { assets } = useAssets();
  
  // Portfolio hook for balance information
  const { balances } = usePortfolio();
  
  // User stream for optimistic updates
  const { addPendingOrder } = useUserStream();

  // Get ticker data from assets instead of polling
  const currentAsset = assets.find(asset => asset.symbol === symbol);
  
  useEffect(() => {
    if (currentAsset) {
      setTicker({
        symbol: currentAsset.symbol,
        price: currentAsset.price.toString(),
        change: currentAsset.priceChange?.toString() || '0',
        changePercent: `${currentAsset.priceChangePercent?.toFixed(2) || '0'}%`
      });
    }
  }, [currentAsset]);

  // Fallback: Load ticker data only once on mount if no WebSocket data
  useEffect(() => {
    if (!currentAsset && symbol) {
      const loadTicker = async () => {
        try {
          const tickerData = await getCurrentTicker(symbol);
          if (tickerData) {
            setTicker({
              symbol: tickerData.symbol,
              price: tickerData.price,
              change: '0',
              changePercent: '0%'
            });
          }
        } catch (err) {
          console.error('Failed to load ticker:', err);
        }
      };
      loadTicker();
    }
  }, [symbol, currentAsset]);

  const handleTestOrder = async () => {
    setTestLoading(true);
    setError(null);
    setResult(null);

    try {
      const orderData: PlaceOrderRequest = {
        symbol,
        side,
        type: orderType,
        quantity: quantity.toString(),
        ...(orderType === 'LIMIT' && { price: price.toString() }),
        timeInForce
      };

      const response = await testOrder(orderData);
      
      if (response.success) {
        setResult({
          type: 'test',
          message: response.message,
          data: response.test_result
        });
      } else {
        setError(response.error || 'Test order failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Test order failed');
    } finally {
      setTestLoading(false);
    }
  };

  const handlePlaceOrder = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const orderData: PlaceOrderRequest = {
        symbol,
        side,
        type: orderType,
        quantity: quantity.toString(),
        ...(orderType === 'LIMIT' && { price: price.toString() }),
        timeInForce
      };

      // Optymistyczne dodanie zlecenia ze statusem PENDING
      const optimisticOrder = {
        orderId: Math.floor(Math.random() * 1000000), // Tymczasowe ID
        clientOrderId: `optimistic_${Date.now()}`,
        symbol,
        side,
        type: orderType,
        timeInForce,
        price: orderType === 'LIMIT' ? price.toString() : ticker?.price || '0',
        origQty: quantity.toString(),
        executedQty: '0',
        cummulativeQuoteQty: '0',
        avgPrice: '0',
        status: 'PENDING',
        updateTime: Date.now(),
        fills: []
      };
      
      addPendingOrder(optimisticOrder, 5000); // 5s timeout

      const response = await placeOrder(orderData);
      
      if (response.success) {
        setResult({
          type: 'live',
          message: 'Order placed successfully!',
          data: response.order
        });
        // Reset form after successful order
        setQuantity('');
        setPrice('');
      } else {
        setError(response.error || 'Failed to place order');
        // Note: Optymistyczne zlecenie zostanie automatycznie usunięte po timeout
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to place order');
      // Note: Optymistyczne zlecenie zostanie automatycznie usunięte po timeout
    } finally {
      setLoading(false);
    }
  };

  const isFormValid = () => {
    if (!quantity || parseFloat(quantity.toString()) <= 0) return false;
    if (orderType === 'LIMIT' && (!price || parseFloat(price.toString()) <= 0)) return false;
    return true;
  };

  const getEstimatedTotal = () => {
    if (!quantity) return '0.00';
    
    let estimatedPrice = 0;
    if (orderType === 'LIMIT' && price) {
      estimatedPrice = parseFloat(price.toString());
    } else if (ticker?.price) {
      estimatedPrice = parseFloat(ticker.price);
    }
    
    const qty = parseFloat(quantity.toString());
    return (qty * estimatedPrice).toFixed(2);
  };

  const symbolOptions = assets.map(asset => ({
    value: asset.symbol,
    label: `${asset.symbol} - ${asset.baseAsset}/${asset.quoteAsset}`
  }));

  return (
    <Stack gap="md" p="md">
      <Title order={2}>Panel Tradingowy</Title>
      
      {/* Current Price Display */}
      {ticker && (
        <Paper p="md" withBorder>
          <Group justify="space-between" align="center">
            <Group gap="md">
              <Text size="xl" fw={700}>
                {ticker.symbol}
              </Text>
              <Text size="lg" ff="monospace" fw={600}>
                ${parseFloat(ticker.price).toFixed(2)}
              </Text>
            </Group>
            <Badge color="blue" variant="light">
              TESTNET
            </Badge>
          </Group>
        </Paper>
      )}
      
      {/* Available Balance Display */}
      <Paper p="md" withBorder>
        <Group justify="space-between" align="center">
          <Group gap="md">
            <IconWallet size={20} />
            <Text size="md" fw={600}>
              Dostępne saldo
            </Text>
          </Group>
          <Group gap="lg">
            {/* Show USDT balance for all pairs */}
            <Group gap="xs">
              <Text size="sm" c="dimmed">USDT:</Text>
              <Tooltip label="Dostępne środki do handlu (nie zawiera zablokowanych w zleceniach)" withArrow>
                <Text size="sm" ff="monospace" fw={600} c="teal" style={{ textDecoration: 'underline dotted' }}>
                  {(() => {
                    const usdtBalance = balances.find(b => b.asset === 'USDT');
                    return usdtBalance ? formatCrypto(usdtBalance.free, 2) : '0.00';
                  })()}
                </Text>
              </Tooltip>
            </Group>
            
            {/* Show base asset balance if not USDT */}
            {symbol && !symbol.endsWith('USDT') && (() => {
              const baseAsset = symbol.replace('USDT', '');
              const baseBalance = balances.find(b => b.asset === baseAsset);
              return baseBalance && baseBalance.free > 0 ? (
                <Group gap="xs">
                  <Text size="sm" c="dimmed">{baseAsset}:</Text>
                  <Tooltip label="Dostępne środki do sprzedaży" withArrow>
                    <Text size="sm" ff="monospace" fw={600} c="blue" style={{ textDecoration: 'underline dotted' }}>
                      {formatCrypto(baseBalance.free, 8)}
                    </Text>
                  </Tooltip>
                </Group>
              ) : null;
            })()}
          </Group>
        </Group>
      </Paper>
      
      <Grid>
        <Grid.Col span={8}>
          <Paper p="md" withBorder>
            <Stack gap="md">
              <Text size="lg" fw={600}>
                Nowe Zlecenie
              </Text>
              
              {/* Symbol Selection */}
              <Select
                label="Symbol"
                value={symbol}
                onChange={(value) => setSymbol(value || 'BTCUSDT')}
                data={symbolOptions}
                searchable
                maxDropdownHeight={200}
              />
              
              {/* Order Type and Side */}
              <Grid>
                <Grid.Col span={6}>
                  <Select
                    label="Typ zlecenia"
                    value={orderType}
                    onChange={(value) => setOrderType(value as 'MARKET' | 'LIMIT')}
                    data={[
                      { value: 'MARKET', label: 'Market (natychmiastowe)' },
                      { value: 'LIMIT', label: 'Limit (z ceną)' }
                    ]}
                  />
                </Grid.Col>
                <Grid.Col span={6}>
                  <Select
                    label="Strona"
                    value={side}
                    onChange={(value) => setSide(value as 'BUY' | 'SELL')}
                    data={[
                      { value: 'BUY', label: '🟢 Kupno (BUY)' },
                      { value: 'SELL', label: '🔴 Sprzedaż (SELL)' }
                    ]}
                  />
                </Grid.Col>
              </Grid>
              
              {/* Quantity and Price */}
              <Grid>
                <Grid.Col span={orderType === 'LIMIT' ? 6 : 12}>
                  <NumberInput
                    label={`Ilość (${symbol.replace('USDT', '')})`}
                    value={quantity}
                    onChange={setQuantity}
                    min={0}
                    decimalScale={8}
                    placeholder="0.001"
                    required
                  />
                </Grid.Col>
                {orderType === 'LIMIT' && (
                  <Grid.Col span={6}>
                    <NumberInput
                      label="Cena (USDT)"
                      value={price}
                      onChange={setPrice}
                      min={0}
                      decimalScale={2}
                      placeholder={ticker?.price || '0.00'}
                      required
                    />
                  </Grid.Col>
                )}
              </Grid>
              
              {/* Time in Force (only for LIMIT orders) */}
              {orderType === 'LIMIT' && (
                <Select
                  label="Time in Force"
                  value={timeInForce}
                  onChange={(value) => setTimeInForce(value as 'GTC' | 'IOC' | 'FOK')}
                  data={[
                    { value: 'GTC', label: 'GTC - Good Till Canceled' },
                    { value: 'IOC', label: 'IOC - Immediate or Cancel' },
                    { value: 'FOK', label: 'FOK - Fill or Kill' }
                  ]}
                />
              )}
              
              {/* Estimated Total */}
              <Paper p="sm" bg="gray.0" withBorder>
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">
                    Szacowana wartość:
                  </Text>
                  <Text size="sm" fw={600} ff="monospace">
                    ${getEstimatedTotal()} USDT
                  </Text>
                </Group>
              </Paper>
              
              <Divider />
              
              {/* Action Buttons */}
              <Group gap="md">
                <Button
                  leftSection={<IconFlask size={16} />}
                  variant="outline"
                  onClick={handleTestOrder}
                  loading={testLoading}
                  disabled={!isFormValid() || loading}
                  flex={1}
                >
                  Test Order
                </Button>
                <Button
                  leftSection={side === 'BUY' ? <IconTrendingUp size={16} /> : <IconTrendingDown size={16} />}
                  color={side === 'BUY' ? 'teal' : 'red'}
                  onClick={handlePlaceOrder}
                  loading={loading}
                  disabled={!isFormValid() || testLoading}
                  flex={1}
                >
                  {side === 'BUY' ? 'Kupuj' : 'Sprzedaj'}
                </Button>
              </Group>
            </Stack>
          </Paper>
        </Grid.Col>
        
        <Grid.Col span={4}>
          <Stack gap="md">
            {/* Quick Actions */}
            <Paper p="md" withBorder>
              <Text size="md" fw={600} mb="md">
                Szybkie akcje
              </Text>
              <Stack gap="xs">
                <Button
                  size="sm"
                  variant="light"
                  onClick={() => {
                    setQuantity('0.001');
                    setOrderType('MARKET');
                    setSide('BUY');
                  }}
                >
                  Kup 0.001 BTC (Market)
                </Button>
                <Button
                  size="sm"
                  variant="light"
                  color="red"
                  onClick={() => {
                    setQuantity('0.001');
                    setOrderType('MARKET');
                    setSide('SELL');
                  }}
                >
                  Sprzedaj 0.001 BTC (Market)
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setQuantity('');
                    setPrice('');
                    setOrderType('MARKET');
                    setSide('BUY');
                    setError(null);
                    setResult(null);
                  }}
                >
                  Wyczyść formularz
                </Button>
              </Stack>
            </Paper>
            
            {/* Info */}
            <Paper p="md" withBorder>
              <Text size="sm" c="dimmed">
                ⚠️ To jest środowisko testowe Binance. Zlecenia są wykonywane na testnet z wirtualnymi środkami.
              </Text>
            </Paper>
          </Stack>
        </Grid.Col>
      </Grid>
      
      {/* Results Display */}
      {error && (
        <Alert
          icon={<IconAlertCircle size={16} />}
          title="Błąd"
          color="red"
          onClose={() => setError(null)}
          withCloseButton
        >
          {error}
        </Alert>
      )}
      
      {result && (
        <Alert
          icon={<IconCheck size={16} />}
          title={result.type === 'test' ? 'Test Order - Sukces' : 'Zlecenie złożone'}
          color={result.type === 'test' ? 'blue' : 'teal'}
          onClose={() => setResult(null)}
          withCloseButton
        >
          <Text>{result.message}</Text>
          {result.data && (
            <Paper p="sm" mt="xs" bg="gray.0">
              <Text size="xs" ff="monospace">
                {JSON.stringify(result.data, null, 2)}
              </Text>
            </Paper>
          )}
        </Alert>
      )}
    </Stack>
  );
};

export default memo(TradingPanel);
