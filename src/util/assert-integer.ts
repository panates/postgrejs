/**
 * What the server reads as an integer from text: optional sign, digits,
 * nothing else. `'1.5'`, `'1e3'` and `'0x10'` are all refused by
 * `int4in()`, and surrounding whitespace is trimmed before it looks.
 */
const DECIMAL_INTEGER = /^[+-]?\d+$/;

/**
 * Returns `v` as the integer an integer column can store, or throws.
 *
 * The rule is that the binary encoding must accept exactly what the text
 * one does and refuse exactly what the server refuses, because which of
 * the two a value goes out as is not the caller's choice: it depends on
 * whether the parameter's type was declared, which statement cache the
 * query hit, and what the server resolved. A value that means one thing
 * through one path and another through the other is the worst outcome
 * there is, and that is what this used to be:
 *
 * ```
 *                             text          binary (before)
 * [1.5]     -> int4[]         22P02 error   stored 1
 * [-1.5]    -> int4[]         22P02 error   stored -2   (a floor, not a truncation)
 * ['0x10']  -> int4[]         22P02 error   stored 0
 * ['']      -> int8[]         22P02 error   stored 0
 * [40000]   -> int2[]         22003 error   RangeError, from Buffer
 * ```
 *
 * Only the last of those was safe. The rest put a number in the table
 * that the caller never wrote and the server would have refused, and
 * silently - the row inserted, the copy succeeded.
 *
 * So a fractional value is refused rather than floored. Truncating 3.7
 * to 3 was the long-standing behaviour here and the argument for it was
 * that it is usually what a caller writing into an integer column means;
 * what that argument misses is that the same caller writing the same
 * value through the same client gets an error whenever the encoding
 * happens to be text, so it cannot be what they meant. Round or truncate
 * at the call site, or let the server do it with a cast.
 *
 * `min`/`max` are checked here as well, rather than left to Buffer's own
 * bounds check, so that the message names the type and the value.
 */
export function assertInteger(
  v: any,
  typeName: string,
  min: number,
  max: number,
): number {
  let n: number;
  const t = typeof v;
  if (t === 'number') {
    n = v;
    if (Number.isNaN(n))
      throw new TypeError(
        `Cannot encode value as ${typeName}: it has no integer value`,
      );
  } else if (t === 'bigint') {
    // Exact up to 2^53; beyond that the range check below refuses it
    // anyway, since nothing this function guards is that wide.
    n = Number(v);
  } else if (t === 'string') {
    const s = (v as string).trim();
    if (!DECIMAL_INTEGER.test(s))
      throw new TypeError(
        `Cannot encode "${v}" as ${typeName}: it is not an integer`,
      );
    n = +s;
  } else {
    throw new TypeError(
      `Cannot encode value as ${typeName}: it has no integer value`,
    );
  }
  if (!Number.isInteger(n))
    throw new TypeError(
      `Cannot encode ${n} as ${typeName}: it is not an integer`,
    );
  if (n < min || n > max)
    throw new RangeError(
      `Cannot encode ${n} as ${typeName}: it is out of range (${min} to ${max})`,
    );
  return n;
}

const INT8_MIN = BigInt('-9223372036854775808');
const INT8_MAX = BigInt('9223372036854775807');

/**
 * The same rule for int8, which counts past what a `number` holds.
 *
 * BigInt is happy to convert things that are not numbers at all -
 * `BigInt('')` is 0n because an empty string reads as zero, `BigInt(true)`
 * is 1n - so a bad value in a bigint column used to land as a plausible
 * 0 or 1. Only what genuinely carries an exact integer is let through.
 */
export function assertBigInt(v: any, typeName: string): bigint {
  let n: bigint;
  const t = typeof v;
  if (t === 'bigint') {
    n = v;
  } else if (t === 'number') {
    if (!Number.isInteger(v))
      throw new TypeError(
        Number.isNaN(v)
          ? `Cannot encode value as ${typeName}: it has no integer value`
          : `Cannot encode ${v} as ${typeName}: it is not an integer`,
      );
    n = BigInt(v);
  } else if (t === 'string') {
    const s = (v as string).trim();
    if (!DECIMAL_INTEGER.test(s))
      throw new TypeError(
        `Cannot encode "${v}" as ${typeName}: it is not an integer`,
      );
    n = BigInt(s);
  } else {
    throw new TypeError(
      `Cannot encode value as ${typeName}: it has no integer value`,
    );
  }
  if (n < INT8_MIN || n > INT8_MAX)
    throw new RangeError(
      `Cannot encode ${n} as ${typeName}: it is out of range (${INT8_MIN} to ${INT8_MAX})`,
    );
  return n;
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
