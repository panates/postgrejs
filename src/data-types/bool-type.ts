import { DataTypeOIDs } from '../constants.js';
import type { DataType } from '../interfaces/data-type.js';
import type { SmartBuffer } from '../protocol/smart-buffer.js';

export const BoolType: DataType = {
  name: 'bool',
  oid: DataTypeOIDs.bool,
  jsType: 'boolean',
  fixedBinarySize: 1,

  decodeBinary(v: Buffer, offset: number = 0): boolean {
    return !!v.readUInt8(offset);
  },

  // 't'/'f', the form decodeText above reads and the server itself
  // emits - encodeText and decodeText are a public pair and have to stay
  // each other's inverse.
  encodeText(v: any): string {
    return v ? 't' : 'f';
  },

  encodeBinary(buf: SmartBuffer, v: boolean): void {
    buf.writeInt8(v ? 1 : 0);
  },

  // PostgreSQL's boolout() always emits exactly 't' or 'f' for a bool
  // column's text-format wire output, regardless of how the value was
  // originally inserted (confirmed live: `select b from t` where t is a
  // real bool column returns "t"/"f", never "true"/"y"/"on"/etc) - the
  // other literal forms are only valid as *input* to a bool cast, never as
  // output, so they can never match here.
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
