import React, { useRef, useEffect, useState } from 'react';
import { createChart, CandlestickSeries } from 'lightweight-charts';
import type { IChartApi, CandlestickData } from 'lightweight-charts';
import { createDebugLogger } from '../utils/debugLogger';

const logger = createDebugLogger('SimpleChart');

interface SimpleChartProps {
  data: CandlestickData[];
  width?: string;
  height?: string;
  onChartReady?: (chart: IChartApi) => void;
}

export const SimpleChart: React.FC<SimpleChartProps> = ({
  data = [],
  width = '100%',
  height = '400px',
  onChartReady
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<any>(null);
  const [isLoading, setIsLoading] = useState(true);

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

  // Separate useEffect for chart creation to avoid re-creation on data changes
  useEffect(() => {
    if (!containerRef.current || chartRef.current) return;

    // Use setTimeout to ensure container is in the DOM and has dimensions
    const timerId = setTimeout(() => {
      const container = containerRef.current;
      if (!container || chartRef.current) return; // Double check to avoid duplicate creation

      // Log container dimensions for debugging
      const rect = container.getBoundingClientRect();
      logger.log('Container dimensions before chart creation:', {
        width: rect.width,
        height: rect.height
      });

      // Force minimum dimensions if needed
      if (rect.width === 0) {
        container.style.width = '100%';
      }
      if (rect.height === 0) {
        container.style.height = '400px';
      }

      try {
        // Create chart with explicit dimensions
        const chart = createChart(container, {
          width: Math.max(300, rect.width || 600),
          height: Math.max(300, rect.height || 400),
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
          };
        }

        // Notify parent component only once after everything is ready
        setTimeout(() => {
          if (onChartReady && chartRef.current) {
            onChartReady(chartRef.current);
          }
        }, 100); // Small delay to ensure everything is rendered
        
      } catch (error) {
        logger.error('Error creating chart:', error);
        setIsLoading(false);
      }
    }, 100);

    return () => clearTimeout(timerId);
  }, []); // Empty dependency array - only run once

  // Update data when it changes
  useEffect(() => {
    if (!seriesRef.current || !chartRef.current || data.length === 0) return;

    try {
      seriesRef.current.setData(data);
      chartRef.current.timeScale().fitContent();
      logger.log(`Updated chart with ${data.length} data points`);
    } catch (error) {
      logger.error('Error updating chart data:', error);
    }
  }, [data]);

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
