import React, { useState, useMemo, memo, useEffect, useRef, useCallback } from 'react';
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
import { useAssets } from '../hooks/useAssets';

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
  // Filtr rynku (quote): ALL, USDT, BTC, ETH, BNB
  const [selectedMarket, setSelectedMarket] = useState<'ALL' | 'USDT' | 'BTC' | 'ETH' | 'BNB'>('USDT');

  // Skieruj subskrypcje WS na wybrany rynek (optymalizacja ruchu)
  const { setPreferredQuotes } = useAssets();
  useEffect(() => {
    if (selectedMarket === 'ALL') {
      setPreferredQuotes(null);
    } else {
      setPreferredQuotes([selectedMarket]);
    }
    // po zmianie rynku wróć na pierwszą stronę
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
  }, [selectedMarket]);

  // Debounced search dla lepszej wydajności
  const debouncedGlobalFilter = useDebounced(globalFilter, 300);
  
  // Hook do animacji zmian cen
  // Filtrowanie/grupowanie wg wybranego rynku
  const displayAssets = useMemo(() => {
    if (selectedMarket !== 'ALL') {
      return assets.filter(a => a.quoteAsset === selectedMarket);
    }
    // ALL: wybierz dla każdej monety jedną parę wg preferencji quote
    const preference = ['USDT', 'BTC', 'ETH', 'BNB'];
    const byBase = new Map<string, Asset>();
    for (const asset of assets) {
      const current = byBase.get(asset.baseAsset);
      if (!current) {
        byBase.set(asset.baseAsset, asset);
        continue;
      }
      const curRank = preference.indexOf(current.quoteAsset);
      const nextRank = preference.indexOf(asset.quoteAsset);
      const curScore = curRank === -1 ? Number.MAX_SAFE_INTEGER : curRank;
      const nextScore = nextRank === -1 ? Number.MAX_SAFE_INTEGER : nextRank;
      if (nextScore < curScore) byBase.set(asset.baseAsset, asset);
      // jeśli ten sam priorytet, wybierz większy wolumen
      else if (nextScore === curScore && asset.volume > current.volume) byBase.set(asset.baseAsset, asset);
    }
    return Array.from(byBase.values());
  }, [assets, selectedMarket]);

  // Hook do animacji zmian cen bazujący na faktycznie renderowanych wierszach
  const priceChanges = usePriceChangeAnimation(displayAssets);

  // Debounce wybór aktywa, aby nie spamować subskrypcjami WS (wymóg: 250ms)
  const selectDebounceRef = useRef<number | null>(null);
  const handleAssetSelectDebounced = useCallback((asset: Asset) => {
    if (selectDebounceRef.current) {
      clearTimeout(selectDebounceRef.current);
      selectDebounceRef.current = null;
    }
    selectDebounceRef.current = window.setTimeout(() => {
      onAssetSelect(asset);
    }, 250);
  }, [onAssetSelect]);

  // Definicja kolumn dla tabeli
  const columns = useMemo(
    () => [
      columnHelper.accessor('baseAsset', {
        header: 'Krypto',
        cell: (info) => {
          const base = info.getValue();
          const quote = info.row.original.quoteAsset;
          return (
            <Group gap={6} wrap="nowrap">
              <Text fw={600} c="blue">{base}</Text>
              {selectedMarket === 'ALL' && (
                <Badge variant="light" size="xs" color="gray">{quote}</Badge>
              )}
            </Group>
          );
        },
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
        cell: (info) => {
          const v = info.getValue();
          let display: string;
          if (v === 0) display = '0';
          else if (v >= 1_000_000_000) display = (v / 1_000_000_000).toFixed(2) + 'B';
          else if (v >= 1_000_000) display = (v / 1_000_000).toFixed(2) + 'M';
          else if (v >= 10_000) display = (v / 1_000).toFixed(2) + 'K';
          else if (v >= 1) display = v.toFixed(2);
          else if (v >= 0.01) display = v.toFixed(4); // małe ale czytelne
          else display = v.toExponential(2);
          return (
            <Text ta="right" ff="monospace" size="sm">
              {display}
            </Text>
          );
        },
      }),
      columnHelper.display({
        id: 'actions',
        header: 'Akcje',
        cell: (info) => (
          <Button
            size="xs"
            variant={selectedAsset === info.row.original.symbol ? 'filled' : 'outline'}
            onClick={() => handleAssetSelectDebounced(info.row.original)}
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
    data: displayAssets,
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
    // Ważne: nie resetuj paginacji przy każdej zmianie danych (np. update tickera)
    autoResetPageIndex: false,
  debugTable: (typeof process !== 'undefined' && (process as any).env && (process as any).env.NODE_ENV === 'development') || false,
  });

  // Zabezpieczenie: jeśli po filtracji/zmianie pageSize obecny pageIndex wykracza poza zakres, zawęź go
  useEffect(() => {
    const pageCount = table.getPageCount();
    if (pageCount === 0 && pagination.pageIndex !== 0) {
      setPagination((prev) => ({ ...prev, pageIndex: 0 }));
      return;
    }
    if (pageCount > 0 && pagination.pageIndex > pageCount - 1) {
      setPagination((prev) => ({ ...prev, pageIndex: pageCount - 1 }));
    }
  }, [displayAssets.length, debouncedGlobalFilter, pagination.pageSize, sorting, table, pagination.pageIndex]);

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
                Widoczne: {table.getFilteredRowModel().rows.length} / {assets.length} aktywów {selectedMarket !== 'ALL' ? `(rynek ${selectedMarket})` : ``}
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
              placeholder="Rynek"
              data={[
                { value: 'ALL', label: 'Wszystkie rynki' },
                { value: 'USDT', label: 'Rynek USDT' },
                { value: 'BNB', label: 'Rynki BNB' },
                { value: 'BTC', label: 'Rynki BTC' },
                { value: 'ETH', label: 'Rynki ETH' },
              ]}
              value={selectedMarket}
              onChange={(value) => setSelectedMarket((value as any) ?? 'ALL')}
              w={160}
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

export default memo(AssetSelector);
