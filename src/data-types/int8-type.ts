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

  parseBinary(buf: Buffer, offset: number = 0): bigint | number {
    const v =
      typeof buf.readBigInt64BE === 'function'
        ? buf.readBigInt64BE(offset)
        : readBigInt64BE(buf, offset);
    return v >= -maxSafeInteger && v <= maxSafeInteger ? Number(v) : v;
  },

  encodeBinary(buf: SmartBuffer, v: bigint | number): void {
    buf.writeBigInt64BE(v);
  },

  parseText(s: string): bigint | number {
    // Any decimal integer of 15 digits or fewer (sign aside) is guaranteed
    // <= Number.MAX_SAFE_INTEGER (2^53-1, 16 digits), so it converts to a
    // number exactly - skip BigInt() entirely for it. Most int8 columns in
    // practice hold values far smaller than the full 64-bit range, so this
    // fast path covers the common case; only strings at/above that length
    // need the slower BigInt parse-and-range-check.
    const digits = s.charCodeAt(0) === 45 /* '-' */ ? s.length - 1 : s.length;
    if (digits <= 15) return Number(s);
    const v = BigInt(s);
    return v >= -maxSafeInteger && v <= maxSafeInteger ? Number(v) : v;
  },

  // Reuses fastParseIntBuffer for the same ≤15-digit fast case parseText
  // handles with Number(s) - a 15-digit magnitude tops out at
  // 999,999,999,999,999, under Number.MAX_SAFE_INTEGER (16 digits), so the
  // accumulation is exactly representable in a double throughout, matching
  // Number(s) bit-for-bit. Falls back to a real string + BigInt() only for
  // the rare >15-digit case, same as parseText. Reads directly from the
  // shared row buffer at offset/len (get-parsers.ts's text fast path) -
  // no Buffer.subarray() needed for either branch.
  parseTextBuffer(buf: Buffer, offset: number, len: number): bigint | number {
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
