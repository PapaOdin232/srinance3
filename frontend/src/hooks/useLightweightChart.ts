import { useRef, useEffect, useCallback, useState } from 'react';
import { createChart, CandlestickSeries } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, CandlestickData } from 'lightweight-charts';
import { createDebugLogger } from '../utils/debugLogger';

const logger = createDebugLogger('useLightweightChart');

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
  // Utrzymuj instancję wykresu w stanie, aby komponenty rodzica mogły
  // zareagować na jej gotowość (np. ukryć overlay i zaaplikować dane historyczne)
  const [chartInstanceState, setChartInstanceState] = useState<IChartApi | null>(null);

  // Initialize chart with safe retry if container not ready
  useEffect(() => {
    let mounted = true;

    const initializationInProgressRef = { current: false } as { current: boolean };
    const initializationAttemptedRef = { current: false } as { current: boolean };
    const resizeObserverRef = { current: null as ResizeObserver | null };
    const resizeTimeoutRef = { current: null as ReturnType<typeof setTimeout> | null };

    const MAX_INIT_ATTEMPTS = 6;
    let initAttempts = 0;

    const setupResizeObserver = (container: HTMLElement) => {
      if (resizeObserverRef.current) return;

      const prevSize = { width: 0, height: 0 };

      const doResize = () => {
        if (!chartInstanceRef.current) return;
        const rect = container.getBoundingClientRect();
        const w = Math.max(0, Math.floor(rect.width));
        const h = Math.max(0, Math.floor(rect.height));
        if ((w !== prevSize.width || h !== prevSize.height) && w > 0 && h > 0) {
          prevSize.width = w;
          prevSize.height = h;
          try {
            chartInstanceRef.current!.applyOptions({ width: w, height: h });
            logger.log(`Chart resized to: ${w}x${h}`);
          } catch (e) {
            logger.warn('applyOptions failed during resize', e);
          }
        }
      };

      if (typeof ResizeObserver !== 'undefined') {
        resizeObserverRef.current = new ResizeObserver(() => {
          if (resizeTimeoutRef.current) clearTimeout(resizeTimeoutRef.current);
          resizeTimeoutRef.current = setTimeout(() => {
            resizeTimeoutRef.current = null;
            try { doResize(); } catch (e) { logger.warn('doResize failed', e); }
          }, 100);
        });
        try {
          resizeObserverRef.current.observe(container);
        } catch (e) {
          logger.warn('ResizeObserver observe failed', e);
        }
      }
    };

    const attemptInitialize = () => {
      if (!mounted) return;
      if (initializationInProgressRef.current) return;
      if (chartInstanceRef.current) return; // already initialized

      const chartContainer = chartContainerRef.current;
      if (!chartContainer) {
        initAttempts += 1;
        logger.warn(`Chart container not available (attempt ${initAttempts}/${MAX_INIT_ATTEMPTS})`);
        if (initAttempts < MAX_INIT_ATTEMPTS) {
          setTimeout(attemptInitialize, 100 * initAttempts);
        } else {
          logger.error('Failed to find chart container after multiple attempts');
        }
        return;
      }

      initializationInProgressRef.current = true;

      const initializeChart = () => {
        if (!mounted) return;
        const containerRect = chartContainer.getBoundingClientRect();
        const containerWidth = Math.max(0, Math.floor(containerRect.width));
        const containerHeight = Math.max(0, Math.floor(containerRect.height));

        if (containerWidth === 0 || containerHeight === 0) {
          const computed = window.getComputedStyle(chartContainer);
          logger.warn('Container has zero dimensions - forcing styles', {
            clientWidth: chartContainer.clientWidth,
            clientHeight: chartContainer.clientHeight,
            boundingClientRect: containerRect,
            computedStyle: { display: computed.display, width: computed.width, height: computed.height, visibility: computed.visibility }
          });
          try { chartContainer.style.minHeight = '400px'; chartContainer.style.width = '100%'; } catch (e) { logger.warn('Failed to set inline styles on chart container', e); }

          setTimeout(() => { if (mounted) initializeChart(); }, 50);
          return;
        }

        logger.log(`Creating chart with dimensions: ${containerWidth}x${containerHeight}`);

        try {
          const chart = createChart(chartContainer, {
            width: containerWidth,
            height: containerHeight,
            layout: {
              background: { color: '#0D1117' },
              textColor: '#F0F6FC',
              fontSize: 12,
              fontFamily: '"SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif'
            },
            grid: { vertLines: { color: 'rgba(56, 139, 253, 0.08)', style: 0 }, horzLines: { color: 'rgba(56, 139, 253, 0.08)', style: 0 } },
            crosshair: { mode: 1, vertLine: { width: 1, color: '#388BFD', style: 2, labelBackgroundColor: '#161B22' }, horzLine: { width: 1, color: '#388BFD', style: 2, labelBackgroundColor: '#161B22' } },
            rightPriceScale: { borderColor: '#30363D', textColor: '#F0F6FC', entireTextOnly: false, scaleMargins: { top: 0.1, bottom: 0.2 } },
            timeScale: { borderColor: '#30363D', fixRightEdge: false, timeVisible: true, secondsVisible: false, shiftVisibleRangeOnNewBar: true },
            handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
            handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true }
          });

          const candlestickSeries = chart.addSeries(CandlestickSeries, {
            upColor: '#26A69A', downColor: '#EF5350', borderVisible: true, borderUpColor: '#1B5E20', borderDownColor: '#C62828', wickVisible: true, wickUpColor: '#00796B', wickDownColor: '#D32F2F',
            priceFormat: { type: 'price', precision: 4, minMove: 0.0001 }, title: 'OHLC', visible: true, priceLineVisible: true, lastValueVisible: true, priceLineWidth: 1, priceLineColor: '#388BFD', priceLineStyle: 2
          });

          chartInstanceRef.current = chart;
          candlestickSeriesRef.current = candlestickSeries;

          // Update state on next tick to avoid sync update loops
          setTimeout(() => {
            if (!mounted) return;
            setChartInstanceState(chart);
            logger.log('Lightweight chart instance created and state updated');
            // Setup resize observer after chart exists
            try { setupResizeObserver(chartContainer); } catch (e) { logger.warn('setupResizeObserver failed', e); }
            initializationInProgressRef.current = false;
          }, 0);

        } catch (e) {
          logger.error('Failed to create chart:', e);
          initializationInProgressRef.current = false;
        }
      };

      initializeChart();
    };

    // Start first attempt
    if (!initializationAttemptedRef.current) {
      initializationAttemptedRef.current = true;
      setTimeout(attemptInitialize, 50);
    }

    return () => {
      mounted = false;
      // cleanup resize observer and timeouts
      try {
        if (resizeTimeoutRef.current) {
          clearTimeout(resizeTimeoutRef.current);
          resizeTimeoutRef.current = null;
        }
      } catch (_) {}
      try {
        if (resizeObserverRef.current) {
          resizeObserverRef.current.disconnect();
          resizeObserverRef.current = null;
        }
      } catch (e) { logger.warn('Error disconnecting ResizeObserver during cleanup', e); }

      if (chartInstanceRef.current) {
        try { chartInstanceRef.current.remove(); logger.log('Chart instance cleaned up'); } catch (e) { logger.warn('Error removing chart instance:', e); }
        chartInstanceRef.current = null;
        candlestickSeriesRef.current = null;
        setChartInstanceState(null);
      }
    };
  }, []);

  // Set historical data
  const setHistoricalData = useCallback((data: CandlestickData[]) => {
    if (candlestickSeriesRef.current && data.length > 0) {
      candlestickSeriesRef.current.setData(data);
    }
  }, []);

  // Update single candlestick
  const updateCandlestick = useCallback((candlestick: CandlestickData) => {
    if (candlestickSeriesRef.current) {
      candlestickSeriesRef.current.update(candlestick);
    }
  }, []);

  // Clear all data
  const clearData = useCallback(() => {
    if (candlestickSeriesRef.current) {
      candlestickSeriesRef.current.setData([]);
    }
  }, []);

  // Fit content to viewport
  const fitContent = useCallback(() => {
    if (chartInstanceState) {
      chartInstanceState.timeScale().fitContent();
    }
  }, [chartInstanceState]);

  // Set chart theme (dark/light)
  const setTheme = useCallback((isDark: boolean) => {
    if (!chartInstanceState) return;
    
    const themeOptions = isDark ? {
      layout: {
        background: { color: '#0D1117' },
        textColor: '#F0F6FC',
      },
      grid: {
        vertLines: { color: 'rgba(56, 139, 253, 0.08)' },
        horzLines: { color: 'rgba(56, 139, 253, 0.08)' },
      },
      rightPriceScale: {
        borderColor: '#30363D',
      },
      timeScale: {
        borderColor: '#30363D',
      },
    } : {
      layout: {
        background: { color: '#FFFFFF' },
        textColor: '#2D3748',
      },
      grid: {
        vertLines: { color: 'rgba(197, 203, 213, 0.5)' },
        horzLines: { color: 'rgba(197, 203, 213, 0.5)' },
      },
      rightPriceScale: {
        borderColor: '#D1D5DB',
      },
      timeScale: {
        borderColor: '#D1D5DB',
      },
    };
    
    chartInstanceState.applyOptions(themeOptions);
  }, [chartInstanceState]);

  // Apply custom color scheme for candles
  const setColorScheme = useCallback((scheme: 'default' | 'classic' | 'modern' | 'minimal') => {
    if (!candlestickSeriesRef.current) return;
    
    const colorSchemes = {
      default: {
        upColor: '#26A69A',
        downColor: '#EF5350',
        borderUpColor: '#1B5E20',
        borderDownColor: '#C62828',
        wickUpColor: '#00796B',
        wickDownColor: '#D32F2F',
      },
      classic: {
        upColor: '#00C851',
        downColor: '#FF4444',
        borderUpColor: '#00701A',
        borderDownColor: '#CC0000',
        wickUpColor: '#00701A',
        wickDownColor: '#CC0000',
      },
      modern: {
        upColor: '#10B981',
        downColor: '#F59E0B',
        borderUpColor: '#047857',
        borderDownColor: '#D97706',
        wickUpColor: '#047857',
        wickDownColor: '#D97706',
      },
      minimal: {
        upColor: '#4ADE80',
        downColor: '#F87171',
        borderUpColor: '#22C55E',
        borderDownColor: '#EF4444',
        wickUpColor: '#16A34A',
        wickDownColor: '#DC2626',
      }
    };
    
    candlestickSeriesRef.current.applyOptions(colorSchemes[scheme]);
    logger.log(`Applied color scheme: ${scheme}`);
  }, []);

  // Toggle volume visibility (if volume data is available)
  const toggleVolumeDisplay = useCallback((show: boolean) => {
    // This would be implemented if volume series was added
    logger.log(`Volume display toggled: ${show}`);
  }, []);

  return {
    chartContainerRef,
  chartInstance: chartInstanceState,
    candlestickSeries: candlestickSeriesRef.current,
    setHistoricalData,
    updateCandlestick,
    clearData,
    fitContent,
    setTheme,
    setColorScheme,
    toggleVolumeDisplay
  };
}

export default useLightweightChart;
