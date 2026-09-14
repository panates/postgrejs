import { DataTypeOIDs } from '../constants.js';
import type { DataMappingOptions } from '../interfaces/data-mapping-options.js';
import type { DataType } from '../interfaces/data-type.js';
import { SmartBuffer } from '../protocol/smart-buffer.js';
import { formatTimestamptz } from '../util/format-datetime.js';
import { parseDateTimeTz } from '../util/parse-datetime.js';
import { parsePgTimestampBuffer } from '../util/parse-pg-timestamp.js';

const timeShift = 946684800000;
const timeMul = 4294967296;

export const TimestamptzType: DataType = {
  name: 'timestamptz',
  oid: DataTypeOIDs.timestamptz,
  jsType: 'Date',
  fixedBinarySize: 8,

  encodeText(v: any): string {
    return formatTimestamptz(v);
  },

  encodeBinary(
    buf: SmartBuffer,
    v: Date | number | string,
    options: DataMappingOptions,
  ): void {
    if (typeof v === 'string') v = parseDateTimeTz(v, options.utcDates);
    if (v === Infinity) {
      buf.writeInt32BE(0x7fffffff); // hi
      buf.writeUInt32BE(0xffffffff); // lo
      return;
    }
    if (v === -Infinity) {
      buf.writeInt32BE(-0x80000000); // hi
      buf.writeUInt32BE(0x00000000); // lo
      return;
    }
    if (!(v instanceof Date)) v = new Date(v);
    let n = v.getTime();
    n = (n - timeShift) * 1000;
    const hi = Math.floor(n / timeMul);
    const lo = n - hi * timeMul;
    buf.writeInt32BE(hi);
    buf.writeUInt32BE(lo);
  },

  decodeBinary(
    v: Buffer,
    offset: number = 0,
    options: DataMappingOptions,
  ): Date | number | string {
    const fetchAsString = options.fetchAsString?.includes(
      DataTypeOIDs.timestamptz,
    );
    const hi = v.readInt32BE(offset);
    const lo = v.readUInt32BE(offset + 4);
    if (lo === 0xffffffff && hi === 0x7fffffff)
      return fetchAsString ? 'infinity' : Infinity;
    if (lo === 0x00000000 && hi === -0x80000000)
      return fetchAsString ? '-infinity' : -Infinity;

    // Shift from 2000 to 1970. A timestamptz is an absolute instant, so
    // this is already the value - there is nothing to reinterpret against
    // the local zone the way `timestamp` (which carries no zone of its
    // own) has to. Rebuilding the Date from its own local getters, as this
    // used to, gave back the same instant for every value except one: an
    // instant inside the hour that repeats when local time falls back is
    // ambiguous read as wall-clock, so the rebuild silently picked the
    // other one and moved the value an hour. The text path never did that,
    // so the same row decoded binary and text disagreed.
    const d = new Date((lo + hi * timeMul) / 1000 + timeShift);
    return fetchAsString ? dateToTimestamptzString(d) : d;
  },

  decodeText(v: string, options: DataMappingOptions): Date | number | string {
    const d = parseDateTimeTz(v, options.utcDates);
    if (options.fetchAsString?.includes(DataTypeOIDs.timestamptz)) {
      if (d instanceof Date) return dateToTimestamptzString(d);
      if (d === Infinity) return 'infinity';
      if (d === -Infinity) return '-infinity';
      // parseDateTimeTz() only ever returns a Date, Infinity or -Infinity,
      // never anything else, so this is unreachable.
      return '';
    }
    return d;
  },

  // Reads PostgreSQL's own timestamp shape straight from the wire bytes.
  // Building the string first and handing it to decodeText() costs about
  // as much again as the parse itself, for a string that exists only to be
  // scanned a character at a time. Anything not in that exact shape
  // (infinity, a BC suffix, an LMT-style offset) has no Date to give back
  // and takes the original path, which still needs the string.
  //
  // Note this type's decodeText always parses first and only branches on
  // fetchAsString afterward (unlike date/time/timestamp, which early-return
  // the raw string), so the same order is kept here.
  decodeTextBuffer(
    buf: Buffer,
    offset: number,
    len: number,
    options: DataMappingOptions,
  ): Date | number | string {
    const d = parsePgTimestampBuffer(buf, offset, offset + len);
    if (d !== undefined) {
      return options.fetchAsString?.includes(DataTypeOIDs.timestamptz)
        ? dateToTimestamptzString(d)
        : d;
    }
    return TimestamptzType.decodeText(
      buf.toString('latin1', offset, offset + len),
      options,
    );
  },

  isType(v: any): boolean {
    return v instanceof Date;
  },
};

function dateToTimestamptzString(d: Date): string {
  return d.toISOString().replace('T', ' ');
}

export const ArrayTimestamptzType: DataType = {
  ...TimestamptzType,
  name: '_timestamptz',
  oid: DataTypeOIDs._timestamptz,
  elementsOID: DataTypeOIDs.timestamptz,
};
