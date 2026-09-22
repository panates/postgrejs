import { DataTypeNames, DataTypeOIDs } from '../constants.js';
import { DataTypeMap, GlobalTypeMap } from '../data-type-map.js';
import type { DataMappingOptions } from '../interfaces/data-mapping-options.js';
import type { DataType } from '../interfaces/data-type.js';
import type { SmartBuffer } from '../protocol/smart-buffer.js';
import type { OID } from '../types.js';
import { readBigInt64BE } from '../util/bigint-methods.js';
import {
  getTemporal,
  systemTimeZone,
  type TemporalApi,
} from '../util/temporal.js';
import { DateType } from './date-type.js';
import { IntervalType, parseIntervalText } from './interval-type.js';
import { createMultiRangeType, createRangeType } from './range-type.js';
import { TimeType } from './time-type.js';
import { TimestampType } from './timestamp-type.js';
import { TimestamptzType } from './timestamptz-type.js';

/**
 * PostgreSQL's date/time types decoded into `Temporal` values instead of
 * `Date`.
 *
 * Three things `Date` cannot do and these can: carry the microseconds
 * PostgreSQL actually stores (a `Date` is milliseconds, so the last three
 * digits of every timestamp were being dropped), say that a `timestamp`
 * has no zone at all rather than guessing one from `utcDates`, and keep
 * a `date` a date instead of a midnight in some zone.
 *
 * Decoding only is opinionated: every type here still *accepts* as a
 * parameter everything it accepted before, so turning this on does not
 * invalidate the `Date`s and strings a caller already passes.
 */

const EPOCH_2000_NS = 946684800000000000n;
const TS_INFINITY = 0x7fffffffffffffffn;
const TS_MINUS_INFINITY = -0x8000000000000000n;
const DATE_INFINITY = 0x7fffffff;
const DATE_MINUS_INFINITY = -0x80000000;
const MICROS_PER_DAY = 86400000000n;
const MAX_SAFE_MICROS = BigInt(Number.MAX_SAFE_INTEGER);

/** The five types a caller may ask for by OID. */
export const TemporalCapableOIDs: readonly OID[] = Object.freeze([
  DataTypeOIDs.date,
  DataTypeOIDs.time,
  DataTypeOIDs.timestamp,
  DataTypeOIDs.timestamptz,
  DataTypeOIDs.interval,
]);

function readMicros(v: Buffer, offset: number): bigint {
  return typeof v.readBigInt64BE === 'function'
    ? v.readBigInt64BE(offset)
    : readBigInt64BE(v, offset);
}

/**
 * PostgreSQL writes years before the common era as `0044-03-15 BC`;
 * Temporal counts them astronomically, where that year is -43. Rewrites
 * the one into the other - `-000043-03-15` - so the era is not simply
 * refused, and the text path answers what the binary path already does.
 */
function withoutEra(v: string): string {
  const body = v.slice(0, -3);
  const dash = body.indexOf('-');
  const year = 1 - +body.substring(0, dash);
  return (
    (year < 0 ? '-' : '+') +
    String(Math.abs(year)).padStart(6, '0') +
    body.substring(dash)
  );
}

function zoneOf(options: DataMappingOptions): string {
  return options.timeZone || systemTimeZone();
}

/** Guards the one thing PostgreSQL can store and Temporal cannot hold. */
function requireMicrosecondPrecision(ns: bigint): bigint {
  if (ns % 1000n)
    throw new TypeError(
      'PostgreSQL stores microseconds, and this value carries ' +
        'nanoseconds that would be dropped. Round it first: ' +
        "value.round({ smallestUnit: 'microsecond' }).",
    );
  return ns / 1000n;
}

/**
 * A `Temporal.Duration` out of the three quantities PostgreSQL keeps
 * apart, or an error when they cannot make one.
 *
 * `interval '1 mon -3 days'` is an ordinary PostgreSQL value and has no
 * Duration: Temporal refuses a duration whose fields disagree in sign,
 * and balancing months against days needs a date to count from, which a
 * bare interval does not have.
 */
