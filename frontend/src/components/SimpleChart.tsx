import React, { useRef, useEffect, useState, useLayoutEffect } from 'react';
import { createChart, CandlestickSeries, HistogramSeries } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, CandlestickData, HistogramData } from 'lightweight-charts';
import { createDebugLogger } from '../utils/debugLogger';

const logger = createDebugLogger('SimpleChart');

interface ExtendedCandlestickData extends CandlestickData {
  isClosed?: boolean;  // odpowiednik pola 'x' z Binance WebSocket
  volume?: number;     // opcjonalne pole wolumenu
}

interface SimpleChartProps {
  data: CandlestickData[];                 // history (initial)
  realtimeCandle?: ExtendedCandlestickData | null; // incremental update
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
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const priceLineRef = useRef<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [hoveredOHLCV, setHoveredOHLCV] = useState<{
    time: CandlestickData['time'];
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
  } | null>(null);
  // keep last applied history fingerprint to avoid redundant setData
  const lastHistoryFingerprintRef = useRef<string | null>(null);
  // track if fitContent was called to avoid redundant calls
  const fittedRef = useRef(false);
  // mirror of current data to compute scroll heuristics and merges
  const dataRef = useRef<CandlestickData[]>([]);
  const volumeDataRef = useRef<HistogramData[]>([]);
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

