import { calculateRSI } from '../../indicators/rsi';
import type { CandleData } from '../../indicators/types';

describe('RSI', () => {
  const mk = (vals: number[]): CandleData[] =>
    vals.map((v, i) => ({ time: i + 1, open: v, high: v, low: v, close: v }));

  it('returns empty if not enough data (period+1)', () => {
    expect(calculateRSI(mk([1, 2, 3]), { period: 5, overbought: 70, oversold: 30 })).toEqual([]);
  });

  it('computes RSI for a simple sequence', () => {
    // Increasing values should yield RSI > 50
    const data = mk([10, 11, 12, 13, 14, 13, 12, 13, 14, 15]);
    const res = calculateRSI(data, { period: 5, overbought: 70, oversold: 30 });
    expect(res.length).toBeGreaterThan(0);
    // First computed time corresponds to index=period
    expect(res[0].time).toBe(6);
    // Values should be between 0 and 100
    for (const r of res) {
      expect(r.value).toBeGreaterThanOrEqual(0);
      expect(r.value).toBeLessThanOrEqual(100);
    }
  });
});
