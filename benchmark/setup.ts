import { Connection } from 'postgrejs';
import type { BenchDbConfig } from './config.js';
import {
  LARGE_ARRAY_ELEMENT_COUNT,
  LARGE_ARRAY_FIRST_ELEMENT,
  LARGE_ARRAY_ROW_COUNT,
  LARGE_ARRAY_SECOND_ELEMENT,
  largeArrayElementSql,
} from './scenarios/extended-query/large-array-fetch.js';
import {
  LARGE_BLOB_ROW_COUNT,
  LARGE_BLOB_SIZE_BYTES,
} from './scenarios/extended-query/large-blob-fetch.js';

const MIXED_TYPES_COLUMNS = `
    id SERIAL NOT NULL,
    f_int2 int2,
    f_int4 int4,
    f_int8 int8,
    f_float4 float4,
    f_float8 float8,
    f_varchar character varying(255),
    f_json json,
    f_jsonb jsonb,
    f_timestamp timestamp,
    f_timestamptz timestamptz,
    f_bytea bytea,
    CONSTRAINT %TABLE%_pkey PRIMARY KEY (id)
`;

function schemaSql(schema: string, owner: string): string {
  return `
DROP SCHEMA IF EXISTS ${schema} CASCADE;
CREATE SCHEMA ${schema} AUTHORIZATION ${owner};

CREATE TABLE ${schema}.mixed_types (
${MIXED_TYPES_COLUMNS.replace(/%TABLE%/g, 'mixed_types')}
);

INSERT INTO ${schema}.mixed_types
  (f_int2, f_int4, f_int8, f_float4, f_float8, f_varchar, f_json, f_jsonb,
   f_timestamp, f_timestamptz, f_bytea)
VALUES
  -- Widest text representation each type can produce, for the same reason
  -- the large_array seed hugs int4's extremes: a binary column costs a
  -- fixed number of bytes on the wire whatever the value is, while the
  -- text format costs one byte per character - so narrow values would
  -- quietly understate what the binary protocol saves. These are the
  -- values the type is capable of holding, not unusually large ones.
  (-32768, -2147483648, -9223372036854775808,
   -3.4028235e+38, -1.7976931348623157e+308,
   'abcd', '{"a": 1}', '{"a": 1}',
   '2020-01-10 15:45:12.123', '2005-07-01 01:21:11.123+03:00', '\\xABCDEF');

CREATE TABLE ${schema}.bulk_rows (
${MIXED_TYPES_COLUMNS.replace(/%TABLE%/g, 'bulk_rows')}
);

CREATE TABLE ${schema}.large_blob (
    id SERIAL NOT NULL,
    data bytea,
    CONSTRAINT large_blob_pkey PRIMARY KEY (id)
);

INSERT INTO ${schema}.large_blob (data)
SELECT decode(repeat('ab', ${LARGE_BLOB_SIZE_BYTES}), 'hex')
FROM generate_series(1, ${LARGE_BLOB_ROW_COUNT});

CREATE TABLE ${schema}.large_array (
    id SERIAL NOT NULL,
    data int4[],
    CONSTRAINT large_array_pkey PRIMARY KEY (id)
);

INSERT INTO ${schema}.large_array (data)
SELECT array(
  SELECT ${largeArrayElementSql('i')}
  FROM generate_series(1, ${LARGE_ARRAY_ELEMENT_COUNT}) i
)
FROM generate_series(1, ${LARGE_ARRAY_ROW_COUNT});
`;
}

// f_int4 for i=1 (odd) in the generator below - schemaIsSeeded() checks it
// so that changing these seed values, which leaves the row count untouched,
// still forces a reseed instead of silently benchmarking the old data.
const BULK_ROWS_MIN_INT4 = -2147483648 + 1;

