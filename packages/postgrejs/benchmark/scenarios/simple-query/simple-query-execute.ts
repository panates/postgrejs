import type { ScenarioMeta } from '../../types.js';

export const SIMPLE_QUERY_SQL = 'select 1 as one';

export const SIMPLE_QUERY_EXECUTE_SCENARIO: ScenarioMeta = {
  name: 'simple-query-execute',
  title: 'Sequential Execution',
  description: `Run \`select 1\` one call at a time on an already-open connection.
Each call is fully awaited before the next one starts.

Every library uses its genuine Simple Query path: PostgreJS's execute(),
pg's query(text) with no params, postgres.js's unsafe() with no args -
always a real Simple Query message, regardless of any prepare option.

This is the baseline for the group: one round trip's plain cost, with no
concurrency, no pooling, and no bind parameters. Compare it against
Concurrent Execution below to see what overlapping calls on the same
connection buys each library.`,
  bench: {
    time: 1500,
    iterations: 100,
    warmupTime: 800,
    warmupIterations: 800,
  },
};
