// Mock for logger to avoid import.meta.env issues in tests
type LevelName = 'error' | 'warn' | 'info' | 'debug' | 'trace';

class Logger {
  private prefix: string;
  constructor(_prefix: string) {
    this.prefix = _prefix;
  }
  error = (..._args: any[]) => {
    // No-op in tests
  };
  warn = (..._args: any[]) => {
    // No-op in tests
  };
  info = (..._args: any[]) => {
    // No-op in tests
  };
  debug = (..._args: any[]) => {
    // No-op in tests
  };
  trace = (..._args: any[]) => {
    // No-op in tests
  };
  child(_suffix: string) {
    return new Logger(`${this.prefix}:${_suffix}`);
  }
}

export const createLogger = (_prefix: string) => new Logger(_prefix);
export const logger = createLogger('app');

export function setLoggerLevel(_lvl: LevelName) {
  // No-op in tests
}
