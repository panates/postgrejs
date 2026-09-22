import { arrayLeaf } from './array-leaf.js';

/**
 * Whether a parameter goes out with no declared type (OID 0), as text,
 * for the server to resolve from wherever it lands.
 *
 * Two kinds of value cannot say what they are:
 *
 * - A `Date` is an instant or a wall clock depending on the column, and
 *   declaring either one moves the other. See `format-datetime.ts`.
 * - A string is whichever of PostgreSQL's text-input types the context
 *   calls for. `determine()` answers `varchar`, and declaring that stops
 *   the server inferring: `insert into t(j) values($1)` into a `json`
 *   column, `id = $1` against a `uuid`, `coalesce($1, 1)` and an enum
 *   column all fail with "expression is of type character varying".
 *   Unspecified, every one of them works.
 *
 * This is what `pg` sends for both, and the divergence from it is what
 * the shapes above were failing on. It is not free: a parameter with no
 * context to be resolved from - `$1 is null`, `array_agg($1)`,
 * `concat($1, 1)` - now raises "could not determine data type", exactly
 * as it does under `pg`. A cast (`$1::text`) or a named type
 * (`new BindParam(DataTypeOIDs.varchar, v)`) says which type is meant.
 *
 * - An array of numbers is the same question, and the answer matters
 *   more: `[1, 2]` is `int2[]`, `int4[]`, `int8[]`, `numeric[]`,
 *   `float4[]` or `float8[]` depending on where it lands, and unlike
 *   their scalars those types have no operators or implicit casts
 *   between them. A declared `int4[]` is therefore not merely a guess
 *   but a wrong answer wherever the column is one of the other five:
 *   `array[1,2]::int8[] = $1` is `42883 operator does not exist:
 *   bigint[] = integer[]`, and `numeric[] = double precision[]` the
 *   same. The scalars are left declared because they do have those
 *   operators - `1::int8 = $1` and `1.5::numeric = $1` both resolve.
 *
 * A scalar number, a boolean, a Buffer, and an array of anything but
 * numbers keep their declared types: an array of booleans, of Buffers
 * or of one of this client's own classes has one type it can be, so
 * naming it says nothing the server would have decided differently -
 * and it keeps the binary encoding, which the text literal gives up.
 * A caller who wants that back for a large numeric array names the type
 * with `new BindParam(DataTypeOIDs._float8, v)`.
 */
export function isUnspecifiedParam(v: any): boolean {
  const x = arrayLeaf(v);
  if (typeof x === 'string' || x instanceof Date) return true;
  return Array.isArray(v) && (typeof x === 'number' || typeof x === 'bigint');
}
