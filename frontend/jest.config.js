export default {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  // Fix: Użyj resolve zamiast bezpośredniego path template aby uniknąć XSS
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts'],
  moduleNameMapping: {
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
  },
};