  // Helper: convert candles -> histogram volume data
  const candlesToVolumeData = (candles: ExtendedCandlestickData[]): HistogramData[] =>
    candles.map(c => ({ time: c.time, value: c.volume ?? 0 }));

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
          rightBarStaysOnScroll: true,
          rightOffset: 5,
        },
        rightPriceScale: {
          borderColor: '#30363D',
        },
        crosshair: {
          mode: 1,
          vertLine: { color: 'rgba(56, 139, 253, 0.5)', width: 1, style: 1 },
          horzLine: { color: 'rgba(56, 139, 253, 0.5)', width: 1, style: 1 },
        },
      });

  // Add candlestick series using standard API
  const series = chart.addSeries(CandlestickSeries, {} as any);

  // Add volume histogram series and configure price scale for volume
  const volumeSeries = chart.addSeries(HistogramSeries, { priceScaleId: 'volume', priceFormat: { type: 'volume' } } as any);
      chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.7, bottom: 0 }, visible: true, alignLabels: false });

      // Store refs
      chartRef.current = chart;
      seriesRef.current = series;
      volumeSeriesRef.current = volumeSeries;

      // Set data after chart is created
      if (data.length > 0) {
        series.setData(data as CandlestickData[]);
        dataRef.current = data.slice();

        // Set volume data if candles contain volume
        const volumeData = candlesToVolumeData(data as ExtendedCandlestickData[]);
        if (volumeData.length > 0) {
          volumeSeries.setData(volumeData);
          volumeDataRef.current = volumeData;
          const nonZero = volumeData.filter(v => v.value && v.value > 0).length;
          logger.log(`Initial volume points: total=${volumeData.length}, nonzero=${nonZero}`);
        }

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

      // Add crosshair subscription to provide tooltip data
      chart.subscribeCrosshairMove((param) => {
        if (!param.point || !param.time) {
          setHoveredOHLCV(null);
          return;
        }

        const raw = param.seriesData.get(series as any) as any;
        const volRaw = param.seriesData.get(volumeSeries as any) as any;
        if (raw && typeof raw === 'object') {
          setHoveredOHLCV({
            time: param.time,
            open: raw.open,
            high: raw.high,
            low: raw.low,
            close: raw.close,
            volume: volRaw ? volRaw.value : undefined,
          });
        } else {
          setHoveredOHLCV(null);
        }
      });

      // Set initial price line if we have data
      if (data.length > 0) {
        const last = data[data.length - 1];
        try {
          priceLineRef.current = series.createPriceLine({ price: (last as any).close, axisLabelVisible: true, lineWidth: 1, lineStyle: 2 });
        } catch (e) {
          // ignore if API doesn't support createPriceLine in mock env
        }
      }

      // Hide loading indicator
      setIsLoading(false);

      // Setup resize handler
      const handleResize = () => {
        if (!chartRef.current || !container) return;
        const rect = container.getBoundingClientRect();
        const w = Math.floor(rect.width);
        const h = Math.floor(rect.height);
        if (w > 0 && h > 0) chartRef.current.resize(w, h);
      };

      // subscribe to visible range changes to prefetch older history on left edge proximity
      chart.timeScale().subscribeVisibleLogicalRangeChange((logicalRange) => {
        if (!logicalRange || !seriesRef.current || !onLoadMoreHistory) return;
        const s = seriesRef.current;
        const stats = s ? (s as any).barsInLogicalRange?.(logicalRange) : undefined;
        if (!stats) return;
        if (stats.barsBefore !== undefined && stats.barsBefore < 10) {
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
              const ts = chart.timeScale();
              const vr = ts.getVisibleLogicalRange();
              const merged = mergeCandles(older, dataRef.current);
              dataRef.current = merged;
              const s2 = seriesRef.current as any;
              if (s2) s2.setData(merged);
              // update volume
              const mergedVolume = candlesToVolumeData(merged as ExtendedCandlestickData[]);
              if (volumeSeriesRef.current) volumeSeriesRef.current.setData(mergedVolume);
              if (vr) {
                const shift = older.length;
                ts.setVisibleLogicalRange({ from: (vr as any).from + shift, to: (vr as any).to + shift });
              }
              logger.log(`Prefetched ${older.length} older candles. Total: ${merged.length}`);
              // log volume stats after merge
              try {
                const mergedVol = candlesToVolumeData(merged as ExtendedCandlestickData[]);
                const nonZero = mergedVol.filter(v => v.value && v.value > 0).length;
                logger.log(`Prefetch volume: total=${mergedVol.length}, nonzero=${nonZero}`);
              } catch (e) {
                logger.warn('Could not compute merged volume stats', e);
              }
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
        const resizeObserver = new ResizeObserver(() => window.requestAnimationFrame(handleResize));
        resizeObserver.observe(container);

        // Return cleanup function
        return () => {
          resizeObserver.disconnect();
          try {
            chart.remove();
          } catch (e) {
            logger.warn('Error removing chart on cleanup', e);
          }
          chartRef.current = null;
          seriesRef.current = null;
          volumeSeriesRef.current = null;
        };
      }

      if (onChartReady && chartRef.current) onChartReady(chartRef.current);
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
      // Update volume series when history changes
      if (volumeSeriesRef.current) {
        const volumeData = candlesToVolumeData(data as ExtendedCandlestickData[]);
        volumeSeriesRef.current.setData(volumeData);
        volumeDataRef.current = volumeData;
      }
      // Update price line to last close
      if (data.length > 0 && seriesRef.current) {
        const lastPrice = (data[data.length - 1] as any).close;
        try {
          if (priceLineRef.current && seriesRef.current.removePriceLine) {
            seriesRef.current.removePriceLine(priceLineRef.current);
          }
          if (seriesRef.current.createPriceLine) {
            priceLineRef.current = seriesRef.current.createPriceLine({ price: lastPrice, axisLabelVisible: true, lineWidth: 1, lineStyle: 2 });
          }
        } catch (e) {
          // ignore in environments without full API
        }
      }
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
      // log volume stats for history update
      try {
        const vol = candlesToVolumeData(data as ExtendedCandlestickData[]);
        const nonZero = vol.filter(v => v.value && v.value > 0).length;
        logger.log(`Updated chart with ${data.length} data points (fingerprint=${fingerprint}), volume nonzero=${nonZero}`);
      } catch (e) {
        logger.log(`Updated chart with ${data.length} data points (fingerprint=${fingerprint})`);
      }
    } catch (error) {
      logger.error('Error updating chart data:', error);
    }
  }, [data, visibleCandlesCount]);

  // Effect: incremental realtime update (single candlestick) — efficient series.update()
  useEffect(() => {
    if (!realtimeCandle || !seriesRef.current || !chartRef.current) return;

    try {
      // Sprawdź stan świecy - otwarta czy zamknięta
      if (realtimeCandle.isClosed) {
        logger.log('Received closed candle - adding as new', realtimeCandle);

        // 1. Zaktualizuj ostatnią świecę (gdyby była ta sama)
        seriesRef.current.update(realtimeCandle);

        // 2. Dodaj do wewnętrznej kolekcji danych
        const newDataRef = [...dataRef.current];

        // Znajdź indeks istniejącej świecy o tym samym czasie
        const existingIndex = newDataRef.findIndex(
          candle => candle.time === realtimeCandle.time
        );

        if (existingIndex >= 0) {
          // Zastąp istniejącą świecę
          newDataRef[existingIndex] = realtimeCandle;
        } else {
          // Dodaj nową świecę
          newDataRef.push(realtimeCandle);
          // Opcjonalnie - sortuj jeśli kolejność może być zaburzona
          newDataRef.sort((a, b) => {
            const aTime = typeof a.time === 'number' ? a.time :
              (Date.parse(String(a.time)) / 1000) || 0;
            const bTime = typeof b.time === 'number' ? b.time :
              (Date.parse(String(b.time)) / 1000) || 0;
            return aTime - bTime;
          });
        }

        // Zaktualizuj referencję
        dataRef.current = newDataRef;

        // 3. Aktualizuj fingerprint
        const ts = String(realtimeCandle.time);
        lastHistoryFingerprintRef.current = `${newDataRef.length}:${ts}`;

  logger.log('Applied closed candle, total candles:', dataRef.current.length, 'volume:', (realtimeCandle as any).volume);
      } else {
        // To aktualizacja bieżącej, otwartej świecy - prostszy update
        seriesRef.current.update(realtimeCandle);

        // Update realtime volume if available
        if (volumeSeriesRef.current && realtimeCandle.volume !== undefined) {
          try {
            volumeSeriesRef.current.update({ time: realtimeCandle.time, value: realtimeCandle.volume });
          } catch (e) {
            logger.warn('Volume update failed:', e);
          }
        }

        // Update price line to current close
        try {
          if (priceLineRef.current && seriesRef.current.removePriceLine) {
            seriesRef.current.removePriceLine(priceLineRef.current);
          }
          if (seriesRef.current.createPriceLine) {
            priceLineRef.current = seriesRef.current.createPriceLine({ price: realtimeCandle.close, axisLabelVisible: true, lineWidth: 1, lineStyle: 2 });
          }
        } catch (e) {
          // ignore
        }
        // Opcjonalnie - aktualizuj także w dataRef
        const newDataRef = [...dataRef.current];
        const existingIndex = newDataRef.findIndex(
          candle => candle.time === realtimeCandle.time
        );

        if (existingIndex >= 0) {
          // Tylko aktualizuj istniejącą świecę
          newDataRef[existingIndex] = realtimeCandle;
          dataRef.current = newDataRef;
        }

  logger.log('Updated open candle data', realtimeCandle, 'volume:', (realtimeCandle as any).volume);
      }
    } catch (error) {
      logger.error('Error applying realtime candle update:', error);
    }
  }, [realtimeCandle]);

  return (
    <div style={{ position: 'relative', width, height }}>
      {/* Tooltip for hovered OHLCV */}
      {hoveredOHLCV && (
        <div style={{
          position: 'absolute',
          top: 8,
          left: 8,
          padding: '6px 10px',
          backgroundColor: 'rgba(13,17,23,0.85)',
          color: '#F0F6FC',
          borderRadius: 6,
          zIndex: 20,
          fontSize: 12,
          fontFamily: 'monospace',
          pointerEvents: 'none'
        }}>
          <div>O: {hoveredOHLCV.open?.toFixed(2)}</div>
          <div>H: {hoveredOHLCV.high?.toFixed(2)}</div>
          <div>L: {hoveredOHLCV.low?.toFixed(2)}</div>
          <div>C: {hoveredOHLCV.close?.toFixed(2)}</div>
          {hoveredOHLCV.volume !== undefined && <div>V: {hoveredOHLCV.volume?.toFixed(2)}</div>}
        </div>
      )}
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
