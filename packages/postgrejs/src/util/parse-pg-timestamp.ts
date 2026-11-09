/**
 * Reads a fixed 2-digit field at `i`, or -1 when it runs past `end` or
 * either byte isn't a digit. Module level, not a closure inside the
 * scanner: a closure allocated per parsed value would cost more than the
 * parse it speeds up.
 *
 * `end` is load-bearing, not a formality: this reads a row's own slice of
 * a shared buffer, so a read past the end would silently pick up the next
 * column's bytes - and accept a truncated timestamp if they happened to be
 * digits, rather than declining it.
 */
function read2(buf: Buffer, i: number, end: number): number {
  if (i + 1 >= end) return -1;
  const a = buf[i] - 48;
  if (a < 0 || a > 9) return -1;
  const b = buf[i + 1] - 48;
  if (b < 0 || b > 9) return -1;
  return a * 10 + b;
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * Days between the Unix epoch and a proleptic-Gregorian Y/M/D (Howard
 * Hinnant's days_from_civil). `Date.UTC()` produces the same number but
 * costs roughly twice as much, because it also has to coerce and normalise
 * arbitrarily out-of-range arguments - which every caller here has already
 * ruled out. Only correct for the in-range, already-validated values the
 * scanner feeds it (years 1000-9999, so every intermediate stays positive
 * and `| 0` truncation is the same as flooring).
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
 * `YYYY-MM-DD HH:MM:SS[.f+][(+|-)HH[:MM]]` - straight out of the wire
 * bytes, instead of building a string and handing that to the engine's
 * general-purpose date parser. `new Date(str)` costs ~150ns per value and
 * dominates decode time on timestamp-heavy result sets; even the string
 * this replaces costs ~43ns to materialise before any parsing starts.
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
export function parsePgTimestampBuffer(
  buf: Buffer,
  offset: number,
  end: number,
): Date | undefined {
  if (end - offset < 19) return undefined;
  // Year must be a plain 1000-9999: a leading zero would hit the engine's
  // legacy two-digit-year mapping (`0001` -> 2001) that the fallback path
  // still produces.
  const y0 = buf[offset] - 48;
  if (y0 < 1 || y0 > 9) return undefined;
  if (
    buf[offset + 4] !== 45 || // -
    buf[offset + 7] !== 45 || // -
    buf[offset + 10] !== 32 || // space
    buf[offset + 13] !== 58 || // :
    buf[offset + 16] !== 58 // :
  )
    return undefined;

  let n: number;
  let year = y0;
  for (let i = offset + 1; i < offset + 4; i++) {
    n = buf[i] - 48;
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
  const month = read2(buf, offset + 5, end);
  if (month < 1 || month > 12) return undefined;
  const day = read2(buf, offset + 8, end);
  if (day < 1 || day > 31) return undefined;
  const hour = read2(buf, offset + 11, end);
  if (hour < 0 || hour > 23) return undefined;
  const minute = read2(buf, offset + 14, end);
  if (minute < 0 || minute > 59) return undefined;
  const second = read2(buf, offset + 17, end);
  if (second < 0 || second > 59) return undefined;
  if (day > DAYS_IN_MONTH[month - 1]) {
    // February 29th is the one day this table can't answer on its own.
    if (month !== 2 || day !== 29) return undefined;
    if (year % 4 !== 0 || (year % 100 === 0 && year % 400 !== 0))
      return undefined;
  }

  let pos = offset + 19;
  let ms = 0;
  if (pos < end && buf[pos] === 46) {
    // Fractional seconds: milliseconds are the first 3 digits, zero-padded
    // when fewer are present (".5" is 500ms) and truncated when more are
    // (".123456" is 123ms) - both matching the existing paths exactly.
    pos++;
    let digits = 0;
    while (pos < end) {
      n = buf[pos] - 48;
      if (n < 0 || n > 9) break;
      if (digits < 3) ms = ms * 10 + n;
      digits++;
      pos++;
    }
    if (!digits) return undefined;
    if (digits === 1) ms *= 100;
    else if (digits === 2) ms *= 10;
  }

  if (pos === end)
    return new Date(year, month - 1, day, hour, minute, second, ms);

  const sign = buf[pos];
  if (sign !== 43 && sign !== 45) return undefined; // + or -
  pos++;
  const offHour = read2(buf, pos, end);
  if (offHour < 0 || offHour > 23) return undefined;
  pos += 2;
  let offMinute = 0;
  if (pos < end) {
    if (buf[pos] !== 58) return undefined; // :
    offMinute = read2(buf, pos + 1, end);
    if (offMinute < 0 || offMinute > 59) return undefined;
    pos += 3;
    // A trailing ":SS" (PostgreSQL emits these for pre-standard-time
    // dates) is deliberately not handled: `new Date()` rejects those
    // outright today, so they must keep falling through to do the same.
    if (pos !== end) return undefined;
  }
  const offsetMinutes = (offHour * 60 + offMinute) * (sign === 45 ? -1 : 1);
  return new Date(
    (epochDays(year, month, day) * 86400 +
      hour * 3600 +
      (minute - offsetMinutes) * 60 +
      second) *
      1000 +
      ms,
  );
}

// Big enough for any timestamp PostgreSQL prints (the longest is
// "YYYY-MM-DD HH:MM:SS.ffffff+HH:MM", 32 bytes); anything longer is left to
// the fallback, which produces the same value it always did.
const scratch = Buffer.allocUnsafe(64);

/**
 * The same scan for a value that is already a string - the array-element
 * and string-parameter paths, which never see the wire bytes.
 *
 * Copying into a scratch buffer first still beats scanning the string
 * directly through a second, parallel implementation: the copy costs about
 * half of what materialising the string cost in the first place, and there
 * is only one scanner to keep correct. Safe to share one buffer because
 * the copy and the scan that reads it are a single synchronous step.
 */
export function parsePgTimestampString(str: string): Date | undefined {
  const len = str.length;
  if (len < 19 || len > scratch.length) return undefined;
  let c: number;
  for (let i = 0; i < len; i++) {
    c = str.charCodeAt(i);
    // A code point above 255 would be truncated on the way into the buffer
    // and could land on a digit, turning a string the scanner should
    // reject into one it accepts. Nothing in the shape it scans is
    // non-ASCII, so anything that isn't goes to the fallback.
    if (c > 255) return undefined;
    scratch[i] = c;
  }
  return parsePgTimestampBuffer(scratch, 0, len);
}
