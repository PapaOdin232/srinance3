// Types for technical indicators
export interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface IndicatorValue {
  time: number;
  value: number;
}

export interface RSIValue extends IndicatorValue {}

export interface MACDValue {
  time: number;
  macd: number;
  signal: number;
  histogram: number;
}

export interface BollingerBandsValue {
  time: number;
  upper: number;
  middle: number;
  lower: number;
}

export interface MovingAverageValue extends IndicatorValue {}

// Indicator configuration interfaces
export interface RSIConfig {
  period: number;
  overbought: number;
  oversold: number;
}

export interface MACDConfig {
  fastPeriod: number;
  slowPeriod: number;
  signalPeriod: number;
}

export interface BollingerBandsConfig {
  period: number;
  multiplier: number;
}

export interface MovingAverageConfig {
  period: number;
  type: 'SMA' | 'EMA';
}
