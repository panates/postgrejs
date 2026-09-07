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
