import { expect } from 'expect';
import {
  Box,
  Circle,
  Interval,
  Line,
  LineSegment,
  Numeric,
  Path,
  Point,
  Polygon,
  Range,
} from 'postgrejs';

/**
 * The matrix is the six values measured against `pg` 8.23.0, plus the
 * three that isolate the sign.
 */
describe('Interval.toISOString()', () => {
  const iso = (fields: any) => new Interval(fields).toISOString();

  it('should agree with pg on the values that carry no sign', () => {
    expect(
      iso({
        years: 1,
        months: 2,
        days: 3,
        hours: 4,
        minutes: 5,
        seconds: 6,
        milliseconds: 700,
      }),
    ).toStrictEqual('P1Y2M3DT4H5M6.7S');
    expect(iso({})).toStrictEqual('P0Y0M0DT0H0M0S');
    expect(iso({ days: 1 })).toStrictEqual('P0Y0M1DT0H0M0S');
    expect(iso({ milliseconds: 0.001 })).toStrictEqual('P0Y0M0DT0H0M0.000001S');
  });

  it('should sign only the components that have a value', () => {
    // `-0M-0S` is what it used to print, which `pg` does not write and no
    // reader expects.
    expect(iso({ days: -1, hours: -2 })).toStrictEqual('P0Y0M-1DT-2H0M0S');
    expect(iso({ years: -1, months: -2 })).toStrictEqual('P-1Y-2M0DT0H0M0S');
  });

  it('should keep the sign where the value carries into another component', () => {
    expect(iso({ minutes: -90 })).toStrictEqual('P0Y0M0DT-1H-30M0S');
    expect(iso({ milliseconds: -500 })).toStrictEqual('P0Y0M0DT0H0M-0.5S');
  });
});

describe('toPostgres()', () => {
  it('should give the literal PostgreSQL reads back', () => {
    // `pg`'s convention for "write yourself back": an encoder that
    // follows it can take a value this client decoded.
    expect(new Interval({ days: 1, hours: 2 }).toPostgres()).toStrictEqual(
      '1 day 02:00:00',
    );
    expect(new Numeric('19.99').toPostgres()).toStrictEqual('19.99');
    expect(new Point(1, 2).toPostgres()).toStrictEqual('(1,2)');
    expect(new Circle(1, 2, 3).toPostgres()).toStrictEqual('<(1,2),3>');
    expect(new Range(1, 5, '[)', 3904).toPostgres()).toStrictEqual('[1,5)');
  });

  it('should be what toString() gives, for every class that has one', () => {
    for (const v of [
      new Interval({ days: -1 }),
      new Numeric('-0.5'),
      new Point(3, 4),
      new Circle(0, 0, 1),
      new Range(1, 5, '[]', 3904),
      new Box(1, 2, 3, 4),
      new LineSegment(1, 2, 3, 4),
      new Line(1, -1, 0),
      new Path([new Point(1, 2), new Point(3, 4)]),
      new Polygon([new Point(1, 2), new Point(3, 4)]),
    ] as any[]) {
      expect(v.toPostgres()).toStrictEqual(String(v));
    }
  });
});
