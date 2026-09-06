import type { ScenarioMeta } from '../../types.js';
import { SIMPLE_QUERY_SQL } from '../simple-query/simple-query-execute.js';

export const POOL_SIMPLE_QUERY_EXECUTE_CONCURRENCY = 1000;
export const POOL_SIMPLE_QUERY_EXECUTE_POOL_SIZE = 10;

export const POOL_SIMPLE_QUERY_EXECUTE_SCENARIO: ScenarioMeta = {
  name: 'pool-simple-query-execute',
  title: 'Pooled Simple Query',
  description: `Same query as Sequential Execution/Concurrent Execution above,
run through a pool instead of a single open connection:
${POOL_SIMPLE_QUERY_EXECUTE_CONCURRENCY} concurrent \`${SIMPLE_QUERY_SQL}\`
queries against a pool of max size ${POOL_SIMPLE_QUERY_EXECUTE_POOL_SIZE},
using each library's own top-level pooled entry point.`,
  bench: {
    time: 800,
    iterations: 5,
    warmupTime: 200,
    warmupIterations: 1,
  },
};