function toDuration(
  T: TemporalApi,
  months: number,
  days: number,
  micros: bigint,
): any {
  const signs = [
    Math.sign(months),
    Math.sign(days),
    micros > 0n ? 1 : micros < 0n ? -1 : 0,
  ];
  let sign = 0;
  let i: number;
  for (i = 0; i < 3; i++) {
    if (!signs[i]) continue;
    if (!sign) sign = signs[i];
    else if (signs[i] !== sign)
      throw new TypeError(
        `The interval ${months} mons ${days} days ${micros} us mixes ` +
          'signs, and Temporal.Duration allows only one sign for all of ' +
          'its fields. Leave `interval` out of `temporalTypes` for a ' +
          'column that holds values like this one.',
      );
  }
  if (micros > MAX_SAFE_MICROS || micros < -MAX_SAFE_MICROS)
    throw new RangeError(
      `An interval of ${micros} microseconds is past what a ` +
        'Temporal.Duration field can hold.',
    );
  // The time part is spread over hours/minutes/seconds rather than left
  // as one microsecond count: a Duration never balances itself, so
  // `interval '3 hours'` would answer 0 hours and 10800 seconds. Days
  // and months are the two PostgreSQL keeps apart on purpose and are
  // left exactly as they came.
  const abs = micros < 0n ? -micros : micros;
  const s = micros < 0n ? -1 : 1;
  return T.Duration.from({
    months,
    days,
    hours: Number(abs / 3600000000n) * s,
    minutes: Number((abs / 60000000n) % 60n) * s,
    seconds: Number((abs / 1000000n) % 60n) * s,
    microseconds: Number(abs % 1000000n) * s,
  });
}

/**
 * The `Date` an existing decoder produced, as the Temporal value this
 * type answers with. Only for the shapes the fast paths below hand back:
 * `infinity` stays the number it already was, and an unreadable date -
 * a zone abbreviation under a non-ISO DateStyle, which names no offset -
 * is an error rather than an `Invalid Date` nobody can use.
 */
function checkDate(v: Date | number, str: string): Date | number {
  if (typeof v === 'number') return v;
  if (Number.isNaN(v.getTime()))
    throw new Error(
      `"${str}" could not be read as a date - see DataMappingOptions.dateStyle.`,
    );
  return v;
}

function temporalTimestamptzType(T: TemporalApi): DataType {
  const decodeText = (v: string, options: DataMappingOptions): any => {
    // ISO is the default DateStyle and is Instant's own shape once the
    // space between date and time is allowed for, which it is.
    if (!options.dateStyle) {
      const c = v.charCodeAt(0);
      if (c >= 0x30 && c <= 0x39)
        return T.Instant.from(
          v.endsWith(' BC') ? withoutEra(v) : v,
        ).toZonedDateTimeISO(zoneOf(options));
    }
    const d = checkDate(TimestamptzType.decodeText(v, options), v);
    // A styled rendering carries milliseconds at best, so nothing is
    // lost by going through the Date the existing parser built.
    return typeof d === 'number'
      ? d
      : T.Instant.fromEpochMilliseconds(d.getTime()).toZonedDateTimeISO(
          zoneOf(options),
        );
  };
  return {
    name: 'timestamptz',
    oid: DataTypeOIDs.timestamptz,
    jsType: 'Temporal.ZonedDateTime',

    decodeBinary(
      v: Buffer,
      offset: number = 0,
      _len: number,
      options: DataMappingOptions,
    ): any {
      const micros = readMicros(v, offset);
      if (micros === TS_INFINITY) return Infinity;
      if (micros === TS_MINUS_INFINITY) return -Infinity;
      return T.Instant.fromEpochNanoseconds(
        EPOCH_2000_NS + micros * 1000n,
      ).toZonedDateTimeISO(zoneOf(options));
    },

    decodeText,

    decodeTextBuffer(
      buf: Buffer,
      offset: number,
      len: number,
      options: DataMappingOptions,
    ): any {
      return decodeText(buf.toString('latin1', offset, offset + len), options);
    },

    encodeBinary(buf: SmartBuffer, v: any, options: DataMappingOptions): void {
      if (v instanceof T.ZonedDateTime || v instanceof T.Instant) {
        buf.writeBigInt64BE(
          requireMicrosecondPrecision(v.epochNanoseconds - EPOCH_2000_NS),
        );
        return;
      }
      TimestamptzType.encodeBinary!(buf, v, options);
    },

    encodeText(v: any, options: DataMappingOptions): string {
      // Without the [zone] suffix, which PostgreSQL does not read - the
      // offset in front of it is what carries the instant anyway.
      if (v instanceof T.ZonedDateTime)
        return v.toString({ timeZoneName: 'never' });
      if (v instanceof T.Instant) return v.toString();
      return TimestamptzType.encodeText!(v, options);
    },

    isType(v: any): boolean {
      return (
        v instanceof T.ZonedDateTime ||
        v instanceof T.Instant ||
        TimestamptzType.isType(v)
      );
    },
  };
}

