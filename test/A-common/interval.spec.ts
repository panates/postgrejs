import { expect } from 'expect';
import { Interval } from 'postgrejs';
import { parseIntervalText } from '../../src/data-types/interval-type.js';

describe('Interval', () => {
  it('should carry every field, zero when the value has none', () => {
    // The difference from pg's sparse objects, where `interval '1 day'`
    // is `{days: 1}` and reading `.hours` gives undefined.
    const iv = new Interval({ days: 1, hours: 2 });
    expect({ ...iv }).toStrictEqual({
      years: 0,
      months: 0,
      days: 1,
      hours: 2,
      minutes: 0,
      seconds: 0,
      milliseconds: 0,
    });
    expect({ ...new Interval() }).toStrictEqual({
      years: 0,
      months: 0,
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      milliseconds: 0,
    });
  });

  describe('fromParts()', () => {
    it('should split the wire format into fields', () => {
      const iv = Interval.fromParts(14706789000n, 3, 14);
      expect({ ...iv }).toStrictEqual({
        years: 1,
        months: 2,
        days: 3,
        hours: 4,
        minutes: 5,
        seconds: 6,
        milliseconds: 789,
      });
    });

    it('should print years and months from one month count', () => {
      // What the server does with `interval '13 mons'`.
      expect({ ...Interval.fromParts(0n, 0, 13) }).toMatchObject({
        years: 1,
        months: 1,
      });
      expect({ ...Interval.fromParts(0n, 0, -36) }).toMatchObject({
        years: -3,
        months: 0,
      });
    });

    it('should put the sign on each field that has one', () => {
      expect({ ...Interval.fromParts(-7200000000n, -1, 0) }).toMatchObject({
        days: -1,
        hours: -2,
        minutes: 0,
      });
    });

    it('should keep microsecond precision', () => {
      expect(Interval.fromParts(-1n, 0, 0).milliseconds).toStrictEqual(-0.001);
      expect(Interval.fromParts(500000n, 0, 0).milliseconds).toStrictEqual(500);
      expect(Interval.fromParts(123456n, 0, 0).milliseconds).toStrictEqual(
        123.456,
      );
    });
  });

  describe('toString()', () => {
    // Every expectation here is what a live server printed for the same
    // value - the point of the method is that it matches, so an interval
    // reads the same in a log as it does in psql and casts back.
    const cases: [string, unknown[]][] = [
      ['1 day 02:00:00', [7200000000n, 1, 0]],
      ['1 year 2 mons 3 days 04:05:06.789', [14706789000n, 3, 14]],
      ['00:00:00', [0n, 0, 0]],
      ['-1 days -02:00:00', [-7200000000n, -1, 0]],
      ['00:00:00.123456', [123456n, 0, 0]],
      ['2 mons', [0n, 0, 2]],
      ['-3 years', [0n, 0, -36]],
      ['1 day -02:00:00', [-7200000000n, 1, 0]],
      ['100000:00:00', [360000000000000n, 0, 0]],
      ['-00:00:00.000001', [-1n, 0, 0]],
      ['1 year 1 mon', [0n, 0, 13]],
      ['00:00:00.5', [500000n, 0, 0]],
      ['-1 years -1 mons -1 days -00:00:01', [-1000000n, -1, -13]],
    ];
    for (const [expected, parts] of cases) {
      it(`should print ${JSON.stringify(expected)}`, () => {
        const [us, days, months] = parts as [bigint, number, number];
        expect(Interval.fromParts(us, days, months).toString()).toStrictEqual(
          expected,
        );
      });
    }

    it('should use the singular only for exactly one', () => {
      // `-1 days`, not `-1 day` - the server pluralises on `!== 1`, not on
      // magnitude.
      expect(new Interval({ days: 1 }).toString()).toStrictEqual('1 day');
      expect(new Interval({ days: -1 }).toString()).toStrictEqual('-1 days');
      expect(new Interval({ months: 1 }).toString()).toStrictEqual('1 mon');
      expect(new Interval({ months: -1 }).toString()).toStrictEqual('-1 mons');
      expect(new Interval({ years: 1 }).toString()).toStrictEqual('1 year');
      expect(new Interval({ years: -1 }).toString()).toStrictEqual('-1 years');
    });
  });

  describe('totalMicroseconds', () => {
    it('should fold a fractional field in rather than truncate it', () => {
      expect(new Interval({ seconds: 1.5 }).totalMicroseconds).toStrictEqual(
        1500000n,
      );
      expect(new Interval({ hours: 0.5 }).totalMicroseconds).toStrictEqual(
        1800000000n,
      );
    });

    it('should stay exact past what a double holds', () => {
      expect(new Interval({ hours: 100000 }).totalMicroseconds).toStrictEqual(
        360000000000000n,
      );
    });
  });

  it('should report the whole month count', () => {
    expect(new Interval({ years: 1, months: 2 }).totalMonths).toStrictEqual(14);
    expect(new Interval({ years: -3 }).totalMonths).toStrictEqual(-36);
  });

  it('should render as an ISO 8601 duration', () => {
    expect(Interval.fromParts(14706789000n, 3, 14).toISOString()).toStrictEqual(
      'P1Y2M3DT4H5M6.789S',
    );
    expect(new Interval().toISOString()).toStrictEqual('P0Y0M0DT0H0M0S');
  });

  it('should serialize to JSON as the string, not as its fields', () => {
    // A consumer can cast the string straight back to an interval; a bag
    // of seven numbers means nothing outside this package.
    expect(JSON.stringify({ iv: new Interval({ days: 1, hours: 2 }) })).toBe(
      '{"iv":"1 day 02:00:00"}',
    );
  });

  describe('parseIntervalText()', () => {
    it('should read back what toString writes', () => {
      for (const s of [
        '1 day 02:00:00',
        '1 year 2 mons 3 days 04:05:06.789',
        '00:00:00',
        '-1 days -02:00:00',
        '-00:00:00.000001',
        '00:00:00.5',
        '100000:00:00',
        '1 day -02:00:00',
      ]) {
        expect(parseIntervalText(s).toString()).toStrictEqual(s);
      }
    });

    it('should refuse a shape it cannot read rather than answering zero', () => {
      // The other IntervalStyles are not parsed here, and reading one
      // leniently would mean silently returning an empty interval.
      expect(() => parseIntervalText('@ 1 year 2 mons')).toThrow(
        'IntervalStyle',
      );
      expect(() => parseIntervalText('P1Y2M')).toThrow('IntervalStyle');
      expect(() => parseIntervalText('1-2')).toThrow('IntervalStyle');
    });
  });
});
