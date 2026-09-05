import type { ScenarioMeta } from '../types.js';

export const SIMPLE_QUERY_EXECUTE_CONCURRENT_CONCURRENCY = 50;

export function simpleQueryExecuteConcurrentSql(i: number): string {
  return `select ${i} as val`;
}

export const SIMPLE_QUERY_EXECUTE_CONCURRENT_SCENARIO: ScenarioMeta = {
  name: 'simple-query-execute-concurrent',
  title: 'Concurrent Execution',
  description:
    'The concurrent counterpart to Sequential Execution above: fire ' +
    `${SIMPLE_QUERY_EXECUTE_CONCURRENT_CONCURRENCY} Simple Query calls on ` +
    'the SAME already-open connection without awaiting each one ' +
    'individually, then await them all via Promise.all() - postgrejs ' +
    'pipelines these at the wire level (writes each message without ' +
    "waiting for the previous one's response, matches responses back in " +
    'FIFO order) so results never cross-talk even though the caller never ' +
    'awaited between calls. Each call selects a distinct literal and the ' +
    'result is checked against it, so this scenario verifies correctness ' +
    "(do the other libraries' single connections queue/pipeline correctly " +
    'too?), not just timing',
  bench: {
    time: 1500,
    iterations: 100,
    warmupTime: 300,
    warmupIterations: 50,
  },
};
