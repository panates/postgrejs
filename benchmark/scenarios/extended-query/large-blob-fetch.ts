import type { ScenarioMeta } from '../../types.js';

export const LARGE_BLOB_SIZE_BYTES = 1024 * 1024;
export const LARGE_BLOB_ROW_COUNT = 10;

export function largeBlobFetchSql(schema: string): string {
  return `select data from ${schema}.large_blob order by id limit $1`;
}

export const LARGE_BLOB_FETCH_SCENARIO: ScenarioMeta = {
  name: 'large-blob-fetch',
  title: 'Large Blob Fetch',
  description: `Fetch ${LARGE_BLOB_ROW_COUNT} rows of a
${LARGE_BLOB_SIZE_BYTES / (1024 * 1024)}MB bytea value each
(${(LARGE_BLOB_ROW_COUNT * LARGE_BLOB_SIZE_BYTES) / (1024 * 1024)}MB total)
via each library's Extended Query path, with the row count itself a real
bind parameter, not a literal. The measurement is dominated by
wire-transfer and decode time for a few large values, instead of
per-row/per-column overhead across many small ones - the counterpart to
Mixed-Type Decode above, which is many small values.

Unlike that scenario, no protocol format is forced onto anyone here:
PostgreJS is left on its own Extended Query default (binary), and
pg/postgres.js get whatever their own default is.

postgres.js has no binary protocol support at all (verified elsewhere in
this report), so it always fetches as text - hex-encoded on the wire,
decoded client-side. pg's binary parser table (\`pg-types\`) has no entry
for \`bytea\` either (verified live: requesting binary format for a bytea
column returns a corrupted value, not a Buffer) - undocumented and unsafe
to rely on, so pg is left on its own text default too, same as
postgres.js.

Only PostgreJS ends up genuinely exercising a binary fetch; the other two
show their real, best-available path rather than a forced or broken one -
and pay for it. bytea's text format is \`\\x\`-prefixed hex, literally 2x the
wire bytes of binary's raw bytes, so pg and postgres.js transfer twice
what PostgreJS does here.`,
  reportWireBytes: true,
  bench: {
    time: 1000,
    iterations: 20,
    warmupTime: 200,
    warmupIterations: 5,
  },
};
