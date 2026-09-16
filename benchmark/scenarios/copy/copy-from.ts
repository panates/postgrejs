import type { ScenarioMeta } from '../../types.js';

export const COPY_FROM_ROW_COUNT = 200_000;

/**
 * Destination for both COPY scenarios. Kept separate from `bulk_rows` and
 * seeded with nothing: these scenarios write, and each iteration truncates
 * first so every run loads into an empty table.
 */
export const COPY_TARGET_COLUMNS = [
  'f_int4',
  'f_int8',
  'f_float8',
  'f_varchar',
  'f_timestamptz',
] as const;

/**
 * One row of the payload every adapter sends, identical across libraries.
 *
 * The values hug each type's widest text form on purpose, the same choice
 * `setup.ts` makes for the seeded tables and for the same reason: a binary
 * column costs a fixed number of bytes whatever the value is, while text
 * costs one byte per character. `1` is one byte of CSV against four of
 * binary, so a payload of small numbers would quietly understate the
 * binary format - and, just as importantly, overstate it if the values
 * were made unusually long. These are ordinary values the columns are
 * declared to hold.
 *
 * How much it matters is large enough to state outright rather than leave
 * implied. Measured on the same 200,000 rows, text against binary:
 *
 * - these values (10-digit int4, 19-digit int8, widest float8, 40-char
 *   varchar): 2495ms against 242ms, a 10.3x gap, ~22MB of CSV
 * - single-digit numbers and 4-char strings instead: 497ms against 187ms,
 *   a 2.7x gap, ~8MB of CSV
 *
 * Both are honest numbers for their own data; neither is "the" answer, and
 * the seed choice moves the headline by nearly 4x on its own. It is stated
 * here so a reader can place the table against their own rows rather than
 * take one figure as universal. Binary's cost per column does not move
 * between those two runs - what changes is how much text the server has to
 * parse, which is the whole mechanism.
 */
export function copyFromRow(i: number): any[] {
  return [
    2147483647 - (i % 1000),
    BigInt('9223372036854775807') - BigInt(i % 1000),
    -1.7976931348623157e308 + i,
    'row_' + i + '_abcdefghijklmnopqrstuvwxyz',
    new Date(Date.UTC(2020, 0, 1) + i * 1000),
  ];
}

/**
 * One materialised row as a CSV line, for the libraries that can only send
 * text. Takes the row rather than an index so every adapter formats the
 * same objects the binary scenario encodes, inside its own timed call.
 */
export function toCsvLine(r: any[]): string {
  return `${r[0]},${r[1]},${r[2]},${r[3]},${(r[4] as Date).toISOString()}\n`;
}

const SHARED_DESCRIPTION = `Bulk-loads ${COPY_FROM_ROW_COUNT.toLocaleString(
  'en-US',
)} rows into an empty table over
\`COPY ... FROM STDIN\`, the path PostgreSQL itself optimises for bulk
writes. Each iteration truncates the destination first, so every run loads
into the same empty table - the truncate is inside the timed call and
costs every library the same.

Column values hug each type's widest text form, the same choice the seeded
tables make: binary costs a fixed number of bytes per column whatever the
value is, while text costs one per character, so a payload of small numbers
would understate the format difference and unusually long ones would
overstate it.

That choice moves the headline enough to state outright. On these same
200,000 rows, text against binary: with these values (10-digit int4,
19-digit int8, widest float8, 40-char varchar) 2495ms against 242ms, a
10.3x gap over ~22MB of CSV; with single-digit numbers and 4-char strings
instead, 497ms against 187ms, a 2.7x gap over ~8MB. Both are honest for
their own data and neither is universal - binary's cost per column doesn't
move between those runs, what changes is how much text the server has to
parse. Place the table against your own rows rather than reading one figure
as the answer.`;

export const COPY_FROM_TEXT_SCENARIO: ScenarioMeta = {
  name: 'copy-from-text',
  title: 'Bulk Load (text COPY)',
  description: `${SHARED_DESCRIPTION}

This is the like-for-like comparison: every library formats the same CSV
payload and streams it as bytes, which is the only thing pg and
postgres.js can do (see Bulk Load (binary COPY) below). PostgreJS uses its
own \`copyFrom()\` byte stream here rather than \`copyFromRows()\`, so what
is measured is the driver's COPY transport, not the format.

pg needs \`pg-copy-streams\` for this at all - its core \`Query\` refuses
COPY IN - which is installed here so it runs its real path rather than
being marked unsupported.`,
  bench: {
    time: 2000,
    iterations: 5,
    warmupTime: 500,
    warmupIterations: 2,
  },
  unsupportedLibs: {
    bun: 'No COPY API',
  },
};

export const COPY_FROM_BINARY_SCENARIO: ScenarioMeta = {
  name: 'copy-from-binary',
  title: 'Bulk Load (binary COPY)',
  description: `${SHARED_DESCRIPTION}

The same rows as Bulk Load (text COPY) above, loaded through PostgreJS's
\`copyFromRows()\`, which encodes them into PostgreSQL's binary COPY format
instead of CSV. Read the two tables together: the difference between them
is what the format buys, while the text table alone is what separates the
drivers.

pg and postgres.js are absent because neither can produce the format.
Both can carry a binary COPY payload the caller has already encoded - so
this is not a missing transport - but producing it needs a binary encoder
per type, which neither has. For pg a third-party package,
\`pg-copy-streams-binary\`, supplies its own encoders; it is left out here
for the same reason \`pg-native\` is, being outside the driver rather than
part of it.`,
  bench: {
    time: 2000,
    iterations: 5,
    warmupTime: 500,
    warmupIterations: 2,
  },
  unsupportedLibs: {
    pg: 'No binary COPY encoding',
    postgres: 'No binary COPY encoding',
    bun: 'No COPY API',
  },
};
