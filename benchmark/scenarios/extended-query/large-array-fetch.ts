import type { ScenarioMeta } from '../../types.js';

export const LARGE_ARRAY_ELEMENT_COUNT = 50_000;
export const LARGE_ARRAY_ROW_COUNT = 10;
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

export const LARGE_ARRAY_FIRST_ELEMENT = INT4_MIN + 1;
export const LARGE_ARRAY_SECOND_ELEMENT = INT4_MAX - 2;
export const LARGE_ARRAY_LAST_ELEMENT = INT4_MAX - LARGE_ARRAY_ELEMENT_COUNT;

export function largeArrayFetchSql(schema: string): string {
  return `select data from ${schema}.large_array order by id limit $1`;
}

export const LARGE_ARRAY_FETCH_SCENARIO: ScenarioMeta = {
  name: 'large-array-fetch',
  title: 'Large Array Fetch',
  description: `Fetch ${LARGE_ARRAY_ROW_COUNT} rows of an int4[] with
${LARGE_ARRAY_ELEMENT_COUNT} elements each, via each library's Extended
Query path, with the row count itself a real bind parameter, not a
literal. Elements alternate between just below int4's ceiling and just
above its floor, so every value is full-width and roughly half are
negative. Full-width values are what show binary format's real wire
advantage: binary spends a fixed 8 bytes per int4 element, while text
spends one byte per digit.

This is the array counterpart to Large Blob Fetch above (one large scalar
value) and Mixed-Type Decode (many small values): here it is many elements
within a single column value, repeated across rows. Element count, not
byte size, is what drives cost for an array, unlike a blob - see this
file's own comments for the measurement that showed why - so this is
sized for a clear decode-time gap without ballooning each iteration to
whole seconds.

As with Large Blob Fetch, no protocol format is forced onto anyone:
PostgreJS is left on its own Extended Query default (binary).

pg's binary array decode (\`pg-types\`) is registered-but-buggy rather than
simply unsupported. It does have a registered binary parser for \`_int4\`
(unlike \`bytea\`), but that parser reads every element as an unsigned bit
pattern, with no two's-complement handling for negative values. Verified
live: requesting binary format for an int4[] containing negative numbers
returns wrong values from the first negative element onward, and desyncs
the element count entirely on a larger array - a 1500-element array came
back as 1519 elements, values wrong.

So pg is left on its own text default here too, same as postgres.js (no
binary protocol support at all, verified elsewhere in this report). A case
where a library merely having a registered binary parser is not the same
as that parser being safe to use.`,
  reportWireBytes: true,
  bench: {
    time: 1000,
    iterations: 20,
    warmupTime: 200,
    warmupIterations: 5,
  },
};
