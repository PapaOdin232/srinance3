/**
 * Performance monitoring utility for WebSocket message handlers
 */
export class PerformanceMonitor {
  private measurements: Map<string, number[]> = new Map();

  start(label: string): string {
    const startTime = performance.now();
    return `${label}_${startTime}`;
  }

  end(label: string, operation: string = 'operation'): number {
    const endTime = performance.now();
    const [, startTimeStr] = label.split('_');
    const startTime = parseFloat(startTimeStr);
    const duration = endTime - startTime;

    // Store measurement
    const key = label.split('_')[0];
    if (!this.measurements.has(key)) {
      this.measurements.set(key, []);
    }
    const measurements = this.measurements.get(key)!;
    measurements.push(duration);

    // Keep only last 100 measurements
    if (measurements.length > 100) {
      measurements.shift();
    }

    // Log warning if operation takes too long
    if (duration > 16) { // 16ms = 60fps threshold
      console.warn(`[Performance] ${operation} took ${duration.toFixed(2)}ms - may cause frame drops`);
    }

    return duration;
  }

  getStats(label: string): { avg: number; max: number; min: number; count: number } | null {
    const measurements = this.measurements.get(label);
    if (!measurements || measurements.length === 0) return null;

    const avg = measurements.reduce((a, b) => a + b, 0) / measurements.length;
    const max = Math.max(...measurements);
    const min = Math.min(...measurements);

    return { avg, max, min, count: measurements.length };
  }
}

export const perfMonitor = new PerformanceMonitor();
