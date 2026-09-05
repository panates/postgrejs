import { DataTypeOIDs } from '../constants.js';
import type { DataType } from '../interfaces/data-type.js';
import type { SmartBuffer } from '../protocol/smart-buffer.js';
import { parseBytea, parseByteaBuffer } from '../util/parse-bytea.js';

export const ByteaType: DataType = {
  name: 'bytea',
  oid: DataTypeOIDs.bytea,
  jsType: 'Buffer',

  parseBinary(v: Buffer, offset: number = 0): Buffer {
    return offset ? v.subarray(offset) : v;
  },

  encodeBinary(buf: SmartBuffer, v: Buffer): void {
    buf.writeBuffer(v);
  },

  parseText: parseBytea,
  parseTextBuffer: parseByteaBuffer,

  isType(v: any): boolean {
    return v instanceof Buffer;
  },
};

export const ArrayByteaType: DataType = {
  ...ByteaType,
  name: '_bytea',
  oid: DataTypeOIDs._bytea,
  elementsOID: DataTypeOIDs.bytea,
};
