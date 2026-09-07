import { DataTypeOIDs } from '../constants.js';
import type { DataType } from '../interfaces/data-type.js';
import type { SmartBuffer } from '../protocol/smart-buffer.js';

export const Float4Type: DataType = {
  name: 'float4',
  oid: DataTypeOIDs.float4,
  jsType: 'number',
  fixedBinarySize: 4,

  encodeText(v: any): string {
    return '' + v;
  },

  encodeBinary(buf: SmartBuffer, v: number | string): void {
    buf.writeFloatBE(typeof v === 'number' ? v : parseFloat(v));
  },

  decodeBinary(v: Buffer, offset: number = 0): number {
    return v.readFloatBE(offset);
  },

  decodeText: parseFloat,

  decodeTextBuffer(buf: Buffer, offset: number, len: number): number {
    return parseFloat(buf.toString('latin1', offset, offset + len));
  },

  isType(v: any): boolean {
    return typeof v === 'number';
  },
};

export const ArrayFloat4Type: DataType = {
  ...Float4Type,
  name: '_float4',
  oid: DataTypeOIDs._float4,
  elementsOID: DataTypeOIDs.float4,
};
