import '@testing-library/jest-dom';
// Wydłuż globalny timeout testów (cięższe testy komponentów + coverage)
jest.setTimeout(20000);

// Setup import.meta for Vite environment in tests
Object.defineProperty(global, 'import', {
  value: {
    meta: {
      env: {
        DEV: true,
        PROD: false,
        VITE_WS_URL: 'ws://localhost:8080',
        VITE_API_URL: 'http://localhost:3000',
        VITE_LOG_LEVEL: 'debug',
        VITE_ENABLE_BINANCE_STREAMS: 'false',
        VITE_MARKET_QUOTES: 'USDT,BTC,ETH,BNB',
        VITE_MAX_TICKER_SUBS: '100'
      }
    }
  },
  writable: true
});

// Mock dla HTMLCanvasElement.getContext (Chart.js)
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  value: () => {
    // Można rozbudować mock jeśli testy będą tego wymagać
    return {
      fillRect: () => {},
      clearRect: () => {},
      getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Array(w * h * 4) }),
      putImageData: () => {},
      createImageData: () => [],
      setTransform: () => {},
      drawImage: () => {},
      save: () => {},
      fillText: () => {},
      restore: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      closePath: () => {},
      stroke: () => {},
      translate: () => {},
      scale: () => {},
      rotate: () => {},
      arc: () => {},
      fill: () => {},
      measureText: () => ({ width: 0 }),
      transform: () => {},
      rect: () => {},
      clip: () => {},
    };
  },
});

// Stub dla scrollIntoView używanego przez Mantine Combobox w JSDOM
if (!HTMLElement.prototype.scrollIntoView) {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    value: jest.fn(),
    writable: true,
    configurable: true,
  });
}

// Provide minimal env vars via process.env for tests
(process as any).env = {
  ...(process as any).env,
  NODE_ENV: 'test',
  VITE_API_URL: 'http://localhost:8001',
  VITE_WS_URL: 'ws://localhost:8001/ws',
  VITE_ENABLE_BINANCE_STREAMS: 'false',
  VITE_MARKET_QUOTES: 'USDT,BTC,ETH,BNB',
  VITE_MAX_TICKER_SUBS: '100'
};

// Mock global ResizeObserver for Mantine/ScrollArea
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Global fetch mock (dla komponentów używających secureApiCall / fetch)
if (!(global as any).fetch) {
  (global as any).fetch = jest.fn(async () => ({
    ok: true,
    json: async () => ({
      // Zwracamy strukturę obsługującą zarówno bot/config jak i bot/strategies
      config: {
        type: 'simple_ma',
        symbol: 'BTCUSDT',
        timeframe: '1m',
        parameters: {},
        risk_management: {
          max_position_size: 1000,
          stop_loss_percentage: 2,
          take_profit_percentage: 5,
        },
      },
      strategies: {
        simple_ma: { name: 'Simple MA' },
        rsi: { name: 'RSI' },
      },
    }),
  }));
}

// ================== Console Suppression ==================
const originalConsole = { ...console };
const SUPPRESSED_PATTERNS: RegExp[] = [
  /\[BinanceAPI\] Failed to fetch trading pairs/,
  /An update to .* inside a test was not wrapped in act/,
  /Setting up WebSocket for/,
  /WebSocket state changed:/,
  /Subscribing to .* via existing WebSocket/,
  // Szumowe logi panelu rynku i hooka wykresu (powtarzalne przy każdym teście)
  /^\[MarketPanel]/,
  /^\[useLightweightChart]/,
];

(['log','error','warn'] as const).forEach(level => {
  (console as any)[level] = (...args: any[]) => {
    const msg = args[0];
    if (typeof msg === 'string' && SUPPRESSED_PATTERNS.some(r => r.test(msg))) {
      return; // swallow
    }
    (originalConsole as any)[level](...args);
  };
});


