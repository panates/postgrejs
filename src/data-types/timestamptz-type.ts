import { DataTypeOIDs } from '../constants.js';
import { DataMappingOptions } from '../interfaces/data-mapping-options.js';
import { DataType } from '../interfaces/data-type.js';
import { SmartBuffer } from '../protocol/smart-buffer.js';
import { parseDateTime } from '../util/parse-datetime.js';

const timeShift = 946684800000;
const timeMul = 4294967296;

export const TimestamptzType: DataType = {
  name: 'timestamptz',
  oid: DataTypeOIDs.timestamptz,
  jsType: 'Date',

  parseBinary(v: Buffer, options: DataMappingOptions): Date | number | string {
    const fetchAsString = options.fetchAsString && options.fetchAsString.includes(DataTypeOIDs.timestamptz);
    const hi = v.readInt32BE();
    const lo = v.readUInt32BE(4);
    if (lo === 0xffffffff && hi === 0x7fffffff) return fetchAsString ? 'infinity' : Infinity;
    if (lo === 0x00000000 && hi === -0x80000000) return fetchAsString ? '-infinity' : -Infinity;

    // Shift from 2000 to 1970
    let d = new Date((lo + hi * timeMul) / 1000 + timeShift);
    if (fetchAsString || !options.utcDates)
      d = new Date(
        d.getFullYear(),
        d.getMonth(),
        d.getDate(),
        d.getHours(),
        d.getMinutes(),
        d.getSeconds(),
        d.getMilliseconds(),
      );
    return fetchAsString ? dateToTimestamptzString(d) : d;
  },

  encodeBinary(buf: SmartBuffer, v: Date | number | string, options: DataMappingOptions): void {
    if (typeof v === 'string') v = parseDateTime(v, true, true, options.utcDates);
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

  parseText(v: string, options: DataMappingOptions): Date | number | string {
    const d = parseDateTime(v, true, true, options.utcDates);
    if (options.fetchAsString && options.fetchAsString.includes(DataTypeOIDs.timestamptz)) {
      if (d instanceof Date) return dateToTimestamptzString(d);
      if (d === Infinity) return 'infinity';
      if (d === -Infinity) return '-infinity';
      return '';
    }
    return d;
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
