import type { ScenarioMeta } from '../../types.js';

export const SIMPLE_QUERY_EXECUTE_CONCURRENT_CONCURRENCY = 100;

export function simpleQueryExecuteConcurrentSql(i: number): string {
  return `select ${i} as val`;
}

export const SIMPLE_QUERY_EXECUTE_CONCURRENT_SCENARIO: ScenarioMeta = {
  name: 'simple-query-execute-concurrent',
  title: 'Concurrent Execution',
  description: `The concurrent counterpart to Sequential Execution above. Fire
${SIMPLE_QUERY_EXECUTE_CONCURRENT_CONCURRENCY} Simple Query calls on the SAME
already-open connection without awaiting each one individually, then await
them all via Promise.all().

PostgreJS pipelines these at the wire level: it writes each message without
waiting for the previous one's response, then matches responses back in
FIFO order, so results never cross-talk even though the caller never
awaited between calls.

Each call selects a distinct literal and checks the result against it, so
this scenario verifies correctness too - do the other libraries' single
connections queue/pipeline correctly? - not just timing. Without distinct
values every response would be interchangeable and a client that matched
them back to the wrong caller would still return a valid row for each,
reporting a fast but wrong number instead of failing.

The distinct literal costs nothing on the server and does not turn this
into a measurement of statement preparation: the Simple Query protocol has
no server-side statement cache, so PostgreSQL parses, rewrites and plans
every Query message it receives even when the text is byte-identical to
the previous one. Measured, 100 concurrent calls with a constant literal
land within noise of the varying one (Node -2.5% to +1.5% across repeats,
Bun +0.3% - the sign flips between runs). Simple Query has no bind
parameters to carry the distinct value instead, which is why this varies
the text where the Extended Query counterpart varies a parameter.`,
  bench: {
    time: 1500,
    iterations: 100,
    warmupTime: 300,
    warmupIterations: 50,
  },
};
