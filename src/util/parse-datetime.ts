// noinspection RegExpUnnecessaryNonCapturingGroup
import { fastParseInt } from './fast-parseint.js';

// noinspection RegExpUnnecessaryNonCapturingGroup
const TIMESTAMP_PATTERN =
  /^(\d{4})-?(0[1-9]|1[012])?-?([123]0|[012][1-9]|31)?(?:[T ]?([01][0-9]|2[0-3]):?([0-5][0-9]):?([0-5][0-9])?(?:\.(\d+))?(?:(Z)|(?:([+-])([01]?[0-9]|2[0-3]):?([0-5][0-9])?))?)?$/;
type DateArgs = [number, number, number, number, number, number, number];

function noMatch(str: string): Date | number {
  if (str === 'infinity' || str === 'Infinity') return Infinity;
  if (str === '-infinity' || str === '-Infinity') return -Infinity;
  return new Date('invalid');
}

/**
 * Reads a fixed 2-digit field at `i`, or -1 when either character isn't a
 * digit. Module level, not a closure inside parsePgTimestamp(): a closure
 * allocated per parsed value would cost more than the parse it speeds up.
 */
function read2(str: string, i: number): number {
  // Written as `>= 0 && <= 9` rather than `< 0 || > 9` so a missing
  // character (charCodeAt past the end is NaN, and every NaN comparison is
  // false) is rejected instead of silently producing NaN arithmetic.
  const a = str.charCodeAt(i) - 48;
  if (!(a >= 0 && a <= 9)) return -1;
  const b = str.charCodeAt(i + 1) - 48;
  if (!(b >= 0 && b <= 9)) return -1;
  return a * 10 + b;
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * Days between the Unix epoch and a proleptic-Gregorian Y/M/D (Howard
 * Hinnant's days_from_civil). `Date.UTC()` produces the same number but
 * costs roughly twice as much, because it also has to coerce and normalise
 * arbitrarily out-of-range arguments - which every caller here has already
 * ruled out. Only correct for the in-range, already-validated values
 * parsePgTimestamp() feeds it (years 1000-9999, so every intermediate
 * stays positive and `| 0` truncation is the same as flooring).
 */
function epochDays(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = (y / 400) | 0;
  const yoe = y - era * 400;
  const doy = (((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) | 0) + day - 1;
  const doe = yoe * 365 + ((yoe / 4) | 0) - ((yoe / 100) | 0) + doy;
  return era * 146097 + doe - 719468;
}

/**
 * Decodes the exact shape PostgreSQL's own ISO output uses -
 * `YYYY-MM-DD HH:MM:SS[.f+][(+|-)HH[:MM]]` - by scanning digits directly,
 * instead of handing the string to the engine's general-purpose date
 * parser. `new Date(str)` costs ~150ns per value and dominates decode time
 * on timestamp-heavy result sets; this is ~1.4x faster and allocates no
 * intermediate match array.
 *
 * Returns undefined for anything that isn't *exactly* that shape, so every
 * other input (compact forms, `T` separators, a `BC` suffix, years outside
 * 1000-9999, LMT-style ±HH:MM:SS offsets) falls through to the original
 * `new Date()`/regex path and keeps its existing result - including the
 * engine's own quirks, which callers may already depend on:
 * `0001-01-01` parsing as year 2001, and `-04:56:02` offsets being
 * rejected outright.
 *
 * A missing offset means local time, matching what `new Date(str)` does
 * with a space-separated, offset-less timestamp.
 */
function parsePgTimestamp(str: string): Date | undefined {
  const len = str.length;
  if (len < 19) return undefined;
  // Year must be a plain 1000-9999: a leading zero would hit the engine's
  // legacy two-digit-year mapping (`0001` -> 2001) that the fallback path
  // still produces.
  const y0 = str.charCodeAt(0) - 48;
  if (y0 < 1 || y0 > 9) return undefined;
  if (
    str.charCodeAt(4) !== 45 || // -
    str.charCodeAt(7) !== 45 || // -
    str.charCodeAt(10) !== 32 || // space
    str.charCodeAt(13) !== 58 || // :
    str.charCodeAt(16) !== 58 // :
  )
    return undefined;

  let n: number;
  let year = y0;
  for (let i = 1; i < 4; i++) {
    n = str.charCodeAt(i) - 48;
    if (n < 0 || n > 9) return undefined;
    year = year * 10 + n;
  }
  // month, day, hour, minute, second - each a 2-digit field at a fixed
  // offset. Every field is range-checked rather than just parsed: the
  // fallback path handles out-of-range values inconsistently (month 0,
  // day 0, minute 60 and second 60 are rejected outright, while a day past
  // the end of its month rolls over into the next one), so rather than
  // reproduce that split, only unambiguously valid values are taken here
  // and everything else is left to it, exactly as before.
  const month = read2(str, 5);
  if (month < 1 || month > 12) return undefined;
  const day = read2(str, 8);
  if (day < 1 || day > 31) return undefined;
  const hour = read2(str, 11);
  if (hour < 0 || hour > 23) return undefined;
  const minute = read2(str, 14);
  if (minute < 0 || minute > 59) return undefined;
  const second = read2(str, 17);
  if (second < 0 || second > 59) return undefined;
  if (day > DAYS_IN_MONTH[month - 1]) {
    // February 29th is the one day this table can't answer on its own.
    if (month !== 2 || day !== 29) return undefined;
    if (year % 4 !== 0 || (year % 100 === 0 && year % 400 !== 0))
      return undefined;
  }

  let pos = 19;
  let ms = 0;
  if (pos < len && str.charCodeAt(pos) === 46) {
    // Fractional seconds: milliseconds are the first 3 digits, zero-padded
    // when fewer are present (".5" is 500ms) and truncated when more are
    // (".123456" is 123ms) - both matching the existing paths exactly.
    pos++;
    let digits = 0;
    while (pos < len) {
      n = str.charCodeAt(pos) - 48;
      if (n < 0 || n > 9) break;
      if (digits < 3) ms = ms * 10 + n;
      digits++;
      pos++;
    }
    if (!digits) return undefined;
    if (digits === 1) ms *= 100;
    else if (digits === 2) ms *= 10;
  }

  if (pos === len)
    return new Date(year, month - 1, day, hour, minute, second, ms);

  const sign = str.charCodeAt(pos);
  if (sign !== 43 && sign !== 45) return undefined; // + or -
  pos++;
  const offHour = read2(str, pos);
  if (offHour < 0 || offHour > 23) return undefined;
  pos += 2;
  let offMinute = 0;
  if (pos < len) {
    if (str.charCodeAt(pos) !== 58) return undefined; // :
    offMinute = read2(str, pos + 1);
    if (offMinute < 0 || offMinute > 59) return undefined;
    pos += 3;
    // A trailing ":SS" (PostgreSQL emits these for pre-standard-time
    // dates) is deliberately not handled: `new Date()` rejects those
    // outright today, so they must keep falling through to do the same.
    if (pos !== len) return undefined;
  }
  const offset = (offHour * 60 + offMinute) * (sign === 45 ? -1 : 1);
  return new Date(
    (epochDays(year, month, day) * 86400 +
      hour * 3600 +
      (minute - offset) * 60 +
      second) *
      1000 +
      ms,
  );
}

function fillTimeArgs(m: RegExpMatchArray, args: DateArgs): void {
  for (let i = 3; i < 7; i++) {
    const s = m[i + 1];
    if (i === 6 && s) {
      args[i] = fastParseInt((s + '000').slice(0, 3));
    } else {
      args[i] = fastParseInt(s) || 0;
    }
  }
}

export function parseDate(str: string, utc?: boolean): Date | number {
  const m = str.match(TIMESTAMP_PATTERN);
  if (!m) return noMatch(str);

  const args: DateArgs = [1970, 0, 1, 0, 0, 0, 0];
  args[0] = fastParseInt(m[1]) || 0;
  args[1] = fastParseInt(m[2]) || 0;
  // Regression test: day defaults to 1 when omitted (a bare year or
  // year-month string, both valid per TIMESTAMP_PATTERN) - `|| 0` used to
  // leave it at 0, and Date.UTC()'s day is 1-indexed, so "day 0" silently
  // rolled back to the last day of the *previous* month.
  args[2] = fastParseInt(m[3]) || 1;
  // Months start from 0
  if (args[1] > 0) args[1]--;

  if (m[8] || utc) return new Date(Date.UTC(...args));
  return new Date(...args);
}

export function parseDateTime(str: string, utc?: boolean): Date | number {
  if (!utc) {
    if (str === 'infinity') return Infinity;
    if (str === '-infinity') return -Infinity;
    const fast = parsePgTimestamp(str);
    if (fast) return fast;
    const d = new Date(str);
    if (!isNaN(d.getTime())) return d;
  }

  const m = str.match(TIMESTAMP_PATTERN);
  if (!m) return noMatch(str);

  const args: DateArgs = [1970, 0, 1, 0, 0, 0, 0];
  args[0] = fastParseInt(m[1]) || 0;
  args[1] = fastParseInt(m[2]) || 0;
  // Regression test: day defaults to 1 when omitted (a bare year or
  // year-month string, both valid per TIMESTAMP_PATTERN) - `|| 0` used to
  // leave it at 0, and Date.UTC()'s day is 1-indexed, so "day 0" silently
  // rolled back to the last day of the *previous* month.
  args[2] = fastParseInt(m[3]) || 1;
  // Months start from 0
  if (args[1] > 0) args[1]--;
  fillTimeArgs(m, args);

  if (m[8] || utc) return new Date(Date.UTC(...args));
  return new Date(...args);
}

export function parseDateTimeTz(str: string, utc?: boolean): Date | number {
  if (str === 'infinity') return Infinity;
  if (str === '-infinity') return -Infinity;
  const fast = parsePgTimestamp(str);
  if (fast) return fast;
  const native = new Date(str);
  if (!isNaN(native.getTime())) return native;

  const m = str.match(TIMESTAMP_PATTERN);
  if (!m) return noMatch(str);

  const args: DateArgs = [1970, 0, 1, 0, 0, 0, 0];
  args[0] = fastParseInt(m[1]) || 0;
  args[1] = fastParseInt(m[2]) || 0;
  // Regression test: day defaults to 1 when omitted (a bare year or
  // year-month string, both valid per TIMESTAMP_PATTERN) - `|| 0` used to
  // leave it at 0, and Date.UTC()'s day is 1-indexed, so "day 0" silently
  // rolled back to the last day of the *previous* month.
  args[2] = fastParseInt(m[3]) || 1;
  // Months start from 0
  if (args[1] > 0) args[1]--;
  fillTimeArgs(m, args);

  if (m[9]) {
    const r = m[9] === '-' ? -1 : 1;
    args[3] -= (fastParseInt(m[10]) || 0) * r;
    args[4] -= (fastParseInt(m[11]) || 0) * r;
    return new Date(Date.UTC(...args));
  }
  if (m[8] || utc) return new Date(Date.UTC(...args));
  return new Date(...args);
}
