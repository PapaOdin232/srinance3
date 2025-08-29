import { calculateMACD } from '../../indicators/macd';
import type { CandleData } from '../../indicators/types';

describe('MACD', () => {
  const mk = (vals: number[]): CandleData[] =>
    vals.map((v, i) => ({ time: i + 1, open: v, high: v, low: v, close: v }));

  it('returns empty if not enough data (slowPeriod + signalPeriod)', () => {
    const data = mk([1, 2, 3, 4, 5]);
    expect(calculateMACD(data, { fastPeriod: 2, slowPeriod: 4, signalPeriod: 3 })).toEqual([]);
  });

  it('computes macd/signal/histogram arrays', () => {
    const data = mk([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
    const res = calculateMACD(data, { fastPeriod: 3, slowPeriod: 6, signalPeriod: 3 });
    expect(res.length).toBeGreaterThan(0);
    for (const r of res) {
      expect(Number.isFinite(r.macd)).toBe(true);
      expect(Number.isFinite(r.signal)).toBe(true);
      expect(Number.isFinite(r.histogram)).toBe(true);
    }
  });
});
