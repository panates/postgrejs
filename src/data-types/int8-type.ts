import { DataTypeOIDs } from '../constants.js';
import type { DataType } from '../interfaces/data-type.js';
import type { SmartBuffer } from '../protocol/smart-buffer.js';
import { readBigInt64BE } from '../util/bigint-methods.js';
import { fastParseIntBuffer } from '../util/fast-parseint.js';

const maxSafeInteger = BigInt(Number.MAX_SAFE_INTEGER);

export const Int8Type: DataType = {
  name: 'int8',
  oid: DataTypeOIDs.int8,
  jsType: 'BigInt',
  fixedBinarySize: 8,

  encodeText(v: any): string {
    return '' + v;
  },

  encodeBinary(buf: SmartBuffer, v: bigint | number): void {
    buf.writeBigInt64BE(v);
  },

  decodeBinary(buf: Buffer, offset: number = 0): bigint | number {
    const v =
      typeof buf.readBigInt64BE === 'function'
        ? buf.readBigInt64BE(offset)
        : readBigInt64BE(buf, offset);
    return v >= -maxSafeInteger && v <= maxSafeInteger ? Number(v) : v;
  },

  decodeText(s: string): bigint | number {
    const digits = s.charCodeAt(0) === 45 /* '-' */ ? s.length - 1 : s.length;
    if (digits <= 15) return Number(s);
    const v = BigInt(s);
    return v >= -maxSafeInteger && v <= maxSafeInteger ? Number(v) : v;
  },

  decodeTextBuffer(buf: Buffer, offset: number, len: number): bigint | number {
    const digits = buf[offset] === 45 /* '-' */ ? len - 1 : len;
    if (digits <= 15) return fastParseIntBuffer(buf, offset, len);
    const v = BigInt(buf.toString('utf8', offset, offset + len));
    return v >= -maxSafeInteger && v <= maxSafeInteger ? Number(v) : v;
  },

  isType(v: any): boolean {
    return (
      typeof v === 'bigint' ||
      (typeof v === 'number' &&
        Number.isInteger(v) &&
        (v > 2147483647 || v < -2147483648))
    );
  },
};

export const ArrayInt8Type: DataType = {
  ...Int8Type,
  name: '_int8',
  oid: DataTypeOIDs._int8,
  elementsOID: DataTypeOIDs.int8,
};
