import React, { useState, useMemo } from 'react';
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
  
  // Hook do animacji zmian cen
  const priceChanges = usePriceChangeAnimation(
    Array.isArray(balances) ? balances.map(b => ({ symbol: b.asset, price: b.currentPrice || 0 })) : []
  );

  // Filter balances based on hideZeroBalances setting
  const filteredBalances = useMemo(() => {
    if (!Array.isArray(balances)) return [];
    if (!hideZeroBalances) return balances;
    return balances.filter(balance => balance.total > 0.00000001);
  }, [balances, hideZeroBalances]);

  // Calculate total portfolio value for percentage calculations
  const totalPortfolioValue = useMemo(() => {
    return filteredBalances.reduce((sum, balance) => sum + (balance.valueUSD || 0), 0);
  }, [filteredBalances]);

  // Definicja kolumn dla tabeli
  const columns = useMemo(
    () => [
      columnHelper.accessor('asset', {
        header: 'Aktywo',
        cell: (info) => (
          <Group gap="xs">
            <Text fw={600} c="blue" size="sm">
              {info.getValue()}
            </Text>
          </Group>
        ),
      }),
      columnHelper.accessor('total', {
        header: 'Ilość',
        cell: (info) => (
          <Text ta="right" ff="monospace" size="sm">
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
            return <Text c="dimmed" size="sm">-</Text>;
          }
          
          return (
            <PriceCell 
              price={price}
              change={change || undefined}
              isUSDT={asset === 'USDT'}
            />
          );
        },
      }),
      columnHelper.accessor('priceChange24h', {
        header: '24h %',
        cell: (info) => {
          const value = info.getValue();
          if (value === undefined || value === 0) {
            return <Text c="dimmed" size="sm">-</Text>;
          }
          const isPositive = value >= 0;
          return (
            <Badge
              color={isPositive ? 'teal' : 'red'}
              variant="light"
              size="sm"
            >
              {isPositive ? '+' : ''}{value.toFixed(2)}%
            </Badge>
          );
        },
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
      }),
      columnHelper.display({
        id: 'allocation',
        header: '%',
        cell: (info) => {
          const value = info.row.original.valueUSD || 0;
          const percentage = totalPortfolioValue > 0 ? (value / totalPortfolioValue) * 100 : 0;
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
      }),
      columnHelper.accessor('valueChange24h', {
        header: 'Zmiana 24h',
        cell: (info) => {
          const value = info.getValue();
          if (value === undefined || Math.abs(value) < 0.01) {
            return <Text c="dimmed" size="sm">$0.00</Text>;
          }
          const isPositive = value >= 0;
          return (
            <Text 
              ta="right" 
              ff="monospace" 
              c={isPositive ? 'teal' : 'red'}
              fw={500}
              size="sm"
            >
              {isPositive ? '+' : ''}{formatCurrency(value, 'USD')}
            </Text>
          );
        },
      }),
    ],
    [priceChanges, totalPortfolioValue]
  );

  // Konfiguracja tabeli TanStack
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
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  debugTable: (typeof process !== 'undefined' && (process as any).env && (process as any).env.NODE_ENV === 'development') || false,
  });

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
                {filteredBalances.length} aktywów
              </Text>
              <Text size="sm" fw={500}>
                {formatCurrency(totalPortfolioValue)}
              </Text>
            </Group>
          </Group>

          <Group justify="space-between">
            <TextInput
              placeholder="Szukaj aktywów (np. BTC, ETH...)"
              leftSection={<IconSearch size={16} />}
              value={globalFilter ?? ''}
              onChange={(event) => setGlobalFilter(event.currentTarget.value)}
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
              table.getRowModel().rows.map((row) => (
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

export default PortfolioTable;
