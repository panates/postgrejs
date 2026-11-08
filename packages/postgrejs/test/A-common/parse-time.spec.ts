import { expect } from 'expect';
import { parseTime } from '../../src/util/parse-time.js';

describe('parseTime()', () => {
  it('should parse hh:mm:ss into a local-time Date anchored at the epoch day', () => {
    const d = parseTime('03:04:05');
    expect(d.getFullYear()).toStrictEqual(1970);
    expect(d.getMonth()).toStrictEqual(0);
    expect(d.getDate()).toStrictEqual(1);
    expect(d.getHours()).toStrictEqual(3);
    expect(d.getMinutes()).toStrictEqual(4);
    expect(d.getSeconds()).toStrictEqual(5);
  });

  it('should parse into UTC components when utc is true', () => {
    const d = parseTime('03:04:05', false, true);
    expect(d.getUTCHours()).toStrictEqual(3);
    expect(d.getUTCMinutes()).toStrictEqual(4);
    expect(d.getUTCSeconds()).toStrictEqual(5);
  });

  it("should force UTC when the string carries a 'Z' suffix, even without the utc flag", () => {
    const d = parseTime('03:04:05Z');
    expect(d.getUTCHours()).toStrictEqual(3);
  });

  it('should pad a fractional-seconds part shorter than 3 digits', () => {
    const d = parseTime('03:04:05.1', false, true);
    expect(d.getUTCMilliseconds()).toStrictEqual(100);
  });

  it('should truncate a fractional-seconds part longer than 3 digits, not round it', () => {
    // '.1236' truncates to '123', it does not round up to 124.
    const d = parseTime('03:04:05.1236', false, true);
    expect(d.getUTCMilliseconds()).toStrictEqual(123);
  });

  it('should return an invalid Date for a string that does not match the pattern', () => {
    expect(isNaN(parseTime('not-a-time').getTime())).toStrictEqual(true);
  });

  describe('with parseTimeZone: true', () => {
    it('should subtract a positive (+HH:MM) offset to land on the equivalent UTC instant', () => {
      // 03:04:05+02:30 is 2h30m ahead of UTC, so the UTC instant is
      // 2h30m earlier: 00:34:05.
      const d = parseTime('03:04:05+02:30', true);
      expect(d.getUTCHours()).toStrictEqual(0);
      expect(d.getUTCMinutes()).toStrictEqual(34);
      expect(d.getUTCSeconds()).toStrictEqual(5);
    });

    it('should add a negative (-HH:MM) offset to land on the equivalent UTC instant', () => {
      // Regression test: the sign check used to compare against a capture
      // group that did not exist in this pattern (always undefined), so a
      // negative offset was silently treated as positive. 01:00:00-05:00
      // is 5h behind UTC, so the UTC instant is 5h later: 06:00:00 - a
      // wrong sign would instead produce the previous day at 20:00.
      const d = parseTime('01:00:00-05:00', true);
      expect(d.getUTCHours()).toStrictEqual(6);
      expect(d.getUTCMinutes()).toStrictEqual(0);
    });

    it('should handle a zero offset hour with non-zero minutes (+00:MM)', () => {
      // fastParseInt('00') is 0, itself falsy - exercises the `|| 0`
      // fallback on the hour half of the offset, not just the minute half.
      const d = parseTime('10:00:00+00:30', true);
      expect(d.getUTCHours()).toStrictEqual(9);
      expect(d.getUTCMinutes()).toStrictEqual(30);
    });

    it('should treat a bare +HH offset (no minutes) as :00 minutes', () => {
      const d = parseTime('10:00:00+03', true);
      expect(d.getUTCHours()).toStrictEqual(7);
      expect(d.getUTCMinutes()).toStrictEqual(0);
    });

    it('should ignore the offset when parseTimeZone is false, using local time instead', () => {
      const d = parseTime('03:04:05+02:30', false, true);
      expect(d.getUTCHours()).toStrictEqual(3);
      expect(d.getUTCMinutes()).toStrictEqual(4);
    });
  });
});
