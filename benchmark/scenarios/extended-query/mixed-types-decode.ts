import type { ScenarioMeta } from '../../types.js';

export const MIXED_TYPES_DECODE_ROW_TARGET = 1000;

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
  description: `Fetch ${MIXED_TYPES_DECODE_ROW_TARGET} mixed-type rows (int2/int4/
float4/float8/varchar/json/jsonb/timestamp/timestamptz/bytea) via each
library's Extended Query path - PostgreJS's query(), a one-shot
parameterized call, not a reused prepared statement - and decode them to
JS values. The row count is itself a real bind parameter ($1), not a
literal, and large enough that column-decode work dominates the
measurement rather than per-call round-trip overhead.

This is the Extended Query counterpart to Simple Query Fetch above: the
raw decode cost this protocol carries per call, before Prepared Statement
Reuse below measures what reusing the parsed plan saves.

Excludes int8: pg, postgres.js and PostgreJS return it as genuinely
different JS types by default (string, BigInt, number-or-BigInt). Timing
that column would measure type-conversion choice, not decode speed.

Forces PostgreJS onto the text protocol explicitly. Its Extended Query
default is binary, per-column, unlike pg and postgres.js, which are always
text here - pg's binary mode is opt-in and never requested, and
postgres.js has no binary protocol support at all. Without that, this
scenario would compare binary decode against text decode, not decode
speed.`,
  bench: {
    time: 500,
    iterations: 30,
    warmupTime: 100,
    warmupIterations: 5,
  },
};
