// Export all indicator functions and types
export * from './types';
export * from './rsi';
export * from './movingAverage';
export * from './macd';
export * from './bollingerBands';

// Default configurations for indicators
export const DEFAULT_RSI_CONFIG = {
  period: 14,
  overbought: 70,
  oversold: 30
};

export const DEFAULT_MACD_CONFIG = {
  fastPeriod: 12,
  slowPeriod: 26,
  signalPeriod: 9
};

export const DEFAULT_BOLLINGER_BANDS_CONFIG = {
  period: 20,
  multiplier: 2
};

export const DEFAULT_MA_CONFIG = {
  period: 20,
  type: 'SMA' as const
};
