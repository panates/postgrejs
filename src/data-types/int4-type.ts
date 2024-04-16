import { DataTypeOIDs } from '../constants.js';
import type { DataType } from '../interfaces/data-type.js';
import type { SmartBuffer } from '../protocol/smart-buffer.js';
import { fastParseInt } from '../util/fast-parseint.js';

export const Int4Type: DataType = {
  name: 'int4',
  oid: DataTypeOIDs.int4,
  jsType: 'number',

  parseBinary(v: Buffer): number {
    return v.readInt32BE(0);
  },

  encodeBinary(buf: SmartBuffer, v: number): void {
    buf.writeInt32BE(fastParseInt(v));
  },

  parseText: fastParseInt,

  isType(v: any): boolean {
    return typeof v === 'number' && Number.isInteger(v) && v <= Number.MAX_SAFE_INTEGER;
  },
};

export const ArrayInt4Type: DataType = {
  ...Int4Type,
  name: '_int4',
  oid: DataTypeOIDs._int4,
  elementsOID: DataTypeOIDs.int4,
};
