/**
 * Returns `v` coerced to an integer, or throws when it cannot be one.
 *
 * `fastParseInt()` already answers NaN for a value with no integer reading
 * - `'abc'`, `{}`, `[]`, `true` - but `Buffer.writeInt32BE(NaN)` then
 * stores a silent zero, so the answer is lost exactly where it matters.
 * Nothing downstream can tell that apart from a real zero afterwards: the
 * row inserts, the copy succeeds, and the wrong number is in the table.
 *
 * Floats are deliberately not rejected: truncating 3.7 to 3 is the
 * long-standing behaviour of these encoders and is usually what a caller
 * writing into an integer column means. Only "this is not a number at all"
 * is refused.
 *
 * Unlike the integer types, float4/float8/numeric leave NaN alone - it is a
 * value PostgreSQL stores and returns as NaN, distinct from NULL, on every
 * supported server version.
 */
export function assertInteger(v: number, typeName: string): number {
  if (Number.isNaN(v)) {
    throw new TypeError(
      `Cannot encode value as ${typeName}: it has no integer value`,
    );
  }
  return v;
}

/**
 * Returns `parsed` when a value that was NOT already a number coerced to
 * one, and throws when it did not.
 *
 * Kept apart from assertInteger() because the two families disagree about
 * NaN on purpose. float4/float8/numeric all store NaN as a value distinct
 * from NULL, so a caller passing the number NaN means it and it never
 * reaches here - the encoders take `typeof v === 'number'` straight
 * through. What does reach here is `'abc'`, `{}` or `true`, whose coercion
 * produced NaN because they have no numeric reading at all; writing those
 * as NaN would be indistinguishable afterwards from a NaN that was meant.
 */
export function assertCoercedNumber(parsed: number, typeName: string): number {
  if (Number.isNaN(parsed)) {
    throw new TypeError(
      `Cannot encode value as ${typeName}: it has no numeric value`,
    );
  }
  return parsed;
}

/**
 * Refuses a value that only has an integer reading through a coercion
 * nobody asked for.
 *
 * int8 goes to `BigInt` rather than through `fastParseInt()`, and BigInt is
 * happy to convert things that are not numbers at all: `BigInt([])` is 0n
 * because an empty array stringifies to "", and `BigInt(true)` is 1n. A
 * bad value in a bigint column would land as a plausible-looking 0 or 1,
 * so only the types that genuinely carry an integer are let through.
 */
export function assertBigIntSource(v: any, typeName: string): bigint | number {
  const t = typeof v;
  if (t === 'bigint' || t === 'number' || t === 'string') return v;
  throw new TypeError(
    `Cannot encode value as ${typeName}: it has no integer value`,
  );
}
