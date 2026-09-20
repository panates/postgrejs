import { expect } from 'expect';
import {
  Box,
  Circle,
  DataTypeOIDs,
  Interval,
  Line,
  LineSegment,
  Path,
  Point,
  Polygon,
  Range,
  stringifyArrayForSQL,
  stringifyValueForSQL,
} from 'postgrejs';

const str = (v: any, options?: any) => stringifyValueForSQL(v, options);

describe('stringifyValueForSQL()', () => {
  describe('an object is asked about, not assumed to be JSON', () => {
    // Each of these used to come out as `::json`, and because the classes
    // have a toJSON() returning their own literal the result was a JSON
    // string holding one - `'"(1,2)"'::json` - which casts to nothing.
    // Every literal below was run through a live server and casts to the
    // type it names.
    it('should write each geometric class as its own literal', () => {
      expect(str(new Point(1, 2))).toStrictEqual("'(1,2)'::point");
      expect(str(new Circle(1, 2, 3))).toStrictEqual("'<(1,2),3>'::circle");
      expect(str(new Box(1, 2, 3, 4))).toStrictEqual("'(1,2),(3,4)'::box");
      expect(str(new LineSegment(1, 2, 3, 4))).toStrictEqual(
        "'[(1,2),(3,4)]'::lseg",
      );
      expect(str(new Line(1, -1, 0))).toStrictEqual("'{1,-1,0}'::line");
      expect(str(new Polygon([new Point(1, 2)]))).toStrictEqual(
        "'((1,2))'::polygon",
      );
    });

    it("should keep a path's closed flag, which is part of the value", () => {
      expect(str(new Path([new Point(1, 2)]))).toStrictEqual("'((1,2))'::path");
      expect(str(new Path([new Point(1, 2)], false))).toStrictEqual(
        "'[(1,2)]'::path",
      );
    });

    it('should write an Interval and a Range as theirs', () => {
      expect(str(new Interval({ days: 1, hours: 2 }))).toStrictEqual(
        "'1 day 02:00:00'::interval",
      );
      // The OID a decoded Range carries is what names the type here -
      // six types answer to `instanceof Range`.
      expect(str(new Range(1, 10, '[)', DataTypeOIDs.int4range))).toStrictEqual(
        "'[1,10)'::int4range",
      );
      expect(str(new Range(1, 10, '[)', DataTypeOIDs.int8range))).toStrictEqual(
        "'[1,10)'::int8range",
      );
    });

    it('should refuse a Range that names no type, rather than pick one', () => {
      // determine()'s own error: writing a literal for a type nobody
      // chose is the thing that mechanism exists to prevent.
      expect(() => str(new Range(1, 10))).toThrow('carries no type OID');
    });

    it('should write a Date as a timestamp, not its ISO string', () => {
      const d = new Date(2020, 0, 2, 3, 4, 5);
      expect(str(d)).toStrictEqual("'2020-01-02 03:04:05.000'::timestamp");
    });

    it('should read a Date the way utcDates says, as the parameter path does', () => {
      const d = new Date(Date.UTC(2020, 0, 2, 3, 4, 5));
      expect(str(d, { utcDates: true })).toStrictEqual(
        "'2020-01-02 03:04:05.000'::timestamp",
      );
    });

    it('should write a Buffer as bytea, not as a JSON byte array', () => {
      // It used to leak as {"type":"Buffer","data":[97,98,99]}.
      expect(str(Buffer.from('abc'))).toStrictEqual(" E'\\\\x616263'::bytea");
    });

    it('should write a plain {x, y} as a point, the way binding it does', () => {
      // A behaviour change, and the consistent one: the same object bound
      // as a parameter has always been sent as a point.
      expect(str({ x: 1, y: 2 })).toStrictEqual("'(1,2)'::point");
      expect(str({ x: 1, y: 2, r: 3 })).toStrictEqual("'<(1,2),3>'::circle");
    });

    it('should still write an object no type claims as json', () => {
      expect(str({ a: 1 })).toStrictEqual('\'{"a":1}\'::json');
      expect(str({ a: { b: [1, 2] } })).toStrictEqual(
        '\'{"a":{"b":[1,2]}}\'::json',
      );
      expect(str({ s: "o'x" })).toStrictEqual('\'{"s":"o\'\'x"}\'::json');
    });
  });

  describe('everything else is unchanged', () => {
    it('should write a string bare, so it takes the type of where it lands', () => {
      // determine() answers varchar, but an unadorned literal is
      // `unknown`: `insert into t(n) values('5')` works where
      // `'5'::varchar` would not.
      expect(str('hello')).toStrictEqual("'hello'");
      expect(str("it's")).toStrictEqual("'it''s'");
    });

    it('should keep the uuid cast a uuid-shaped string gets', () => {
      expect(str('87d48838-02b3-4e26-8fec-bcc8c00e3772')).toStrictEqual(
        "'87d48838-02b3-4e26-8fec-bcc8c00e3772'::uuid",
      );
    });

    it('should write the scalars as themselves', () => {
      expect(str(1.5)).toStrictEqual('1.5');
      expect(str(10n)).toStrictEqual('10');
      expect(str(true)).toStrictEqual('true');
      expect(str(false)).toStrictEqual('false');
      expect(str(null)).toStrictEqual('null');
      expect(str(undefined)).toStrictEqual('null');
    });

    it('should still let a caller supply its own encoder', () => {
      // An encode function turns the value into a string before any of
      // the type lookup happens, so it stays the last word.
      expect(
        stringifyValueForSQL(new Point(1, 2), {}, v => 'X' + v),
      ).toStrictEqual("'X(1,2)'");
    });
  });

  describe('stringifyArrayForSQL()', () => {
    it('should write each element the same way', () => {
      expect(
        stringifyArrayForSQL([new Point(1, 2), new Point(3, 4)]),
      ).toStrictEqual("ARRAY['(1,2)'::point,'(3,4)'::point]");
      expect(stringifyArrayForSQL([1, 2])).toStrictEqual('ARRAY[1,2]');
      expect(stringifyArrayForSQL(['a', null])).toStrictEqual(
        "ARRAY['a',null]",
      );
    });

    it('should nest', () => {
      expect(stringifyArrayForSQL([[1, 2], [3]])).toStrictEqual(
        'ARRAY[ARRAY[1,2],ARRAY[3]]',
      );
    });
  });
});
