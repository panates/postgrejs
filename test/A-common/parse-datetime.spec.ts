import { expect } from 'expect';
import {
  parseDate,
  parseDateTime,
  parseDateTimeTz,
} from '../../src/util/parse-datetime.js';

describe('parse-datetime', () => {
  describe('parseDate()', () => {
    it('should parse a full year-month-day string', () => {
      const d = parseDate('2024-01-05', true) as Date;
      expect(d.getUTCFullYear()).toStrictEqual(2024);
      expect(d.getUTCMonth()).toStrictEqual(0);
      expect(d.getUTCDate()).toStrictEqual(5);
    });

    it('should default month and day to January 1st when only a year is given', () => {
      const d = parseDate('2024', true) as Date;
      expect(d.getUTCFullYear()).toStrictEqual(2024);
      expect(d.getUTCMonth()).toStrictEqual(0);
      expect(d.getUTCDate()).toStrictEqual(1);
    });

    it("should force UTC via the string's own 'Z', even without the utc flag", () => {
      const d = parseDate('2024-01-05T00:00:00Z') as Date;
      expect(d.getUTCFullYear()).toStrictEqual(2024);
      expect(d.getUTCMonth()).toStrictEqual(0);
      expect(d.getUTCDate()).toStrictEqual(5);
    });

    it('should return Infinity/-Infinity for those PostgreSQL keywords', () => {
      expect(parseDate('infinity')).toStrictEqual(Infinity);
      expect(parseDate('-infinity')).toStrictEqual(-Infinity);
      expect(parseDate('Infinity')).toStrictEqual(Infinity);
      expect(parseDate('-Infinity')).toStrictEqual(-Infinity);
    });

    it('should return an invalid Date for a string matching neither shape', () => {
      const d = parseDate('not-a-date') as Date;
      expect(isNaN(d.getTime())).toStrictEqual(true);
    });
  });

  describe('parseDateTime()', () => {
    it("should take the fast native Date() path when it parses and utc isn't forced", () => {
      const d = parseDateTime('2024-01-05T03:04:05Z') as Date;
      expect(d.getUTCHours()).toStrictEqual(3);
    });

    it('should fall back to the regex parser for a compact form native Date() cannot read', () => {
      // No separators at all - TIMESTAMP_PATTERN's dashes/colons are all
      // optional, but the native Date constructor rejects this shape
      // outright, which is exactly what forces the manual fallback path.
      const d = parseDateTime('20240105030405', true) as Date;
      expect(d.getUTCFullYear()).toStrictEqual(2024);
      expect(d.getUTCMonth()).toStrictEqual(0);
      expect(d.getUTCDate()).toStrictEqual(5);
      expect(d.getUTCHours()).toStrictEqual(3);
      expect(d.getUTCMinutes()).toStrictEqual(4);
      expect(d.getUTCSeconds()).toStrictEqual(5);
    });

    it('should always use the regex parser when utc is true, even for a fast-path-eligible string', () => {
      const d = parseDateTime('2024-01-05 03:04:05', true) as Date;
      expect(d.getUTCHours()).toStrictEqual(3);
    });

    it('should pad a fractional-seconds part to exactly 3 digits', () => {
      const d = parseDateTime('20240105030405.5', true) as Date;
      expect(d.getUTCMilliseconds()).toStrictEqual(500);
    });

    it("should force UTC via the string's own 'Z' in the regex path too", () => {
      const d = parseDateTime('20240105030405Z') as Date;
      expect(d.getUTCHours()).toStrictEqual(3);
    });

    it('should return Infinity/-Infinity for those PostgreSQL keywords', () => {
      expect(parseDateTime('infinity')).toStrictEqual(Infinity);
      expect(parseDateTime('-infinity')).toStrictEqual(-Infinity);
    });

    it('should return an invalid Date for a string matching neither shape', () => {
      const d = parseDateTime('not-a-date', true) as Date;
      expect(isNaN(d.getTime())).toStrictEqual(true);
    });

    it('should build a local-time Date in the regex path when neither Z nor utc apply', () => {
      const d = parseDateTime('20240105030405') as Date;
      expect(d.getHours()).toStrictEqual(3);
      expect(d.getMinutes()).toStrictEqual(4);
    });
  });

  describe('parseDateTimeTz()', () => {
    it('should take the fast native Date() path when it parses (regardless of utc)', () => {
      const d = parseDateTimeTz('2024-01-05T03:04:05Z') as Date;
      expect(d.getUTCHours()).toStrictEqual(3);
    });

    it('should fall back to the regex parser for a compact form native Date() cannot read', () => {
      const d = parseDateTimeTz('20240105030405', true) as Date;
      expect(d.getUTCFullYear()).toStrictEqual(2024);
      expect(d.getUTCHours()).toStrictEqual(3);
    });

    it('should subtract a positive (+HH:MM) offset to land on the equivalent UTC instant', () => {
      // 03:04:05+02:30 is 2h30m ahead of UTC -> 00:34:05 UTC.
      const d = parseDateTimeTz('20240105030405+0230') as Date;
      expect(d.getUTCHours()).toStrictEqual(0);
      expect(d.getUTCMinutes()).toStrictEqual(34);
    });

    it('should add a negative (-HH:MM) offset to land on the equivalent UTC instant', () => {
      // 01:00:00-05:00 is 5h behind UTC -> 06:00:00 UTC.
      const d = parseDateTimeTz('20240105010000-0500') as Date;
      expect(d.getUTCHours()).toStrictEqual(6);
    });

    it('should treat a bare +HH offset (no minutes) as :00 minutes', () => {
      const d = parseDateTimeTz('20240105100000+03') as Date;
      expect(d.getUTCHours()).toStrictEqual(7);
      expect(d.getUTCMinutes()).toStrictEqual(0);
    });

    it("should force UTC via the string's own 'Z' in the regex path when there is no offset", () => {
      const d = parseDateTimeTz('20240105030405Z') as Date;
      expect(d.getUTCHours()).toStrictEqual(3);
    });

    it('should build a local-time Date in the regex path when neither an offset nor utc apply', () => {
      const d = parseDateTimeTz('20240105030405') as Date;
      expect(d.getHours()).toStrictEqual(3);
      expect(d.getMinutes()).toStrictEqual(4);
    });

    it('should return Infinity/-Infinity for those PostgreSQL keywords', () => {
      expect(parseDateTimeTz('infinity')).toStrictEqual(Infinity);
      expect(parseDateTimeTz('-infinity')).toStrictEqual(-Infinity);
    });

    it('should return an invalid Date for a string matching neither shape', () => {
      const d = parseDateTimeTz('not-a-date') as Date;
      expect(isNaN(d.getTime())).toStrictEqual(true);
    });
  });

  // The digit-scanning fast path for PostgreSQL's own ISO output shape.
  // Every case here has to produce exactly what the `new Date()`/regex
  // path it replaced produced - including where that means declining to
  // handle the value at all, since the fallback has quirks (a day past the
  // end of its month is clamped, not rolled over; a leading-zero year hits
  // the engine's two-digit-year mapping) that callers may rely on.
  describe('PostgreSQL ISO shape fast path', () => {
    it('should apply a whole-hour offset', () => {
      const d = parseDateTimeTz('2024-03-05 14:22:31+03') as Date;
      expect(d.toISOString()).toStrictEqual('2024-03-05T11:22:31.000Z');
    });

    it('should apply an offset with minutes, in both directions', () => {
      expect(
        (parseDateTimeTz('2024-03-05 14:22:31+03:30') as Date).toISOString(),
      ).toStrictEqual('2024-03-05T10:52:31.000Z');
      expect(
        (parseDateTimeTz('2024-03-05 14:22:31-04:30') as Date).toISOString(),
      ).toStrictEqual('2024-03-05T18:52:31.000Z');
    });

    it('should zero-pad a short fractional part and truncate a long one to milliseconds', () => {
      expect(
        (
          parseDateTimeTz('2024-03-05 14:22:31.5+00') as Date
        ).getUTCMilliseconds(),
      ).toStrictEqual(500);
      expect(
        (
          parseDateTimeTz('2024-03-05 14:22:31.12+00') as Date
        ).getUTCMilliseconds(),
      ).toStrictEqual(120);
      expect(
        (
          parseDateTimeTz('2024-03-05 14:22:31.123456+00') as Date
        ).getUTCMilliseconds(),
      ).toStrictEqual(123);
    });

    it('should build a local-time Date when the string carries no offset', () => {
      const d = parseDateTime('2024-03-05 14:22:31') as Date;
      expect(d.getFullYear()).toStrictEqual(2024);
      expect(d.getHours()).toStrictEqual(14);
      expect(d.getMinutes()).toStrictEqual(22);
    });

    it('should accept February 29th in a leap year', () => {
      expect(
        (parseDateTimeTz('2024-02-29 00:00:00+00') as Date).toISOString(),
      ).toStrictEqual('2024-02-29T00:00:00.000Z');
      // 2000 is a leap year (divisible by 400), 1900 is not (by 100).
      expect(
        (parseDateTimeTz('2000-02-29 00:00:00+00') as Date).toISOString(),
      ).toStrictEqual('2000-02-29T00:00:00.000Z');
    });

    it('should hand a day past the end of its month back to the fallback, which rolls it over', () => {
      const d = parseDateTime('2024-02-30 00:00:00') as Date;
      expect(d.getMonth()).toStrictEqual(2);
      expect(d.getDate()).toStrictEqual(1);
      // 1900 is not a leap year, so the 29th rolls into March here too.
      const nonLeap = parseDateTime('1900-02-29 00:00:00') as Date;
      expect(nonLeap.getMonth()).toStrictEqual(2);
      expect(nonLeap.getDate()).toStrictEqual(1);
    });

    it('should decline out-of-range fields rather than rolling them over', () => {
      for (const s of [
        '2024-00-10 00:00:00',
        '2024-01-00 00:00:00',
        '2024-03-05 24:22:31',
        '2024-03-05 14:60:00',
        '2024-03-05 14:22:60',
        // A non-digit anywhere in the year, past its first character.
        '20x4-03-05 14:22:31',
      ]) {
        expect(isNaN((parseDateTime(s) as Date).getTime())).toStrictEqual(true);
      }
    });

    it('should hand a colon-less four-digit offset to the fallback, which reads it', () => {
      const d = parseDateTimeTz('2024-03-05 14:22:31+0330') as Date;
      expect(d.toISOString()).toStrictEqual('2024-03-05T10:52:31.000Z');
    });

    it('should decline a year with a leading zero, keeping the fallback mapping', () => {
      // The engine reads "0001" as 2001; the fast path must not "fix" that.
      const d = parseDateTimeTz('0001-01-01 00:00:00+00') as Date;
      expect(d.getUTCFullYear()).toStrictEqual(2001);
    });

    it('should decline a seconds-bearing offset, which the fallback rejects outright', () => {
      // PostgreSQL emits these for pre-standard-time dates.
      const d = parseDateTimeTz('1880-01-01 00:00:00-04:56:02') as Date;
      expect(isNaN(d.getTime())).toStrictEqual(true);
    });

    it('should decline anything with trailing or malformed characters', () => {
      for (const s of [
        '2024-03-05 14:22:31 BC',
        '2024-03-05 14:22:31x',
        '2024-03-05 14:22:31.',
        '2024-03-05 14:22:31+',
      ]) {
        expect(isNaN((parseDateTimeTz(s) as Date).getTime())).toStrictEqual(
          true,
        );
      }
    });

    it('should still parse a trailing-colon offset through the fallback', () => {
      // Not the fixed shape, but the engine accepts it - so the result has
      // to stay what it always was rather than becoming an invalid Date.
      const d = parseDateTimeTz('2024-03-05 14:22:31+03:') as Date;
      expect(d.toISOString()).toStrictEqual('2024-03-05T11:22:31.000Z');
    });

    it('should still parse a single-digit offset through the fallback', () => {
      // "+3" isn't the fixed two-digit shape, but the engine accepts it.
      const d = parseDateTimeTz('2024-03-05 14:22:31+3') as Date;
      expect(d.toISOString()).toStrictEqual('2024-03-05T11:22:31.000Z');
    });
  });
});
