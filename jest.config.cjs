module.exports = {
  testEnvironment: 'node',
  verbose: true,
  forceExit: true,
  detectOpenHandles: true,
  maxWorkers: 1,
  coveragePathIgnorePatterns: [
    '/build/',
    '/dist/',
    '/packages/oracle/',
    '/node_modules/',
    '_support',
    '_shared'
  ],
  coverageReporters: ['lcov', 'text'],
  coverageDirectory: '<rootDir>/coverage/',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+.ts?$': ['ts-jest', {
      'tsconfig': '<rootDir>/test/tsconfig.json'
    }]
  },
  moduleNameMapper: {
    '(\\..+)\\.js': '$1',
    'postgresql-client': '<rootDir>/src'
  },
  globalSetup: '<rootDir>/test/_support/env.ts'
};
