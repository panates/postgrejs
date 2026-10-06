/**
 * Follows a value's `toPostgres()` until it reaches one that has none.
 *
 * `toPostgres()` is `pg`'s extension point for a type that knows how to
 * write itself: a library with its own geometry, money or domain class
 * implements it, and the value goes out as that class says rather than
 * as whatever `String()` makes of it. The result is followed rather than
 * returned, because what it hands back may itself be a `Date`, an array,
 * a `Buffer` or another such value.
 *
 * @param v The value a parameter is about to be written from.
 * @returns The value to write, which is `v` itself unless it had one.
 * @throws TypeError if the values form a cycle.
 */
/* Only for a parameter with no declared type. A declared type owns its
   own encoding and is an answer the caller gave, not a guess.

   This client's own classes are unaffected: every one of their
   `toPostgres()` is `return this.toString()`, which is what the path
   below used to reach anyway. What changes is a caller's class, which
   used to be written `[object Object]` - silently, with a row written
   and no error. */
export function resolveToPostgres(v: any): any {
  if (v === null || typeof v !== 'object' || typeof v.toPostgres !== 'function')
    return v;
  const seen: any[] = [];
  while (
    v !== null &&
    typeof v === 'object' &&
    typeof v.toPostgres === 'function'
  ) {
    if (seen.includes(v))
      throw new TypeError(
        'Circular reference while preparing a parameter: toPostgres() returned a value that leads back to itself',
      );
    seen.push(v);
    v = v.toPostgres();
  }
  return v;
}

/**
 * The text an undeclared parameter - or one element of an undeclared
 * array - goes out as.
 *
 * Follows `toPostgres()` first, then writes a plain object as JSON and
 * anything else as its own text.
 *
 * @param v The value to render.
 * @returns What to put on the wire, before any array quoting.
 */
/* The two rules `pg`'s `prepareValue` has that this path did not. The
   rest of its rules are either already here in their own branch - a
   Date, an array, a Buffer - or deliberately not taken: it writes a Date
   with a `T` where this client writes a space, and quotes the elements
   of a number array where this client writes them bare, which is 10-26%
   smaller and parses identically. Those are spellings the server reads
   the same way; these two are a value that arrives as something else. */
export function unspecifiedText(v: any): string {
  v = resolveToPostgres(v);
  if (
    v !== null &&
    typeof v === 'object' &&
    !(v instanceof Date) &&
    !Buffer.isBuffer(v) &&
    !Array.isArray(v)
  )
    return JSON.stringify(v);
  return '' + v;
}
