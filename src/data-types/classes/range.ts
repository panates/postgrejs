import type { OID } from '../../types.js';
import { REQUIRES_TYPE_OID, setTypeOid } from './type-oid.js';

/** Which ends of a range include their bound, written as PostgreSQL writes it. */
export type RangeBounds = '[)' | '[]' | '()' | '(]';

function formatBound(v: unknown): string {
  if (v === null || v === undefined) return '';
  // A Date renders as an ISO 8601 timestamp rather than the JavaScript
  // form: PostgreSQL accepts it back, `Mon Oct 22 2020 ...` it does not,
  // and the point of this method is that the string casts to a range
  // again.
  const s = v instanceof Date ? v.toISOString() : String(v);
  // The server quotes a bound that is empty or carries anything that
  // would be read as punctuation of the literal itself - whitespace
  // included, which is why a timestamp is always quoted. Inside the
  // quotes a quote and a backslash are each doubled.
  if (s === '' || /["\\()[\],]|\s/.test(s))
    return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '""') + '"';
  return s;
}

/**
 * PostgreSQL's range types - `int4range`, `tstzrange` and the rest - as
 * a pair of bounds, each of which may be absent (the range runs to
 * infinity that way) and each of which may or may not be included.
 *
 * ```ts
 * const r = new Range(1, 10);          // the default bounds, [1,10)
 * r.lowerInclusive;                    // true
 * r.upperInclusive;                    // false
 * String(r);                           // '[1,10)'
 *
 * new Range(null, 10);                 // '(,10)' - unbounded below
 * new Range(1, 10, '[]');              // '[1,10]'
 * Range.empty();                       // 'empty' - no values at all
 * ```
 *
 * `empty` is a value of its own rather than a range whose bounds happen
 * to meet, and `(,)` - unbounded at both ends - is its opposite, not the
 * same thing. Only `isEmpty` tells them apart.
 *
 * The bounds are the element type's own JavaScript values, so a
 * `tstzrange` has `Date`s in it and an `int4range` has numbers. An absent
 * bound is `null`, which is also how PostgreSQL's own constructors take
 * it: `int4range(null, 10)`.
 *
 * Note what the server does to a discrete type: `int4range(1,10,'[]')` is
 * stored and returned as `[1,11)`, because for integers those are the
 * same set. So `upperInclusive` comes back false for every `int4range`,
 * `int8range` and `daterange` - that is PostgreSQL normalizing, not this
 * class losing something.
 *
 * `toString()` prints what the server prints for a range over numbers.
 * Over dates it cannot: a `Range` holds `Date`s and has no way to know
 * whether it came from a `daterange`, a `tsrange` or a `tstzrange`, which
 * the server renders three different ways. It prints the instant in ISO
 * 8601 instead - the truth about the `Date` it holds, and something
 * PostgreSQL accepts back, but not byte-for-byte what a `daterange`
 * prints. The exact wire form is what goes out when the Range is passed
 * as a parameter, where the element type's own renderer is in reach.
 */
export class Range<T = any> {
  /**
   * All six range types answer `instanceof Range`, so one has to be named
   * rather than guessed - see REQUIRES_TYPE_OID.
   */
  static readonly [REQUIRES_TYPE_OID] = true;

  /** The lower bound, or null when the range runs to negative infinity. */
  lower: T | null;
  /** The upper bound, or null when the range runs to infinity. */
  upper: T | null;
  lowerInclusive: boolean;
  upperInclusive: boolean;
  /** True for `empty`, which contains no values - not the same as `(,)`. */
  isEmpty: boolean;

  /**
   * @param oid Which range type this is - `DataTypeOIDs.int4range` and so
   *   on. A Range that came from a query already carries the one it was
   *   decoded from; give it here when building one to send, or name it at
   *   the call site with `new BindParam(oid, range)`.
   */
  constructor(
    lower: T | null = null,
    upper: T | null = null,
    bounds: RangeBounds = '[)',
    oid?: OID,
  ) {
    this.lower = lower;
    this.upper = upper;
    // An absent bound is never inclusive; the server prints `(` for it
    // whatever was asked for.
    this.lowerInclusive = bounds.charAt(0) === '[' && lower !== null;
    this.upperInclusive = bounds.charAt(1) === ']' && upper !== null;
    this.isEmpty = false;
    if (oid !== undefined) setTypeOid(this, oid);
  }

  /** The empty range, which contains no values. */
  static empty<T = any>(oid?: OID): Range<T> {
    const r = new Range<T>(null, null, '[)', oid);
    r.isEmpty = true;
    return r;
  }

  /**
   * The range as PostgreSQL prints it, so it casts straight back through
   * `::int4range` and reads the way the same value does in psql.
   */
  toString(): string {
    if (this.isEmpty) return 'empty';
    return (
      (this.lowerInclusive && this.lower !== null ? '[' : '(') +
      formatBound(this.lower) +
      ',' +
      formatBound(this.upper) +
      (this.upperInclusive && this.upper !== null ? ']' : ')')
    );
  }

  toJSON(): string {
    return this.toString();
  }
}
