import type { ScenarioMeta } from '../../types.js';

export const EXTENDED_QUERY_SQL = 'select $1::int2 as one';
export const EXTENDED_QUERY_PARAM = 1;

export const EXTENDED_QUERY_EXECUTE_SCENARIO: ScenarioMeta = {
  name: 'extended-query-execute',
  title: 'Sequential Execution',
  description: `The Extended Query counterpart to the Simple Query group's
Sequential Execution above: one already-open connection, one call at a
time, each awaited before the next starts.

Instead of a literal, it selects an int2 value bound as a real query
parameter (\`select $1::int2\`), so every library genuinely goes through
Parse/Bind/Describe/Execute/Sync rather than a single Query message.

Unlike Prepared Statement Reuse below, there is no reused or cached
server-side statement here, so this isolates the one-shot per-call cost
Extended Query pays on top of the Simple Query baseline. Compare it
against Concurrent Execution below to see what overlapping calls buys
each library here too.`,
  bench: {
    time: 1500,
    iterations: 100,
    warmupTime: 300,
    warmupIterations: 50,
  },
};
