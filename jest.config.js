/** @type {import('jest').Config} */
export default {
  testMatch: ['<rootDir>/tests/unit/**/*.test.ts', '<rootDir>/tests/api/**/*.test.ts'],
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: 'tsconfig.test.json',
      },
    ],
  },
  moduleNameMapper: {
    // Strip .js extensions from ESM-style imports so ts-jest resolves .ts files
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testEnvironment: 'node',
  forceExit: true,
  testTimeout: 30000,
  maxWorkers: '50%',
  workerIdleMemoryLimit: '512MB',
  collectCoverageFrom: [
    '**/*.ts',
    '!**/*.test.ts',
    '!**/node_modules/**',
    '!dist/**',
    '!gui/**',
    '!site/**',
    '!data/**',
    '!scripts/**',
    '!tools/**',
    '!seeds.ts',
    '!partition-server.ts',
    '!proxy-server.ts',
    '!orchestrator.ts',
    '!mcp-stdio.ts',
    '!mcp-stdio-remote.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text-summary', 'lcov', 'clover', 'json-summary'],
};
