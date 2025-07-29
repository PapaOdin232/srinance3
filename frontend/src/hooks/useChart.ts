import React, { useRef, useEffect, useCallback } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  TimeScale,
  PointElement,
  LineElement,
  LineController,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import type { ChartData, ChartOptions } from 'chart.js';
import 'chartjs-adapter-date-fns';

// Zarejestruj komponenty Chart.js
ChartJS.register(
  CategoryScale,
  LinearScale,
  TimeScale,
  PointElement,
  LineElement,
  LineController,
  Title,
  Tooltip,
  Legend,
  Filler
);

console.log('[useChart] Chart.js components registered successfully');

// Type definitions for better type safety
export type ChartUpdateMode = 'default' | 'none' | 'resize' | 'reset' | 'show' | 'hide' | 'active';

export type ChartDataValue = number | { x: number; y: number } | [number, number] | null;

export interface SafeChartOptions extends ChartOptions {
  // Add any specific options we need
}

export interface ChartConfiguration {
  type: 'line' | 'bar' | 'pie' | 'doughnut' | 'polarArea' | 'radar' | 'scatter' | 'bubble';
  data: ChartData;
  options?: ChartOptions;
}

// Safety validation functions
const validateDatasetIndex = (index: number, datasets: unknown[]): boolean => {
  return Number.isInteger(index) && index >= 0 && index < datasets.length;
};

const isValidChartData = (data: unknown): data is ChartData => {
  return typeof data === 'object' && data !== null && 'datasets' in data;
};

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
 */
export function useChart(
  config: ChartConfiguration,
  dependencies: React.DependencyList = []
) {
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstanceRef = useRef<ChartJS | null>(null);
  const canvasIdRef = useRef<string>(`chart-${Math.random().toString(36).substr(2, 9)}`);

  useEffect(() => {
    if (!chartRef.current) {
      console.warn('[useChart] Canvas ref is not available');
      return;
    }

    console.log('[useChart] Creating new Chart.js instance');

    // Always destroy existing chart first and clear canvas completely
    if (chartInstanceRef.current) {
      console.log('[useChart] Destroying existing chart instance');
      try {
        chartInstanceRef.current.destroy();
      } catch (error) {
        console.warn('[useChart] Error destroying existing chart:', error);
      }
      chartInstanceRef.current = null;
    }

    // Ensure canvas has unique ID and clear it
    const canvas = chartRef.current;
    canvas.id = canvasIdRef.current;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // Reset canvas size to trigger complete cleanup
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    }

    try {
      // Safe type assertion - ChartConfiguration is compatible with Chart.js config
      chartInstanceRef.current = new ChartJS(canvas, config);
      console.log('[useChart] Chart.js instance created successfully');
    } catch (error) {
      console.error('[useChart] Error creating chart:', error);
    }

    return () => {
      if (chartInstanceRef.current) {
        console.log('[useChart] Cleanup: destroying chart instance');
        try {
          chartInstanceRef.current.destroy();
        } catch (error) {
          console.warn('[useChart] Failed to destroy chart instance:', error);
        } finally {
          chartInstanceRef.current = null;
        }
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
          console.warn('[useChart] Failed to destroy chart instance during unmount:', error);
        } finally {
          chartInstanceRef.current = null;
        }
      }
    };
  }, []);

  const updateChart = useCallback((data?: ChartData, options: ChartUpdateMode = 'default') => {
    if (chartInstanceRef.current) {
      if (data && isValidChartData(data)) {
        console.log('[useChart] Updating chart data');
        chartInstanceRef.current.data = data;
      }
      chartInstanceRef.current.update(options);
    }
  }, []);

  const updateDataset = useCallback((datasetIndex: number, newData: ChartDataValue[]) => {
    if (chartInstanceRef.current && chartInstanceRef.current.data.datasets) {
      if (!validateDatasetIndex(datasetIndex, chartInstanceRef.current.data.datasets)) {
        console.error(`[useChart] Invalid dataset index: ${datasetIndex}`);
        return;
      }
      
      console.log(`[useChart] Updating dataset ${datasetIndex} with ${newData.length} points`);
      chartInstanceRef.current.data.datasets[datasetIndex].data = newData;
      chartInstanceRef.current.update();
    }
  }, []);

  const addDataPoint = useCallback((label: Date | string | number, datasetIndex: number, value: number, maxPoints = 100) => {
    console.log(`[useChart] Adding data point: label=${String(label)}, value=${value}, datasetIndex=${datasetIndex}`);
    
    if (!chartInstanceRef.current || !chartInstanceRef.current.data.datasets) {
      console.error('[useChart] Chart instance or datasets not available');
      return;
    }

    if (!validateDatasetIndex(datasetIndex, chartInstanceRef.current.data.datasets)) {
      console.error(`[useChart] Invalid dataset index: ${datasetIndex}`);
      return;
    }
    
    const chart = chartInstanceRef.current;
    const dataset = chart.data.datasets[datasetIndex];
    
    if (!dataset) {
      console.error(`[useChart] Dataset at index ${datasetIndex} not found`);
      return;
    }
    
    // Safely add new data
    if (!chart.data.labels) {
      chart.data.labels = [];
    }
    if (!Array.isArray(dataset.data)) {
      dataset.data = [];
    }
    
    chart.data.labels.push(label);
    (dataset.data as ChartDataValue[]).push(value);
    
    console.log(`[useChart] Chart data after adding: labels=${chart.data.labels.length}, data=${dataset.data.length}`);
    
    // Remove oldest data if exceeding maxPoints
    if (chart.data.labels.length > maxPoints) {
      chart.data.labels.shift();
      (dataset.data as ChartDataValue[]).shift();
      console.log(`[useChart] Removed old data point, current length: ${chart.data.labels.length}`);
    }
    
    chart.update('none');
    console.log('[useChart] Chart updated successfully');
  }, []);

  const clearChart = useCallback(() => {
    if (chartInstanceRef.current) {
      console.log('[useChart] Clearing chart data');
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
  chartInstance: ChartJS | null;
  updateChart: (data?: ChartData, options?: ChartUpdateMode) => void;
  updateDataset: (datasetIndex: number, newData: ChartDataValue[]) => void;
  addDataPoint: (label: Date | string | number, datasetIndex: number, value: number, maxPoints?: number) => void;
  clearChart: () => void;
}

export default useChart;