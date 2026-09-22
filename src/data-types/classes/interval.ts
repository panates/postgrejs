/** The fields an Interval is built from. All optional, all defaulting to 0. */
export interface IntervalFields {
  years?: number;
  months?: number;
  days?: number;
  hours?: number;
  minutes?: number;
  seconds?: number;
  milliseconds?: number;
}

const US_PER_SECOND = 1000000n;
const US_PER_MINUTE = 60n * US_PER_SECOND;
const US_PER_HOUR = 60n * US_PER_MINUTE;

function pad2(v: number): string {
  return v < 10 ? '0' + v : '' + v;
}

/**
 * PostgreSQL's `interval`, as the three independent quantities it actually
 * is: a number of months, a number of days, and a time.
 *
 * They are kept apart rather than reduced to one total because they are
 * not convertible - a month is 28 to 31 days and a day is 23 to 25 hours
 * across a DST boundary, so only the server, holding a calendar and a time
 * zone, can add one to a timestamp. Anything here that answered "how many
 * milliseconds is this" would have to invent those lengths.
 *
 * Every field is always present, 0 when the value has none:
 *
 * ```ts
 * const iv = new Interval({ days: 1, hours: 2 });
 * iv.minutes;          // 0, not undefined
 * String(iv);          // '1 day 02:00:00'
 * iv.toISOString();    // 'P0Y0M1DT2H0M0S'
 * ```
 *
 * The field names are `pg`'s (`postgres-interval`), so code ported from it
 * reads the same values from the same places. The difference is that
 * package's objects are sparse - `interval '1 day'` gives it `{days: 1}`
 * and nothing else, so `iv.hours + 1` is NaN and a zero interval is `{}` -
 * and that it has no `toString()`, so a log line gets `[object Object]`.
 *
 * `milliseconds` carries the sub-second part and can be fractional, since
 * PostgreSQL stores microseconds: `interval '0.000001 seconds'` is
 * `milliseconds: 0.001`. Also `pg`'s behaviour, kept for the same reason.
 *
 * A negative interval carries the sign on each field that has one, the way
 * the server prints it: `interval '-1 day -2 hours'` is
 * `{ days: -1, hours: -2 }`.
 *
 * Two of those differences are deliberate and stay, so anyone porting
 * from `pg` knows what to change:
 *
 * - **`JSON.stringify` gives the string, where `pg` gives the object.**
 *   `interval '1 day'` serialises as `"1 day"` here and as `{"days":1}`
 *   there. The string is what a log line, an API response and a `::interval`
 *   cast all want, and it is the only form that survives a round trip
 *   through JSON. Code that reads `body.duration.days` has to read the
 *   string, or keep the object with `{...iv}`.
 * - **Every field is present.** `pg` omits the ones that are zero, which
 *   is why `iv.hours + 1` is `NaN` there and a zero interval is `{}`. Code
 *   that counted on `Object.keys()` being short, or on a deep-equal
 *   against a sparse literal, sees all seven here.
 *
 * `toPostgres()` is `pg`'s convention for "write yourself back", so a
 * value read here can be passed to any encoder that follows it - this
 * client's own parameter path never needed it, since it knows the class.
 */
export class Interval implements IntervalFields {
  years: number;
  months: number;
  days: number;
  hours: number;
  minutes: number;
  /** Whole seconds; the sub-second part is in `milliseconds`. */
  seconds: number;
  /** The sub-second part, fractional down to a microsecond. */
  milliseconds: number;

  constructor(fields?: IntervalFields) {
    this.years = fields?.years || 0;
    this.months = fields?.months || 0;
    this.days = fields?.days || 0;
    this.hours = fields?.hours || 0;
    this.minutes = fields?.minutes || 0;
    this.seconds = fields?.seconds || 0;
    this.milliseconds = fields?.milliseconds || 0;
  }

  /**
   * Builds one from the three quantities the wire format carries: a signed
   * microsecond count for the time, and day and month counts of their own.
   */
  static fromParts(
    microseconds: bigint,
    days: number,
    months: number,
  ): Interval {
    const negative = microseconds < 0n;
    let left = negative ? -microseconds : microseconds;
    const hours = left / US_PER_HOUR;
    left -= hours * US_PER_HOUR;
    const minutes = left / US_PER_MINUTE;
    left -= minutes * US_PER_MINUTE;
    const seconds = left / US_PER_SECOND;
    left -= seconds * US_PER_SECOND;
    const sign = negative ? -1 : 1;
    return new Interval({
      // Months are stored as one count and printed as years plus months,
      // so 13 comes back as a year and a month - which is what the server
      // does with `interval '13 mons'`.
      years: Math.trunc(months / 12),
      months: months % 12,
      days,
      hours: sign * Number(hours),
      minutes: sign * Number(minutes),
      seconds: sign * Number(seconds),
      milliseconds: (sign * Number(left)) / 1000,
    });
  }

