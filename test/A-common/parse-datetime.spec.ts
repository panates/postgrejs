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
});
