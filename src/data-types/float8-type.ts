import { DataTypeOIDs } from '../constants.js';
import type { DataType } from '../interfaces/data-type.js';
import type { SmartBuffer } from '../protocol/smart-buffer.js';

export const Float8Type: DataType = {
  name: 'float8',
  oid: DataTypeOIDs.float8,
  jsType: 'number',

  parseBinary(v: Buffer): number {
    return v.readDoubleBE(0);
  },

  encodeBinary(buf: SmartBuffer, v: number | string): void {
    buf.writeDoubleBE(typeof v === 'number' ? v : parseFloat(v));
  },

  parseText: parseFloat,

  isType(v: any): boolean {
    return typeof v === 'number';
  },
};

export const ArrayFloat8Type: DataType = {
  ...Float8Type,
  name: '_float8',
  oid: DataTypeOIDs._float8,
  elementsOID: DataTypeOIDs.float8,
};
