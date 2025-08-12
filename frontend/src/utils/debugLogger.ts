/**
 * Debug logger that only logs when in development mode
 * Prevents console.log from blocking main thread in production
 */
export class DebugLogger {
  private prefix: string;
  private isDev: boolean;

  constructor(prefix: string) {
    this.prefix = prefix;
    this.isDev = import.meta.env.DEV;
  }

  log(message: string, ...args: any[]) {
    if (this.isDev) {
      console.log(`[${this.prefix}] ${message}`, ...args);
    }
  }

  warn(message: string, ...args: any[]) {
    if (this.isDev) {
      console.warn(`[${this.prefix}] ${message}`, ...args);
    }
  }

  error(message: string, ...args: any[]) {
    // Always log errors
    console.error(`[${this.prefix}] ${message}`, ...args);
  }
}

export const createDebugLogger = (prefix: string) => new DebugLogger(prefix);
