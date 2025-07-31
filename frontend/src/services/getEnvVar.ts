// getEnvVar.ts - Helper for environment variables in Vite

// Whitelist dozwolonych kluczy środowiskowych dla bezpieczeństwa
const ALLOWED_ENV_KEYS = [
  'VITE_API_URL',
  'VITE_WS_URL', 
  'VITE_API_KEY',
  'VITE_SECRET_KEY',
  'VITE_AUTH_TOKEN',
  'MODE',
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
  
  // Use Vite's import.meta.env instead of process.env
  const envValue = import.meta.env[key];
  return envValue ?? fallback ?? '';
}
