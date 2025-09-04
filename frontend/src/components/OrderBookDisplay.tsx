import React, { useMemo, memo, useRef, useLayoutEffect, useCallback } from 'react';
import { Paper, Stack, Group, Text, Badge, ScrollArea } from '@mantine/core';
import { IconTrendingUp, IconTrendingDown } from '@tabler/icons-react';
import { createDebugLogger } from '../utils/debugLogger';
import { usePreserveScrollPosition } from '../hooks/usePreserveScroll';

const logger = createDebugLogger('OrderBookDisplay');

type Level = [price: string, qty: string];

interface OrderBookData {
  symbol: string;
  bids: readonly Level[];
  asks: readonly Level[];
  timestamp?: number;
}

interface OrderBookDisplayProps {
  orderbook: OrderBookData;
  maxRows?: number;
}

const ROW_HEIGHT = 28; // stała wysokość rzędu dla stabilnego layoutu

const OrderBookDisplay: React.FC<OrderBookDisplayProps> = ({ orderbook, maxRows = 10 }) => {
  // Debug log to see if component re-renders
  logger.render(`Rendering with orderbook: ${orderbook.symbol} ${orderbook.timestamp}`);
  
  // Mount / Unmount logs
  React.useEffect(() => {
    logger.log('Mounted OrderBookDisplay');
    return () => {
      logger.log('Unmounted OrderBookDisplay');
    };
  }, []);
  
  const locale = typeof window !== 'undefined' && typeof navigator !== 'undefined'
    ? navigator.language : 'pl-PL';
  const priceFmt = useMemo(() => new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), [locale]);
  const qtyFmt = useMemo(() => new Intl.NumberFormat(locale, { minimumFractionDigits: 4, maximumFractionDigits: 4 }), [locale]);
  const formatPrice = (s: string) => { const n = Number(s); return Number.isFinite(n) ? priceFmt.format(n) : 'N/A'; };
  const formatQty = (s: string) => { const n = Number(s); return Number.isFinite(n) ? qtyFmt.format(n) : 'N/A'; };

    const { spread, spreadPct, anomaly } = useMemo(() => {
    const bidsN = orderbook.bids.map(([p]) => Number(p)).filter(Number.isFinite);
    const asksN = orderbook.asks.map(([p]) => Number(p)).filter(Number.isFinite);
    const bb = bidsN.length ? Math.max(...bidsN) : NaN;
    const ba = asksN.length ? Math.min(...asksN) : NaN;
    const s = Number.isFinite(bb) && Number.isFinite(ba) ? ba - bb : NaN;
    const m = Number.isFinite(bb) && Number.isFinite(ba) ? (bb + ba) / 2 : NaN;
    const sp = Number.isFinite(s) && Number.isFinite(m) && m > 0 ? (s / m) * 100 : NaN;
    return { spread: s, spreadPct: sp, anomaly: Number.isFinite(bb) && Number.isFinite(ba) && ba < bb };
  }, [orderbook.bids, orderbook.asks]);

  const bidsForView = useMemo(() => [...orderbook.bids]
    .slice().sort((a, b) => Number(b[0]) - Number(a[0])).slice(0, maxRows), [orderbook.bids, maxRows]);

  const asksForView = useMemo(() => [...orderbook.asks]
    .slice().sort((a, b) => Number(a[0]) - Number(b[0])).slice(0, maxRows).reverse(), [orderbook.asks, maxRows]); // najwyższe u góry

  // Content signature dla stabilnego hooka - tylko ceny, nie czas
  const contentSignature = useMemo(
    () => `${asksForView.map(([p]) => p).join('|')}||${bidsForView.map(([p]) => p).join('|')}`,
    [asksForView, bidsForView]
  );

  // ===== kontrola przewijania ScrollArea =====
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const savedScrollTopRef = useRef(0);

  // Użyj hooka do zachowania pozycji przewijania
  const { onScroll, isUserInteracting } = usePreserveScrollPosition(
    viewportRef,
    // używaj content signature zamiast timestamp żeby hook nie odpalał się co 2s
    [contentSignature]
  );

  // Owijka logująca zmiany pozycji scrolla i aktualizująca zapamiętaną pozycję
  const handleScrollPositionChange = useCallback(({ y }: { y: number }) => {
    savedScrollTopRef.current = y;
    logger.log('Scroll position changed', { y });
    onScroll(y);
  }, [onScroll]);

  // Przywróć pozycję scrolla po każdej aktualizacji danych (timestamp)
  // Jednorazowy debounce log dla niegotowego viewportu
  const warnedRef = useRef(false);

  useLayoutEffect(() => {
    const vp = viewportRef.current;
    if (!vp) {
      if (!warnedRef.current) {
        logger.log('Viewport not ready yet, skipping scroll restore');
        warnedRef.current = true;
      }
      return;
    }
    const maxTop = Math.max(0, vp.scrollHeight - vp.clientHeight);
    const nextTop = Math.min(savedScrollTopRef.current, maxTop);
    if (Number.isFinite(nextTop) && !isUserInteracting()) {
      vp.scrollTop = nextTop;
      logger.log('Scroll position restored after data update', {
        timestamp: orderbook.timestamp,
        restoredTo: nextTop,
        maxTop,
      });
    }
  }, [orderbook.timestamp]);

  // Diagnostyka - log co 2s pozycji scroll i content signature
  React.useEffect(() => {
    const timer = setInterval(() => {
      const vp = viewportRef.current;
      if (vp) {
        console.log('OrderBook Diagnostics:', {
          scrollTop: vp.scrollTop,
          clientHeight: vp.clientHeight,
          scrollHeight: vp.scrollHeight,
          contentSignature: contentSignature.substring(0, 100) + '...',
          timestamp: orderbook.timestamp
        });
      }
    }, 2000);
    
    return () => clearInterval(timer);
  }, [contentSignature, orderbook.timestamp]);

  return (
    <Paper p="md" withBorder shadow="sm" h={400} data-testid="orderbook-container">
      <Stack gap="sm" h="100%">

        {/* Column Headers */}
        <Group justify="space-between" px="xs">
          <Text size="xs" c="dimmed" fw={500}>Cena</Text>
          <Text size="xs" c="dimmed" fw={500}>Ilość</Text>
        </Group>

        <ScrollArea
          flex={1}
          type="auto"
          aria-label="Order book entries"
          viewportRef={viewportRef}
          onScrollPositionChange={handleScrollPositionChange}
        >
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              tableLayout: 'fixed', // stabilny layout
            }}
          >
            <thead>
              <tr>
                <th scope="col" style={{ textAlign: 'left', padding: '4px 8px', fontSize: '12px', fontWeight: 500, color: 'var(--mantine-color-dimmed)' }}>Price</th>
                <th scope="col" style={{ textAlign: 'right', padding: '4px 8px', fontSize: '12px', fontWeight: 500, color: 'var(--mantine-color-dimmed)' }}>Quantity</th>
              </tr>
            </thead>
            <tbody>
              {/* Asks (Sell Orders) - Red - stabilne klucze */}
              {asksForView.map(([price, quantity]) => (
                <tr key={`ask-${price}-${quantity}`} style={{ height: ROW_HEIGHT }}>
                  <td
                    style={{
                      padding: '4px 8px',
                      fontSize: '14px',
                      fontFamily: 'monospace',
                      color: 'var(--mantine-color-red-6)',
                      fontWeight: 500,
                    }}
                    aria-label="zlecenie sprzedaży"
                  >
                    ▼ {formatPrice(price)}
                  </td>
                  <td style={{ padding: '4px 8px', fontSize: '14px', fontFamily: 'monospace', color: 'var(--mantine-color-dimmed)', textAlign: 'right' }}>
                    {formatQty(quantity)}
                  </td>
                </tr>
              ))}

              {/* Spread Indicator */}
              <tr style={{ height: ROW_HEIGHT }}>
                <td colSpan={2} style={{ padding: '8px', backgroundColor: 'var(--mantine-color-gray-1)', borderRadius: '4px', textAlign: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                    <IconTrendingUp size={16} color="var(--mantine-color-teal-6)" />
                    <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--mantine-color-dimmed)' }}>
                      Spread: {Number.isFinite(spread) ? spread.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'N/A'} USDT ({Number.isFinite(spreadPct) ? spreadPct.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'N/A'}%)
                    </span>
                    {anomaly && <Badge size="xs" color="red">Anomalia danych</Badge>}
                    <IconTrendingDown size={16} color="var(--mantine-color-red-6)" />
                  </div>
                </td>
              </tr>

              {/* Bids (Buy Orders) - Green - stabilne klucze */}
              {bidsForView.map(([price, quantity]) => (
                <tr key={`bid-${price}-${quantity}`} style={{ height: ROW_HEIGHT }}>
                  <td
                    style={{
                      padding: '4px 8px',
                      fontSize: '14px',
                      fontFamily: 'monospace',
                      color: 'var(--mantine-color-teal-6)',
                      fontWeight: 500,
                    }}
                    aria-label="zlecenie kupna"
                  >
                    ▲ {formatPrice(price)}
                  </td>
                  <td style={{ padding: '4px 8px', fontSize: '14px', fontFamily: 'monospace', color: 'var(--mantine-color-dimmed)', textAlign: 'right' }}>
                    {formatQty(quantity)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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

export default memo(OrderBookDisplay);
