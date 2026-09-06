import type { ScenarioMeta } from '../../types.js';

export const MIXED_TYPES_DECODE_ROW_TARGET = 1000;

// f_int8 is deliberately excluded: pg returns int8 as a string by default,
// postgres.js always as BigInt, postgrejs as number-or-BigInt depending on
// magnitude - three genuinely different output types/mechanisms, not just
// three implementations of the same decode. Timing that column measures
// "how much conversion work does each library choose to do" rather than
// "how fast is the decode path", which would skew this scenario's numbers
// without saying anything meaningful. bulk_rows still has the column (and
// bench.setup still seeds it) for a dedicated, clearly-labeled comparison
// later - it's just left out of this SELECT list.
//
// The row limit is a real bind parameter ($1), not a literal - a single-
// row select here would measure per-call round-trip/Parse+Bind+Describe+
// Execute overhead almost exclusively (decoding one row's worth of columns
// is a fixed, tiny cost next to that), not decode throughput. Fetching
// SIMPLE_QUERY_FETCH-sized row counts makes the actual column-decode work
// dominate the measurement, which is what this scenario is meant to
// isolate - the Extended Query counterpart to Simple Query Fetch above.
export function mixedTypesDecodeSql(schema: string): string {
  return (
    'select id, f_int2, f_int4, f_float4, f_float8, f_varchar, f_json, ' +
    `f_jsonb, f_timestamp, f_timestamptz, f_bytea from ${schema}.bulk_rows ` +
    'order by id limit $1'
  );
}

export const MIXED_TYPES_DECODE_SCENARIO: ScenarioMeta = {
  name: 'mixed-types-decode',
  title: 'Mixed-Type Decode (Text Protocol)',
  description:
    `Fetch ${MIXED_TYPES_DECODE_ROW_TARGET} mixed-type rows (int2/int4/` +
    'float4/float8/varchar/json/jsonb/timestamp/timestamptz/bytea) via ' +
    "each library's Extended Query path (PostgreJS's query(), a one-shot " +
    'parameterized call, not a reused prepared statement) and decode them ' +
    'to JS values - the row count is itself a real bind parameter ($1), ' +
    'not a literal, and large enough that column-decode work dominates ' +
    'the measurement rather than per-call round-trip overhead. The ' +
    'Extended Query counterpart to Simple Query Fetch above, and the raw ' +
    'decode cost this protocol carries per call, before Prepared ' +
    'Statement Reuse below measures what reusing the parsed plan saves. ' +
    'Excludes int8: pg/postgres.js/PostgreJS return it as genuinely ' +
    'different JS types by default (string/BigInt/number-or-BigInt), so ' +
    'timing it would measure type-conversion choice, not decode speed. ' +
    'Forces PostgreJS onto the text protocol explicitly (its Extended ' +
    'Query default is binary, per-column, unlike pg and postgres.js, ' +
    "which are always text here - pg's binary mode is opt-in and never " +
    'requested, postgres.js has no binary protocol support at all) - ' +
    'without that, this would compare binary decode against text decode, ' +
    'not decode speed',
  bench: {
    time: 500,
    iterations: 30,
    warmupTime: 100,
    warmupIterations: 5,
  },
};
