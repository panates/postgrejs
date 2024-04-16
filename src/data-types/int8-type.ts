import { DataTypeOIDs } from '../constants.js';
import type { DataType } from '../interfaces/data-type.js';
import type { SmartBuffer } from '../protocol/smart-buffer.js';
import { readBigInt64BE } from '../util/bigint-methods.js';

const maxSafeInteger = BigInt(Number.MAX_SAFE_INTEGER);

export const Int8Type: DataType = {
  name: 'int8',
  oid: DataTypeOIDs.int8,
  jsType: 'BigInt',

  parseBinary(buf: Buffer): bigint | number {
    const v = typeof buf.readBigInt64BE === 'function' ? buf.readBigInt64BE(0) : readBigInt64BE(buf);
    return v >= -maxSafeInteger && v <= maxSafeInteger ? Number(v) : v;
  },

  encodeBinary(buf: SmartBuffer, v: bigint | number): void {
    buf.writeBigInt64BE(v);
  },

  parseText(s: string): bigint | number {
    const v = BigInt(s);
    return v >= -maxSafeInteger && v <= maxSafeInteger ? Number(v) : v;
  },

  isType(v: any): boolean {
    return typeof v === 'bigint' || (typeof v === 'number' && Number.isInteger(v) && v > Number.MAX_SAFE_INTEGER);
  },
};

export const ArrayInt8Type: DataType = {
  ...Int8Type,
  name: '_int8',
  oid: DataTypeOIDs._int8,
  elementsOID: DataTypeOIDs.int8,
};