function seedBulkRowsSql(schema: string, rowCount: number): string {
  return `
INSERT INTO ${schema}.bulk_rows
  (f_int2, f_int4, f_int8, f_float4, f_float8, f_varchar, f_json, f_jsonb,
   f_timestamp, f_timestamptz, f_bytea)
SELECT
  -- Full-width values, alternating sign - see the mixed_types seed above
  -- for why narrow values would understate the binary protocol's wire
  -- advantage in every text-vs-binary decode scenario driven by this
  -- table.
  (case when i % 2 = 0 then 32767 - (i % 100) else -32768 + (i % 100) end)::int2,
  (case when i % 2 = 0 then 2147483647 - i else -2147483648 + i end),
  -- Deliberately kept inside Number.MAX_SAFE_INTEGER (16 digits rather
  -- than int8's full 19): past it, every library switches to its own
  -- BigInt-ish representation, which would turn this table's decode
  -- scenarios into a measurement of that conversion choice instead of of
  -- decoding. mixed_types above does carry a full-width int8, since that
  -- row was already beyond the safe range on purpose.
  (case when i % 2 = 0 then 9007199254740991 - i else -9007199254740991 + i end)::int8,
  (i * 1.2345678e+30)::float4,
  (i * 1.234567890123456e+100)::float8,
  'row_' || i,
  json_build_object('i', i),
  jsonb_build_object('i', i),
  timestamp '2020-01-01 00:00:00' + (i || ' seconds')::interval,
  timestamptz '2020-01-01 00:00:00+00' + (i || ' seconds')::interval,
  decode(lpad(to_hex(i), 8, '0'), 'hex')
FROM generate_series(1, ${rowCount}) AS i;
`;
}

async function regclassExists(
  connection: Connection,
  qualifiedName: string,
): Promise<boolean> {
  const r = await connection.query(`SELECT to_regclass($1) AS reg`, {
    params: [qualifiedName],
    objectRows: true,
  });
  return !!r.rows?.[0]?.reg;
}

async function schemaIsSeeded(
  connection: Connection,
  schema: string,
  rowCount: number,
): Promise<boolean> {
  if (!(await regclassExists(connection, `${schema}.bulk_rows`))) return false;
  const count = await connection.query(
    `SELECT count(*)::int AS n, min(f_int4)::int AS min_int4
     FROM ${schema}.bulk_rows`,
    { objectRows: true },
  );
  if (count.rows?.[0]?.n !== rowCount) return false;
  if (count.rows?.[0]?.min_int4 !== BULK_ROWS_MIN_INT4) return false;

  if (!(await regclassExists(connection, `${schema}.large_blob`))) return false;
  const blob = await connection.query(
    `SELECT count(*)::int AS row_count, min(octet_length(data))::int AS min_size,
            max(octet_length(data))::int AS max_size
     FROM ${schema}.large_blob`,
    { objectRows: true },
  );
  const row = blob.rows?.[0];
  if (
    row?.row_count !== LARGE_BLOB_ROW_COUNT ||
    row?.min_size !== LARGE_BLOB_SIZE_BYTES ||
    row?.max_size !== LARGE_BLOB_SIZE_BYTES
  )
    return false;

  if (!(await regclassExists(connection, `${schema}.large_array`)))
    return false;
  const arr = await connection.query(
    // The first two elements identify WHICH generator produced this data,
    // not just how much of it there is - element values changed once
    // without the row/element counts changing at all, and this check
    // happily kept the stale data (a whole benchmark run's array numbers
    // were measured against the wrong seed before that was noticed).
    `SELECT count(*)::int AS row_count, min(array_length(data, 1))::int AS min_len,
            max(array_length(data, 1))::int AS max_len,
            min(data[1])::int AS first_el, min(data[2])::int AS second_el
     FROM ${schema}.large_array`,
    { objectRows: true },
  );
  const arrRow = arr.rows?.[0];
  return (
    arrRow?.row_count === LARGE_ARRAY_ROW_COUNT &&
    arrRow?.min_len === LARGE_ARRAY_ELEMENT_COUNT &&
    arrRow?.max_len === LARGE_ARRAY_ELEMENT_COUNT &&
    arrRow?.first_el === LARGE_ARRAY_FIRST_ELEMENT &&
    arrRow?.second_el === LARGE_ARRAY_SECOND_ELEMENT
  );
}

/**
 * Creates (or verifies) the `bench` schema used by all scenarios. Idempotent:
 * if bench.bulk_rows already exists and holds exactly `rowCount` rows,
 * bench.large_blob already exists and holds exactly LARGE_BLOB_ROW_COUNT
 * rows each of the expected size, and bench.large_array already exists and
 * holds exactly LARGE_ARRAY_ROW_COUNT rows each of the expected element
 * count, setup is skipped so repeated `npm run bench` invocations don't
 * reseed data every time.
 */
export async function setupBenchSchema(
  config: BenchDbConfig,
  rowCount: number,
): Promise<void> {
  const connection = new Connection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
  });
  await connection.connect();
  try {
    if (await schemaIsSeeded(connection, config.schema, rowCount)) return;
    await connection.execute(schemaSql(config.schema, config.user));
    await connection.execute(seedBulkRowsSql(config.schema, rowCount));
  } finally {
    await connection.close();
  }
}