function temporalTimestampType(T: TemporalApi): DataType {
  const fromDate = (d: Date, options: DataMappingOptions): any =>
    options.utcDates
      ? T.PlainDateTime.from({
          year: d.getUTCFullYear(),
          month: d.getUTCMonth() + 1,
          day: d.getUTCDate(),
          hour: d.getUTCHours(),
          minute: d.getUTCMinutes(),
          second: d.getUTCSeconds(),
          millisecond: d.getUTCMilliseconds(),
        })
      : T.PlainDateTime.from({
          year: d.getFullYear(),
          month: d.getMonth() + 1,
          day: d.getDate(),
          hour: d.getHours(),
          minute: d.getMinutes(),
          second: d.getSeconds(),
          millisecond: d.getMilliseconds(),
        });
  const decodeText = (v: string, options: DataMappingOptions): any => {
    if (!options.dateStyle) {
      const c = v.charCodeAt(0);
      if (c >= 0x30 && c <= 0x39)
        return T.PlainDateTime.from(v.endsWith(' BC') ? withoutEra(v) : v);
    }
    const d = checkDate(TimestampType.decodeText(v, options), v);
    return typeof d === 'number' ? d : fromDate(d, options);
  };
  return {
    name: 'timestamp',
    oid: DataTypeOIDs.timestamp,
    jsType: 'Temporal.PlainDateTime',

    decodeBinary(v: Buffer, offset: number = 0): any {
      const micros = readMicros(v, offset);
      if (micros === TS_INFINITY) return Infinity;
      if (micros === TS_MINUS_INFINITY) return -Infinity;
      // A timestamp carries no zone, so it is read in UTC and the zone
      // dropped again - `utcDates` has nothing left to decide here.
      return T.Instant.fromEpochNanoseconds(EPOCH_2000_NS + micros * 1000n)
        .toZonedDateTimeISO('UTC')
        .toPlainDateTime();
    },

    decodeText,

    decodeTextBuffer(
      buf: Buffer,
      offset: number,
      len: number,
      options: DataMappingOptions,
    ): any {
      return decodeText(buf.toString('latin1', offset, offset + len), options);
    },

    encodeBinary(buf: SmartBuffer, v: any, options: DataMappingOptions): void {
      if (v instanceof T.PlainDateTime) {
        buf.writeBigInt64BE(
          requireMicrosecondPrecision(
            v.toZonedDateTime('UTC').epochNanoseconds - EPOCH_2000_NS,
          ),
        );
        return;
      }
      TimestampType.encodeBinary!(buf, v, options);
    },

    encodeText(v: any, options: DataMappingOptions): string {
      if (v instanceof T.PlainDateTime) return v.toString();
      return TimestampType.encodeText!(v, options);
    },

    isType(v: any): boolean {
      return v instanceof T.PlainDateTime || TimestampType.isType(v);
    },
  };
}

