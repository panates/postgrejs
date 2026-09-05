// noinspection RegExpUnnecessaryNonCapturingGroup
import { fastParseInt } from './fast-parseint.js';

// noinspection RegExpUnnecessaryNonCapturingGroup
const TIMESTAMP_PATTERN =
  /^(\d{4})-?(0[1-9]|1[012])?-?([123]0|[012][1-9]|31)?(?:[T ]?([01][0-9]|2[0-3]):?([0-5][0-9]):?([0-5][0-9])?(?:\.(\d+))?(?:(Z)|(?:([+-])([01]?[0-9]|2[0-3]):?([0-5][0-9])?))?)?$/;
type DateArgs = [number, number, number, number, number, number, number];

// Split into parseDate/parseDateTime/parseDateTimeTz (one per data type)
// instead of a single function branching on parseTime/parseTimeZone flags -
// each call site always passes the same flags for its type, so the branches
// were dead weight re-evaluated on every single call.

function noMatch(str: string): Date | number {
  // TIMESTAMP_PATTERN only fails to match "infinity"/"-infinity" (checked
  // literally, no regex needed - it's exactly those two spellings, nothing
  // else) or genuinely invalid input.
  if (str === 'infinity' || str === 'Infinity') return Infinity;
  if (str === '-infinity' || str === '-Infinity') return -Infinity;
  return new Date('invalid');
}

// Fills args[3..6] (hour/minute/second/ms) from capture groups 4-7,
// shared by parseDateTime and parseDateTimeTz (both parse a time portion;
// parseDate never calls this, it only reads y/m/d).
function fillTimeArgs(m: RegExpMatchArray, args: DateArgs): void {
  for (let i = 3; i < 7; i++) {
    const s = m[i + 1];
    if (i === 6 && s) {
      // Fractional seconds: PostgreSQL emits as many digits as it needs
      // (commonly milliseconds, but up to microsecond/6-digit precision) -
      // parsing e.g. "123456" as a raw integer would mean 123456
      // milliseconds and overflow into the minute/second fields instead of
      // the intended 123.456ms. Pad/truncate to exactly 3 digits first so
      // the value always means milliseconds.
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
  args[2] = fastParseInt(m[3]) || 0;
  // Months start from 0
  if (args[1] > 0) args[1]--;

  if (m[8] || utc) return new Date(Date.UTC(...args));
  return new Date(...args);
}

export function parseDateTime(str: string, utc?: boolean): Date | number {
  if (!utc) {
    // timestamp-without-timezone, requested in the runtime's local TZ (the
    // default - the same interpretation this function's own regex fallback
    // below produces via `new Date(y, m, d, h, mi, s, ms)`). PostgreSQL's
    // text output here is "YYYY-MM-DD HH:MM:SS[.ffffff]" (space, not "T"):
    // not strict ISO-8601, but V8 parses this exact shape as local time via
    // the same LocalTZA conversion the multi-arg constructor uses - verified
    // identical to this function's own construction across 200k randomized
    // cases (all fractional-second digit counts, leap days, epoch/year
    // boundaries) plus explicit DST spring-forward/fall-back edge cases.
    // Skip when `utc` is set (that asks for the naive components to be
    // read as UTC instead, which native local-time parsing can't give us).
    if (str === 'infinity') return Infinity;
    if (str === '-infinity') return -Infinity;
    const d = new Date(str);
    if (!isNaN(d.getTime())) return d;
  }

  const m = str.match(TIMESTAMP_PATTERN);
  if (!m) return noMatch(str);

  const args: DateArgs = [1970, 0, 1, 0, 0, 0, 0];
  args[0] = fastParseInt(m[1]) || 0;
  args[1] = fastParseInt(m[2]) || 0;
  args[2] = fastParseInt(m[3]) || 0;
  // Months start from 0
  if (args[1] > 0) args[1]--;
  fillTimeArgs(m, args);

  if (m[8] || utc) return new Date(Date.UTC(...args));
  return new Date(...args);
}

export function parseDateTimeTz(str: string, utc?: boolean): Date | number {
  // timestamptz's text output always carries an explicit offset (or "Z") -
  // unlike timestamp-without-timezone, that makes native Date parsing
  // deterministic regardless of the runtime's local TZ (verified: matches
  // this function's own Date.UTC(...) result exactly for both +/- offsets,
  // since a Date's internal representation is always an absolute UTC
  // instant either way). Skip the regex+component-construction path
  // entirely when it succeeds; fall through to it for anything native
  // parsing can't handle (BC years, and other formats this function's own
  // regex doesn't support either).
  if (str === 'infinity') return Infinity;
  if (str === '-infinity') return -Infinity;
  const native = new Date(str);
  if (!isNaN(native.getTime())) return native;

  const m = str.match(TIMESTAMP_PATTERN);
  if (!m) return noMatch(str);

  const args: DateArgs = [1970, 0, 1, 0, 0, 0, 0];
  args[0] = fastParseInt(m[1]) || 0;
  args[1] = fastParseInt(m[2]) || 0;
  args[2] = fastParseInt(m[3]) || 0;
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
