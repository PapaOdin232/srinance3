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
 * 
 * @returns Object containing chartRef and chart management methods
 */
export function useLightweightChart() {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) {
      console.warn('[useLightweightChart] Container ref is not available');
      return;
    }

    console.log('[useLightweightChart] Creating new Lightweight Chart instance');

    // Create chart with enhanced configuration
    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
      layout: {
        background: { 
          color: '#fafafa' 
        },
        textColor: '#2e2e2e',
        fontSize: 12,
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
      },
      grid: {
        vertLines: { 
          color: '#e9ecef',
          style: 1, // dotted
        },
        horzLines: { 
          color: '#e9ecef',
          style: 1, // dotted
        },
      },
      crosshair: {
        mode: 1, // Normal crosshair mode
        vertLine: {
          color: '#6c757d',
          width: 1,
          style: 2, // dashed
        },
        horzLine: {
          color: '#6c757d',
          width: 1,
          style: 2, // dashed
        },
      },
      rightPriceScale: {
        borderColor: '#dee2e6',
        scaleMargins: {
          top: 0.1,
          bottom: 0.1,
        },
        autoScale: true,
      },
      leftPriceScale: {
        visible: false,
      },
      timeScale: {
        borderColor: '#dee2e6',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 5,
        barSpacing: 8,
        minBarSpacing: 0.5,
        fixLeftEdge: false,
        fixRightEdge: false,
      },
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
