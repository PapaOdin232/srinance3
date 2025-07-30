import type { CandleData, RSIValue, RSIConfig } from './types';

/**
 * Calculate RSI (Relative Strength Index)
 * @param data Array of candle data
 * @param config RSI configuration
 * @returns Array of RSI values
 */
export function calculateRSI(data: CandleData[], config: RSIConfig): RSIValue[] {
  const { period } = config;
  const result: RSIValue[] = [];
  
  if (data.length < period + 1) {
    return result;
  }

  let gains: number[] = [];
  let losses: number[] = [];

  // Calculate initial gains and losses
  for (let i = 1; i <= period; i++) {
    const change = data[i].close - data[i - 1].close;
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? Math.abs(change) : 0);
  }

  let avgGain = gains.reduce((sum, gain) => sum + gain, 0) / period;
  let avgLoss = losses.reduce((sum, loss) => sum + loss, 0) / period;

  // Calculate RSI for the first period
  let rs = avgGain / (avgLoss || 1);
  let rsi = 100 - (100 / (1 + rs));
  
  result.push({
    time: data[period].time,
    value: rsi
  });

  // Calculate subsequent RSI values using smoothed averages
  for (let i = period + 1; i < data.length; i++) {
    const change = data[i].close - data[i - 1].close;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;

    avgGain = ((avgGain * (period - 1)) + gain) / period;
    avgLoss = ((avgLoss * (period - 1)) + loss) / period;

    rs = avgGain / (avgLoss || 1);
    rsi = 100 - (100 / (1 + rs));

    result.push({
      time: data[i].time,
      value: rsi
    });
  }

  return result;
}
