import type { CandleData, MovingAverageValue, MovingAverageConfig } from './types';

/**
 * Calculate Simple Moving Average (SMA)
 * @param data Array of candle data
 * @param config Moving average configuration
 * @returns Array of SMA values
 */
export function calculateSMA(data: CandleData[], config: MovingAverageConfig): MovingAverageValue[] {
  const { period } = config;
  const result: MovingAverageValue[] = [];
  
  if (data.length < period) {
    return result;
  }

  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sum += data[j].close;
    }
    
    result.push({
      time: data[i].time,
      value: sum / period
    });
  }

  return result;
}

/**
 * Calculate Exponential Moving Average (EMA)
 * @param data Array of candle data
 * @param config Moving average configuration
 * @returns Array of EMA values
 */
export function calculateEMA(data: CandleData[], config: MovingAverageConfig): MovingAverageValue[] {
  const { period } = config;
  const result: MovingAverageValue[] = [];
  
  if (data.length < period) {
    return result;
  }

  const multiplier = 2 / (period + 1);

  // First EMA value is SMA
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += data[i].close;
  }
  let ema = sum / period;
  
  result.push({
    time: data[period - 1].time,
    value: ema
  });

  // Calculate subsequent EMA values
  for (let i = period; i < data.length; i++) {
    ema = (data[i].close * multiplier) + (ema * (1 - multiplier));
    result.push({
      time: data[i].time,
      value: ema
    });
  }

  return result;
}

/**
 * Calculate Moving Average based on type
 * @param data Array of candle data
 * @param config Moving average configuration
 * @returns Array of MA values
 */
export function calculateMovingAverage(data: CandleData[], config: MovingAverageConfig): MovingAverageValue[] {
  switch (config.type) {
    case 'SMA':
      return calculateSMA(data, config);
    case 'EMA':
      return calculateEMA(data, config);
    default:
      return calculateSMA(data, config);
  }
}
