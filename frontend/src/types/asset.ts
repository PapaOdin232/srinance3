// Typy dla komponentu AssetSelector i danych o aktywach

export interface Asset {
  symbol: string; // np. "BTCUSDT"
  baseAsset: string; // np. "BTC"
  quoteAsset: string; // np. "USDT" 
  price: number;
  priceChange: number;
  priceChangePercent: number;
  volume: number;
  count: number; // liczba transakcji w 24h
  status: string; // "TRADING" | "BREAK" itp.
  // Dodatkowe pola które mogą być użyteczne
  highPrice?: number;
  lowPrice?: number;
  openPrice?: number;
  prevClosePrice?: number;
  weightedAvgPrice?: number;
  bidPrice?: number;
  askPrice?: number;
  bidQty?: number;
  askQty?: number;
}

export interface AssetSelectorProps {
  selectedAsset: string | null;
  onAssetSelect: (asset: Asset) => void;
  assets: Asset[];
  loading?: boolean;
  error?: string | null;
}

// Typy dla tabeli
export interface TableColumn {
  accessor: keyof Asset;
  title: string;
  sortable?: boolean;
  render?: (asset: Asset) => React.ReactNode;
}

// Typ dla filtru/wyszukiwania
export interface AssetFilter {
  search: string;
  minPrice?: number;
  maxPrice?: number;
  sortBy: keyof Asset;
  sortDirection: 'asc' | 'desc';
}
