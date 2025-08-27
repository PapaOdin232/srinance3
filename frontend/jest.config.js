export default {
  // Enable ESM preset so ts-jest preserves import.meta
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'jsdom',
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  globals: {
    'ts-jest': {
      useESM: true,
      tsconfig: '<rootDir>/tsconfig.app.json'
    }
  },
  transform: {
    '^.+\\.(ts|tsx)$': [
      'ts-jest',
      {
        useESM: true,
  diagnostics: false,
        tsconfig: {
          module: 'ESNext',
          target: 'ES2022',
          jsx: 'react-jsx'
        }
      }
    ]
  },
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts'],
  moduleNameMapper: {
    // Map style imports to a simple mock to avoid extra dev deps
    '^.+\\.(css|less|scss|sass)$': '<rootDir>/src/__mocks__/styleMock.ts',
    // Support ESM TS path imports that end with .js in transpiled code
  '^(\\.{1,2}/.*)\\.js$': '$1',
  '^lightweight-charts$': '<rootDir>/src/__mocks__/lightweight-charts.ts'
  },
  // Force transformation of modules that use import.meta
  transformIgnorePatterns: [
    'node_modules/(?!(lightweight-charts|@mantine|@tabler)/)'
  ]
};
