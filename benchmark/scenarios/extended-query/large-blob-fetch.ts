import type { ScenarioMeta } from '../../types.js';

// Seeded once into bench.large_blob by benchmark/setup.ts - LARGE_BLOB_
// ROW_COUNT rows of LARGE_BLOB_SIZE_BYTES each, large enough that wire-
// transfer + decode time dominates the measurement (unlike mixed-types-
// decode's many small values, this is few rows/one column, each value
// deliberately large). Fetching more than one row (instead of a single
// value) is what makes the text-vs-binary wire-size difference add up to
// something measurable per call: bytea's text format is `\x`-prefixed hex,
// literally 2x the wire bytes of binary's raw bytes, so pg/postgres.js
// (both stuck on text here - see the scenario description) transfer
// LARGE_BLOB_ROW_COUNT * LARGE_BLOB_SIZE_BYTES * 2 bytes on the wire per
// call, postgrejs only LARGE_BLOB_ROW_COUNT * LARGE_BLOB_SIZE_BYTES.
export const LARGE_BLOB_SIZE_BYTES = 1 * 1024 * 1024;
export const LARGE_BLOB_ROW_COUNT = 10;

export function largeBlobFetchSql(schema: string): string {
  return `select data from ${schema}.large_blob order by id limit $1`;
}

export const LARGE_BLOB_FETCH_SCENARIO: ScenarioMeta = {
  name: 'large-blob-fetch',
  title: 'Large Blob Fetch',
  description:
    `Fetch ${LARGE_BLOB_ROW_COUNT} rows of a ` +
    `${LARGE_BLOB_SIZE_BYTES / (1024 * 1024)}MB bytea value each ` +
    `(${(LARGE_BLOB_ROW_COUNT * LARGE_BLOB_SIZE_BYTES) / (1024 * 1024)}MB ` +
    "total) via each library's Extended Query path (the row count itself " +
    'a real bind parameter, not a literal), so the measurement is ' +
    'dominated by wire-transfer + decode time for a few large values ' +
    'instead of per-row/per-column overhead across many small ones (the ' +
    'counterpart to Mixed-Type Decode above, which is many small values). ' +
    'Unlike that scenario, no protocol format is forced onto anyone here: ' +
    'PostgreJS is left on its own Extended Query default (binary); pg ' +
    'and postgres.js get whatever their own default is. postgres.js has ' +
    'no binary protocol support at all (verified elsewhere in this ' +
    'report), so it always fetches as text (hex-encoded on the wire, ' +
    "decoded client-side). pg's binary parser table (`pg-types`) has no " +
    'entry for `bytea` (verified live: requesting binary format for a ' +
    'bytea column returns a corrupted value, not a Buffer) - undocumented ' +
    'and unsafe to rely on, so pg is left on its own text default here ' +
    'too, same as postgres.js. Only PostgreJS ends up genuinely ' +
    'exercising a binary fetch; the other two show their real, best-' +
    'available path rather than a forced or broken one - and pay for it: ' +
    "bytea's text format is `\\x`-prefixed hex, literally 2x the wire " +
    "bytes of binary's raw bytes, so pg/postgres.js transfer twice what " +
    'PostgreJS does here',
  reportWireBytes: true,
  bench: {
    time: 1000,
    iterations: 20,
    warmupTime: 200,
    warmupIterations: 5,
  },
};
