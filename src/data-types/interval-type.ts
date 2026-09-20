import { DataTypeOIDs } from '../constants.js';
import type { DataType } from '../interfaces/data-type.js';
import type { SmartBuffer } from '../protocol/smart-buffer.js';
import { readBigInt64BE } from '../util/bigint-methods.js';
import { Interval } from './classes/interval.js';

/**
 * What PostgreSQL prints under the default `IntervalStyle` - years, months
 * and days as counted words, then a signed clock time. Every part is
 * optional and the server omits the ones that are zero, except that a
 * wholly zero interval still prints `00:00:00`.
 */
const INTERVAL_PATTERN =
  /^\s*(?:([+-]?\d+)\s+years?\s*)?(?:([+-]?\d+)\s+mons?\s*)?(?:([+-]?\d+)\s+days?\s*)?(?:([+-])?(\d+):(\d\d):(\d\d)(?:\.(\d{1,6}))?)?\s*$/;

function toInterval(v: any): Interval {
  if (v instanceof Interval) return v;
  if (typeof v === 'string') return parseIntervalText(v);
  if (v && typeof v === 'object') return new Interval(v);
  throw new TypeError(
    `"${typeof v}" cannot be encoded as an interval - pass an Interval, ` +
      'a plain object of its fields, or a string PostgreSQL would accept',
  );
}

export function parseIntervalText(v: string): Interval {
  const m = INTERVAL_PATTERN.exec(v);
  if (!m) {
    // Rather than answering with a zero interval, which is what reading
    // an unrecognized shape leniently would amount to. The other styles
    // (`sql_standard`, `postgres_verbose`, `iso_8601`) are not parsed
    // here, and the binary path - which is the default - never sees any
    // of this.
    throw new Error(
      `"${v}" is not an interval in PostgreSQL's default IntervalStyle`,
    );
  }
  const sign = m[4] === '-' ? -1 : 1;
  return new Interval({
    years: m[1] ? parseInt(m[1], 10) : 0,
    months: m[2] ? parseInt(m[2], 10) : 0,
    days: m[3] ? parseInt(m[3], 10) : 0,
    hours: m[5] ? sign * parseInt(m[5], 10) : 0,
    minutes: m[6] ? sign * parseInt(m[6], 10) : 0,
    seconds: m[7] ? sign * parseInt(m[7], 10) : 0,
    // The fraction is microseconds with trailing zeroes dropped, so `.5`
    // is half a second rather than five microseconds.
    milliseconds: m[8] ? (sign * parseInt(m[8].padEnd(6, '0'), 10)) / 1000 : 0,
  });
}

export const IntervalType: DataType = {
  name: 'interval',
  oid: DataTypeOIDs.interval,
  jsType: 'Interval',

  /**
   * 16 bytes, and three separate quantities rather than one total: a
   * signed microsecond count for the time, then a day count and a month
   * count. The server keeps them apart because they are not convertible -
   * see the Interval class.
   */
  decodeBinary(v: Buffer, offset: number = 0): Interval {
    const micros =
      typeof v.readBigInt64BE === 'function'
        ? v.readBigInt64BE(offset)
        : readBigInt64BE(v, offset);
    return Interval.fromParts(
      micros,
      v.readInt32BE(offset + 8),
      v.readInt32BE(offset + 12),
    );
  },

  encodeBinary(buf: SmartBuffer, v: any): void {
    const iv = toInterval(v);
    buf.writeBigInt64BE(iv.totalMicroseconds);
    buf.writeInt32BE(iv.days);
    buf.writeInt32BE(iv.totalMonths);
  },

  decodeText: parseIntervalText,

  encodeText(v: any): string {
    return toInterval(v).toString();
  },

  isType(v: any): boolean {
    return v instanceof Interval;
  },
};

export const ArrayIntervalType: DataType = {
  ...IntervalType,
  name: '_interval',
  oid: DataTypeOIDs._interval,
  elementsOID: DataTypeOIDs.interval,
};
