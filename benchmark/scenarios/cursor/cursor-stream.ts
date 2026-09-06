import type { ScenarioMeta } from '../../types.js';

export const CURSOR_STREAM_ROW_TARGET = 50_000;
export const CURSOR_STREAM_BATCH_SIZE = 500;

// f_int8 is deliberately excluded: pg returns int8 as a string by default,
// postgres.js always as BigInt, postgrejs as number-or-BigInt depending on
// magnitude - three genuinely different output types/mechanisms, not just
// three implementations of the same decode. Timing that column measures
// "how much conversion work does each library choose to do" rather than
// streaming throughput, which would skew this scenario's numbers without
// saying anything meaningful. bulk_rows still has the column (and
// bench.setup still seeds it) for a dedicated, clearly-labeled comparison
// later - it's just left out of this SELECT list.
export function cursorStreamSql(schema: string, rowTarget: number): string {
  return (
    'select id, f_int2, f_int4, f_float4, f_float8, f_varchar, f_json, ' +
    `f_jsonb, f_timestamp, f_timestamptz, f_bytea from ${schema}.bulk_rows ` +
    `order by id limit ${rowTarget}`
  );
}

export const CURSOR_STREAM_SCENARIO: ScenarioMeta = {
  name: 'cursor-stream',
  title: 'Cursor Streaming',
  description:
    `Stream ${CURSOR_STREAM_ROW_TARGET} rows via a server-side cursor in ` +
    `batches of ${CURSOR_STREAM_BATCH_SIZE}. Excludes int8: pg/postgres.js/` +
    'PostgreJS return it as genuinely different JS types by default ' +
    '(string/BigInt/number-or-BigInt), so timing it would measure type-' +
    'conversion choice, not streaming throughput',
  bench: {
    time: 800,
    iterations: 5,
    warmupTime: 200,
    warmupIterations: 1,
  },
};
