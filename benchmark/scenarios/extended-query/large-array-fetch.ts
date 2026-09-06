import type { ScenarioMeta } from '../../types.js';

// Seeded once into bench.large_array by benchmark/setup.ts -
// LARGE_ARRAY_ROW_COUNT rows, each an int4[] of LARGE_ARRAY_ELEMENT_COUNT
// elements spanning a negative-to-positive range (not all-positive - see
// this scenario's description for why that range matters for pg
// specifically).
//
// Unlike Large Blob Fetch, matching Large Blob Fetch's ~5MB-per-row byte
// count is the wrong target for an array: array decode cost scales with
// ELEMENT COUNT, not bytes - text format parses each element individually
// (split on comma, parseInt), and even binary format frames each element
// with its own 4-byte length prefix (verified live: at 1,310,720 elements/
// row - sized to match 5MB of raw int4 data - every iteration took
// 1.2-3.3 SECONDS across libraries, ~1000x slower than 1,000 elements/row,
// confirming the ~linear per-element cost and that byte-parity with a
// blob is not a meaningful target here). 50,000 elements/row keeps each
// iteration in the tens-of-ms range (extrapolating from that same
// measurement) while still large enough to show a clear decode-time gap,
// unlike 1,000 elements/row (measured ~20-25% apart, barely above noise).
export const LARGE_ARRAY_ELEMENT_COUNT = 50_000;
export const LARGE_ARRAY_ROW_COUNT = 10;

// int4's own extremes. Elements hug these deliberately, so every value is
// full-width (10 digits, 11 characters for the negatives).
//
// This matters because PostgreSQL's binary array format spends a FIXED 8
// bytes per int4 element (4-byte length prefix + 4-byte value) whatever
// the value is, while the text format spends one byte per digit - so the
// seed data alone decides how much binary saves on the wire. Measured for
// 50,000 elements: binary is 391KB regardless, text is 537KB at full
// width but only 296KB for the 5-digit values this scenario used to
// generate (a range derived from the element count, -25000..24999). Those
// small values inverted the result, making binary look 32% LARGER, and
// hid the advantage this scenario exists to show. Full-width int4s are
// also what the type actually holds in real use - ids, hashes, epochs -
// so this is binary's real-world best case, not a contrived one.
export const INT4_MIN = -2147483648;
export const INT4_MAX = 2147483647;

/**
 * SQL for the i'th array element: alternating between just below int4's
 * ceiling and just above its floor, so every value is full-width AND
 * roughly half of them are negative - the latter is what makes this
 * scenario able to demonstrate pg's broken binary int4[] decode (see the
 * scenario description).
 */
export function largeArrayElementSql(i: string): string {
  return `(case when ${i} % 2 = 0 then ${INT4_MAX} - ${i} else ${INT4_MIN} + ${i} end)`;
}

// The first two elements the generator above produces (i=1 is odd, i=2 is
// even). setup.ts checks these to decide whether already-seeded data was
// built by the CURRENT generator - without that, changing the value range
// here silently keeps the old data, since row/element counts stay the same.
export const LARGE_ARRAY_FIRST_ELEMENT = INT4_MIN + 1;
export const LARGE_ARRAY_SECOND_ELEMENT = INT4_MAX - 2;
// i = LARGE_ARRAY_ELEMENT_COUNT, which is even - the adapters assert on
// this to confirm they decoded the whole array, not just its start.
export const LARGE_ARRAY_LAST_ELEMENT = INT4_MAX - LARGE_ARRAY_ELEMENT_COUNT;

export function largeArrayFetchSql(schema: string): string {
  return `select data from ${schema}.large_array order by id limit $1`;
}

export const LARGE_ARRAY_FETCH_SCENARIO: ScenarioMeta = {
  name: 'large-array-fetch',
  title: 'Large Array Fetch',
  description:
    `Fetch ${LARGE_ARRAY_ROW_COUNT} rows of an int4[] with ` +
    `${LARGE_ARRAY_ELEMENT_COUNT} elements each (alternating just below ` +
    `int4's ceiling and just above its floor, so every value is full-` +
    'width and roughly half are negative - full-width values are what ' +
    "show the binary format's real wire advantage, since binary spends a " +
    'fixed 8 bytes per int4 element while text spends one byte per ' +
    "digit) via each library's Extended Query path (the row " +
    'count itself a real bind parameter, not a literal) - the array ' +
    'counterpart to Large Blob Fetch above (one large scalar value) and ' +
    'Mixed-Type Decode (many small values): here it is many elements ' +
    'within a single column value, repeated across rows. Element count, ' +
    'not byte size, is what drives cost for an array (unlike a blob - ' +
    "see this file's own comments for the measurement that showed why), " +
    'so this is sized for a clear decode-time gap without ballooning ' +
    'each iteration to whole seconds. As with Large Blob Fetch, no ' +
    'protocol format is forced onto anyone: PostgreJS is left on its ' +
    "own Extended Query default (binary). pg's binary array decode " +
    '(`pg-types`) is registered-but-buggy rather than simply ' +
    'unsupported: it DOES have a registered binary parser for `_int4` ' +
    '(unlike `bytea`), but that parser reads every element as an ' +
    "unsigned bit pattern with no two's-complement handling for negative " +
    'values - verified live: requesting binary format for an int4[] ' +
    'containing negative numbers returns wrong values from the first ' +
    'negative element onward, and desyncs the element count entirely on ' +
    'a larger array (a 1500-element array came back as 1519 elements, ' +
    'values wrong). So pg is left on its own text default here too, ' +
    'same as postgres.js (no binary protocol support at all, verified ' +
    'elsewhere in this report) - a case where a library merely having a ' +
    'registered binary parser is not the same as that parser being ' +
    'safe to use',
  reportWireBytes: true,
  bench: {
    time: 1000,
    iterations: 20,
    warmupTime: 200,
    warmupIterations: 5,
  },
};
