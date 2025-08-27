import React, { useRef, useEffect, useState, useLayoutEffect } from 'react';
import { createChart, CandlestickSeries, HistogramSeries } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, CandlestickData, HistogramData } from 'lightweight-charts';
import { createDebugLogger } from '../utils/debugLogger';

const logger = createDebugLogger('SimpleChart');

// Color schemes definition
const colorSchemes = {
  default: {
    upColor: '#26A69A',
    downColor: '#EF5350',
    wickUpColor: '#26A69A',
    wickDownColor: '#EF5350',
    borderUpColor: '#26A69A',
    borderDownColor: '#EF5350'
  },
  classic: {
    upColor: '#00C851',
    downColor: '#FF4444',
    wickUpColor: '#00C851',
    wickDownColor: '#FF4444',
    borderUpColor: '#00C851',
    borderDownColor: '#FF4444'
  },
  modern: {
    upColor: '#10B981',
    downColor: '#F59E0B',
    wickUpColor: '#10B981',
    wickDownColor: '#F59E0B',
    borderUpColor: '#10B981',
    borderDownColor: '#F59E0B'
  },
  minimal: {
    upColor: '#4ADE80',
    downColor: '#F87171',
    wickUpColor: '#4ADE80',
    wickDownColor: '#F87171',
    borderUpColor: '#4ADE80',
    borderDownColor: '#F87171'
  }
} as const;

// Theme configurations
const getThemeConfig = (isDarkTheme: boolean) => ({
  layout: {
    background: { color: isDarkTheme ? '#0D1117' : '#FFFFFF' },
    textColor: isDarkTheme ? '#F0F6FC' : '#24292F',
  },
  grid: {
    vertLines: { color: isDarkTheme ? 'rgba(56, 139, 253, 0.08)' : 'rgba(56, 139, 253, 0.15)' },
    horzLines: { color: isDarkTheme ? 'rgba(56, 139, 253, 0.08)' : 'rgba(56, 139, 253, 0.15)' },
  },
  timeScale: {
    timeVisible: true,
    borderColor: isDarkTheme ? '#30363D' : '#D0D7DE',
    rightBarStaysOnScroll: true,
    rightOffset: 5,
  },
  rightPriceScale: {
    borderColor: isDarkTheme ? '#30363D' : '#D0D7DE',
  },
  crosshair: {
    mode: 1 as const,
    vertLine: { color: 'rgba(56, 139, 253, 0.5)', width: 1 as const, style: 1 as const },
    horzLine: { color: 'rgba(56, 139, 253, 0.5)', width: 1 as const, style: 1 as const },
  },
});

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
  // Chart appearance settings
  isDarkTheme?: boolean;
  colorScheme?: 'default' | 'classic' | 'modern' | 'minimal';
  showVolume?: boolean;
}

