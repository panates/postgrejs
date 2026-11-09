import type { ScenarioMeta } from '../../types.js';
import { EXTENDED_QUERY_SQL } from '../extended-query/extended-query-execute.js';

export const POOL_EXTENDED_QUERY_EXECUTE_CONCURRENCY = 1000;
export const POOL_EXTENDED_QUERY_EXECUTE_POOL_SIZE = 10;

export const POOL_EXTENDED_QUERY_EXECUTE_SCENARIO: ScenarioMeta = {
  name: 'pool-extended-query-execute',
  title: 'Pooled Extended Query',
  description: `The Extended Query counterpart to Pooled Simple Query above: the
same ${POOL_EXTENDED_QUERY_EXECUTE_CONCURRENCY} concurrent calls against a
pool of max size ${POOL_EXTENDED_QUERY_EXECUTE_POOL_SIZE}, but binding a
real query parameter (\`${EXTENDED_QUERY_SQL}\`) so every library goes
through Parse/Bind/Describe/Execute/Sync instead of a single Query
message.

Each call is a one-shot statement, not a reused prepared one, so this
shows what a pool costs on top of the per-call Extended Query overhead.
Compare it against this group's Pooled Simple Query to see what the extra
protocol round of messages adds once connections are being shared.

Read the margin here with that one-shot constraint in mind. postgres.js's
unprepared path (\`sql.unsafe(query, args)\`, the same call the
single-connection Sequential Execution scenario uses, where it comes out
ahead) does not pipeline a burst the way its prepared path does. Letting
it cache the statement instead turns this into a different measurement
entirely, which is what Prepared Statement Reuse below covers.`,
  bench: {
    time: 800,
    iterations: 5,
    warmupTime: 200,
    warmupIterations: 1,
  },
};
