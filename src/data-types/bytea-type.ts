import decodeBytea from 'postgres-bytea';
import { DataTypeOIDs } from '../constants.js';
import type { DataType } from '../interfaces/data-type.js';
import type { SmartBuffer } from '../protocol/smart-buffer';

export const ByteaType: DataType = {
  name: 'bytea',
  oid: DataTypeOIDs.bytea,
  jsType: 'Buffer',

  parseBinary(v: Buffer): Buffer {
    return v;
  },

  encodeBinary(buf: SmartBuffer, v: Buffer): void {
    buf.writeBuffer(v);
  },

  parseText: decodeBytea,

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
