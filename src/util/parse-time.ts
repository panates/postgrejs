import { fastParseInt } from './fast-parseint.js';

// eslint-disable-next-line
// noinspection RegExpUnnecessaryNonCapturingGroup
export const STRICT_TIME_PATTERN =
  /^([01][0-9]|2[0-3]):([0-5][0-9]):([0-5][0-9])(?:\.(\d+))?(?:(Z)|(?:([+-])([01]?[0-9]|2[0-3]):?([0-5][0-9])?))?$/;
// noinspection RegExpUnnecessaryNonCapturingGroup
export const TIME_PATTERN =
  /^([01][0-9]|2[0-3]):?([0-5][0-9]):?([0-5][0-9])?(?:\.(\d+))?(?:(Z)|(?:([+-])([01]?[0-9]|2[0-3]):?([0-5][0-9])?))?$/;

export function parseTime(str: string, parseTimeZone?: boolean, utc?: boolean): Date {
  const m = str.match(TIME_PATTERN);
  if (!m) return new Date('invalid');

  const args: [number, number, number, number, number, number, number] = [1970, 0, 1, 0, 0, 0, 0];
  for (let i = 1; i < 4; i++) {
    const s = m[i];
    args[i + 2] = fastParseInt(s) || 0;
  }

  if (parseTimeZone && m[6]) {
    const r = m[9] === '-' ? -1 : 1;
    args[3] -= (fastParseInt(m[7]) || 0) * r;
    args[4] -= (fastParseInt(m[8]) || 0) * r;
    return new Date(Date.UTC(...args));
  }
  if (m[5] || utc) return new Date(Date.UTC(...args));
  return new Date(...args);
}
