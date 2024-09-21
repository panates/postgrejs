module.exports = {
  testEnvironment: 'node',
  verbose: true,
  maxWorkers: '50%',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+.ts?$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/test/tsconfig.json',
        isolatedModules: true,
      },
    ],
  },
  moduleNameMapper: {
    '(\\..+)\\.js': '$1',
    postgrejs: '<rootDir>/src',
  },
  globalSetup: '<rootDir>/test/_support/global_setup.ts',
  modulePathIgnorePatterns: ['<rootDir>/build'],
  coveragePathIgnorePatterns: ['/build/', '/node_modules/', '_support'],
  coverageReporters: ['lcov', 'json-summary'],
  coverageDirectory: '<rootDir>/coverage/',
  reporters: [
    'default',
    [
      'jest-junit',
      {
        outputDirectory: 'reports',
        outputName: 'jest-junit.xml',
        ancestorSeparator: ' › ',
        uniqueOutputName: 'false',
        suiteNameTemplate: '{filepath}',
        classNameTemplate: '{classname}',
        titleTemplate: '{title}',
      },
    ],
  ],
};
