import type { ScenarioMeta } from '../../types.js';

export const EXTENDED_QUERY_SQL = 'select $1::int4 as one';
export const EXTENDED_QUERY_PARAM = 1;

export const EXTENDED_QUERY_EXECUTE_SCENARIO: ScenarioMeta = {
  name: 'extended-query-execute',
  title: 'Sequential Execution',
  description: `The Extended Query counterpart to the Simple Query group's
Sequential Execution above: one already-open connection, one call at a
time, each awaited before the next starts.

Instead of a literal, it selects an int4 value bound as a real query
parameter (\`select $1::int4\`), so every library genuinely goes through
Parse/Bind/Describe/Execute/Sync rather than a single Query message.

Unlike Prepared Statement Reuse below, there is no reused or cached
server-side statement here, so this isolates the one-shot per-call cost
Extended Query pays on top of the Simple Query baseline. Compare it
against Concurrent Execution below to see what overlapping calls buys
each library here too.

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
