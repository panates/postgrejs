import { DataTypeOIDs } from '../constants.js';
import type { DataType } from '../interfaces/data-type.js';
import type { SmartBuffer } from '../protocol/smart-buffer.js';

export const BoolType: DataType = {
  name: 'bool',
  oid: DataTypeOIDs.bool,
  jsType: 'boolean',
  fixedBinarySize: 1,

  // 't'/'f', the form decodeText above reads and the server itself
  // emits - encodeText and decodeText are a public pair and have to stay
  // each other's inverse.
  encodeText(v: any): string {
    return v ? 't' : 'f';
  },

  encodeBinary(buf: SmartBuffer, v: boolean): void {
    buf.writeInt8(v ? 1 : 0);
  },

  decodeBinary(v: Buffer, offset: number = 0): boolean {
    return !!v.readUInt8(offset);
  },

  decodeText(v: string): boolean {
    return v === 't';
  },

  decodeTextBuffer(buf: Buffer, offset: number): boolean {
    return buf[offset] === 0x74; /* 't' */
  },

  isType(v: any): boolean {
    return typeof v === 'boolean';
  },
};

export const ArrayBoolType: DataType = {
  ...BoolType,
  name: '_bool',
  oid: DataTypeOIDs._bool,
  elementsOID: DataTypeOIDs.bool,
};
