import { expect } from 'expect';
import {
  DataTypeMap,
  DataTypeOIDs,
  GlobalTypeMap,
  TemporalCapableOIDs,
  temporalTypeMap,
} from 'postgrejs';
import { Temporal } from 'temporal-polyfill';
import { requireTimeZone } from '../../src/util/temporal.js';

(globalThis as any).Temporal = (globalThis as any).Temporal || Temporal;

/**
 * `temporalTypes` is a selection of scalar types, and what it builds is
 * a type map. The selection is the whole public surface - a caller never
 * assembles the registrations themselves - so what it accepts, what it
 * pulls in with each choice, and what it refuses are all pinned here.
 */
describe('temporalTypeMap()', () => {
  const D = DataTypeOIDs;

  describe('the selection', () => {
    it('should take all five for true', () => {
      const map = temporalTypeMap(true);
      for (const oid of TemporalCapableOIDs)
        expect(map.get(oid).jsType).toMatch(/^Temporal\./);
      expect([...TemporalCapableOIDs]).toStrictEqual([
        D.date,
        D.time,
        D.timestamp,
        D.timestamptz,
        D.interval,
      ]);
    });

    it('should give back the base map itself for false or nothing', () => {
      expect(temporalTypeMap(false)).toBe(GlobalTypeMap);
      expect(temporalTypeMap([])).toBe(GlobalTypeMap);
      const base = new DataTypeMap(GlobalTypeMap);
      expect(temporalTypeMap(false, base)).toBe(base);
    });

    it('should refuse an OID that is not one of the five', () => {
      // timetz is the one a caller is most likely to reach for, so the
      // message names the five rather than only rejecting.
      expect(() => temporalTypeMap([D.timetz])).toThrow(
        /only date \(1082\), time \(1083\), timestamp \(1114\), timestamptz \(1184\) and interval \(1186\)/,
      );
      expect(() => temporalTypeMap([D.timetz])).toThrow(/1266 \(timetz\)/);
      expect(() => temporalTypeMap([D.int4])).toThrow(/23 \(int4\)/);
      expect(() => temporalTypeMap([9999999])).toThrow(/9999999/);
    });

    it('should refuse something that is neither a boolean nor an array', () => {
      expect(() => temporalTypeMap('timestamptz' as any)).toThrow(
        /either a boolean or an array of OIDs/,
      );
    });

    it('should hand back the same map for the same selection', () => {
      // Not only to save the copy: a prepared statement is reused while
      // the map it was parsed with is the same object, so a fresh map
      // per statement would quietly empty the statement cache.
      expect(temporalTypeMap(true)).toBe(temporalTypeMap(true));
      expect(temporalTypeMap([D.date, D.interval])).toBe(
        temporalTypeMap([D.interval, D.date, D.date]),
      );
      expect(temporalTypeMap(true)).toBe(
        temporalTypeMap([...TemporalCapableOIDs].reverse()),
      );
      expect(temporalTypeMap([D.date])).not.toBe(temporalTypeMap([D.time]));
    });

    it('should build on the base map rather than replacing it', () => {
      const base = new DataTypeMap(GlobalTypeMap);
      base.register({
        ...GlobalTypeMap.get(D.int4),
        oid: 987654,
        name: 'mine',
        jsType: 'number',
      });
      const map = temporalTypeMap([D.date], base);
      expect(map).not.toBe(base);
      expect(map.get(987654).name).toStrictEqual('mine');
      expect(map.get(D.date).jsType).toStrictEqual('Temporal.PlainDate');
      expect(base.get(D.date).jsType).toStrictEqual('Date');
    });
  });

  describe('what one selected type brings with it', () => {
    // An array type is a copy of the scalar's own decoders and a range
    // type holds the element type it was built with - neither follows
    // the map - so selecting `timestamptz` has to register six things or
    // the same row would answer ZonedDateTime for one column and Date
    // for the array beside it.
    const FAMILY: [number, number[]][] = [
      [
        D.timestamptz,
        [
          D._timestamptz,
          D.tstzrange,
          D._tstzrange,
          D.tstzmultirange,
          D._tstzmultirange,
        ],
      ],
      [
        D.timestamp,
        [D._timestamp, D.tsrange, D._tsrange, D.tsmultirange, D._tsmultirange],
      ],
      [
        D.date,
        [
          D._date,
          D.daterange,
          D._daterange,
          D.datemultirange,
          D._datemultirange,
        ],
      ],
      [D.time, [D._time]],
      [D.interval, [D._interval]],
    ];

    for (const [scalar, others] of FAMILY)
      it(`should carry ${GlobalTypeMap.get(scalar).name}'s array and ranges`, () => {
        const map = temporalTypeMap([scalar]);
        expect(map.get(scalar)).not.toBe(GlobalTypeMap.get(scalar));
        for (const oid of others)
          expect(map.get(oid)).not.toBe(GlobalTypeMap.get(oid));
        // And nothing else moved.
        for (const [other] of FAMILY)
          if (other !== scalar)
            expect(map.get(other)).toBe(GlobalTypeMap.get(other));
      });

    it('should leave timetz alone whatever is selected', () => {
      const map = temporalTypeMap(true);
      expect(map.get(D.timetz)).toBe(GlobalTypeMap.get(D.timetz));
      expect(map.get(D._timetz)).toBe(GlobalTypeMap.get(D._timetz));
    });
  });

  describe('a runtime without Temporal', () => {
    it('should say how to get one, before any I/O', () => {
      const saved = (globalThis as any).Temporal;
      delete (globalThis as any).Temporal;
      try {
        // A selection nothing has built yet, so the memo cannot answer.
        expect(() =>
          temporalTypeMap([DataTypeOIDs.time], new DataTypeMap()),
        ).toThrow(/Temporal is not available in this runtime/);
      } finally {
        (globalThis as any).Temporal = saved;
      }
    });
  });

  describe('the types themselves', () => {
    const map = temporalTypeMap(true);
    const type = (oid: number) => map.get(oid);
    const opts: any = {};

    const TSTZ = Temporal.ZonedDateTime.from(
      '2024-06-15T10:30:00.123456+03:00[Europe/Istanbul]',
    );

    it('should encode each one as a literal PostgreSQL reads', () => {
      // The zone name is left off: PostgreSQL does not read
      // `[Europe/Istanbul]`, and the offset in front of it is what
      // carries the instant anyway.
      expect(type(D.timestamptz).encodeText!(TSTZ, opts)).toStrictEqual(
        '2024-06-15T10:30:00.123456+03:00',
      );
      expect(
        type(D.timestamptz).encodeText!(TSTZ.toInstant(), opts),
      ).toStrictEqual('2024-06-15T07:30:00.123456Z');
      expect(
        type(D.timestamp).encodeText!(
          Temporal.PlainDateTime.from('2024-06-15T10:30:00.123456'),
          opts,
        ),
      ).toStrictEqual('2024-06-15T10:30:00.123456');
      expect(
        type(D.date).encodeText!(Temporal.PlainDate.from('2024-06-15'), opts),
      ).toStrictEqual('2024-06-15');
      expect(
        type(D.time).encodeText!(
          Temporal.PlainTime.from('12:34:56.123456'),
          opts,
        ),
      ).toStrictEqual('12:34:56.123456');
      expect(
        type(D.interval).encodeText!(
          Temporal.Duration.from({
            months: 14,
            days: 3,
            microseconds: 1500000,
          }),
          opts,
        ),
      ).toStrictEqual('P14M3DT1.5S');
    });

    it('should hand a value that is not Temporal to the type it replaced', () => {
      // Decoding is the opinionated half; a caller who has always passed
      // Dates and strings keeps passing them.
      const utc: any = { utcDates: true };
      const d = new Date(Date.UTC(2024, 5, 15, 10, 30));
      expect(type(D.timestamptz).encodeText!(d, utc)).toStrictEqual(
        GlobalTypeMap.get(D.timestamptz).encodeText!(d, utc),
      );
      expect(type(D.timestamp).encodeText!(d, utc)).toStrictEqual(
        GlobalTypeMap.get(D.timestamp).encodeText!(d, utc),
      );
      expect(type(D.date).encodeText!(d, utc)).toStrictEqual(
        GlobalTypeMap.get(D.date).encodeText!(d, utc),
      );
      expect(type(D.time).encodeText!(d, utc)).toStrictEqual(
        GlobalTypeMap.get(D.time).encodeText!(d, utc),
      );
      expect(type(D.interval).encodeText!('1 mon', utc)).toStrictEqual(
        GlobalTypeMap.get(D.interval).encodeText!('1 mon', utc),
      );
      // And still answers about a Date exactly what the type it replaced
      // answered, which is what keeps determine() picking the same one.
      for (const oid of TemporalCapableOIDs)
        expect(type(oid).isType(d)).toStrictEqual(
          GlobalTypeMap.get(oid).isType(d),
        );
    });

    it('should decode the ISO text PostgreSQL writes', () => {
      expect(
        String(
          type(D.timestamptz).decodeText('2024-06-15 07:30:00.123456+00', {
            timeZone: 'UTC',
          }),
        ),
      ).toStrictEqual('2024-06-15T07:30:00.123456+00:00[UTC]');
      expect(
        String(
          type(D.timestamp).decodeText('2024-06-15 10:30:00.123456', opts),
        ),
      ).toStrictEqual('2024-06-15T10:30:00.123456');
      expect(String(type(D.date).decodeText('2024-06-15', opts))).toStrictEqual(
        '2024-06-15',
      );
      expect(
        String(type(D.time).decodeText('12:34:56.123456', opts)),
      ).toStrictEqual('12:34:56.123456');
      expect(String(type(D.interval).decodeText('1 mon', opts))).toStrictEqual(
        'P1M',
      );
    });

    it('should print a timestamptz in the system zone when none is named', () => {
      // The zone decides the wall clock and nothing else: a timestamptz
      // is an absolute instant, and this is the same one in any zone.
      const buf = Buffer.alloc(8);
      buf.writeBigInt64BE(0n); // 2000-01-01 00:00:00 UTC
      const v: any = type(D.timestamptz).decodeBinary(buf, 0, 8, opts);
      expect(v.timeZoneId).toStrictEqual(
        Intl.DateTimeFormat().resolvedOptions().timeZone,
      );
      expect(v.toInstant().epochNanoseconds).toStrictEqual(
        Temporal.Instant.from('2000-01-01T00:00:00Z').epochNanoseconds,
      );
    });

    it('should count a BC year the way Temporal does', () => {
      // 44 BC is the year -43, and 1 BC is the year 0 - the one place
      // where the rewritten year has no sign of its own.
      expect(
        String(type(D.date).decodeText('0044-03-15 BC', opts)),
      ).toStrictEqual('-000043-03-15');
      expect(
        String(type(D.date).decodeText('0001-03-15 BC', opts)),
      ).toStrictEqual('0000-03-15');
    });

    it('should refuse a time zone this runtime cannot resolve', () => {
      // Said against the setting it came from, rather than surfacing
      // from inside a decode as somebody else's RangeError.
      expect(() =>
        requireTimeZone('Mars/Olympus', 'the session TimeZone'),
      ).toThrow(/"Mars\/Olympus" \(the session TimeZone\) is not a time zone/);
      expect(requireTimeZone('Europe/Istanbul', 'x')).toStrictEqual(
        'Europe/Istanbul',
      );
      // Checked once and remembered.
      expect(requireTimeZone('Europe/Istanbul', 'x')).toStrictEqual(
        'Europe/Istanbul',
      );
    });

    it('should refuse an interval past what a Duration field can hold', () => {
      const buf = Buffer.alloc(16);
      buf.writeBigInt64BE(BigInt(Number.MAX_SAFE_INTEGER) + 1n);
      expect(() => type(D.interval).decodeBinary(buf, 0, 16, opts)).toThrow(
        /past what a/,
      );
    });
  });
});
