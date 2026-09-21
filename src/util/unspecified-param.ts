/**
 * The first value inside `v` that is not itself an array - what an array
 * parameter's element type would be read from. A scalar answers itself.
 */
export function arrayLeaf(v: any): any {
  let x = v;
  while (Array.isArray(x)) x = x[0];
  return x;
}

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
 * Numbers, booleans and Buffers keep their declared types: they are
 * already right nearly everywhere, and sending them as text would give
 * up the binary encoding for no correctness gain.
 */
export function isUnspecifiedParam(v: any): boolean {
  const x = arrayLeaf(v);
  return typeof x === 'string' || x instanceof Date;
}
