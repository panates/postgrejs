/**
 * The exact decimal a `numeric` column holds, for the values a
 * JavaScript number cannot carry.
 *
 * `numeric` exists precisely to hold numbers a double cannot - more than
 * about fifteen significant digits, or a magnitude past what prints in
 * plain notation - so decoding one into a double throws away the reason
 * the column was declared that way. A value that does fit still decodes
 * to a plain number; this class is what the rest become, and it carries
 * the digits exactly as the server wrote them.
 *
 * It is a class rather than a bare string so that it can be told apart:
 * `determine()` types a bare string as `varchar`, which the server then
 * refuses to put in a numeric column, so a string could be read but not
 * written back. A `Numeric` round-trips.
 *
 * There is deliberately no `valueOf()`. Arithmetic on one of these has
 * to be an explicit decision - `Symbol.toPrimitive` hands back the exact
 * text for every hint, so `String(n)` and `${n}` are lossless, and
 * `toNumber()` is the way to ask for the double and say so.
 */
export class Numeric {
  readonly value: string;

  constructor(value: string | number | bigint) {
    this.value = typeof value === 'string' ? value : String(value);
  }

  /** The decimal exactly as PostgreSQL wrote it; casts back through `::numeric`. */
  toString(): string {
    return this.value;
  }

  toJSON(): string {
    return this.value;
  }

  /** The value as a double, which is lossy - that is the whole point of this class. */
  toNumber(): number {
    return parseFloat(this.value);
  }

  /**
   * The text for every hint, the numeric one included: coercing to a
   * double behind the caller's back is the loss this class exists to
   * prevent, so `n * 2` has to go through the string and `n + 1`
   * concatenates rather than quietly rounding.
   */
  [Symbol.toPrimitive](): string {
    return this.value;
  }
}
