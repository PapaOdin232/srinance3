import React, { useState, useMemo, useEffect, memo } from 'react';
import {
  Text,
  Table,
  Paper,
  Group,
  Loader,
  Badge,
  ActionIcon,
  Box,
  Switch,
  Button,
  Stack,
  Progress,
  Select,
  TextInput,
  Tabs,
  Tooltip,
} from '@mantine/core';
import { 
  getCoreRowModel, 
  flexRender, 
  createColumnHelper, 
  useReactTable,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  type SortingState,
  type ColumnFiltersState,
} from '@tanstack/react-table';
import { IconRefresh, IconSearch, IconSortAscending, IconSortDescending, IconEye, IconEyeOff } from '@tabler/icons-react';
import { PriceCell } from './shared';
import type { PortfolioBalance, PortfolioTableProps } from '../types/portfolio';
import { useDebounced } from '../hooks/useDebounced';
import { usePriceChangeAnimation } from '../hooks/usePriceChangeAnimation';
import { formatCurrency, formatCrypto } from '../types/portfolio';

const columnHelper = createColumnHelper<PortfolioBalance>();

const PortfolioTable: React.FC<PortfolioTableProps> = ({
  balances,
  loading = false,
  error = null,
  onRefresh,
  hideZeroBalances = true,
  onHideZeroBalancesChange,
}) => {
  // Stan dla sortowania, filtrowania i paginacji
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'valueUSD', desc: true } // Sortuj po wartości domyślnie
  ]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 10,
  });

  // Debounced search dla lepszej wydajności
  const debouncedGlobalFilter = useDebounced(globalFilter, 300);

  // Zakładki kategorii: ALL | CRYPTO | STABLE | FIAT
  type View = 'ALL' | 'CRYPTO' | 'STABLE' | 'FIAT';
  const [view, setView] = useState<View>('ALL');

  // Zbiory klasyfikacji
  const STABLECOINS = useMemo(() => new Set([
    'USDT','USDC','BUSD','TUSD','USDP','DAI','FDUSD','EURT','PYUSD','USDD','GUSD'
  ]), []);
  // Rozszerzona lista fiat (kody ISO + spotykane na Binance w saldach)
  const FIAT_ASSETS = useMemo(() => new Set([
    'USD','EUR','GBP','PLN','JPY','CNY','TRY','BRL','ARS','MXN','ZAR','UAH','RON','KZT','NGN',
    'CZK','CHF','SEK','NOK','DKK','HUF','AUD','NZD','CAD','HKD','SGD','COP','CLP','PEN','PHP',
    'IDR','INR','THB','VND','ILS','AED','SAR','QAR','KRW','MYR'
  ]), []);

  // Klasyfikacja balansów (dodajemy pole category)
  const classifiedBalances = useMemo(() => {
    if (!Array.isArray(balances)) return [] as (PortfolioBalance & { category: View })[];
    return balances.map(b => {
      const asset = (b.asset || '').toUpperCase();
      let category: View = 'CRYPTO';
      if (STABLECOINS.has(asset)) category = 'STABLE';
      else if (FIAT_ASSETS.has(asset)) category = 'FIAT';
      else {
        // Heurystyka: brak ceny + 3 litery + valueUSD 0 => prawdopodobnie fiat
        const noPrice = !b.currentPrice || b.currentPrice === 0;
        if (noPrice && asset.length === 3 && (b.valueUSD === 0 || b.valueUSD === undefined)) {
          category = 'FIAT';
        }
      }
      return { ...b, category };
    });
  }, [balances, STABLECOINS, FIAT_ASSETS]);
  
  // Hook do animacji zmian cen
  const priceChanges = usePriceChangeAnimation(
    Array.isArray(classifiedBalances) ? classifiedBalances.map(b => ({ symbol: b.asset, price: b.currentPrice || 0 })) : []
  );

  // Filter balances based on hideZeroBalances setting
  const filteredBalances = useMemo(() => {
    let list = classifiedBalances;
    if (hideZeroBalances) {
      list = list.filter(balance => balance.total > 0.00000001);
    }
    if (view !== 'ALL') {
      list = list.filter(b => b.category === view);
    }
    return list;
  }, [classifiedBalances, hideZeroBalances, view]);

  // Calculate total portfolio value for percentage calculations
  const totalPortfolioValue = useMemo(() => {
    return filteredBalances.reduce((sum, balance) => sum + (balance.valueUSD || 0), 0);
  }, [filteredBalances]);

  // Definicja kolumn dla tabeli
  const columns = useMemo(
    () => [
      columnHelper.accessor('asset', {
        header: 'Aktywo',
        cell: (info) => {
          const asset = info.getValue();
          const category = (info.row.original as any).category as View;
          const isFiat = category === 'FIAT';
          const isStable = category === 'STABLE';
          return (
            <Group gap="xs">
              <Text data-testid={`asset-${asset}`} fw={600} c={isFiat ? 'orange' : isStable ? 'teal' : 'blue'} size="sm">
                {asset}
              </Text>
              {isFiat && (
                <Tooltip label="Fiat – brak live wyceny" withArrow>
                  <Badge size="xs" color="gray" variant="light">FIAT</Badge>
                </Tooltip>
              )}
              {isStable && (
                <Tooltip label="Stablecoin" withArrow>
                  <Badge size="xs" color="teal" variant="light">STB</Badge>
                </Tooltip>
              )}
            </Group>
          );
        },
      }),
      columnHelper.accessor('free', {
        header: () => (
          <Tooltip label="Dostępne środki do handlu (nie zawiera zablokowanych w zleceniach)" withArrow>
            <Text component="span" style={{ textDecoration: 'underline dotted' }}>
              Dostępne
            </Text>
          </Tooltip>
        ),
        cell: (info) => (
          <Text ta="right" ff="monospace" size="sm" c="teal">
            {formatCrypto(info.getValue(), 8)}
          </Text>
        ),
      }),
      columnHelper.accessor('locked', {
        header: () => (
          <Tooltip label="Środki zablokowane w aktywnych zleceniach" withArrow>
            <Text component="span" style={{ textDecoration: 'underline dotted' }}>
              Zablokowane
            </Text>
          </Tooltip>
        ),
        cell: (info) => {
          const value = info.getValue();
          if (value === 0) {
            return <Text ta="right" ff="monospace" size="sm" c="dimmed">-</Text>;
          }
          return (
            <Text ta="right" ff="monospace" size="sm" c="orange">
              {formatCrypto(value, 8)}
            </Text>
          );
        },
      }),
      columnHelper.accessor('total', {
        header: () => (
          <Tooltip label="Łączne saldo (dostępne + zablokowane)" withArrow>
            <Text component="span" style={{ textDecoration: 'underline dotted' }}>
              Łącznie
            </Text>
          </Tooltip>
        ),
        cell: (info) => (
          <Text ta="right" ff="monospace" size="sm" fw={600}>
            {formatCrypto(info.getValue(), 8)}
          </Text>
        ),
      }),
      columnHelper.accessor('currentPrice', {
        header: 'Cena',
        cell: (info) => {
          const asset = info.row.original.asset;
          const change = priceChanges.get(asset);
          const price = info.getValue();
          
          if (!price || price === 0) {
            const cat = (info.row.original as any).category as View;
            return (
              <Tooltip label={cat === 'FIAT' ? 'Fiat – wycena niedostępna' : 'Brak danych ceny'} withArrow>
                <Text c="dimmed" size="sm">-</Text>
              </Tooltip>
            );
          }
          
          return (
            <PriceCell 
              price={price}
              change={change || undefined}
              isUSDT={asset === 'USDT'}
            />
          );
        },
  sortingFn: 'basic',
      }),
      columnHelper.accessor('valueUSD', {
        header: 'Wartość USD',
        cell: (info) => {
          const value = info.getValue();
          if (!value || value === 0) {
            return <Text c="dimmed" size="sm">$0.00</Text>;
          }
          return (
            <Text ta="right" ff="monospace" fw={500} size="sm">
              {formatCurrency(value, 'USD')}
            </Text>
          );
        },
  sortingFn: 'basic',
      }),
      // Kolumna udziału procentowego w portfelu – teraz sortowalna
      columnHelper.accessor(
        row => {
          const value = row.valueUSD || 0;
          if (totalPortfolioValue === 0) return 0;
            return (value / totalPortfolioValue) * 100;
        },
        {
          id: 'allocation',
          header: '%',
          enableSorting: true,
          // Funkcja sortująca – proste porównanie numeryczne
          sortingFn: 'basic',
          cell: (info) => {
            const percentage = info.getValue<number>() || 0;
            return (
              <Box style={{ minWidth: 60 }}>
                <Text size="xs" c="dimmed" mb={2}>
                  {percentage.toFixed(1)}%
                </Text>
                <Progress
                  value={percentage}
                  size="xs"
                  color={percentage > 10 ? 'blue' : percentage > 5 ? 'teal' : 'gray'}
                />
              </Box>
            );
          },
        }
      ),
    ],
    [priceChanges, totalPortfolioValue]
  );

  // Konfiguracja tabeli TanStack
  const baseGetSortedRowModel = getSortedRowModel();
  const table = useReactTable({
    data: filteredBalances,
    columns,
    state: {
      sorting,
      columnFilters,
      globalFilter: debouncedGlobalFilter,
      pagination,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: (value) => {
      setGlobalFilter(value as string);
      // Po zmianie wyszukiwarki przejdź na pierwszą stronę, żeby uniknąć pustego widoku
      setPagination(prev => ({ ...prev, pageIndex: 0 }));
    },
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: ((table: any) => {
      const sortedModel = baseGetSortedRowModel(table) as any;
      const sortingState = table.getState().sorting as any[];
      if (!sortingState.length) return sortedModel;
      const colId = sortingState[sortingState.length - 1].id;
  if (!['currentPrice','valueUSD','allocation','priceChange24h','valueChange24h'].includes(colId)) return sortedModel;
      const rows: any[] = sortedModel.rows || [];
      if (!rows.length) return sortedModel;
      const nonZero: any[] = [];
      const zeros: any[] = [];
      for (const r of rows) {
        const raw = r.getValue(colId);
        const v = typeof raw === 'number' ? raw : parseFloat(raw);
        if (!v) zeros.push(r); else nonZero.push(r);
      }
      sortedModel.rows = [...nonZero, ...zeros];
      return sortedModel;
    }) as any,
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    // Zapobiegnij skakaniu na pierwszą stronę przy każdej aktualizacji cen
    autoResetPageIndex: false,
    // Stabilne ID wiersza – aktywo jest unikalne
    getRowId: (row) => row.asset,
  debugTable: (typeof process !== 'undefined' && (process as any).env && (process as any).env.NODE_ENV === 'development') || false,
  });

  // Post-processing: przenieś wiersze z zerową wartością/ceną/udziałem na dół niezależnie od kierunku
  const displayRows = useMemo(() => {
    const sortingState = table.getState().sorting;
    if (!sortingState.length) return table.getRowModel().rows;
    const colId = sortingState[sortingState.length - 1].id;
    if (!['currentPrice','valueUSD','allocation','priceChange24h','valueChange24h'].includes(colId)) {
      return table.getRowModel().rows;
    }
    const rows = table.getRowModel().rows;
    const nonZero: typeof rows = [];
    const zeros: typeof rows = [];
    for (const r of rows) {
      const raw = r.getValue(colId) as any;
      const v = typeof raw === 'number' ? raw : parseFloat(raw);
      if (!v) zeros.push(r); else nonZero.push(r);
    }
    return [...nonZero, ...zeros];
  }, [table, table.getState().sorting, table.getRowModel()]);

  // Korekta pageIndex jeśli po zmianie liczby elementów wskazuje poza zakresem
  useEffect(() => {
    const pageCount = table.getPageCount();
    setPagination(prev => {
      if (prev.pageIndex > 0 && prev.pageIndex >= pageCount) {
        return { ...prev, pageIndex: Math.max(0, pageCount - 1) };
      }
      return prev;
    });
  }, [filteredBalances.length, pagination.pageSize, table]);

  if (loading) {
    return (
      <Paper p="md" withBorder>
        <Group justify="center">
          <Loader size="md" />
          <Text>Ładowanie portfolio...</Text>
        </Group>
      </Paper>
    );
  }

  if (error) {
    return (
      <Paper p="md" withBorder>
        <Group justify="center" c="red">
          <Text>Błąd: {error}</Text>
          {onRefresh && (
            <ActionIcon variant="outline" color="red" onClick={onRefresh}>
              <IconRefresh size={16} />
            </ActionIcon>
          )}
        </Group>
      </Paper>
    );
  }

  const filteredCount = table.getFilteredRowModel().rows.length;
  const totalCount = classifiedBalances.length;

  return (
    <Stack gap="md">
      {/* Kontrolki i statystyki */}
      <Paper p="md" withBorder>
        <Stack gap="sm">
          <Group justify="space-between">
            <Text size="lg" fw={600}>
              Portfolio Holdings
            </Text>
            <Group gap="xs">
              <Text size="sm" c="dimmed">
                {filteredCount} aktywów{(view !== 'ALL' || globalFilter) && ` (z ${totalCount})`}
              </Text>
              <Text size="sm" fw={500}>
                {formatCurrency(totalPortfolioValue)}
              </Text>
            </Group>
          </Group>

          <Tabs value={view} onChange={(v) => setView((v as View) || 'ALL')} keepMounted={false} variant="outline" radius="sm">
            <Tabs.List>
              <Tabs.Tab value="ALL">Wszystko</Tabs.Tab>
              <Tabs.Tab value="CRYPTO">Krypto</Tabs.Tab>
              <Tabs.Tab value="STABLE">Stablecoiny</Tabs.Tab>
              <Tabs.Tab value="FIAT">Fiat</Tabs.Tab>
            </Tabs.List>
          </Tabs>

          <Group justify="space-between">
      <TextInput
              placeholder="Szukaj aktywów (np. BTC, ETH...)"
              leftSection={<IconSearch size={16} />}
              value={globalFilter ?? ''}
              onChange={(event) => {
                const val = event.currentTarget.value;
                setGlobalFilter(val);
                // natychmiast przejdź na pierwszą stronę po zmianie frazy
                setPagination(prev => ({ ...prev, pageIndex: 0 }));
        // Przy wyszukiwaniu przechodzimy na ALL aby pokazać wszystkie dopasowania
        if (val && view !== 'ALL') setView('ALL');
              }}
              style={{ flexGrow: 1, maxWidth: 300 }}
            />
            
            <Group gap="md">
              <Select
                placeholder="Na stronie"
                data={[
                  { value: '10', label: '10' },
                  { value: '15', label: '15' },
                  { value: '25', label: '25' },
                  { value: '50', label: '50' },
                ]}
                value={pagination.pageSize.toString()}
                onChange={(value) =>
                  setPagination((prev) => ({
                    ...prev,
                    pageSize: parseInt(value || '10'),
                    pageIndex: 0,
                  }))
                }
                w={120}
              />
              <Switch
                checked={hideZeroBalances}
                onChange={(event) => onHideZeroBalancesChange?.(event.currentTarget.checked)}
                label="Ukryj zero balances"
                thumbIcon={hideZeroBalances ? <IconEyeOff size={12} /> : <IconEye size={12} />}
              />
              {onRefresh && (
                <Button
                  size="xs"
                  variant="outline"
                  leftSection={<IconRefresh size={14} />}
                  onClick={onRefresh}
                >
                  Odśwież
                </Button>
              )}
            </Group>
          </Group>
        </Stack>
      </Paper>

      {/* Tabela */}
      <Paper withBorder>
        <Table striped highlightOnHover>
          <Table.Thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <Table.Tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <Table.Th key={header.id}>
                    {header.isPlaceholder ? null : (
                      <Group gap="xs">
                        <Box
                          style={{ cursor: header.column.getCanSort() ? 'pointer' : 'default' }}
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                        </Box>
                        {header.column.getCanSort() && (
                          <ActionIcon
                            size="xs"
                            variant="transparent"
                            color="dimmed"
                          >
                            {header.column.getIsSorted() === 'asc' ? (
                              <IconSortAscending size={12} />
                            ) : header.column.getIsSorted() === 'desc' ? (
                              <IconSortDescending size={12} />
                            ) : null}
                          </ActionIcon>
                        )}
                      </Group>
                    )}
                  </Table.Th>
                ))}
              </Table.Tr>
            ))}
          </Table.Thead>
          <Table.Tbody>
            {table.getRowModel().rows.length === 0 ? (
              <Table.Tr>
                <Table.Td colSpan={columns.length}>
                  <Text ta="center" c="dimmed" py="xl">
                    Brak aktywów do wyświetlenia
                  </Text>
                </Table.Td>
              </Table.Tr>
            ) : (
              displayRows.map((row) => (
                <Table.Tr key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <Table.Td key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </Table.Td>
                  ))}
                </Table.Tr>
              ))
            )}
          </Table.Tbody>
        </Table>

        {/* Paginacja */}
        <Group justify="space-between" p="md">
          <Text size="sm" c="dimmed">
            Strona {table.getState().pagination.pageIndex + 1} z{' '}
            {table.getPageCount()} (
            {table.getFilteredRowModel().rows.length} aktywów)
          </Text>
          <Group gap="xs">
            <Button
              size="xs"
              variant="outline"
              disabled={!table.getCanPreviousPage()}
              onClick={() => table.previousPage()}
            >
              Poprzednia
            </Button>
            <Button
              size="xs"
              variant="outline"
              disabled={!table.getCanNextPage()}
              onClick={() => table.nextPage()}
            >
              Następna
            </Button>
          </Group>
        </Group>
      </Paper>
    </Stack>
  );
};

export default memo(PortfolioTable);
