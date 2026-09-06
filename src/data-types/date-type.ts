import { DataTypeOIDs } from '../constants.js';
import type { DataMappingOptions } from '../interfaces/data-mapping-options.js';
import type { DataType } from '../interfaces/data-type.js';
import type { SmartBuffer } from '../protocol/smart-buffer.js';
import { formatDate } from '../util/format-datetime.js';
import { parseDate } from '../util/parse-datetime.js';

const timeShift = 946684800000;

export const DateType: DataType = {
  name: 'date',
  oid: DataTypeOIDs.date,
  jsType: 'Date',
  fixedBinarySize: 4,

  encodeText(v: any, options: DataMappingOptions): string {
    return formatDate(v, options);
  },

  encodeBinary(
    buf: SmartBuffer,
    v: Date | number | string,
    options: DataMappingOptions,
  ): void {
    if (typeof v === 'string') v = parseDate(v, options.utcDates);
    if (v === Infinity) {
      buf.writeInt32BE(0x7fffffff);
      return;
    }
    if (v === -Infinity) {
      buf.writeInt32BE(-0x80000000);
      return;
    }
    if (!(v instanceof Date)) v = new Date(v);
    let n = options.utcDates
      ? v.getTime()
      : v.getTime() - v.getTimezoneOffset() * 60 * 1000;
    n = (n - timeShift) / 1000 / 86400;
    const t = Math.trunc(n + Number.EPSILON);
    buf.writeInt32BE(t);
  },

  decodeBinary(
    v: Buffer,
    offset: number = 0,
    options: DataMappingOptions,
  ): Date | number | string {
    const fetchAsString = options.fetchAsString?.includes(DataTypeOIDs.date);
    const t = v.readInt32BE(offset);
    if (t === 0x7fffffff) return fetchAsString ? 'infinity' : Infinity;
    if (t === -0x80000000) return fetchAsString ? '-infinity' : -Infinity;
    // Shift from 2000 to 1970
    let d = new Date(t * 1000 * 86400 + timeShift);
    if (fetchAsString || !options.utcDates)
      d = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    return fetchAsString ? dateToDateString(d) : d;
  },

  decodeText(v: string, options: DataMappingOptions): Date | number | string {
    const fetchAsString = options.fetchAsString?.includes(DataTypeOIDs.date);
    if (fetchAsString) return v;
    return parseDate(v, options.utcDates);
  },

  decodeTextBuffer(
    buf: Buffer,
    offset: number,
    len: number,
    options: DataMappingOptions,
  ): Date | number | string {
    return DateType.decodeText(
      buf.toString('latin1', offset, offset + len),
      options,
    );
  },

  isType(v: any): boolean {
    return (
      v instanceof Date &&
      v.getHours() === 0 &&
      v.getMinutes() === 0 &&
      v.getSeconds() === 0 &&
      v.getMilliseconds() === 0
    );
  },
};

function padZero(v: number): string {
  return v < 9 ? '0' + v : '' + v;
}

function dateToDateString(d: Date): string {
  return (
    d.getFullYear() +
    '-' +
    padZero(d.getMonth() + 1) +
    '-' +
    padZero(d.getDate())
  );
}

export const ArrayDateType: DataType = {
  ...DateType,
  name: '_date',
  oid: DataTypeOIDs._date,
  elementsOID: DataTypeOIDs.date,
};
