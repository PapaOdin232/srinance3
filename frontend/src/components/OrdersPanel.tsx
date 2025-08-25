import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Tabs, Paper, Group, Select, Title, Loader, Table, Alert, Badge, Stack, Text, ActionIcon, Tooltip } from '@mantine/core';
import { getOrdersHistory, type OrderResponse, cancelOrder } from '../services/restClient';
import { useUserStream } from '../store/userStream';
import { FreshnessBadge } from './FreshnessBadge';
import { useAssets } from '../hooks/useAssets';
import { IconReload, IconX } from '@tabler/icons-react';
import { OptimizedScrollArea } from './common/OptimizedScrollArea';

// No props needed - component now uses only WebSocket for real-time updates
interface OrdersPanelProps {}

// Status -> kolor mantine
const statusColorMap: Record<string, string> = {
  NEW: 'blue',
  FILLED: 'teal',
  PARTIALLY_FILLED: 'orange',
  CANCELED: 'red',
  EXPIRED: 'gray',
};

const numberFmt = new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 8 });
const timeFmt = (ts?: number | null) => {
  if (!ts || Number.isNaN(ts)) return '—';
  let n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return '—';
  // Normalize seconds -> ms if needed
  if (n < 1e12) n = n * 1000;
  const d = new Date(n);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('pl-PL');
};

const isMarket = (o: OrderResponse) => (o.type || '').toUpperCase() === 'MARKET';
const priceToDisplay = (o: OrderResponse) => {
  if (isMarket(o)) {
    // Prefer avgPrice for market; fallback to price if present
    const p = o.avgPrice ?? o.price;
    return numberFmt.format(parseFloat(p || '0'));
  }
  return numberFmt.format(parseFloat(o.price || '0'));
};
const qtyToDisplay = (o: OrderResponse) => {
  // For MARKET, if origQty missing/0, fallback to executedQty
  const base = parseFloat(o.origQty || '0');
  if (isMarket(o) && (!Number.isFinite(base) || base === 0)) {
    return numberFmt.format(parseFloat(o.executedQty || '0'));
  }
  return numberFmt.format(base);
};

