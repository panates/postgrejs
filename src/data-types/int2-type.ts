import { DataTypeOIDs } from '../constants.js';
import type { DataType } from '../interfaces/data-type.js';
import type { SmartBuffer } from '../protocol/smart-buffer.js';
import { fastParseInt } from '../util/fast-parseint.js';

export const Int2Type: DataType = {
  name: 'int2',
  oid: DataTypeOIDs.int2,
  jsType: 'number',

  parseBinary(v: Buffer): number {
    return v.readInt16BE(0);
  },

  encodeBinary(buf: SmartBuffer, v: number): void {
    buf.writeInt16BE(fastParseInt(v));
  },

  parseText: fastParseInt,

  isType(v: any): boolean {
    return typeof v === 'number' && Number.isInteger(v) && v >= -32768 && v <= 32767;
  },
};

export const ArrayInt2Type: DataType = {
  ...Int2Type,
  name: '_int2',
  oid: DataTypeOIDs._int2,
  elementsOID: DataTypeOIDs.int2,
};
