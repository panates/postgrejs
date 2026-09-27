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
 *
 * What that giving up costs, which the commit making this change put at
 * nothing measurable and is not: inserting the same value over a
 * loopback connection, alternating within each round, medians of nine -
 *
 * ```
 *                  as text   as BindParam
 * float8[]  1 000   2.33ms       0.91ms    2.6x
 * float8[] 10 000  17.34ms       3.75ms    4.6x
 * float8[] 100 000  143.0ms      26.9ms    5.3x
 * int4[]   100 000   24.5ms      15.5ms    1.6x
 * ```
 *
 * It grows with the array and with how wide an element's text is
 * against its binary: a float8 is 8 bytes against about 19 characters,
 * an int4 is 4 against up to 11 - and most of what a float8[] costs is
 * the server's own parse of that text, not the writing of it. The
 * original measurement was of the smallest of these shapes and read it
 * as level; it is not, at any size.
 *
 * So this is a real price, paid for a correctness the client cannot buy
 * any other way before the server has spoken. A caller who knows the
 * column - and for a large numeric array that is worth knowing - names
 * the type with `new BindParam(DataTypeOIDs._float8, v)` and gets the
 * binary encoding back with nothing given up, since a named type is an
 * answer rather than a guess.
 */
export function isUnspecifiedParam(v: any): boolean {
  const x = arrayLeaf(v);
  if (typeof x === 'string' || x instanceof Date) return true;
  return Array.isArray(v) && (typeof x === 'number' || typeof x === 'bigint');
}