const OrdersPanel: React.FC<OrdersPanelProps> = () => {
  const [tab, setTab] = useState<string>('open');
  const [filterSymbol, setFilterSymbol] = useState<string | null>(null); // null = ALL (lazy)
  const [autoDefaultApplied, setAutoDefaultApplied] = useState(false);
  const { state: userState, sendResnapshot, addOptimisticCancel } = useUserStream();
  const [historyItems, setHistoryItems] = useState<OrderResponse[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingOpen, setLoadingOpen] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorMore, setErrorMore] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  // Finalne statusy do deduplikacji
  const FINAL_STATUSES = ['FILLED','CANCELED','REJECTED','EXPIRED'];

  const { assets } = useAssets();
  // Stabilizuj listę symboli – zmieniaj tylko gdy faktycznie lista (a nie ceny) się zmieni
  const symbols = useMemo(() => {
    const set = Array.from(new Set(assets.map(a => a.symbol)));
    set.sort();
    return set;
  }, [assets.map(a => a.symbol).join(',')]);
  const filterOptions = useMemo(() => (
    [{ value: 'ALL', label: 'Wszystkie' }, ...symbols.map(s => ({ value: s, label: s }))]
  ), [symbols]);

  // Auto-default do pierwszego symbolu gdy user przechodzi na tab historia
  useEffect(() => {
    if (tab === 'history' && !autoDefaultApplied && symbols.length > 0 && !filterSymbol) {
      setFilterSymbol(symbols[0]);
      setAutoDefaultApplied(true);
    }
  }, [tab, symbols, filterSymbol, autoDefaultApplied]);

  // Pobierz otwarte zlecenia dla wszystkich (API bez parametru zwraca wszystkie dla konta)
  // open orders pobieramy z user stream state
  const openOrders: OrderResponse[] = useMemo(() => {
    const arr = Object.values(userState.openOrders || {});
      return arr.map(o => ({
        orderId: o.orderId,
        orderListId: (o as any).orderListId,
        clientOrderId: o.clientOrderId || '',
        symbol: o.symbol,
        side: o.side,
        type: o.type || '',
        price: o.price || '0',
        origQty: o.origQty || '0',
        executedQty: o.executedQty || '0',
        cummulativeQuoteQty: o.cummulativeQuoteQty || '0',
        status: o.status,
        timeInForce: o.timeInForce || '',
        time: o.updateTime || Date.now(),
        updateTime: o.updateTime || Date.now(),
        origQuoteOrderQty: (o as any).origQuoteOrderQty,
        stopPrice: (o as any).stopPrice,
        icebergQty: (o as any).icebergQty,
        isWorking: (o as any).isWorking,
      }));
  }, [userState.openOrders]);

  // Pobierz historię dla wszystkich symboli sekwencyjnie (lub równolegle Promise.all)
  // Pobierz pierwszą stronę historii
  const loadHistoryForSymbol = useCallback(async (symbol: string) => {
    setLoadingHistory(true); setError(null);
    try {
      const res = await getOrdersHistory(symbol, 50); // pierwsza strona
      const list = res?.orders || [];
      // Dedup: orderId + finalStatus
      const dedupMap = new Map<string, OrderResponse>();
      list.forEach(o => {
        const key = `${o.orderId}:${FINAL_STATUSES.includes(o.status) ? o.status : ''}`;
        if (!dedupMap.has(key)) dedupMap.set(key, o);
      });
  const deduped = Array.from(dedupMap.values());
  deduped.sort((a, b) => (b.updateTime ?? b.time ?? 0) - (a.updateTime ?? a.time ?? 0));
      setHistoryItems(deduped);
      // Preferuj nextCursor/hasMore z backendu jeśli dostępne
      setNextCursor((res && typeof res.nextCursor !== 'undefined') ? (res.nextCursor as number | null) : (deduped.length > 0 ? deduped[deduped.length-1].orderId : null));
      setHasMore((res && typeof res.hasMore === 'boolean') ? !!res.hasMore : (list.length === 50));
      setLastRefresh(new Date());
    } catch (e) {
      setError('Błąd podczas pobierania historii zleceń');
    } finally { setLoadingHistory(false); }
  }, []);

  // Pobierz kolejną porcję historii (paginacja)
  const fetchMoreHistory = useCallback(async () => {
    if (loadingMore || !hasMore || !filterSymbol) return;
    setLoadingMore(true); setErrorMore(null);
    try {
      const res = await getOrdersHistory(filterSymbol, 50, nextCursor || undefined);
      const list = res?.orders || [];
      // Dedup: orderId + finalStatus
      const dedupMap = new Map<string, OrderResponse>();
      [...historyItems, ...list].forEach(o => {
        const key = `${o.orderId}:${FINAL_STATUSES.includes(o.status) ? o.status : ''}`;
        if (!dedupMap.has(key)) dedupMap.set(key, o);
      });
  const deduped = Array.from(dedupMap.values());
  deduped.sort((a, b) => (b.updateTime ?? b.time ?? 0) - (a.updateTime ?? a.time ?? 0));
      setHistoryItems(deduped);
      // Preferuj nextCursor/hasMore z backendu jeśli dostępne
      setNextCursor((res && typeof res.nextCursor !== 'undefined') ? (res.nextCursor as number | null) : (list.length > 0 ? list[list.length-1].orderId : nextCursor));
      setHasMore((res && typeof res.hasMore === 'boolean') ? !!res.hasMore : (list.length === 50));
    } catch (e) {
      setErrorMore('Błąd podczas ładowania starszych zleceń');
    } finally { setLoadingMore(false); }
  }, [loadingMore, hasMore, filterSymbol, nextCursor, historyItems]);

  // Oddzielne efekty aby zmiana symboli (przez tickery) nie wywoływała ponownie loadOpen
  useEffect(() => {
    if (tab === 'open') {
      setLoadingOpen(false);
      setLastRefresh(new Date());
    }
  }, [tab, userState.openOrders]);

  useEffect(() => {
    if (tab === 'history') {
      if (filterSymbol && filterSymbol !== 'ALL') {
        loadHistoryForSymbol(filterSymbol);
      } else {
        setHistoryItems([]);
        setNextCursor(null);
        setHasMore(false);
      }
    }
  }, [tab, filterSymbol, loadHistoryForSymbol]);

  // Disable legacy polling (interval removed)

  const handleManualRefresh = (() => {
    let last = 0;
    return () => {
      const now = Date.now();
      if (now - last < 5000) return; // throttle resnapshot to 5s (Phase 7 requirement)
      last = now;
      sendResnapshot();
    };
  })();

  const handleCancel = async (order: OrderResponse) => {
    setCancellingId(order.orderId);
    setError(null);
    
    try {
      // Optymistyczne oznaczenie jako CANCELED
      addOptimisticCancel(order.orderId, 10000); // 10s timeout dla rollback
      
      const resp = await cancelOrder(order.orderId, order.symbol);
      if (resp?.error) {
        setError(resp.error);
        // Uwaga: Rollback zostanie wykonany automatycznie po timeout jeśli nie przyjdzie delta
      }
    } catch (e) {
      setError('Błąd anulowania zlecenia');
      // Uwaga: Rollback zostanie wykonany automatycznie po timeout jeśli nie przyjdzie delta
    } finally { 
      setCancellingId(null); 
    }
  };

  const applyFilter = (orders: OrderResponse[]) => {
    if (!filterSymbol || filterSymbol === 'ALL') return orders; // open orders może być filtrowane globalnie
    return orders.filter(o => o.symbol === filterSymbol);
  };

  const renderRows = (orders: OrderResponse[], showStatus: boolean, allowCancel: boolean) => {
    const filtered = applyFilter(orders);
    if (!filtered.length) {
      return (
        <Table.Tr>
          <Table.Td colSpan={allowCancel ? 9 : showStatus ? 8 : 7}>
            <Text ta="center" c="dimmed">Brak zleceń</Text>
          </Table.Td>
        </Table.Tr>
      );
    }
    return filtered.map(o => (
      <Table.Tr key={`${o.symbol}-${o.orderId}-${FINAL_STATUSES.includes(o.status) ? o.status : ''}`}>
        <Table.Td>{o.symbol}</Table.Td>
        <Table.Td>{o.type}</Table.Td>
        <Table.Td c={o.side === 'BUY' ? 'teal' : 'red'} fw={500}>{o.side}</Table.Td>
  <Table.Td ta="right" ff="monospace">{priceToDisplay(o)}</Table.Td>
  <Table.Td ta="right" ff="monospace">{qtyToDisplay(o)}</Table.Td>
        <Table.Td ta="right" ff="monospace">{numberFmt.format(parseFloat(o.executedQty || '0'))}</Table.Td>
        {showStatus && (
          <Table.Td>
            <Badge color={statusColorMap[o.status] || 'gray'} variant="light" size="sm">{o.status}</Badge>
          </Table.Td>
        )}
  <Table.Td>{timeFmt(o.updateTime ?? o.time)}</Table.Td>
        {allowCancel && (
          <Table.Td>
            <Tooltip label="Anuluj zlecenie">
              <ActionIcon variant="subtle" color="red" size="sm" onClick={() => handleCancel(o)} loading={cancellingId === o.orderId}>
                <IconX size={14} />
              </ActionIcon>
            </Tooltip>
          </Table.Td>
        )}
      </Table.Tr>
    ));
  };

  const filterLabel = filterSymbol && filterSymbol !== 'ALL' ? ` (filtr: ${filterSymbol})` : '';

  return (
    <Stack p="md" gap="md">
      <Group justify="space-between" align="center">
        <Title order={2}>Zarządzanie Zleceniami</Title>
        <Group gap="xs">
          <Select
            data={filterOptions}
            value={filterSymbol || 'ALL'}
            onChange={v => setFilterSymbol(v === 'ALL' ? null : v)}
            placeholder="Filtr Symbolu"
            searchable
            w={200}
            label="Filtr Symbolu"
            data-testid="filter-select"
          />
          <Tooltip label="Odśwież">
            <ActionIcon variant="light" onClick={handleManualRefresh}>
              <IconReload size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      {error && (
        <Alert color="red" variant="light" withCloseButton onClose={() => setError(null)} title="Błąd">
          {error}
        </Alert>
      )}

      <Tabs value={tab} onChange={(v) => setTab(v || 'open')} keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="open">Otwarte Zlecenia</Tabs.Tab>
          <Tabs.Tab value="history">Historia Zleceń</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="open" pt="md">
          <Paper withBorder p="sm">
            <Group justify="space-between" mb="sm">
              <Group gap={6}>
                <Title order={4}>Otwarte Zlecenia{filterLabel}</Title>
                {loadingOpen && <Loader size="sm" />}
              </Group>
               {lastRefresh && (
                 <FreshnessBadge 
                   freshnessMs={userState.freshnessMs ?? 0}
                   fallback={userState.fallback === true}
                 />
               )}
            </Group>
            <OptimizedScrollArea 
              h={360} 
              type="auto"
              optimizeForFrequentUpdates={true}
            >
              <Table striped highlightOnHover withTableBorder withColumnBorders>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Symbol</Table.Th>
                    <Table.Th>Typ</Table.Th>
                    <Table.Th>Strona</Table.Th>
                    <Table.Th ta="right">Cena</Table.Th>
                    <Table.Th ta="right">Ilość</Table.Th>
                    <Table.Th ta="right">Wykonano</Table.Th>
                    <Table.Th>Czas</Table.Th>
                    <Table.Th>Akcje</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {loadingOpen ? (
                    <Table.Tr><Table.Td colSpan={8}><Group justify="center"><Loader /></Group></Table.Td></Table.Tr>
                  ) : (
                    renderRows(openOrders, false, true)
                  )}
                </Table.Tbody>
              </Table>
            </OptimizedScrollArea>
          </Paper>
        </Tabs.Panel>

        <Tabs.Panel value="history" pt="md">
          <Paper withBorder p="sm">
            <Group justify="space-between" mb="sm">
              <Group gap={6}>
                <Title order={4}>Historia Zleceń{filterLabel}</Title>
                {loadingHistory && <Loader size="sm" />}
              </Group>
              {lastRefresh && historyItems.length > 0 && <Text size="xs" c="dimmed">Odświeżono: {lastRefresh.toLocaleTimeString()}</Text>}
            </Group>
            <OptimizedScrollArea 
              h={360} 
              type="auto"
              optimizeForLongLists={true}
            >
              <Table striped highlightOnHover withTableBorder withColumnBorders>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Symbol</Table.Th>
                    <Table.Th>Typ</Table.Th>
                    <Table.Th>Strona</Table.Th>
                    <Table.Th ta="right">Cena</Table.Th>
                    <Table.Th ta="right">Ilość</Table.Th>
                    <Table.Th ta="right">Wykonano</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th>Czas</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {filterSymbol === null || filterSymbol === 'ALL' ? (
                    <Table.Tr>
                      <Table.Td colSpan={8}>
                        <Stack align="center" gap="sm" p="xl">
                          <Text ta="center" c="dimmed" size="lg">
                            📊 Wybierz symbol aby załadować historię zleceń
                          </Text>
                          <Text ta="center" c="dimmed" size="sm">
                            API Binance wymaga symbolu do pobrania historii. Wybierz parę handlową z listy powyżej.
                          </Text>
                          {symbols.length > 0 && (
                            <Group>
                              <Text size="sm" c="dimmed">Popularne pary:</Text>
                              {symbols.slice(0, 3).map(symbol => (
                                <Badge
                                  key={symbol}
                                  variant="light"
                                  style={{ cursor: 'pointer' }}
                                  onClick={() => setFilterSymbol(symbol)}
                                >
                                  {symbol}
                                </Badge>
                              ))}
                            </Group>
                          )}
                        </Stack>
                      </Table.Td>
                    </Table.Tr>
                  ) : loadingHistory ? (
                    <Table.Tr><Table.Td colSpan={8}><Group justify="center"><Loader /></Group></Table.Td></Table.Tr>
                  ) : (
                    renderRows(historyItems, true, false)
                  )}
                </Table.Tbody>
              </Table>
            </OptimizedScrollArea>
            {/* Przycisk "Załaduj więcej" */}
            {filterSymbol && filterSymbol !== 'ALL' && historyItems.length > 0 && hasMore && (
              <Group justify="center" mt="md">
                <button
                  disabled={loadingMore || !hasMore}
                  style={{ padding: '8px 24px', borderRadius: 6, background: '#eee', cursor: loadingMore || !hasMore ? 'not-allowed' : 'pointer', fontWeight: 500 }}
                  onClick={fetchMoreHistory}
                >
                  {loadingMore ? 'Ładowanie...' : 'Załaduj więcej'}
                </button>
              </Group>
            )}
            {errorMore && (
              <Group justify="center" mt="xs"><Text c="red" size="sm">{errorMore}</Text></Group>
            )}
          </Paper>
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
};

export default OrdersPanel;
