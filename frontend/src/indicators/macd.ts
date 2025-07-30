import type { CandleData, MACDValue, MACDConfig } from './types';
import { calculateEMA } from './movingAverage';

/**
 * Calculate MACD (Moving Average Convergence Divergence)
 * @param data Array of candle data
 * @param config MACD configuration
 * @returns Array of MACD values
 */
export function calculateMACD(data: CandleData[], config: MACDConfig): MACDValue[] {
  const { fastPeriod, slowPeriod, signalPeriod } = config;
  const result: MACDValue[] = [];
  
  if (data.length < slowPeriod + signalPeriod) {
    return result;
  }

  // Calculate fast and slow EMAs
  const fastEMA = calculateEMA(data, { period: fastPeriod, type: 'EMA' });
  const slowEMA = calculateEMA(data, { period: slowPeriod, type: 'EMA' });

  // Calculate MACD line (fast EMA - slow EMA)
  const macdLine: { time: number; value: number }[] = [];
  const startIndex = slowPeriod - fastPeriod;

  for (let i = startIndex; i < fastEMA.length; i++) {
    const slowIndex = i - startIndex;
    if (slowIndex < slowEMA.length) {
      macdLine.push({
        time: fastEMA[i].time,
        value: fastEMA[i].value - slowEMA[slowIndex].value
      });
    }
  }

  // Calculate signal line (EMA of MACD line)
  if (macdLine.length < signalPeriod) {
    return result;
  }

  const multiplier = 2 / (signalPeriod + 1);
  
  // First signal value is SMA of MACD
  let sum = 0;
  for (let i = 0; i < signalPeriod; i++) {
    sum += macdLine[i].value;
  }
  let signal = sum / signalPeriod;

  // Add first MACD result
  result.push({
    time: macdLine[signalPeriod - 1].time,
    macd: macdLine[signalPeriod - 1].value,
    signal: signal,
    histogram: macdLine[signalPeriod - 1].value - signal
  });

  // Calculate subsequent signal values and results
  for (let i = signalPeriod; i < macdLine.length; i++) {
    signal = (macdLine[i].value * multiplier) + (signal * (1 - multiplier));
    
    result.push({
      time: macdLine[i].time,
      macd: macdLine[i].value,
      signal: signal,
      histogram: macdLine[i].value - signal
    });
  }

  return result;
}