export const SimpleChart: React.FC<SimpleChartProps> = ({
  data = [],
  realtimeCandle = null,
  width = '100%',
  height = '400px',
  visibleCandlesCount = 100,
  onLoadMoreHistory,
  onChartReady,
  isDarkTheme = true,
  colorScheme = 'default',
  showVolume = true
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
  // track current interval and chart time range to validate realtime updates
  const intervalRef = useRef<string | null>(null);
  const chartTimeRangeRef = useRef<{ first: number; last: number } | null>(null);
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

  // Robust time normalizer: returns UNIX seconds number for lightweight-charts
  const normalizeTime = (t: any): number => {
    if (t === undefined || t === null) return Math.floor(Date.now() / 1000);
    if (typeof t === 'number') {
      // if looks like milliseconds timestamp (> 1e11) convert to seconds
      return t > 100000000000 ? Math.floor(t / 1000) : (t > 10000000000 ? Math.floor(t / 1000) : t);
    }
    if (typeof t === 'string') {
      const parsed = Date.parse(t);
      return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : Math.floor(Number(t) || Date.now() / 1000);
    }
    if (t instanceof Date) return Math.floor(t.getTime() / 1000);
    if (typeof t === 'object') {
      // BusinessDay-like object {year, month, day}
      if ('year' in t && 'month' in t && 'day' in t) {
        return Math.floor(Date.UTC((t as any).year, (t as any).month - 1, (t as any).day, 0, 0, 0) / 1000);
      }
      // Try to stringify and parse
      try {
        const s = JSON.stringify(t);
        const parsed = Date.parse(s);
        if (Number.isFinite(parsed)) return Math.floor(parsed / 1000);
      } catch (_) {}
    }
    return Math.floor(Date.now() / 1000);
  };

  // Ensure all data has properly normalized time format
  const ensureTimeFormat = (data: ExtendedCandlestickData[]): ExtendedCandlestickData[] => {
    return data.map(candle => ({
      ...candle,
      time: normalizeTime(candle.time) as any
    }));
  };

  // Safe update function that ensures time is a number
  const safeSeriesUpdate = (candle: ExtendedCandlestickData) => {
    // Log incoming candle to see what extra fields it has
    logger.log('safeSeriesUpdate received candle:', {
      candle,
      keys: Object.keys(candle),
      hasExtraFields: Object.keys(candle).length > 5
    });
    
    const normalizedTime = normalizeTime(candle.time);
    
    // Double-check that time is a number
    if (typeof normalizedTime !== 'number') {
      logger.error('Time is not a number after normalization:', {
        originalTime: candle.time,
        normalizedTime: normalizedTime,
        typeOriginal: typeof candle.time,
        typeNormalized: typeof normalizedTime
      });
      return;
    }
    
    // Check if the time is valid for update (must be >= last candle time)
    if (chartTimeRangeRef.current) {
      const lastTime = chartTimeRangeRef.current.last;
      if (normalizedTime < lastTime) {
        logger.log('Rejecting realtime update - time is older than last candle:', {
          normalizedTime,
          lastTime,
          diff: normalizedTime - lastTime
        });
        return;
      }
      
      // Additional check: if the time equals the last time, we're updating the same candle
      if (normalizedTime === lastTime) {
        logger.log('Updating existing candle (same time as last):', {
          normalizedTime,
          lastTime
        });
      } else {
        logger.log('Adding new candle (time is newer):', {
          normalizedTime,
          lastTime,
          diff: normalizedTime - lastTime
        });
      }
    }
    
    // Create a clean candle object with numeric time
    const normalizedCandle = {
      time: normalizedTime,
      open: Number(candle.open),
      high: Number(candle.high),
      low: Number(candle.low),
      close: Number(candle.close)
    };
    
    // Validate all numeric fields
    if (!Number.isFinite(normalizedCandle.open) || 
        !Number.isFinite(normalizedCandle.high) || 
        !Number.isFinite(normalizedCandle.low) || 
        !Number.isFinite(normalizedCandle.close)) {
      logger.error('Invalid candle data - non-finite numbers:', {
        originalCandle: candle,
        normalizedCandle,
        open: normalizedCandle.open,
        high: normalizedCandle.high,
        low: normalizedCandle.low,
        close: normalizedCandle.close
      });
      return;
    }
    
    // Debug log the exact values being passed
    logger.log('About to call series.update with clean object:', {
      candle: normalizedCandle,
      keys: Object.keys(normalizedCandle),
      timeType: typeof normalizedCandle.time,
      timeValue: normalizedCandle.time,
      isNumber: Number.isFinite(normalizedCandle.time)
    });
    
    try {
      if (seriesRef.current) {
        seriesRef.current.update(normalizedCandle as any);
      }
    } catch (e) {
      logger.error('Series update failed even with normalized time:', e);
      logger.error('Failed candle object:', JSON.stringify(normalizedCandle));
      // Fallback: rebuild entire series
      if (dataRef.current && dataRef.current.length > 0 && seriesRef.current) {
        const safeData = ensureTimeFormat(dataRef.current);
        seriesRef.current.setData(safeData as any);
      }
    }
  };

  // Safe volume update function
  const safeVolumeUpdate = (time: any, value: number) => {
    const normalizedTime = normalizeTime(time);
    
    if (typeof normalizedTime !== 'number') {
      logger.error('Volume update time is not a number after normalization:', {
        originalTime: time,
        normalizedTime: normalizedTime,
        typeOriginal: typeof time,
        typeNormalized: typeof normalizedTime
      });
      return;
    }
    
    // Check if the time is valid for update (must be >= last candle time)
    if (chartTimeRangeRef.current) {
      const lastTime = chartTimeRangeRef.current.last;
      if (normalizedTime < lastTime) {
        logger.log('Rejecting volume update - time is older than last candle:', {
          normalizedTime,
          lastTime,
          diff: normalizedTime - lastTime
        });
        return;
      }
    }
    
    try {
      if (volumeSeriesRef.current) {
        volumeSeriesRef.current.update({ time: normalizedTime as any, value: Number(value) });
      }
    } catch (e) {
      logger.warn('Volume update failed:', e);
      // If volume update fails, try to rebuild volume series
      try {
        if (dataRef.current && dataRef.current.length > 0 && volumeSeriesRef.current) {
          const volumeData = candlesToVolumeData(dataRef.current as ExtendedCandlestickData[]);
          volumeSeriesRef.current.setData(volumeData);
        }
      } catch (rebuildError) {
        logger.warn('Volume series rebuild failed:', rebuildError);
      }
    }
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

  // Update chart time range references when historical data changes
  useEffect(() => {
    if (data && data.length > 0) {
      const normalized = ensureTimeFormat(data as ExtendedCandlestickData[]);
      dataRef.current = normalized as CandlestickData[];
      chartTimeRangeRef.current = {
        first: (normalized[0] as any).time as number,
        last: (normalized[normalized.length - 1] as any).time as number,
      };
      logger.log('Chart time range updated', chartTimeRangeRef.current);
    } else {
      chartTimeRangeRef.current = null;
    }
  }, [data]);

  // Separate useLayoutEffect for chart creation to avoid re-creation on data changes
  useLayoutEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const width = Math.max(300, container.clientWidth || 600);
    const height = Math.max(300, container.clientHeight || 400);

    try {
      // Create chart with dynamic theme configuration
      const themeConfig = getThemeConfig(isDarkTheme);
      const chart = createChart(container, {
        width,
        height,
        ...themeConfig,
      });

      // Add candlestick series with dynamic colors
      // Disable automatic lastValue label because we create a manual price line (createPriceLine)
      // to avoid duplicate labels (one from series, one from priceLine)
      const currentColors = colorSchemes[colorScheme];
      const series = chart.addSeries(CandlestickSeries, { 
        lastValueVisible: false,
        upColor: currentColors.upColor,
        downColor: currentColors.downColor,
        wickUpColor: currentColors.wickUpColor,
        wickDownColor: currentColors.wickDownColor,
        borderUpColor: currentColors.borderUpColor,
        borderDownColor: currentColors.borderDownColor,
      } as any);

      // Add volume histogram series and configure price scale for volume
      const volumeSeries = chart.addSeries(HistogramSeries, { 
        priceScaleId: 'volume', 
        priceFormat: { type: 'volume' },
        lastValueVisible: false, // Disable price line on volume series to avoid duplication
        priceLineVisible: false,  // Also disable price line explicitly
        crosshairMarkerVisible: false,  // Disable crosshair marker on volume series
        visible: showVolume, // Control volume visibility
      } as any);
      chart.priceScale('volume').applyOptions({ 
        scaleMargins: { top: 0.7, bottom: 0 }, 
        visible: false,  // Hide the volume price scale labels completely
        alignLabels: false 
      });

      // Store refs
      chartRef.current = chart;
      seriesRef.current = series;
      volumeSeriesRef.current = volumeSeries;

      // Set data after chart is created (normalize times)
      if (data.length > 0) {
        const normalized = ensureTimeFormat(data as ExtendedCandlestickData[]);
        series.setData(normalized as CandlestickData[]);
        dataRef.current = normalized.slice() as CandlestickData[];

        // update chart time range ref
        chartTimeRangeRef.current = {
          first: (dataRef.current[0] as any).time as number,
          last: (dataRef.current[dataRef.current.length - 1] as any).time as number,
        };

        // Set volume data if candles contain volume
        const volumeData = candlesToVolumeData(normalized as ExtendedCandlestickData[]);
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

  // Effect: Apply theme and color scheme changes
  useEffect(() => {
    if (!chartRef.current || !seriesRef.current || !volumeSeriesRef.current) return;

    try {
      // Update chart theme
      const themeConfig = getThemeConfig(isDarkTheme);
      chartRef.current.applyOptions(themeConfig);

      // Update candlestick colors
      const currentColors = colorSchemes[colorScheme];
      seriesRef.current.applyOptions({
        upColor: currentColors.upColor,
        downColor: currentColors.downColor,
        wickUpColor: currentColors.wickUpColor,
        wickDownColor: currentColors.wickDownColor,
        borderUpColor: currentColors.borderUpColor,
        borderDownColor: currentColors.borderDownColor,
      });

      // Update volume visibility
      volumeSeriesRef.current.applyOptions({
        visible: showVolume,
      });

      logger.log(`Applied chart settings: theme=${isDarkTheme ? 'dark' : 'light'}, colorScheme=${colorScheme}, showVolume=${showVolume}`);
    } catch (error) {
      logger.error('Error applying chart settings:', error);
    }
  }, [isDarkTheme, colorScheme, showVolume, logger]);

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
      
      // Normalize time format for all historical data
      const normalizedData = ensureTimeFormat(data as ExtendedCandlestickData[]);
      
      seriesRef.current.setData(normalizedData as any);
      dataRef.current = normalizedData.slice() as any;
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

      // Build a safe candle copy with normalized time if needed
      const nextTime: any = normalizeTime((realtimeCandle as any).time);
      const nextCandle: ExtendedCandlestickData = {
        ...realtimeCandle,
        time: nextTime,
      } as any;

      logger.log('Processing realtime candle:', {
        originalTime: (realtimeCandle as any).time,
        normalizedTime: nextTime,
        timeType: typeof nextTime,
        isClosed: (nextCandle as any).isClosed
      });

      // Helpers
      const hasHistory = dataRef.current && dataRef.current.length > 0;
      const firstTime = hasHistory ? (dataRef.current[0] as any).time : undefined;
      const lastTime = hasHistory ? (dataRef.current[dataRef.current.length - 1] as any).time : undefined;
  const toNumberSec = (t: any): number => (typeof t === 'number' ? t : normalizeTime(t));

      // Sprawdź stan świecy - otwarta czy zamknięta
      if ((nextCandle as any).isClosed) {
        logger.log('Received closed candle - adding as new', realtimeCandle);

        // 1. Jeśli brak historii – ustaw jako pierwszy punkt
        if (!hasHistory) {
          seriesRef.current.setData([nextCandle as any]);
        } else if (toNumberSec(nextTime) >= toNumberSec(lastTime)) {
          // Bezpieczna aktualizacja/push na końcu
          safeSeriesUpdate(nextCandle);
        }

        // 2. Dodaj do wewnętrznej kolekcji danych
        const newDataRef = [...dataRef.current];

        // Znajdź indeks istniejącej świecy o tym samym czasie
        const existingIndex = newDataRef.findIndex(
          candle => String(candle.time) === String(nextTime)
        );

        if (existingIndex >= 0) {
          // Zastąp istniejącą świecę
          newDataRef[existingIndex] = nextCandle;
        } else {
          // Dodaj nową świecę
          newDataRef.push(nextCandle);
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
        const ts = String(nextTime);
        lastHistoryFingerprintRef.current = `${newDataRef.length}:${ts}`;

  logger.log('Applied closed candle, total candles:', dataRef.current.length, 'volume:', (nextCandle as any).volume);
      } else {
        // To aktualizacja bieżącej, otwartej świecy - prostszy update
        if (!hasHistory) {
          // Brak historii – ustaw jako pierwszy punkt aby uniknąć błędu "Cannot update oldest data"
          seriesRef.current.setData([nextCandle as any]);
        } else {
          const nextSec = toNumberSec(nextTime);
          const lastSec = toNumberSec(lastTime);
          const firstSec = toNumberSec(firstTime);

          if (nextSec < firstSec || (nextSec > firstSec && nextSec < lastSec)) {
            // Aktualizacja dotyczy świecy spoza końca (np. race podczas zmiany interwału)
            // Użyj pełnego setData z wstawionym/zmienionym elementem, aby uniknąć update() na starszych barach
            const newDataRef = [...dataRef.current];
            const existingIndex = newDataRef.findIndex(c => String(c.time) === String(nextTime));
            if (existingIndex >= 0) {
              newDataRef[existingIndex] = nextCandle;
            } else {
              newDataRef.push(nextCandle);
              newDataRef.sort((a, b) => {
                const aTime = toNumberSec((a as any).time);
                const bTime = toNumberSec((b as any).time);
                return aTime - bTime;
              });
            }
            dataRef.current = newDataRef;
            (seriesRef.current as any).setData(newDataRef);
          } else {
            // Normalna aktualizacja ostatniej świecy
            safeSeriesUpdate(nextCandle);
          }
        }

        // Update realtime volume if available
        if (volumeSeriesRef.current && (nextCandle as any).volume !== undefined) {
          // Use normalized time (already a number)
          safeVolumeUpdate(nextTime, (nextCandle as any).volume);
        }

        // Update price line to current close
        try {
          if (priceLineRef.current && seriesRef.current.removePriceLine) {
            seriesRef.current.removePriceLine(priceLineRef.current);
          }
          if (seriesRef.current.createPriceLine) {
            priceLineRef.current = seriesRef.current.createPriceLine({ price: nextCandle.close, axisLabelVisible: true, lineWidth: 1, lineStyle: 2 });
          }
        } catch (e) {
          // ignore
        }
        // Opcjonalnie - aktualizuj także w dataRef
        const newDataRef = [...dataRef.current];
        const existingIndex = newDataRef.findIndex(
          candle => String(candle.time) === String(nextTime)
        );

        if (existingIndex >= 0) {
          // Tylko aktualizuj istniejącą świecę
          newDataRef[existingIndex] = nextCandle;
          dataRef.current = newDataRef;
        }

  logger.log('Updated open candle data', nextCandle, 'volume:', (nextCandle as any).volume);
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
