import type { LibId } from '../types.js';
import type { Adapter } from './adapter.js';

/**
 * Dynamic-import map so a `pg-native` adapter (out of scope for v1: it
 * requires a system libpq + native compilation, not guaranteed on
 * CI/contributor machines) can be added later behind an opt-in
 * `--lib=pg-native` flag without ever being part of the default matrix.
 */
// Order matters: ALL_LIB_IDS (below) drives the default --lib=all run
// order, and whichever library runs first in a given process/scenario
// tends to look slower/noisier (process/CPU warm-up, not a real code
// difference - confirmed by reversing the order and seeing the "slower"
// library flip). postgrejs is kept out of the first slot so it isn't the
// one absorbing that bias by default.
const ADAPTER_LOADERS: Record<LibId, () => Promise<Adapter>> = {
  pg: async () => (await import('./pg.adapter.js')).pgAdapter,
  postgrejs: async () =>
    (await import('./postgrejs.adapter.js')).postgrejsAdapter,
  postgres: async () => (await import('./postgres.adapter.js')).postgresAdapter,
};

export const ALL_LIB_IDS = Object.keys(ADAPTER_LOADERS) as LibId[];

export function isLibId(value: string): value is LibId {
  return Object.prototype.hasOwnProperty.call(ADAPTER_LOADERS, value);
}

export async function loadAdapter(id: LibId): Promise<Adapter> {
  const loader = ADAPTER_LOADERS[id];
  if (!loader) throw new Error(`Unknown benchmark adapter "${id}"`);
  return loader();
}
