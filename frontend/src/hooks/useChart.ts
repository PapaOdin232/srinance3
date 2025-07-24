import React, { useRef, useEffect, useCallback } from 'react';
import { Chart } from 'chart.js/auto';
import type { ChartConfiguration, Point, BubbleDataPoint } from 'chart.js/auto';

/**
 * Custom hook for managing Chart.js instances with proper lifecycle management
 * 
 * Features:
 * - Automatic cleanup of previous chart instances
 * - Type-safe Chart.js configuration
 * - Memory leak prevention
 * - Error handling for canvas operations
 * 
 * @param config - Chart.js configuration object
 * @param dependencies - Array of dependencies that trigger chart recreation
 * @returns Object containing chartRef for canvas element and chart instance
 * 
 * @example
 * ```typescript
 * const chartConfig: ChartConfiguration = {
 *   type: 'line',
 *   data: { labels: [], datasets: [] },
 *   options: { responsive: true }
 * };
 * 
 * const { chartRef, chartInstance } = useChart(chartConfig, [symbol, data]);
 * 
 * // In JSX:
 * <canvas ref={chartRef}></canvas>
 * ```
 */
export function useChart(
  config: ChartConfiguration,
  dependencies: React.DependencyList = []
) {
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstanceRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!chartRef.current) {
      console.warn('useChart: Canvas ref is not available');
      return;
    }

    // Always destroy existing chart first
    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy();
      chartInstanceRef.current = null;
    }

    try {
      chartInstanceRef.current = new Chart(chartRef.current, config);
    } catch (error) {
      console.error('Error creating chart:', error);
    }

    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
        chartInstanceRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, ...dependencies]);

  // Additional cleanup on unmount
  useEffect(() => {
    return () => {
      if (chartInstanceRef.current) {
        try {
          chartInstanceRef.current.destroy();
        } catch (error) {
          console.warn('Failed to destroy chart instance during unmount:', error);
        } finally {
          chartInstanceRef.current = null;
        }
      }
    };
  }, []);

  const updateChart = useCallback((data?: ChartConfiguration['data'], options: 'none' | 'resize' | 'reset' | 'show' | 'hide' | 'default' = 'default') => {
    if (chartInstanceRef.current) {
      if (data) {
        chartInstanceRef.current.data = data;
      }
      chartInstanceRef.current.update(options);
    }
  }, []);

  const updateDataset = useCallback((datasetIndex: number, newData: (number | [number, number] | Point | BubbleDataPoint | null)[]) => {
    if (chartInstanceRef.current && chartInstanceRef.current.data.datasets[datasetIndex]) {
      chartInstanceRef.current.data.datasets[datasetIndex].data = newData;
      chartInstanceRef.current.update('none');
    }
  }, []);

  const addDataPoint = useCallback((label: Date | string | number, datasetIndex: number, value: number | [number, number] | Point | BubbleDataPoint | null, maxPoints = 100) => {
    if (chartInstanceRef.current && chartInstanceRef.current.data.datasets[datasetIndex]) {
      const chart = chartInstanceRef.current;
      
      // Add new data
      chart.data.labels?.push(label);
      chart.data.datasets[datasetIndex].data.push(value);
      
      // Remove oldest data if exceeding maxPoints
      if (chart.data.labels && chart.data.labels.length > maxPoints) {
        chart.data.labels.shift();
        chart.data.datasets[datasetIndex].data.shift();
      }
      
      chart.update('none');
    }
  }, []);

  const clearChart = useCallback(() => {
    if (chartInstanceRef.current) {
      chartInstanceRef.current.data.labels = [];
      chartInstanceRef.current.data.datasets.forEach(dataset => {
        dataset.data = [];
      });
      chartInstanceRef.current.update();
    }
  }, []);

  return {
    chartRef,
    chartInstance: chartInstanceRef.current,
    updateChart,
    updateDataset,
    addDataPoint,
    clearChart
  };
}

/**
 * Type definitions for better TypeScript support
 */
export interface ChartHookReturn {
  chartRef: React.RefObject<HTMLCanvasElement>;
  chartInstance: Chart | null;
  updateChart: (data?: ChartConfiguration['data'], options?: 'none' | 'resize' | 'reset' | 'show' | 'hide' | 'default') => void;
  updateDataset: (datasetIndex: number, newData: (number | [number, number] | Point | BubbleDataPoint | null)[]) => void;
  addDataPoint: (label: Date | string | number, datasetIndex: number, value: number | [number, number] | Point | BubbleDataPoint | null, maxPoints?: number) => void;
  clearChart: () => void;
}

export default useChart;