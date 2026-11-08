process.env.TS_NODE_PROJECT = __dirname + '/tsconfig-test.json';

/** @type {import('mocha').MochaOptions} */
module.exports = {
  require: [
    '@swc-node/register/esm-register',
    __dirname + '/packages/postgrejs/test/_support/env.ts',
    __dirname + '/packages/postgrejs/test/_support/create-db.ts',
  ],
  extension: ['ts'],
  spec: './packages/*/test/**/*.*spec.ts',
  timeout: 30000,
};
