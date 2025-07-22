// Uwaga: Codacy zgłosił potencjalny problem XSS przy setupFilesAfterEnv. Sprawdź, czy nie przekazujesz tu surowego HTML.
export default {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts'],
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
  },
};
