import React, { useState, useMemo } from 'react';
import {
  Table,
  TextInput,
  Paper,
  Group,
  Text,
  Loader,
  Badge,
  ActionIcon,
  Box,
  Select,
  Button,
  Stack
} from '@mantine/core';
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable, getSortedRowModel, getFilteredRowModel, getPaginationRowModel, type SortingState, type ColumnFiltersState } from '@tanstack/react-table';
import { IconSearch, IconRefresh, IconSortAscending, IconSortDescending } from '@tabler/icons-react';
import { PriceCell } from './shared';
import type { Asset, AssetSelectorProps } from '../types/asset';
import { useDebounced } from '../hooks/useDebounced';
import { usePriceChangeAnimation } from '../hooks/usePriceChangeAnimation';

const columnHelper = createColumnHelper<Asset>();

const AssetSelector: React.FC<AssetSelectorProps> = ({
  selectedAsset,
  onAssetSelect,
  assets,
  loading = false,
  error = null,
}) => {
  // Stan dla sortowania, filtrowania, paginacji
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 10,
  });

  // Debounced search dla lepszej wydajności
  const debouncedGlobalFilter = useDebounced(globalFilter, 300);
  
  // Hook do animacji zmian cen
  const priceChanges = usePriceChangeAnimation(assets);

  // Definicja kolumn dla tabeli
  const columns = useMemo(
    () => [
      columnHelper.accessor('symbol', {
        header: 'Para',
        cell: (info) => (
          <Text fw={600} c="blue">
            {info.getValue()}
          </Text>
        ),
      }),
      columnHelper.accessor('price', {
        header: 'Cena',
        cell: (info) => {
          const symbol = info.row.original.symbol;
          const change = priceChanges.get(symbol);
          const price = info.getValue();
          
          return (
            <PriceCell 
              price={price}
              change={change || undefined}
            />
          );
        },
      }),
      columnHelper.accessor('priceChangePercent', {
        header: '24h %',
        cell: (info) => {
          const value = info.getValue();
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
      columnHelper.accessor('volume', {
        header: 'Wolumen 24h',
        cell: (info) => (
          <Text ta="right" ff="monospace" size="sm">
            {(info.getValue() / 1000000).toFixed(1)}M
          </Text>
        ),
      }),
      columnHelper.display({
        id: 'actions',
        header: 'Akcje',
        cell: (info) => (
          <Button
            size="xs"
            variant={selectedAsset === info.row.original.symbol ? 'filled' : 'outline'}
            onClick={() => onAssetSelect(info.row.original)}
          >
            {selectedAsset === info.row.original.symbol ? 'Wybrano' : 'Wybierz'}
          </Button>
        ),
      }),
    ],
    [selectedAsset, onAssetSelect]
  );

  // Konfiguracja tabeli TanStack
  const table = useReactTable({
    data: assets,
    columns,
    state: {
      sorting,
      columnFilters,
      globalFilter: debouncedGlobalFilter, // Use debounced value
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
    debugTable: import.meta.env.MODE === 'development',
  });

  if (loading) {
    return (
      <Paper p="md" withBorder>
        <Group justify="center">
          <Loader size="md" />
          <Text>Ładowanie aktywów...</Text>
        </Group>
      </Paper>
    );
  }

  if (error) {
    return (
      <Paper p="md" withBorder>
        <Group justify="center" c="red">
          <Text>Błąd: {error}</Text>
          <ActionIcon variant="outline" color="red">
            <IconRefresh size={16} />
          </ActionIcon>
        </Group>
      </Paper>
    );
  }

  return (
    <Stack gap="md">
      {/* Sekcja wyszukiwania i filtrów */}
      <Paper p="md" withBorder>
        <Stack gap="sm">
          <Group justify="space-between">
            <Text size="lg" fw={600}>
              Wybór aktywa
            </Text>
            <Group gap="xs">
              <Text size="sm" c="dimmed">
                Znaleziono: {table.getFilteredRowModel().rows.length} aktywów
              </Text>
            </Group>
          </Group>

          <Group>
            <TextInput
              placeholder="Szukaj par (np. BTC, ETH...)"
              leftSection={<IconSearch size={16} />}
              value={globalFilter ?? ''}
              onChange={(event) => setGlobalFilter(event.currentTarget.value)}
              style={{ flexGrow: 1 }}
            />
            <Select
              placeholder="Rozmiar strony"
              data={[
                { value: '5', label: '5' },
                { value: '10', label: '10' },
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
            {table.getRowModel().rows.map((row) => (
              <Table.Tr
                key={row.id}
                style={{
                  backgroundColor:
                    selectedAsset === row.original.symbol
                      ? 'var(--mantine-color-blue-light)'
                      : undefined,
                }}
              >
                {row.getVisibleCells().map((cell) => (
                  <Table.Td key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </Table.Td>
                ))}
              </Table.Tr>
            ))}
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

export default AssetSelector;
