import { DataTypeOIDs } from '../constants.js';
import type { DataType } from '../interfaces/data-type.js';
import type { SmartBuffer } from '../protocol/smart-buffer.js';
import { parseBytea, parseByteaBuffer } from '../util/parse-bytea.js';

export const ByteaType: DataType = {
  name: 'bytea',
  oid: DataTypeOIDs.bytea,
  jsType: 'Buffer',

  // The hex form PostgreSQL has emitted by default since 9.0.
  encodeText(v: Buffer): string {
    return '\\x' + v.toString('hex');
  },

  encodeBinary(buf: SmartBuffer, v: Buffer): void {
    buf.writeBuffer(v);
  },

  decodeBinary(v: Buffer, offset: number = 0): Buffer {
    return offset ? v.subarray(offset) : v;
  },

  decodeText: parseBytea,
  decodeTextBuffer: parseByteaBuffer,

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