function temporalDateType(T: TemporalApi): DataType {
  const EPOCH_2000 = T.PlainDate.from('2000-01-01');
  const decodeText = (v: string, options: DataMappingOptions): any => {
    if (!options.dateStyle) {
      const c = v.charCodeAt(0);
      if (c >= 0x30 && c <= 0x39)
        return T.PlainDate.from(v.endsWith(' BC') ? withoutEra(v) : v);
    }
    const d = checkDate(DateType.decodeText(v, options), v);
    if (typeof d === 'number') return d;
    return options.utcDates
      ? T.PlainDate.from({
          year: d.getUTCFullYear(),
          month: d.getUTCMonth() + 1,
          day: d.getUTCDate(),
        })
      : T.PlainDate.from({
          year: d.getFullYear(),
          month: d.getMonth() + 1,
          day: d.getDate(),
        });
  };
  return {
    name: 'date',
    oid: DataTypeOIDs.date,
    jsType: 'Temporal.PlainDate',

    decodeBinary(v: Buffer, offset: number = 0): any {
      const days = v.readInt32BE(offset);
      if (days === DATE_INFINITY) return Infinity;
      if (days === DATE_MINUS_INFINITY) return -Infinity;
      return EPOCH_2000.add({ days });
    },

    decodeText,

    decodeTextBuffer(
      buf: Buffer,
      offset: number,
      len: number,
      options: DataMappingOptions,
    ): any {
      return decodeText(buf.toString('latin1', offset, offset + len), options);
    },

    encodeBinary(buf: SmartBuffer, v: any, options: DataMappingOptions): void {
      if (v instanceof T.PlainDate) {
        buf.writeInt32BE(EPOCH_2000.until(v, { largestUnit: 'day' }).days);
        return;
      }
      DateType.encodeBinary!(buf, v, options);
    },

    encodeText(v: any, options: DataMappingOptions): string {
      if (v instanceof T.PlainDate) return v.toString();
      return DateType.encodeText!(v, options);
    },

    isType(v: any): boolean {
      return v instanceof T.PlainDate || DateType.isType(v);
    },
  };
}

function temporalTimeType(T: TemporalApi): DataType {
  const MIDNIGHT = T.PlainTime.from('00:00:00');
  // `time` is rendered the same way under every DateStyle, so there is
  // no styled shape to fall back to here.
  const decodeText = (v: string): any => T.PlainTime.from(v);
  return {
    name: 'time',
    oid: DataTypeOIDs.time,
    jsType: 'Temporal.PlainTime',

    decodeBinary(v: Buffer, offset: number = 0): any {
      const micros = readMicros(v, offset);
      // PostgreSQL's `time` runs to 24:00:00 inclusive; a PlainTime stops
      // one nanosecond short of it, and adding a day's worth of
      // microseconds to midnight would silently wrap back to 00:00:00.
      if (micros >= MICROS_PER_DAY)
        throw new RangeError(
          "PostgreSQL's time '24:00:00' has no Temporal.PlainTime - it is " +
            'the end of the day, and a PlainTime only reaches 23:59:59.999999999.',
        );
      return MIDNIGHT.add({ microseconds: Number(micros) });
    },

    decodeText,

    decodeTextBuffer(buf: Buffer, offset: number, len: number): any {
      return decodeText(buf.toString('latin1', offset, offset + len));
    },

    encodeBinary(buf: SmartBuffer, v: any, options: DataMappingOptions): void {
      if (v instanceof T.PlainTime) {
        const d = MIDNIGHT.until(v, { largestUnit: 'microsecond' });
        if (d.nanoseconds) requireMicrosecondPrecision(BigInt(d.nanoseconds));
        buf.writeBigInt64BE(BigInt(d.microseconds));
        return;
      }
      TimeType.encodeBinary!(buf, v, options);
    },

    encodeText(v: any, options: DataMappingOptions): string {
      if (v instanceof T.PlainTime) return v.toString();
      return TimeType.encodeText!(v, options);
    },

    isType(v: any): boolean {
      return v instanceof T.PlainTime || TimeType.isType(v);
    },
  };
}

