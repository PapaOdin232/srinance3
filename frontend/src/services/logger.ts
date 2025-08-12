// Lightweight leveled logger to control noisy console output.
// Usage: import { logger } from './logger'; logger.debug('msg');
// Levels: error < warn < info < debug < trace
// Configure via VITE_LOG_LEVEL (default 'info') or localStorage.setItem('LOG_LEVEL','debug') for session.

type LevelName = 'error' | 'warn' | 'info' | 'debug' | 'trace';

const levelPriority: Record<LevelName, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  trace: 4,
};

function resolveLevel(): LevelName {
  const ls = (typeof window !== 'undefined' && (window.localStorage.getItem('LOG_LEVEL') as LevelName)) || null;
  const env = (import.meta as any).env?.VITE_LOG_LEVEL as LevelName | undefined;
  const chosen = ls || env || 'info';
  if (levelPriority[chosen] === undefined) return 'info';
  return chosen;
}

let currentLevel: LevelName = resolveLevel();

declare global {
  interface Window { __setLogLevel?: (lvl: LevelName) => void }
}

if (typeof window !== 'undefined') {
  window.__setLogLevel = (lvl: LevelName) => {
    if (levelPriority[lvl] !== undefined) {
      currentLevel = lvl;
      try { window.localStorage.setItem('LOG_LEVEL', lvl); } catch {}
      // eslint-disable-next-line no-console
      console.info('[logger] level set to', lvl);
    }
  };
}

function log(level: LevelName, prefix: string, args: any[]) {
  if (levelPriority[level] <= levelPriority[currentLevel]) {
    const method = level === 'trace' ? 'debug' : level;
    // eslint-disable-next-line no-console
    (console as any)[method](`[${prefix}]`, ...args);
  }
}

class Logger {
  private prefix: string;
  constructor(prefix: string) {
    this.prefix = prefix;
  }
  error = (...args: any[]) => log('error', this.prefix, args);
  warn = (...args: any[]) => log('warn', this.prefix, args);
  info = (...args: any[]) => log('info', this.prefix, args);
  debug = (...args: any[]) => log('debug', this.prefix, args);
  trace = (...args: any[]) => log('trace', this.prefix, args);
  child(suffix: string) { return new Logger(`${this.prefix}:${suffix}`); }
}

export const createLogger = (prefix: string) => new Logger(prefix);
export const logger = createLogger('app');

export function setLoggerLevel(lvl: LevelName) {
  if (levelPriority[lvl] !== undefined) {
    currentLevel = lvl;
  }
}
