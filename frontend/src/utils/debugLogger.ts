/**
 * Debug logger with selective component control
 * Prevents console.log from blocking main thread in production
 * Supports localStorage-based control for fine-tuning during development
 */
export class DebugLogger {
  private prefix: string;
  private isDev: boolean;

  constructor(prefix: string) {
    this.prefix = prefix;
    this.isDev = import.meta.env.DEV;
  }

  private isEnabled(): boolean {
    if (!this.isDev) return false;
    
    // Check global debug flag
    const globalEnabled = localStorage.getItem('debug:enabled');
    if (globalEnabled === 'false') return false;
    
    // Check component-specific flag
    const componentEnabled = localStorage.getItem(`debug:${this.prefix}`);
    if (componentEnabled === 'false') return false;
    
    // Check category flags
    if (this.prefix === 'PriceDisplay' || this.prefix === 'OrderBookDisplay') {
      const componentsEnabled = localStorage.getItem('debug:components');
      if (componentsEnabled === 'false') return false;
    }
    
    return true;
  }

  log(message: string, ...args: any[]) {
    if (this.isEnabled()) {
      console.log(`[${this.prefix}] ${message}`, ...args);
    }
  }

  warn(message: string, ...args: any[]) {
    if (this.isEnabled()) {
      console.warn(`[${this.prefix}] ${message}`, ...args);
    }
  }

  error(message: string, ...args: any[]) {
    // Always log errors, but still respect global disable
    const globalEnabled = localStorage.getItem('debug:enabled');
    if (globalEnabled !== 'false') {
      console.error(`[${this.prefix}] ${message}`, ...args);
    }
  }

  // Utility methods for common patterns
  render(componentInfo: string, data?: any) {
    if (this.isEnabled()) {
      console.log(`[${this.prefix}] RENDER: ${componentInfo}`, data || '');
    }
  }

  connection(state: string, url?: string) {
    if (this.isEnabled()) {
      console.log(`[${this.prefix}] Connection state changed: ${state}${url ? ` for ${url}` : ''}`);
    }
  }
}

export const createDebugLogger = (prefix: string) => new DebugLogger(prefix);

// Helper to quickly disable all debug logs
export const disableAllDebugLogs = () => {
  localStorage.setItem('debug:enabled', 'false');
  console.log('🔇 All debug logs disabled. Refresh page to take effect.');
};

// Helper to enable all debug logs
export const enableAllDebugLogs = () => {
  localStorage.removeItem('debug:enabled');
  console.log('🔊 All debug logs enabled. Refresh page to take effect.');
};

// Helper to disable only component render logs
export const disableComponentRenderLogs = () => {
  localStorage.setItem('debug:components', 'false');
  console.log('🔇 Component render logs disabled. Refresh page to take effect.');
};

// Helper to disable performance logs
export const disablePerformanceLogs = () => {
  localStorage.setItem('debug:performance', 'false');
  console.log('🔇 Performance logs disabled. Refresh page to take effect.');
};

// Helper to set logger level to error only (for binance ticker logs)
export const disableBinanceLogs = () => {
  localStorage.setItem('LOG_LEVEL', 'error');
  console.log('🔇 Binance connection logs disabled. Refresh page to take effect.');
};

// Helper to enable debug level logs  
export const enableDebugLogs = () => {
  localStorage.setItem('LOG_LEVEL', 'debug');
  console.log('🔊 Debug level logs enabled. Refresh page to take effect.');
};

// Make functions available globally in development
if (import.meta.env.DEV) {
  (window as any).disableAllDebugLogs = disableAllDebugLogs;
  (window as any).enableAllDebugLogs = enableAllDebugLogs;
  (window as any).disableComponentRenderLogs = disableComponentRenderLogs;
  (window as any).disablePerformanceLogs = disablePerformanceLogs;
  (window as any).disableBinanceLogs = disableBinanceLogs;
  (window as any).enableDebugLogs = enableDebugLogs;
}
