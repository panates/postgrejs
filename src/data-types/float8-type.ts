import { DataTypeOIDs } from '../constants.js';
import type { DataType } from '../interfaces/data-type.js';
import type { SmartBuffer } from '../protocol/smart-buffer.js';

export const Float8Type: DataType = {
  name: 'float8',
  oid: DataTypeOIDs.float8,
  jsType: 'number',
  fixedBinarySize: 8,

  // Infinity/NaN stringify to the words PostgreSQL itself uses.
  encodeText(v: any): string {
    return '' + v;
  },

  encodeBinary(buf: SmartBuffer, v: number | string): void {
    buf.writeDoubleBE(typeof v === 'number' ? v : parseFloat(v));
  },

  decodeBinary(v: Buffer, offset: number = 0): number {
    return v.readDoubleBE(offset);
  },

  decodeText: parseFloat,

  // See float4-type.ts's decodeTextBuffer comment - same rationale.
  decodeTextBuffer(buf: Buffer, offset: number, len: number): number {
    return parseFloat(buf.toString('latin1', offset, offset + len));
  },

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
