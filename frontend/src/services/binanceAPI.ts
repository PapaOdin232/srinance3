// Direct Binance REST API client for historical data
// This bypasses the backend and connects directly to Binance public API

import axios from 'axios';

// Binance API base URL (public, no authentication required for market data)
const BINANCE_API_BASE = 'https://api.binance.com/api/v3';

export interface BinanceKlineData {
  openTime: number;        // Open time (timestamp in milliseconds)
  open: string;           // Open price
  high: string;           // High price
  low: string;            // Low price
  close: string;          // Close price
  volume: string;         // Volume
  closeTime: number;      // Close time (timestamp in milliseconds)
  quoteAssetVolume: string;
  numberOfTrades: number;
  takerBuyBaseAssetVolume: string;
  takerBuyQuoteAssetVolume: string;
}

// Raw response from Binance API (array format)
export type BinanceKlineRaw = [
  number,  // Open time
  string,  // Open price
  string,  // High price
  string,  // Low price
  string,  // Close price
  string,  // Volume
  number,  // Close time
  string,  // Quote asset volume
  number,  // Number of trades
  string,  // Taker buy base asset volume
  string   // Taker buy quote asset volume
];

// Lightweight-charts compatible format
export interface LightweightChartsKline {
  time: number;  // Unix timestamp in seconds (as Time type for lightweight-charts)
  open: number;
  high: number;
  low: number;
  close: number;
}

/**
 * Fetch historical klines directly from Binance API
 * @param symbol Trading pair symbol (e.g., 'BTCUSDT')
 * @param interval Kline interval (e.g., '1m', '5m', '1h', '1d')
 * @param limit Number of klines to retrieve (max 1000, default 100)
 * @returns Promise with klines data
 */
export async function fetchBinanceKlines(
  symbol: string, 
  interval: string = '1m', 
  limit: number = 100
): Promise<BinanceKlineData[]> {
  try {
    console.log(`[BinanceAPI] Fetching ${limit} klines for ${symbol} (${interval})`);
    
    const response = await axios.get<BinanceKlineRaw[]>(`${BINANCE_API_BASE}/klines`, {
      params: {
        symbol: symbol.toUpperCase(),
        interval,
        limit: Math.min(limit, 1000) // Binance API limit
      },
      timeout: 10000
    });

    const klines: BinanceKlineData[] = response.data.map(raw => ({
      openTime: raw[0],
      open: raw[1],
      high: raw[2],
      low: raw[3],
      close: raw[4],
      volume: raw[5],
      closeTime: raw[6],
      quoteAssetVolume: raw[7],
      numberOfTrades: raw[8],
      takerBuyBaseAssetVolume: raw[9],
      takerBuyQuoteAssetVolume: raw[10]
    }));

    console.log(`[BinanceAPI] Successfully fetched ${klines.length} klines`);
    return klines;

  } catch (error) {
    console.error('[BinanceAPI] Failed to fetch klines:', error);
    throw new Error(`Failed to fetch klines for ${symbol}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Convert Binance klines to lightweight-charts format
 * @param klines Array of Binance kline data
 * @returns Array in lightweight-charts candlestick format
 */
export function convertToLightweightChartsFormat(klines: BinanceKlineData[]): LightweightChartsKline[] {
  return klines.map(kline => ({
    time: Math.floor(kline.openTime / 1000), // Convert milliseconds to seconds
    open: parseFloat(kline.open),
    high: parseFloat(kline.high),
    low: parseFloat(kline.low),
    close: parseFloat(kline.close)
  }));
}

/**
 * Fetch klines and convert to lightweight-charts format in one step
 * @param symbol Trading pair symbol
 * @param interval Kline interval
 * @param limit Number of klines
 * @returns Promise with lightweight-charts compatible data
 */
export async function fetchLightweightChartsKlines(
  symbol: string,
  interval: string = '1m',
  limit: number = 100
): Promise<LightweightChartsKline[]> {
  const klines = await fetchBinanceKlines(symbol, interval, limit);
  return convertToLightweightChartsFormat(klines);
}

export default {
  fetchBinanceKlines,
  convertToLightweightChartsFormat,
  fetchLightweightChartsKlines
};
