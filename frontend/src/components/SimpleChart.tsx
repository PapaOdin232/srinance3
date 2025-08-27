import React, { useRef, useEffect, useState, useLayoutEffect } from 'react';
import { createChart, CandlestickSeries } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, CandlestickData } from 'lightweight-charts';
import { createDebugLogger } from '../utils/debugLogger';

const logger = createDebugLogger('SimpleChart');

interface SimpleChartProps {
  data: CandlestickData[];                 // history (initial)
  realtimeCandle?: CandlestickData | null; // incremental update
  width?: string;
  height?: string;
  // how many candles should be visible initially (all data remains loaded and scrollable)
  visibleCandlesCount?: number;
  // async provider: load older candles before the first currently loaded time
  onLoadMoreHistory?: (
    firstCandleTime: CandlestickData['time']
  ) => Promise<CandlestickData[]>;
  onChartReady?: (chart: IChartApi) => void;
}

export const SimpleChart: React.FC<SimpleChartProps> = ({
  data = [],
  realtimeCandle = null,
  width = '100%',
  height = '400px',
  visibleCandlesCount = 100,
  onLoadMoreHistory,
  onChartReady
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  // keep last applied history fingerprint to avoid redundant setData
  const lastHistoryFingerprintRef = useRef<string | null>(null);
  // track if fitContent was called to avoid redundant calls
  const fittedRef = useRef(false);
  // mirror of current data to compute scroll heuristics and merges
  const dataRef = useRef<CandlestickData[]>([]);
  // guards for history prefetching
  const isLoadingMoreRef = useRef(false);
  const noMoreHistoryRef = useRef(false);

  // helper: merge and dedupe by time, keep chronological order
  const mergeCandles = (
    older: CandlestickData[],
    current: CandlestickData[]
  ): CandlestickData[] => {
    if (!older?.length) return current;
    const map = new Map<string, CandlestickData>();
    for (const c of older) map.set(String(c.time), c);
    for (const c of current) map.set(String(c.time), c);
    const arr = Array.from(map.values());
    arr.sort((a, b) => {
      const at = typeof a.time === 'number' ? a.time : (Date.parse(String(a.time)) / 1000) || 0;
      const bt = typeof b.time === 'number' ? b.time : (Date.parse(String(b.time)) / 1000) || 0;
      return at - bt;
    });
    return arr;
  };

  useEffect(() => {
    // Cleanup function to prevent memory leaks
    return () => {
      if (chartRef.current) {
        try {
          chartRef.current.remove();
          chartRef.current = null;
        } catch (e) {
          logger.warn('Error cleaning up chart', e);
        }
      }
    };
  }, []);

  // Separate useLayoutEffect for chart creation to avoid re-creation on data changes
  useLayoutEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const width = Math.max(300, container.clientWidth || 600);
    const height = Math.max(300, container.clientHeight || 400);

    try {
      // Create chart with explicit dimensions
      const chart = createChart(container, {
        width,
        height,
        layout: {
          background: { color: '#0D1117' },
          textColor: '#F0F6FC',
        },
        grid: {
          vertLines: { color: 'rgba(56, 139, 253, 0.08)' },
          horzLines: { color: 'rgba(56, 139, 253, 0.08)' },
        },
        timeScale: {
          timeVisible: true,
          borderColor: '#30363D',
          // allow scrolling and keep right bar glued when scrolling new data in
          rightBarStaysOnScroll: true,
          rightOffset: 5,
        },
        rightPriceScale: {
          borderColor: '#30363D',
        }
      });

      // Add candlestick series
      const series = chart.addSeries(CandlestickSeries, {
        upColor: '#26A69A',
        downColor: '#EF5350',
        wickUpColor: '#26A69A',
        wickDownColor: '#EF5350',
      });

      // Store refs
      chartRef.current = chart;
      seriesRef.current = series;

      // Set data after chart is created
      if (data.length > 0) {
        series.setData(data);
        dataRef.current = data.slice();
        // show only last N candles initially (all data is scrollable)
        if (data.length > visibleCandlesCount) {
          const last = data.length - 0.5;
          const first = last - visibleCandlesCount;
          chart.timeScale().setVisibleLogicalRange({ from: first, to: last });
        } else {
          chart.timeScale().fitContent();
          fittedRef.current = true;
        }
      }

      // Hide loading indicator
      setIsLoading(false);

      // Setup resize handler
      const handleResize = () => {
        if (!chartRef.current || !container) return;

        const rect = container.getBoundingClientRect();
        const width = Math.floor(rect.width);
        const height = Math.floor(rect.height);

        if (width > 0 && height > 0) {
          chartRef.current.resize(width, height);
        }
      };

      // Use ResizeObserver if available
      // subscribe to visible range changes to prefetch older history on left edge proximity
      chart.timeScale().subscribeVisibleLogicalRangeChange((logicalRange) => {
        if (!logicalRange || !seriesRef.current || !onLoadMoreHistory) return;
        // use bars stats to know how many bars exist before the left edge
        const s = seriesRef.current;
        const stats = s ? s.barsInLogicalRange(logicalRange) : undefined;
        if (!stats) return;
        // if we are close to the left edge (few bars left), prefetch older
        if (stats.barsBefore !== undefined && stats.barsBefore < 10) {
          // run async without blocking UI
          (async () => {
            if (isLoadingMoreRef.current || noMoreHistoryRef.current) return;
            const firstTime = dataRef.current[0]?.time;
            if (!firstTime) return;
            try {
              isLoadingMoreRef.current = true;
              setIsLoadingHistory(true);
              const older = await onLoadMoreHistory(firstTime);
              if (!older || older.length === 0) {
                noMoreHistoryRef.current = true;
                return;
              }
              // remember current view
              const ts = chart.timeScale();
              const vr = ts.getVisibleLogicalRange();
              // merge and re-apply
        const merged = mergeCandles(older, dataRef.current);
        dataRef.current = merged;
        const s2 = seriesRef.current;
        if (s2) s2.setData(merged);
              // shift view by number of new bars to keep visual position
              if (vr) {
                const shift = older.length;
                ts.setVisibleLogicalRange({ from: vr.from + shift, to: vr.to + shift });
              }
              logger.log(`Prefetched ${older.length} older candles. Total: ${merged.length}`);
            } catch (e) {
              logger.warn('Error prefetching older candles', e);
            } finally {
              isLoadingMoreRef.current = false;
              setIsLoadingHistory(false);
            }
          })();
        }
      });

      if (typeof ResizeObserver !== 'undefined') {
        const resizeObserver = new ResizeObserver(() => {
          window.requestAnimationFrame(handleResize);
        });
        resizeObserver.observe(container);

        // Return cleanup function
        return () => {
          resizeObserver.disconnect();
          if (chartRef.current) {
            chartRef.current.remove();
            chartRef.current = null;
          }
          if (seriesRef.current) {
            seriesRef.current = null;
          }
        };
      }

      // Notify parent component only once after everything is ready
      if (onChartReady && chartRef.current) {
        onChartReady(chartRef.current);
      }
      
    } catch (error) {
      logger.error('Error creating chart:', error);
      setIsLoading(false);
    }
  }, []); // Empty dependency array - only run once

  // Effect: apply full history when `data` prop changes, but dedupe using fingerprint
  useEffect(() => {
    if (!seriesRef.current || !chartRef.current) return;
    if (!data || data.length === 0) return;

    const lastTimestamp = data.length ? String(data[data.length - 1].time) : '';
    const fingerprint = `${data.length}:${lastTimestamp}`;
    if (fingerprint === lastHistoryFingerprintRef.current) {
      logger.log('History unchanged — skipping setData');
      return;
    }

    try {
      // preserve current visible range if the user scrolled somewhere
      const ts = chartRef.current.timeScale();
      const vr = ts.getVisibleLogicalRange();
      seriesRef.current.setData(data);
      dataRef.current = data.slice();
      if (vr) {
        ts.setVisibleLogicalRange(vr);
      } else if (!fittedRef.current) {
        // initial behavior: show last N if too many
        if (data.length > visibleCandlesCount) {
          const last = data.length - 0.5;
          const first = last - visibleCandlesCount;
          ts.setVisibleLogicalRange({ from: first, to: last });
        } else {
          ts.fitContent();
          fittedRef.current = true;
        }
      }
      lastHistoryFingerprintRef.current = fingerprint;
      logger.log(`Updated chart with ${data.length} data points (fingerprint=${fingerprint})`);
    } catch (error) {
      logger.error('Error updating chart data:', error);
    }
  }, [data, visibleCandlesCount]);

  // Effect: incremental realtime update (single candlestick) — efficient series.update()
  useEffect(() => {
    if (!realtimeCandle || !seriesRef.current || !chartRef.current) return;

    try {
      seriesRef.current.update(realtimeCandle);
      // update fingerprint for history to avoid next full setData re-applying same data
      const lastFingerprint = lastHistoryFingerprintRef.current;
      if (lastFingerprint) {
        const parts = lastFingerprint.split(':');
        const length = Number(parts[0] || 0);
        const ts = String(realtimeCandle.time);
        lastHistoryFingerprintRef.current = `${length}:${ts}`;
      }
      logger.log('Applied realtime candle update', realtimeCandle);
    } catch (error) {
      logger.error('Error applying realtime candle update:', error);
    }
  }, [realtimeCandle]);

  return (
    <div style={{ position: 'relative', width, height }}>
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          minHeight: '300px'
        }}
      />
      {isLoading && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(13, 17, 23, 0.7)',
          color: '#fff',
          zIndex: 5
        }}>
          Inicjalizacja wykresu...
        </div>
      )}
      {isLoadingHistory && (
        <div style={{
          position: 'absolute',
          top: 10,
          left: 10,
          padding: '4px 8px',
          backgroundColor: 'rgba(13, 17, 23, 0.7)',
          color: '#fff',
          borderRadius: 4,
          fontSize: 12,
          zIndex: 6,
        }}>
          Ładowanie historii...
        </div>
      )}
    </div>
  );
};

export default SimpleChart;
