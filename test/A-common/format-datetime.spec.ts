import { expect } from 'expect';
import {
  formatDate,
  formatTime,
  formatTimestamp,
  formatTimestamptz,
} from '../../src/util/format-datetime.js';

// A fixed instant, single-digit month/day/hour/minute/second so the
// zero-padding itself is under test, not incidental to the date chosen.
const UTC_MS = Date.UTC(2024, 0, 5, 3, 4, 5, 6); // 2024-01-05T03:04:05.006Z

describe('format-datetime', () => {
  describe('formatDate()', () => {
    it('should format using local components by default', () => {
      const d = new Date(UTC_MS);
      const expected =
        `${d.getFullYear()}-` +
        `${String(d.getMonth() + 1).padStart(2, '0')}-` +
        `${String(d.getDate()).padStart(2, '0')}`;
      expect(formatDate(d)).toStrictEqual(expected);
    });

    it('should format using UTC components when utcDates is set', () => {
      expect(formatDate(new Date(UTC_MS), { utcDates: true })).toStrictEqual(
        '2024-01-05',
      );
    });

    it('should accept an epoch-ms number the same as an equivalent Date', () => {
      expect(formatDate(UTC_MS, { utcDates: true })).toStrictEqual(
        '2024-01-05',
      );
    });

    it('should coerce a date-like string through `new Date()`', () => {
      expect(
        formatDate('2024-01-05T03:04:05.006Z', { utcDates: true }),
      ).toStrictEqual('2024-01-05');
    });

    it('should pass Infinity/-Infinity through as PostgreSQL keywords', () => {
      expect(formatDate(Infinity)).toStrictEqual('infinity');
      expect(formatDate(-Infinity)).toStrictEqual('-infinity');
    });

    it('should zero-pad a single-digit year out to 4 digits', () => {
      // year 5 AD - as unlikely as it is to be a real value, the format
      // has to stay 4 digits wide either way. Date.UTC()/`new Date(year,
      // ...)` special-case a 0-99 year argument as 1900+year, so
      // setUTCFullYear() is the only way to actually get one that low.
      const d = new Date(UTC_MS);
      d.setUTCFullYear(5);
      expect(formatDate(d, { utcDates: true })).toStrictEqual('0005-01-05');
    });
  });

  describe('formatTime()', () => {
    it('should format using local components by default', () => {
      const d = new Date(UTC_MS);
      const expected =
        `${String(d.getHours()).padStart(2, '0')}:` +
        `${String(d.getMinutes()).padStart(2, '0')}:` +
        `${String(d.getSeconds()).padStart(2, '0')}.` +
        `${String(d.getMilliseconds()).padStart(3, '0')}`;
      expect(formatTime(d)).toStrictEqual(expected);
    });

    it('should format using UTC components when utcDates is set', () => {
      expect(formatTime(new Date(UTC_MS), { utcDates: true })).toStrictEqual(
        '03:04:05.006',
      );
    });

    it('should pass Infinity/-Infinity through as PostgreSQL keywords', () => {
      expect(formatTime(Infinity)).toStrictEqual('infinity');
      expect(formatTime(-Infinity)).toStrictEqual('-infinity');
    });
  });

  describe('formatTimestamp()', () => {
    it('should join formatDate() and formatTime() with a space', () => {
      expect(
        formatTimestamp(new Date(UTC_MS), { utcDates: true }),
      ).toStrictEqual('2024-01-05 03:04:05.006');
    });

    it('should pass Infinity/-Infinity through as PostgreSQL keywords', () => {
      expect(formatTimestamp(Infinity)).toStrictEqual('infinity');
      expect(formatTimestamp(-Infinity)).toStrictEqual('-infinity');
    });
  });

  describe('formatTimestamptz()', () => {
    it('should always write UTC with an explicit +00 offset', () => {
      // timestamptz is an absolute instant - unlike the zone-less types
      // above, there is no `utcDates` option to pass here at all.
      expect(formatTimestamptz(new Date(UTC_MS))).toStrictEqual(
        '2024-01-05 03:04:05.006+00',
      );
    });

    it('should accept an epoch-ms number', () => {
      expect(formatTimestamptz(UTC_MS)).toStrictEqual(
        '2024-01-05 03:04:05.006+00',
      );
    });

    it('should coerce a date-like string through `new Date()`', () => {
      expect(formatTimestamptz('2024-01-05T03:04:05.006Z')).toStrictEqual(
        '2024-01-05 03:04:05.006+00',
      );
    });

    it('should pass Infinity/-Infinity through as PostgreSQL keywords', () => {
      expect(formatTimestamptz(Infinity)).toStrictEqual('infinity');
      expect(formatTimestamptz(-Infinity)).toStrictEqual('-infinity');
    });
  });
});
