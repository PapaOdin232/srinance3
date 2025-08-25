/**
 * Performance monitoring utilities for scroll performance optimization
 */

interface ScrollPerformanceMetrics {
  wheelEvents: number;
  touchEvents: number;
  scrollEvents: number;
  averageDelay: number;
  maxDelay: number;
  passiveListenersCount: number;
  activeListenersCount: number;
}

class ScrollPerformanceMonitor {
  private metrics: ScrollPerformanceMetrics = {
    wheelEvents: 0,
    touchEvents: 0,
    scrollEvents: 0,
    averageDelay: 0,
    maxDelay: 0,
    passiveListenersCount: 0,
    activeListenersCount: 0,
  };

  private delays: number[] = [];
  private startTime: number = 0;
  private isMonitoring = false;

  startMonitoring(): void {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    this.setupListeners();
    console.log('[ScrollMonitor] Performance monitoring started');
  }

  stopMonitoring(): void {
    if (!this.isMonitoring) return;
    
    this.isMonitoring = false;
    this.removeListeners();
    console.log('[ScrollMonitor] Performance monitoring stopped');
  }

  getMetrics(): ScrollPerformanceMetrics {
    return { ...this.metrics };
  }

  logMetrics(): void {
    const metrics = this.getMetrics();
    console.group('📊 Scroll Performance Metrics');
    console.log('Wheel Events:', metrics.wheelEvents);
    console.log('Touch Events:', metrics.touchEvents);
    console.log('Scroll Events:', metrics.scrollEvents);
    console.log('Average Delay:', `${metrics.averageDelay.toFixed(2)}ms`);
    console.log('Max Delay:', `${metrics.maxDelay.toFixed(2)}ms`);
    console.log('Passive Listeners:', metrics.passiveListenersCount);
    console.log('Active Listeners:', metrics.activeListenersCount);
    console.groupEnd();
    
    // Warning dla wysokich opóźnień
    if (metrics.maxDelay > 100) {
      console.warn('⚠️ High scroll delay detected! Consider optimizing event handlers.');
    }
  }

  private setupListeners(): void {
    // Monitor wheel events
    document.addEventListener('wheel', this.handleWheelEvent, { passive: true });
    
    // Monitor touch events
    document.addEventListener('touchstart', this.handleTouchEvent, { passive: true });
    document.addEventListener('touchmove', this.handleTouchEvent, { passive: true });
    
    // Monitor scroll events
    document.addEventListener('scroll', this.handleScrollEvent, { passive: true });
  }

  private removeListeners(): void {
    document.removeEventListener('wheel', this.handleWheelEvent);
    document.removeEventListener('touchstart', this.handleTouchEvent);
    document.removeEventListener('touchmove', this.handleTouchEvent);
    document.removeEventListener('scroll', this.handleScrollEvent);
  }

  private handleWheelEvent = (): void => {
    this.startTime = performance.now();
    this.metrics.wheelEvents++;
    
    // Measure processing delay
    requestAnimationFrame(() => {
      const delay = performance.now() - this.startTime;
      this.recordDelay(delay);
    });
  };

  private handleTouchEvent = (): void => {
    this.startTime = performance.now();
    this.metrics.touchEvents++;
    
    requestAnimationFrame(() => {
      const delay = performance.now() - this.startTime;
      this.recordDelay(delay);
    });
  };

  private handleScrollEvent = (): void => {
    this.startTime = performance.now();
    this.metrics.scrollEvents++;
    
    requestAnimationFrame(() => {
      const delay = performance.now() - this.startTime;
      this.recordDelay(delay);
    });
  };

  private recordDelay(delay: number): void {
    this.delays.push(delay);
    
    // Keep only last 100 measurements
    if (this.delays.length > 100) {
      this.delays.shift();
    }
    
    // Update metrics
    this.metrics.maxDelay = Math.max(this.metrics.maxDelay, delay);
    this.metrics.averageDelay = this.delays.reduce((sum, d) => sum + d, 0) / this.delays.length;
  }
}

// Global instance
export const scrollPerformanceMonitor = new ScrollPerformanceMonitor();

// Auto-start monitoring in development
if (process.env.NODE_ENV === 'development') {
  scrollPerformanceMonitor.startMonitoring();
  
  // Log metrics every 30 seconds
  setInterval(() => {
    scrollPerformanceMonitor.logMetrics();
  }, 30000);
}
