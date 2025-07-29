// Typy dla Portfolio/Balance table component

export interface PortfolioBalance {
  asset: string;
  free: number;
  locked: number;
  total: number;
  currentPrice?: number;  // aktualna cena w USDT
  priceChange24h?: number; // zmiana % 24h
  valueUSD?: number;      // wartość USD
  valueChange24h?: number; // zmiana wartości USD 24h
}

export interface PortfolioTableProps {
  balances: PortfolioBalance[];
  loading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
  hideZeroBalances?: boolean;
  onHideZeroBalancesChange?: (hide: boolean) => void;
}

// Helper functions for portfolio calculations
export const calculateTotalPortfolioValue = (balances: PortfolioBalance[]): number => {
  return balances.reduce((total, balance) => total + (balance.valueUSD || 0), 0);
};

export const calculatePortfolioChange24h = (balances: PortfolioBalance[]): number => {
  const totalCurrent = calculateTotalPortfolioValue(balances);
  const totalPrevious = balances.reduce((total, balance) => {
    const previousValue = (balance.valueUSD || 0) - (balance.valueChange24h || 0);
    return total + previousValue;
  }, 0);
  
  if (totalPrevious === 0) return 0;
  return ((totalCurrent - totalPrevious) / totalPrevious) * 100;
};

export const formatCurrency = (value: number, currency: string = 'USD'): string => {
  return new Intl.NumberFormat('pl-PL', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

export const formatCrypto = (value: number, precision: number = 8): string => {
  if (value === 0) return '0';
  if (value < 0.00000001) return '<0.00000001';
  return value.toFixed(precision).replace(/\.?0+$/, '');
};
