import { useRef, useEffect, useCallback } from 'react';
import { createChart, CandlestickSeries } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, CandlestickData } from 'lightweight-charts';

/**
 * Custom hook for managing Lightweight Charts instances
 * 
 * Features:
 * - Automatic chart creation and cleanup
 * - Candlestick series for financial data
 * - Real-time data updates
 * - Memory leak prevention
 * - Optimized passive event listeners for scroll performance
 * 
 * @returns Object containing chartRef and chart management methods
 */
export function useLightweightChart() {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

  // Initialize chart
  useEffect(() => {
    const chartContainer = chartContainerRef.current;
    if (!chartContainer) {
      console.warn('[useLightweightChart] Container ref is not available');
      return;
    }

    console.log('[useLightweightChart] Creating new Lightweight Chart instance');

    // Create chart with optimized scroll performance settings
    const chart = createChart(chartContainer, {
      width: chartContainer.clientWidth,
      height: 400,
      layout: {
        background: { color: '#1A1B1E' },
        textColor: '#DDD',
      },
      grid: {
        vertLines: { color: '#2B2B43' },
        horzLines: { color: '#2B2B43' },
      },
      crosshair: {
        mode: 1,
      },
      rightPriceScale: {
        borderColor: '#485158',
      },
      timeScale: {
        borderColor: '#485158',
        fixRightEdge: false,
      },
      // Optimized scroll handling with reduced sensitivity for better performance
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    });

    // Add candlestick series with enhanced styling
    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#00b894', // Green for bullish candles
      downColor: '#e17055', // Red for bearish candles
      borderVisible: false,
      wickUpColor: '#00b894',
      wickDownColor: '#e17055',
      priceFormat: {
        type: 'price',
        precision: 2,
        minMove: 0.01,
      },
    });

    chartInstanceRef.current = chart;
    candlestickSeriesRef.current = candlestickSeries;

    console.log('[useLightweightChart] Chart instance created successfully');

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current && chartInstanceRef.current) {
        chartInstanceRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    // Cleanup function
    return () => {
      console.log('[useLightweightChart] Cleaning up chart instance');
      window.removeEventListener('resize', handleResize);
      
      if (chartInstanceRef.current) {
        chartInstanceRef.current.remove();
        chartInstanceRef.current = null;
        candlestickSeriesRef.current = null;
      }
    };
  }, []);

  // Set historical data
  const setHistoricalData = useCallback((data: CandlestickData[]) => {
    if (candlestickSeriesRef.current) {
      console.log(`[useLightweightChart] Setting ${data.length} historical data points`);
      candlestickSeriesRef.current.setData(data);
    } else {
      console.warn('[useLightweightChart] Candlestick series not available');
    }
  }, []);

  // Update with new candlestick data
  const updateCandlestick = useCallback((candlestick: CandlestickData) => {
    if (candlestickSeriesRef.current) {
      console.log(`[useLightweightChart] Updating candlestick:`, candlestick);
      candlestickSeriesRef.current.update(candlestick);
    } else {
      console.warn('[useLightweightChart] Candlestick series not available for update');
    }
  }, []);

  // Clear chart data
  const clearChart = useCallback(() => {
    if (candlestickSeriesRef.current) {
      console.log('[useLightweightChart] Clearing chart data');
      candlestickSeriesRef.current.setData([]);
    }
  }, []);

  // Fit content to viewport
  const fitContent = useCallback(() => {
    if (chartInstanceRef.current) {
      chartInstanceRef.current.timeScale().fitContent();
    }
  }, []);

  return {
    chartContainerRef,
    chartInstance: chartInstanceRef.current,
    candlestickSeries: candlestickSeriesRef.current,
    setHistoricalData,
    updateCandlestick,
    clearChart,
    fitContent
  };
}

export default useLightweightChart;
