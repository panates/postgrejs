import process from 'node:process';
import type { LibId } from '../types.js';
import type { Adapter } from './adapter.js';

/**
 * Dynamic-import map so a `pg-native` adapter (out of scope for v1: it
 * requires a system libpq + native compilation, not guaranteed on
 * CI/contributor machines) can be added later behind an opt-in
 * `--lib=pg-native` flag without ever being part of the default matrix.
 */
// Order matters: DEFAULT_LIB_IDS (below) drives the default --lib=all run
// order, and whichever library runs first in a given process/scenario
// tends to look slower/noisier (process/CPU warm-up, not a real code
// difference - confirmed by reversing the order and seeing the "slower"
// library flip). PostgreJS is kept out of the first slot so it isn't the
// one absorbing that bias by default.
const ADAPTER_LOADERS: Record<LibId, () => Promise<Adapter>> = {
  pg: async () => (await import('./pg.adapter.js')).pgAdapter,
  postgrejs: async () =>
    (await import('./postgrejs.adapter.js')).postgrejsAdapter,
  postgres: async () => (await import('./postgres.adapter.js')).postgresAdapter,
  bun: async () => (await import('./bun-sql.adapter.js')).bunSqlAdapter,
};

/**
 * Every adapter this registry knows how to load, including opt-in-only
 * ones - used for validating a user-supplied `--lib` id, not for
 * expanding `--lib=all` (see DEFAULT_LIB_IDS for that).
 */
export const ALL_LIB_IDS = Object.keys(ADAPTER_LOADERS) as LibId[];

/**
 * What `--lib=all` expands to - runtime-dependent, not a fixed list:
 * `bun`'s native SQL client only exists inside the `bun` executable, and
 * every worker is spawned via `process.execPath` (see
 * runner/orchestrator.ts's spawnWorker), which re-invokes whichever
 * executable is running *this* process. So when this orchestrator itself
 * is running under `bun` (`npm run bench:bun`), `bun` belongs in the
 * default matrix alongside pg/postgres/postgrejs - the whole point is
 * comparing all four under the same runtime. Under a plain `node`
 * invocation (`npm run bench`), including it would crash every worker
 * trying to `import('bun')`, so it's excluded there. Either way, `--lib=bun`
 * still works as an explicit override on any runtime (it just won't
 * succeed unless that runtime is actually bun).
 */
export const DEFAULT_LIB_IDS = process.versions.bun
  ? ALL_LIB_IDS
  : ALL_LIB_IDS.filter(id => id !== 'bun');

export function isLibId(value: string): value is LibId {
  return Object.prototype.hasOwnProperty.call(ADAPTER_LOADERS, value);
}

export async function loadAdapter(id: LibId): Promise<Adapter> {
  const loader = ADAPTER_LOADERS[id];
  if (!loader) throw new Error(`Unknown benchmark adapter "${id}"`);
  return loader();
}
