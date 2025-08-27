// types/trading.ts
export interface BinanceKlineData {
  e: string;
  E: number;
  s: string;
  k: {
    t: number; // kline start time
    T: number; // kline close time
    s: string;
    i: string;
    f: number;
    L: number;
    o: string; // open price
    c: string; // close price
    h: string; // high price
    l: string; // low price
    v: string; // volume
    n: number;
    x: boolean; // is kline closed
    q: string;
    V: string;
    Q: string;
    B: string;
  };
}

import type { CandlestickData as LWCandlestickData } from 'lightweight-charts';

export interface CandlestickData extends LWCandlestickData {
  volume?: number; // Add optional volume field for compatibility
}

export interface VolumeData {
  time: number;
  value: number;
}
