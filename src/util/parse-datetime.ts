// noinspection RegExpUnnecessaryNonCapturingGroup
import { fastParseInt } from './fast-parseint.js';

// noinspection RegExpUnnecessaryNonCapturingGroup
const TIMESTAMP_PATTERN =
  // eslint-disable-next-line
  /^(\d{4})-?(0[1-9]|1[012])?-?([123]0|[012][1-9]|31)?(?:[T ]?([01][0-9]|2[0-3]):?([0-5][0-9]):?([0-5][0-9])?(?:\.(\d+))?(?:(Z)|(?:([+-])([01]?[0-9]|2[0-3]):?([0-5][0-9])?))?)?$/;
const INFINITY_PATTERN = /^-?infinity$/;

export function parseDateTime(str: string, parseTime?: boolean, parseTimeZone?: boolean, utc?: boolean): Date | number {
  let m = str.match(TIMESTAMP_PATTERN);
  if (!m) {
    m = str.match(INFINITY_PATTERN);
    if (m) return Number(str.replace('i', 'I'));
    return new Date('invalid');
  }

  const args: [number, number, number, number, number, number, number] = [1970, 0, 1, 0, 0, 0, 0];
  const l = parseTime ? 7 : 3;
  for (let i = 0; i < l; i++) {
    const s = m[i + 1];
    args[i] = fastParseInt(s) || 0;
  }
  // Months starts from 0
  if (args[1] > 0) args[1]--;

  if (parseTimeZone && parseTime && m[9]) {
    const r = m[9] === '-' ? -1 : 1;
    args[3] -= (fastParseInt(m[10]) || 0) * r;
    args[4] -= (fastParseInt(m[11]) || 0) * r;
    return new Date(Date.UTC(...args));
  }
  if (m[8] || utc) return new Date(Date.UTC(...args));
  return new Date(...args);
}