function temporalIntervalType(T: TemporalApi): DataType {
  return {
    name: 'interval',
    oid: DataTypeOIDs.interval,
    jsType: 'Temporal.Duration',

    decodeBinary(v: Buffer, offset: number = 0): any {
      return toDuration(
        T,
        v.readInt32BE(offset + 12),
        v.readInt32BE(offset + 8),
        readMicros(v, offset),
      );
    },

    decodeText(v: string): any {
      const iv = parseIntervalText(v);
      return toDuration(T, iv.totalMonths, iv.days, iv.totalMicroseconds);
    },

    encodeBinary(buf: SmartBuffer, v: any, options: DataMappingOptions): void {
      if (!(v instanceof T.Duration)) {
        IntervalType.encodeBinary!(buf, v, options);
        return;
      }
      buf.writeBigInt64BE(durationMicros(v));
      buf.writeInt32BE(v.days + v.weeks * 7);
      buf.writeInt32BE(v.years * 12 + v.months);
    },

    encodeText(v: any, options: DataMappingOptions): string {
      // A Duration prints ISO 8601, which PostgreSQL reads whatever its
      // IntervalStyle is set to.
      if (v instanceof T.Duration) return v.toString();
      return IntervalType.encodeText!(v, options);
    },

    isType(v: any): boolean {
      return v instanceof T.Duration || IntervalType.isType(v);
    },
  };
}

/** A Duration's time part, in the microseconds the wire carries. */
function durationMicros(d: any): bigint {
  if (d.nanoseconds % 1000) requireMicrosecondPrecision(BigInt(d.nanoseconds));
  return (
    BigInt(d.hours) * 3600000000n +
    BigInt(d.minutes) * 60000000n +
    BigInt(d.seconds) * 1000000n +
    BigInt(d.milliseconds) * 1000n +
    BigInt(d.microseconds) +
    BigInt(d.nanoseconds / 1000)
  );
}

/**
 * What one selected OID pulls in with it.
 *
 * The array and range types do not follow their element through the type
 * map - an array type is a copy of the scalar's own decoders and a range
 * type holds the element type it was built with - so each has to be
 * registered too, or a `timestamptz` column would answer with a
 * ZonedDateTime while `timestamptz[]` and `tstzrange` in the same row
 * still answered with Dates.
 */
interface FamilySpec {
  build: (T: TemporalApi) => DataType;
  arrayOid: OID;
  range?: {
    name: string;
    oid: OID;
    arrayOid: OID;
    multiOid: OID;
    multiArrayOid: OID;
  };
}

