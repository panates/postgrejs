module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testEnvironment: 'node',
  verbose: true,
  forceExit: true,
  detectOpenHandles: true,
  maxWorkers: 1,
  testMatch: [
    '<rootDir>/test/**/*.spec.ts'
  ],
  testPathIgnorePatterns: ['/node_modules/'],
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest'
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  globals: {
    'ts-jest': {
      diagnostics: false,
      tsconfig: '<rootDir>/test/tsconfig.json',
      useESM: true
    }
  },
  extensionsToTreatAsEsm: ['.ts'],
  coverageDirectory: '<rootDir>/coverage/'
};


