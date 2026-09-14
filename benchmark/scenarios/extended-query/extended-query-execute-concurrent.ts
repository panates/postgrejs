import type { ScenarioMeta } from '../../types.js';

export const EXTENDED_QUERY_EXECUTE_CONCURRENT_CONCURRENCY = 50;
export const EXTENDED_QUERY_EXECUTE_CONCURRENT_SQL = 'select $1::int4 as val';

export const EXTENDED_QUERY_EXECUTE_CONCURRENT_SCENARIO: ScenarioMeta = {
  name: 'extended-query-execute-concurrent',
  title: 'Concurrent Execution',
  description: `The concurrent counterpart to Sequential Execution above, same
shape as the Simple Query group's Concurrent Execution.

Fire ${EXTENDED_QUERY_EXECUTE_CONCURRENT_CONCURRENCY} genuine Extended Query
calls (\`select $1::int4\`, a real bind parameter, not a reused/cached
statement) on the SAME already-open connection without awaiting each one
individually, then await them all via Promise.all(). PostgreJS pipelines
these at the wire level, so results never cross-talk even though the
caller never awaited between calls.

Each call binds a distinct value and checks the result against it, so this
scenario verifies correctness too - do the other libraries' single
connections queue/pipeline Extended Query calls correctly? - not just
timing.

The cast is \`int4\`, not a narrower integer type, on purpose. Libraries
differ in whether they declare parameter types at all: PostgreJS names an
OID for every parameter in Parse (int4 for a JS number), while pg and
postgres.js send none and let the server infer each one from context. With
a narrower target - \`$1::int2\` - that difference stops being free: the
server has to wrap PostgreJS's int4 parameter in a runtime cast that the
others never pay for, and this scenario ends up measuring type-declaration
policy rather than Extended Query speed. Measured with a counterbalanced
A/B/B/A run (each library taking both positions in the pair, so ordering
bias cancels - it is worth ~1.4 points here on its own): against pg,
\`$1::int2\` put PostgreJS 4.3% behind on average, \`$1::int4\` 0.5%, which
is inside this measurement's noise. Keep the parameter's declared type and
the cast's target the same.`,
  bench: {
    time: 1500,
    iterations: 100,
    warmupTime: 300,
    warmupIterations: 50,
  },
};
