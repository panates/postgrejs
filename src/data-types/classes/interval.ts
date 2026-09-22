/** The fields an Interval is built from; it keeps the ones that have a value. */
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
 * It carries the fields that have a value and no others, which is what
 * the wire format carries too - three quantities, and a zero among them
 * is not a field:
 *
 * ```ts
 * const iv = new Interval({ days: 1, hours: 2 });
 * Object.keys(iv);     // ['days', 'hours']
 * iv.minutes;          // undefined
 * String(iv);          // '1 day 02:00:00'
 * iv.toISOString();    // 'P0Y0M1DT2H0M0S'
 * ```
 *
 * The field names and the shape are `pg`'s (`postgres-interval`), so code
 * ported from it reads the same values from the same places and a
 * `JSON.stringify` of a row says the same thing. The difference is that
 * this has a `toString()` - `pg`'s object gives `[object Object]` in a log
 * line - and a `toPostgres()`, so the value can be sent back.
 *
 * The fields are optional, so `iv.hours + 1` does not compile without
 * saying what an absent one means (`(iv.hours ?? 0) + 1`). That is the
 * point: which fields a value has depends on the value, not on the type,
 * and the older shape - every field present and 0 - hid that behind
 * numbers nobody wrote.
 *
 * `milliseconds` carries the sub-second part and can be fractional, since
 * PostgreSQL stores microseconds: `interval '0.000001 seconds'` is
 * `milliseconds: 0.001`. Also `pg`'s behaviour, kept for the same reason.
 *
 * A negative interval carries the sign on each field that has one, the way
 * the server prints it: `interval '-1 day -2 hours'` is
 * `{ days: -1, hours: -2 }`.
 *
 * `toPostgres()` is `pg`'s convention for "write yourself back", so a
 * value read here can be passed to any encoder that follows it - this
 * client's own parameter path never needed it, since it knows the class.
 */
export class Interval implements IntervalFields {
  // `declare`, so that the class body emits nothing: a declared field is
  // defined as `undefined` on every instance under ES2022 class fields,
  // which is an own key again - exactly what this is getting rid of.
  declare years?: number;
  declare months?: number;
  declare days?: number;
  declare hours?: number;
  declare minutes?: number;
  /** Whole seconds; the sub-second part is in `milliseconds`. */
  declare seconds?: number;
  /** The sub-second part, fractional down to a microsecond. */
  declare milliseconds?: number;

  /**
   * Keeps the fields that have a value. A zero is not one: it is what
   * every field of every interval would otherwise be filled with, and
   * `{ days: 1 }` says what `interval '1 day'` is far better than the
   * same thing plus six zeroes nobody wrote.
   */
  constructor(fields?: IntervalFields) {
    if (!fields) return;
    if (fields.years) this.years = fields.years;
    if (fields.months) this.months = fields.months;
    if (fields.days) this.days = fields.days;
    if (fields.hours) this.hours = fields.hours;
    if (fields.minutes) this.minutes = fields.minutes;
    if (fields.seconds) this.seconds = fields.seconds;
    if (fields.milliseconds) this.milliseconds = fields.milliseconds;
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
    return (this.years ?? 0) * 12 + (this.months ?? 0);
  }

  /** The time part as a signed microsecond count, as the wire format carries it. */
  get totalMicroseconds(): bigint {
    // Split so that a fractional hours/minutes/seconds is folded in rather
    // than silently truncated, while whole values stay exact past what a
    // double can hold.
    const h = this.hours ?? 0;
    const mi = this.minutes ?? 0;
    const sec = this.seconds ?? 0;
    const whole = Math.trunc(h) * 3600 + Math.trunc(mi) * 60 + Math.trunc(sec);
    const fraction =
      (h - Math.trunc(h)) * 3600 +
      (mi - Math.trunc(mi)) * 60 +
      (sec - Math.trunc(sec));
    return (
      BigInt(whole) * US_PER_SECOND +
      BigInt(Math.round(fraction * 1e6 + (this.milliseconds ?? 0) * 1000))
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
      (this.years ?? 0) +
      'Y' +
      (this.months ?? 0) +
      'M' +
      (this.days ?? 0) +
      'DT' +
      signed(hours) +
      'H' +
      signed(minutes) +
      'M' +
      secondsPart +
      'S'
    );
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
