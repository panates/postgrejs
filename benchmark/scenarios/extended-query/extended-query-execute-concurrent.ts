import type { ScenarioMeta } from '../../types.js';

export const EXTENDED_QUERY_EXECUTE_CONCURRENT_CONCURRENCY = 50;
export const EXTENDED_QUERY_EXECUTE_CONCURRENT_SQL = 'select $1::int2 as val';

export const EXTENDED_QUERY_EXECUTE_CONCURRENT_SCENARIO: ScenarioMeta = {
  name: 'extended-query-execute-concurrent',
  title: 'Concurrent Execution',
  description:
    'The concurrent counterpart to Sequential Execution above, same ' +
    "shape as the Simple Query group's Concurrent Execution: fire " +
    `${EXTENDED_QUERY_EXECUTE_CONCURRENT_CONCURRENCY} genuine Extended ` +
    'Query calls (`select $1::int2`, a real bind parameter, not a ' +
    'reused/cached statement) on the SAME already-open connection ' +
    'without awaiting each one individually, then await them all via ' +
    'Promise.all() - PostgreJS pipelines these at the wire level so ' +
    'results never cross-talk even though the caller never awaited ' +
    'between calls. Each call binds a distinct value and the result is ' +
    'checked against it, so this scenario verifies correctness (do the ' +
    "other libraries' single connections queue/pipeline Extended Query " +
    'calls correctly too?), not just timing',
  bench: {
    time: 1500,
    iterations: 100,
    warmupTime: 300,
    warmupIterations: 50,
  },
};
