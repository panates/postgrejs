import { DataTypeOIDs } from '../constants.js';
import type { DataMappingOptions } from '../interfaces/data-mapping-options.js';
import type { DataType } from '../interfaces/data-type.js';
import type { SmartBuffer } from '../protocol/smart-buffer.js';
import { parseDateTime } from '../util/parse-datetime.js';

const timeShift = 946684800000;
const timeMul = 4294967296;

export const TimestampType: DataType = {
  name: 'timestamp',
  oid: DataTypeOIDs.timestamp,
  jsType: 'Date',

  parseBinary(v: Buffer, options: DataMappingOptions): Date | number | string {
    const fetchAsString = options.fetchAsString && options.fetchAsString.includes(DataTypeOIDs.timestamp);
    const hi = v.readInt32BE();
    const lo = v.readUInt32BE(4);
    if (lo === 0xffffffff && hi === 0x7fffffff) return fetchAsString ? 'infinity' : Infinity;
    if (lo === 0x00000000 && hi === -0x80000000) return fetchAsString ? '-infinity' : -Infinity;

    // Shift from 2000 to 1970
    let d = new Date((lo + hi * timeMul) / 1000 + timeShift);
    if (fetchAsString || !options.utcDates)
      d = new Date(
        d.getUTCFullYear(),
        d.getUTCMonth(),
        d.getUTCDate(),
        d.getUTCHours(),
        d.getUTCMinutes(),
        d.getUTCSeconds(),
        d.getUTCMilliseconds(),
      );
    return fetchAsString ? dateToTimestampString(d) : d;
  },

  encodeBinary(buf: SmartBuffer, v: Date | number | string, options: DataMappingOptions): void {
    if (typeof v === 'string') v = parseDateTime(v, true, false, options.utcDates);
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
    // Postgresql ignores timezone data so we are
    let n = options.utcDates ? v.getTime() : v.getTime() - v.getTimezoneOffset() * 60 * 1000;
    n = (n - timeShift) * 1000;
    const hi = Math.floor(n / timeMul);
    const lo = n - hi * timeMul;
    buf.writeInt32BE(hi);
    buf.writeUInt32BE(lo);
  },

  parseText(v: string, options: DataMappingOptions): Date | number | string {
    if (options.fetchAsString && options.fetchAsString.includes(DataTypeOIDs.timestamp)) return v;
    return parseDateTime(v, true, false, options.utcDates);
  },

  isType(v: any): boolean {
    return (
      v instanceof Date &&
      !(v.getFullYear() === 1970 && v.getMonth() === 0 && v.getDate() === 1) &&
      !(v.getHours() === 0 && v.getMinutes() === 0 && v.getSeconds() === 0 && v.getMilliseconds() === 0)
    );
  },
};

function padZero(v: number): string {
  return v < 9 ? '0' + v : '' + v;
}

function dateToTimestampString(d: Date): string {
  return (
    d.getFullYear() +
    '-' +
    padZero(d.getMonth() + 1) +
    '-' +
    padZero(d.getDate()) +
    ' ' +
    padZero(d.getHours()) +
    ':' +
    padZero(d.getMinutes()) +
    ':' +
    padZero(d.getSeconds())
  );
}

export const ArrayTimestampType: DataType = {
  ...TimestampType,
  name: '_timestamp',
  oid: DataTypeOIDs._timestamp,
  elementsOID: DataTypeOIDs.timestamp,
};