  /** The whole month count, as the wire format carries it. */
  get totalMonths(): number {
    return this.years * 12 + this.months;
  }

  /** The time part as a signed microsecond count, as the wire format carries it. */
  get totalMicroseconds(): bigint {
    // Split so that a fractional hours/minutes/seconds is folded in rather
    // than silently truncated, while whole values stay exact past what a
    // double can hold.
    const whole =
      Math.trunc(this.hours) * 3600 +
      Math.trunc(this.minutes) * 60 +
      Math.trunc(this.seconds);
    const fraction =
      (this.hours - Math.trunc(this.hours)) * 3600 +
      (this.minutes - Math.trunc(this.minutes)) * 60 +
      (this.seconds - Math.trunc(this.seconds));
    return (
      BigInt(whole) * US_PER_SECOND +
      BigInt(Math.round(fraction * 1e6 + this.milliseconds * 1000))
    );
  }

  /**
   * The interval as PostgreSQL itself prints it under the default
   * `IntervalStyle`, so it round-trips through an `::interval` cast and
   * reads the way the same value does in psql.
   */
  toString(): string {
    const out: string[] = [];
    const { years, months, days } = this;
    // Singular only for exactly 1 - the server prints `-1 days`, not
    // `-1 day`.
    if (years) out.push(years + (years === 1 ? ' year' : ' years'));
    if (months) out.push(months + (months === 1 ? ' mon' : ' mons'));
    if (days) out.push(days + (days === 1 ? ' day' : ' days'));
    const us = this.totalMicroseconds;
    // The time is printed when it has a value, and also when nothing else
    // does - a zero interval is `00:00:00` rather than an empty string.
    if (us || !out.length) {
      const negative = us < 0n;
      let left = negative ? -us : us;
      const hours = left / US_PER_HOUR;
      left -= hours * US_PER_HOUR;
      const minutes = left / US_PER_MINUTE;
      left -= minutes * US_PER_MINUTE;
      const seconds = left / US_PER_SECOND;
      left -= seconds * US_PER_SECOND;
      let time =
        (negative ? '-' : '') +
        // Hours are not bounded at 24 and are padded only up to two
        // digits: `100000:00:00` is what the server prints.
        pad2(Number(hours)) +
        ':' +
        pad2(Number(minutes)) +
        ':' +
        pad2(Number(seconds));
      if (left) {
        time += '.' + String(left).padStart(6, '0').replace(/0+$/, '');
      }
      out.push(time);
    }
    return out.join(' ');
  }

  /** The interval as an ISO 8601 duration. */
  toISOString(): string {
    const us = this.totalMicroseconds;
    const negative = us < 0n;
    let left = negative ? -us : us;
    const hours = left / US_PER_HOUR;
    left -= hours * US_PER_HOUR;
    const minutes = left / US_PER_MINUTE;
    left -= minutes * US_PER_MINUTE;
    const seconds = left / US_PER_SECOND;
    left -= seconds * US_PER_SECOND;
    // The sign goes on the components that have a value, not on all of
    // them: `interval '-1 day -2 hours'` is `P0Y0M-1DT-2H0M0S`, and
    // signing the empty ones printed `-0M-0S` - which is what `pg` does
    // not write and no reader expects.
    const sign = negative ? '-' : '';
    const signed = (v: bigint) => (v ? sign : '') + v;
    let secondsPart = (seconds || left ? sign : '') + seconds;
    if (left)
      secondsPart += '.' + String(left).padStart(6, '0').replace(/0+$/, '');
    return (
      'P' +
      this.years +
      'Y' +
      this.months +
      'M' +
      this.days +
      'DT' +
      signed(hours) +
      'H' +
      signed(minutes) +
      'M' +
      secondsPart +
      'S'
    );
  }

  toJSON(): string {
    return this.toString();
  }

  /**
   * The literal PostgreSQL reads back, for an encoder that asks the value
   * how to write itself - `pg`'s convention, and the reason a value this
   * client decoded can be handed straight to one.
   */
  toPostgres(): string {
    return this.toString();
  }
}
