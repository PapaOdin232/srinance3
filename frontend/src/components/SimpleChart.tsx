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
  onChartReady?: (chart: IChartApi) => void;
}

export const SimpleChart: React.FC<SimpleChartProps> = ({
  data = [],
  realtimeCandle = null,
  width = '100%',
  height = '400px',
  onChartReady
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // keep last applied history fingerprint to avoid redundant setData
  const lastHistoryFingerprintRef = useRef<string | null>(null);
  // track if fitContent was called to avoid redundant calls
  const fittedRef = useRef(false);

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
        chart.timeScale().fitContent();
        fittedRef.current = true;
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
      seriesRef.current.setData(data);
      if (!fittedRef.current) {
        chartRef.current.timeScale().fitContent();
        fittedRef.current = true;
      }
      lastHistoryFingerprintRef.current = fingerprint;
      logger.log(`Updated chart with ${data.length} data points (fingerprint=${fingerprint})`);
    } catch (error) {
      logger.error('Error updating chart data:', error);
    }
  }, [data]);

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
    </div>
  );
};

export default SimpleChart;
