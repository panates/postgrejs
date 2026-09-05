import type { ScenarioMeta } from '../types.js';

export const SIMPLE_QUERY_FETCH_ROW_TARGET = 1000;

// f_int8 is deliberately excluded: pg returns int8 as a string by default,
// postgres.js always as BigInt, postgrejs as number-or-BigInt depending on
// magnitude - three genuinely different output types/mechanisms, not just
// three implementations of the same decode. Timing that column measures
// "how much conversion work does each library choose to do" rather than
// "how fast is the decode path", which would skew this scenario's numbers
// without saying anything meaningful. bulk_rows still has the column (and
// bench.setup still seeds it) for a dedicated, clearly-labeled comparison
// later - it's just left out of this SELECT list.
export function simpleQueryFetchSql(schema: string, rowTarget: number): string {
  return (
    'select id, f_int2, f_int4, f_float4, f_float8, f_varchar, f_json, ' +
    `f_jsonb, f_timestamp, f_timestamptz, f_bytea from ${schema}.bulk_rows ` +
    `order by id limit ${rowTarget}`
  );
}

export const SIMPLE_QUERY_FETCH_SCENARIO: ScenarioMeta = {
  name: 'simple-query-fetch',
  title: 'Simple Query Fetch',
  description:
    `Fetch ${SIMPLE_QUERY_FETCH_ROW_TARGET} mixed-type rows via each ` +
    "library's Simple Query path (the same protocol as Sequential " +
    'Execution and Concurrent Execution above) on a single already-open ' +
    'connection, no pool - row-fetch throughput without the parse/bind/' +
    'describe overhead of the Extended Query protocol. Excludes int8: ' +
    'pg/postgres.js/postgrejs return it as genuinely different JS types ' +
    'by default (string/BigInt/number-or-BigInt), so timing it would ' +
    'measure type-conversion choice, not decode speed',
  bench: {
    time: 500,
    iterations: 30,
    warmupTime: 100,
    warmupIterations: 5,
  },
};
