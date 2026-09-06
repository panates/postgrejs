import { DataTypeOIDs } from '../constants.js';
import type { DataType } from '../interfaces/data-type.js';
import type { SmartBuffer } from '../protocol/smart-buffer.js';

export const Float4Type: DataType = {
  name: 'float4',
  oid: DataTypeOIDs.float4,
  jsType: 'number',
  fixedBinarySize: 4,

  decodeBinary(v: Buffer, offset: number = 0): number {
    return v.readFloatBE(offset);
  },

  // Infinity/NaN stringify to the words PostgreSQL itself uses.
  encodeText(v: any): string {
    return '' + v;
  },

  encodeBinary(buf: SmartBuffer, v: number | string): void {
    buf.writeFloatBE(typeof v === 'number' ? v : parseFloat(v));
  },

  decodeText: parseFloat,

  // PostgreSQL's float4 text output (including "NaN"/"Infinity"/
  // "-Infinity") is pure ASCII, so 'latin1' decodes identically to 'utf8'
  // here but skips V8's multi-byte-sequence detection - same parseFloat,
  // cheaper string decode only (not a hand-rolled float parser: float
  // accumulation isn't exact the way integer accumulation is, so this
  // deliberately reuses the proven-correct built-in instead).
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
