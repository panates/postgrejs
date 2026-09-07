import { expect } from 'expect';
import { Int8Type } from '../../src/data-types/int8-type.js';

describe('Int8Type', () => {
  it('should encode as its string form for the text/literal path', () => {
    expect(Int8Type.encodeText!(123n)).toStrictEqual('123');
  });

  it('should fall back to the manual BigInt64 reader when the buffer has no native readBigInt64BE', () => {
    const buf = Buffer.alloc(8);
    buf.writeBigInt64BE(123n);
    (buf as any).readBigInt64BE = undefined;
    expect(Int8Type.decodeBinary!(buf, 0, {})).toStrictEqual(123);
  });

  describe('decodeText()', () => {
    it('should take the <=15-digit fast path for an ordinary value', () => {
      // Only array (_int8) columns route through decodeText() itself -
      // scalar int8 columns use decodeTextBuffer() instead (see
      // get-parsers.ts), so this needs a direct call to reach it.
      expect(Int8Type.decodeText!('123', {})).toStrictEqual(123);
    });

    it('should return a plain number for a value that fits in a safe integer, even past 15 digits', () => {
      // 16 digits, but still well under Number.MAX_SAFE_INTEGER.
      expect(Int8Type.decodeText!('1234567890123456', {})).toStrictEqual(
        1234567890123456,
      );
    });

    it('should return a bigint for a value beyond the safe integer range', () => {
      expect(Int8Type.decodeText!('99999999999999999', {})).toStrictEqual(
        99999999999999999n,
      );
    });

    it('should count digits correctly for a negative value past 15 digits', () => {
      expect(Int8Type.decodeText!('-99999999999999999', {})).toStrictEqual(
        -99999999999999999n,
      );
    });

    it('should return a plain number for a negative value that still fits in a safe integer', () => {
      expect(Int8Type.decodeText!('-1234567890123456', {})).toStrictEqual(
        -1234567890123456,
      );
    });
  });

  describe('isType()', () => {
    it('should accept a bigint', () => {
      expect(Int8Type.isType(123n)).toStrictEqual(true);
    });

    it('should accept an integer number outside the int4 range', () => {
      expect(Int8Type.isType(2147483648)).toStrictEqual(true);
      expect(Int8Type.isType(-2147483649)).toStrictEqual(true);
    });

    it('should refuse an integer number within the int4 range', () => {
      expect(Int8Type.isType(42)).toStrictEqual(false);
    });

    it('should refuse a non-integer or non-numeric value', () => {
      expect(Int8Type.isType(1.5)).toStrictEqual(false);
      expect(Int8Type.isType('123')).toStrictEqual(false);
    });
  });
});
