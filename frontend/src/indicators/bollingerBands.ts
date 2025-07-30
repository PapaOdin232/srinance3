import type { CandleData, BollingerBandsValue, BollingerBandsConfig } from './types';
import { calculateSMA } from './movingAverage';

/**
 * Calculate Bollinger Bands
 * @param data Array of candle data
 * @param config Bollinger Bands configuration
 * @returns Array of Bollinger Bands values
 */
export function calculateBollingerBands(data: CandleData[], config: BollingerBandsConfig): BollingerBandsValue[] {
  const { period, multiplier } = config;
  const result: BollingerBandsValue[] = [];
  
  if (data.length < period) {
    return result;
  }

  // Calculate SMA (middle band)
  const smaValues = calculateSMA(data, { period, type: 'SMA' });

  for (let i = 0; i < smaValues.length; i++) {
    const dataIndex = i + period - 1;
    const sma = smaValues[i].value;

    // Calculate standard deviation
    let sumSquaredDiff = 0;
    for (let j = dataIndex - period + 1; j <= dataIndex; j++) {
      const diff = data[j].close - sma;
      sumSquaredDiff += diff * diff;
    }
    
    const variance = sumSquaredDiff / period;
    const standardDeviation = Math.sqrt(variance);

    // Calculate upper and lower bands
    const upperBand = sma + (multiplier * standardDeviation);
    const lowerBand = sma - (multiplier * standardDeviation);

    result.push({
      time: data[dataIndex].time,
      upper: upperBand,
      middle: sma,
      lower: lowerBand
    });
  }

  return result;
}