const FAMILIES: Record<number, FamilySpec> = {
  [DataTypeOIDs.date]: {
    build: temporalDateType,
    arrayOid: DataTypeOIDs._date,
    range: {
      name: 'daterange',
      oid: DataTypeOIDs.daterange,
      arrayOid: DataTypeOIDs._daterange,
      multiOid: DataTypeOIDs.datemultirange,
      multiArrayOid: DataTypeOIDs._datemultirange,
    },
  },
  [DataTypeOIDs.time]: {
    build: temporalTimeType,
    arrayOid: DataTypeOIDs._time,
  },
  [DataTypeOIDs.timestamp]: {
    build: temporalTimestampType,
    arrayOid: DataTypeOIDs._timestamp,
    range: {
      name: 'tsrange',
      oid: DataTypeOIDs.tsrange,
      arrayOid: DataTypeOIDs._tsrange,
      multiOid: DataTypeOIDs.tsmultirange,
      multiArrayOid: DataTypeOIDs._tsmultirange,
    },
  },
  [DataTypeOIDs.timestamptz]: {
    build: temporalTimestamptzType,
    arrayOid: DataTypeOIDs._timestamptz,
    range: {
      name: 'tstzrange',
      oid: DataTypeOIDs.tstzrange,
      arrayOid: DataTypeOIDs._tstzrange,
      multiOid: DataTypeOIDs.tstzmultirange,
      multiArrayOid: DataTypeOIDs._tstzmultirange,
    },
  },
  [DataTypeOIDs.interval]: {
    build: temporalIntervalType,
    arrayOid: DataTypeOIDs._interval,
  },
};

/** Every registration one selected OID stands for. */
export function temporalTypesFor(oid: OID, T: TemporalApi): DataType[] {
  const spec = FAMILIES[oid];
  const scalar = spec.build(T);
  const out: DataType[] = [
    scalar,
    {
      ...scalar,
      name: '_' + scalar.name,
      oid: spec.arrayOid,
      elementsOID: scalar.oid,
    },
  ];
  const r = spec.range;
  if (r) {
    const multiName = r.name.replace('range', 'multirange');
    const range = createRangeType(r.name, r.oid, scalar);
    const multi = createMultiRangeType(multiName, r.multiOid, range);
    out.push(
      range,
      { ...range, name: '_' + r.name, oid: r.arrayOid, elementsOID: r.oid },
      multi,
      {
        ...multi,
        name: '_' + multiName,
        oid: r.multiArrayOid,
        elementsOID: r.multiOid,
      },
    );
  }
  return out;
}

function normalizeSelection(selection: boolean | OID[]): OID[] {
  if (selection === true) return TemporalCapableOIDs.slice();
  if (selection === false) return [];
  if (!Array.isArray(selection))
    throw new TypeError(
      '`temporalTypes` is either a boolean or an array of OIDs, not ' +
        typeof selection,
    );
  const out: OID[] = [];
  const l = selection.length;
  let i: number;
  let oid: OID;
  for (i = 0; i < l; i++) {
    oid = selection[i];
    if (!TemporalCapableOIDs.includes(oid))
      throw new TypeError(
        '`temporalTypes` accepts only date (1082), time (1083), timestamp ' +
          '(1114), timestamptz (1184) and interval (1186). Received ' +
          `${oid}${DataTypeNames[oid] ? ' (' + DataTypeNames[oid] + ')' : ''}.`,
      );
    if (!out.includes(oid)) out.push(oid);
  }
  return out.sort((a, b) => a - b);
}

const _derived = new WeakMap<DataTypeMap, Map<string, DataTypeMap>>();

/**
 * A type map that decodes the selected date/time types into `Temporal`
 * values, built on top of `base` - which keeps whatever else the caller
 * registered there.
 *
 * The same selection on the same base always gives back the same map.
 * That is not only to save the copy: a prepared statement is reused only
 * while the map it was parsed with is the same object, so handing out a
 * fresh map per statement would quietly empty the statement cache.
 */
export function temporalTypeMap(
  selection: boolean | OID[] = true,
  base: DataTypeMap = GlobalTypeMap,
): DataTypeMap {
  const oids = normalizeSelection(selection);
  if (!oids.length) return base;
  const key = oids.join(',');
  let forBase = _derived.get(base);
  if (!forBase) {
    forBase = new Map();
    _derived.set(base, forBase);
  }
  let map = forBase.get(key);
  if (!map) {
    const T = getTemporal();
    map = new DataTypeMap(base);
    const l = oids.length;
    let i: number;
    for (i = 0; i < l; i++) map.register(temporalTypesFor(oids[i], T));
    forBase.set(key, map);
  }
  return map;
}
