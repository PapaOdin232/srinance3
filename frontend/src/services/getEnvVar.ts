// getEnvVar.ts - tylko process.env, do użycia w testach i kodzie współdzielonym

// Whitelist dozwolonych kluczy środowiskowych dla bezpieczeństwa
const ALLOWED_ENV_KEYS = [
  'VITE_API_URL',
  'VITE_WS_URL', 
  'VITE_API_KEY',
  'VITE_SECRET_KEY',
  'VITE_AUTH_TOKEN',
  'NODE_ENV',
  'API_URL',
  'WS_URL'
] as const;

type AllowedEnvKey = typeof ALLOWED_ENV_KEYS[number];

export function getEnvVar(key: AllowedEnvKey, fallback?: string): string {
  // Sprawdź czy klucz jest na whitelist
  if (!ALLOWED_ENV_KEYS.includes(key)) {
    console.warn(`Environment key '${key}' is not in allowed list`);
    return fallback ?? '';
  }
  
  if (typeof process !== 'undefined' && typeof process.env !== 'undefined' && Object.prototype.hasOwnProperty.call(process.env, key)) {
    return process.env[key] ?? fallback ?? '';
  }
  return fallback ?? '';
}
