// API Configuration
export const API_CONFIG = {
  // W środowisku deweloperskim używaj localhost, w produkcji HTTPS
  BASE_URL: import.meta.env.VITE_API_URL || 'http://localhost:8001',
  
  // Endpoints
  ENDPOINTS: {
    BOT_CONFIG: '/bot/config',
    BOT_STRATEGIES: '/bot/strategies',
    BOT_START: '/bot/start',
    BOT_STOP: '/bot/stop',
    BOT_STATUS: '/bot/status',
    ACCOUNT_INFO: '/account/info',
    MARKET_DATA: '/market/data',
  }
};

// Helper function to build full URL
export const buildApiUrl = (endpoint: string): string => {
  return `${API_CONFIG.BASE_URL}${endpoint}`;
};

// Secure fetch wrapper
export const secureApiCall = async (endpoint: string, options?: RequestInit) => {
  const url = buildApiUrl(endpoint);
  
  // W produkcji, sprawdź czy URL jest HTTPS
  if (import.meta.env.MODE === 'production' && !url.startsWith('https://')) {
    throw new Error('Production requires HTTPS connections');
  }
  
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
};
