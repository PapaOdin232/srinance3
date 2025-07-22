// getViteEnvVar.ts - tylko import.meta.env, do użycia w kodzie uruchamianym przez Vite

// Whitelist dozwolonych kluczy środowiskowych dla bezpieczeństwa
const ALLOWED_VITE_ENV_KEYS = [
  'VITE_API_URL',
  'VITE_WS_URL', 
  'VITE_API_KEY',
  'VITE_SECRET_KEY',
  'MODE',
  'BASE_URL',
  'PROD',
  'DEV'
] as const;

type AllowedViteEnvKey = typeof ALLOWED_VITE_ENV_KEYS[number];

export function getViteEnvVar(key: AllowedViteEnvKey, fallback?: string): string {
  // Sprawdź czy klucz jest na whitelist
  if (!ALLOWED_VITE_ENV_KEYS.includes(key)) {
    console.warn(`Vite environment key '${key}' is not in allowed list`);
    return fallback ?? '';
  }
  
  // @ts-ignore
  if (typeof import.meta !== 'undefined' && typeof import.meta.env !== 'undefined' && Object.prototype.hasOwnProperty.call(import.meta.env, key)) {
    // @ts-ignore
    return import.meta.env[key] ?? fallback ?? '';
  }
  return fallback ?? '';
}
