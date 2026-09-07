import type { ScenarioMeta } from '../../types.js';

export const PREPARED_STATEMENT_ITERATIONS = 50;

// f_int8 is deliberately excluded: pg returns int8 as a string by default,
// postgres.js always as BigInt, postgrejs as number-or-BigInt depending on
// magnitude - three genuinely different output types/mechanisms, not just
// three implementations of the same decode. Timing that column measures
// "how much conversion work does each library choose to do" rather than
// prepared-statement reuse cost, which would skew this scenario's numbers
// without saying anything meaningful. mixed_types still has the column
// (and bench.setup still seeds it) for a dedicated, clearly-labeled
// comparison later - it's just left out of this SELECT list.
export function preparedStatementSql(schema: string): string {
  return (
    'select id, f_int2, f_int4, f_float4, f_float8, f_varchar, f_json, ' +
    `f_jsonb, f_timestamp, f_timestamptz, f_bytea from ${schema}.mixed_types ` +
    'where id = $1'
  );
}

export const PREPARED_STATEMENT_REUSE_SCENARIO: ScenarioMeta = {
  name: 'prepared-statement-reuse',
  title: 'Prepared Statement Reuse (Sequential)',
  description: `Prepare once and execute ${PREPARED_STATEMENT_ITERATIONS} times,
one at a time, each awaited before the next starts. Each library uses its
own prepared-statement mechanism: postgres.js auto-prepares, pg uses a
named statement, PostgreJS uses explicit prepare()/execute()/close().

Compare it against the Concurrent variant below to see what overlapping
executions of the same reused statement buys each library.

Excludes int8: pg, postgres.js and PostgreJS return it as genuinely
different JS types by default (string, BigInt, number-or-BigInt), so
timing it would measure type-conversion choice, not reuse cost.`,
  // One iteration here is PREPARED_STATEMENT_ITERATIONS sequential round
  // trips (~25ms), so the defaults used elsewhere would leave the reported
  // mean resting on ~20 samples of a quantity that varies with whatever
  // else the machine is doing - measured swings of 23-41ms between runs of
  // identical work, enough to reorder the table by itself. More samples,
  // and more warmup before them, buy a mean that reflects the library
  // rather than the minute it ran in.
  bench: {
    time: 2000,
    iterations: 60,
    warmupTime: 300,
    warmupIterations: 10,
  },
};
