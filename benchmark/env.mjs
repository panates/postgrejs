// Preload step for worker.ts child processes.
//
// @swc-node/register only picks up `paths`/`baseUrl` (needed for the
// `postgrejs` package-name alias, mirrored from test/tsconfig.json) when
// `TS_NODE_PROJECT` is set *before* `@swc-node/register/esm-register`
// initializes, so it must be pointed to explicitly here rather than relying
// on auto-discovery. This file is passed as an earlier `--import` than the
// register hook itself, the same two-step trick `.mocharc.cjs` uses (env.ts
// requires before the register hook runs).
process.env.TS_NODE_PROJECT = new URL(
  './tsconfig.json',
  import.meta.url,
).pathname;
