import { calculateSMA, calculateEMA, calculateMovingAverage } from '../../indicators/movingAverage';
import type { CandleData } from '../../indicators/types';

describe('movingAverage', () => {
  const mk = (vals: number[]): CandleData[] =>
    vals.map((v, i) => ({ time: i + 1, open: v, high: v, low: v, close: v }));

  it('SMA: returns empty for data shorter than period', () => {
    expect(calculateSMA(mk([1, 2]), { period: 3, type: 'SMA' })).toEqual([]);
  });

  it('SMA: computes simple average per window', () => {
    const data = mk([1, 2, 3, 4, 5]);
    const res = calculateSMA(data, { period: 3, type: 'SMA' });
    expect(res).toEqual([
      { time: 3, value: 2 },
      { time: 4, value: 3 },
      { time: 5, value: 4 },
    ]);
  });

  it('EMA: returns empty for data shorter than period', () => {
    expect(calculateEMA(mk([1, 2]), { period: 3, type: 'EMA' })).toEqual([]);
  });

  it('EMA: first value equals SMA, then smoothes', () => {
    const data = mk([10, 11, 12, 13, 14]);
    const res = calculateEMA(data, { period: 3, type: 'EMA' });
    // first EMA point at time=3 equals SMA(10,11,12)=11
    expect(res[0]).toEqual({ time: 3, value: 11 });
    // ensure monotonic smoothing between 12 and 13
    expect(res[1].value).toBeGreaterThan(11);
    expect(res[2].value).toBeGreaterThan(res[1].value);
  });

  it('calculateMovingAverage delegates by type', () => {
    const data = mk([1, 2, 3]);
    expect(calculateMovingAverage(data, { period: 3, type: 'SMA' })).toEqual([
      { time: 3, value: 2 },
    ]);
    const ema = calculateMovingAverage(data, { period: 3, type: 'EMA' });
    expect(ema.length).toBe(1);
    expect(ema[0].time).toBe(3);
  });
});
