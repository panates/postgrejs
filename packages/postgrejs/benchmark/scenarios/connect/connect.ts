import type { ScenarioMeta } from '../../types.js';

export const CONNECT_SCENARIO: ScenarioMeta = {
  name: 'connect',
  title: 'Connect',
  description:
    'Open a fresh connection/session and close it, repeated per sample',
  bench: {
    time: 500,
    iterations: 10,
    warmupTime: 100,
    warmupIterations: 2,
  },
};
