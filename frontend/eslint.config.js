import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { globalIgnores } from 'eslint/config'

// Uwaga: większość problemów z raportu Codacy pochodziła z analizowania plików zbudowanych (dist/*).
// Dodajemy szerokie ignorowanie oraz zawężamy reguły do źródeł.
export default tseslint.config([
  // Ignoruj wszystkie katalogi build artefacts / cache
  globalIgnores([
    '**/dist/**',
    'dist',
    '**/coverage/**',
  ]),
  // Konfiguracja dla kodu źródłowego TS/TSX
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      // Możliwe dalsze wyłączenia / dopasowania przy potrzebie
    },
  },
  // Testy – dodaj globalne zmienne środowiska testowego (jest / jsdom)
  {
    files: ['**/*.test.{ts,tsx}', '**/__tests__/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        // eslint-plugin-jest można dodać później; na razie same globalne zmienne
        jest: true,
      },
    },
  },
])
