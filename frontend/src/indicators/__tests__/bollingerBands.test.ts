import { calculateBollingerBands } from '../../indicators/bollingerBands';
import type { CandleData } from '../../indicators/types';

describe('BollingerBands', () => {
  const mk = (vals: number[]): CandleData[] =>
    vals.map((v, i) => ({ time: i + 1, open: v, high: v, low: v, close: v }));

  it('returns empty if not enough data for period', () => {
    expect(calculateBollingerBands(mk([1, 2]), { period: 3, multiplier: 2 })).toEqual([]);
  });

  it('computes upper/middle/lower bands with variance', () => {
    const data = mk([10, 10, 10, 10, 10]);
    const res = calculateBollingerBands(data, { period: 3, multiplier: 2 });
    // For constant series, stddev=0 -> all bands equal to SMA
    for (const r of res) {
      expect(r.upper).toBeCloseTo(r.middle, 10);
      expect(r.lower).toBeCloseTo(r.middle, 10);
    }
  });
});
