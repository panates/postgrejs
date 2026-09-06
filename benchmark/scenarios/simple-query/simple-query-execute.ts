import type { ScenarioMeta } from '../../types.js';

export const SIMPLE_QUERY_SQL = 'select 1 as one';

export const SIMPLE_QUERY_EXECUTE_SCENARIO: ScenarioMeta = {
  name: 'simple-query-execute',
  title: 'Sequential Execution',
  description:
    'Run `select 1` on an already-open connection one call at a time - ' +
    'each call is fully awaited before the next one starts, using each ' +
    "library's genuine Simple Query path (postgrejs's execute(), pg's " +
    "query(text) with no params, postgres.js's unsafe() with no args, " +
    'which sends a real Simple Query message regardless of any prepare ' +
    "option). The baseline for this group: one round trip's plain cost " +
    'with no concurrency, no pooling, no bind parameters - compare ' +
    'against Concurrent Execution below to see what overlapping calls on ' +
    'the same connection buys each library',
  bench: {
    // Sub-millisecond op: a short warmup risks measuring before every
    // library's code path has fully JIT-optimized (postgrejs's protocol
    // encode/decode call graph is deeper than pg's/postgres.js's, so it
    // would need more warmup calls to reach steady state) - both windows
    // are widened well past that to keep the comparison fair.
    time: 1500,
    iterations: 100,
    warmupTime: 300,
    warmupIterations: 50,
  },
};
