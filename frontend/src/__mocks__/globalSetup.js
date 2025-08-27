// Global setup for Jest to support import.meta
global.import = {
  meta: {
    env: {
      DEV: true,
      PROD: false,
      VITE_WS_URL: 'ws://localhost:8080',
      VITE_API_URL: 'http://localhost:3000',
      VITE_LOG_LEVEL: 'debug'
    }
  }
};
