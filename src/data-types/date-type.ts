import { DataTypeOIDs } from '../constants.js';
import type { DataMappingOptions } from '../interfaces/data-mapping-options.js';
import type { DataType } from '../interfaces/data-type.js';
import type { SmartBuffer } from '../protocol/smart-buffer.js';
import { parseDateTime } from '../util/parse-datetime.js';

const timeShift = 946684800000;

export const DateType: DataType = {
  name: 'date',
  oid: DataTypeOIDs.date,
  jsType: 'Date',

  parseBinary(v: Buffer, options: DataMappingOptions): Date | number | string {
    const fetchAsString = options.fetchAsString && options.fetchAsString.includes(DataTypeOIDs.date);
    const t = v.readInt32BE();
    if (t === 0x7fffffff) return fetchAsString ? 'infinity' : Infinity;
    if (t === -0x80000000) return fetchAsString ? '-infinity' : -Infinity;
    // Shift from 2000 to 1970
    let d = new Date(t * 1000 * 86400 + timeShift);
    if (fetchAsString || !options.utcDates) d = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    return fetchAsString ? dateToDateString(d) : d;
  },

  encodeBinary(buf: SmartBuffer, v: Date | number | string, options: DataMappingOptions): void {
    if (typeof v === 'string') v = parseDateTime(v, false, false, options.utcDates);
    if (v === Infinity) {
      buf.writeInt32BE(0x7fffffff);
      return;
    }
    if (v === -Infinity) {
      buf.writeInt32BE(-0x80000000);
      return;
    }
    if (!(v instanceof Date)) v = new Date(v);
    let n = options.utcDates ? v.getTime() : v.getTime() - v.getTimezoneOffset() * 60 * 1000;
    n = (n - timeShift) / 1000 / 86400;
    const t = Math.trunc(n + Number.EPSILON);
    buf.writeInt32BE(t);
  },

  parseText(v: string, options: DataMappingOptions): Date | number | string {
    const fetchAsString = options.fetchAsString && options.fetchAsString.includes(DataTypeOIDs.date);
    if (fetchAsString) return v;
    return parseDateTime(v, false, false, options.utcDates);
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
  return d.getFullYear() + '-' + padZero(d.getMonth() + 1) + '-' + padZero(d.getDate());
}

export const ArrayDateType: DataType = {
  ...DateType,
  name: '_date',
  oid: DataTypeOIDs._date,
  elementsOID: DataTypeOIDs.date,
};
