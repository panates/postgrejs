import { expect } from 'expect';
import {
  readBigInt64BE,
  writeBigUInt64BE,
} from '../../src/util/bigint-methods.js';

describe('bigint-methods (Buffer.readBigInt64BE/writeBigInt64BE polyfill)', () => {
  describe('readBigInt64BE()', () => {
    // Cross-checked against Node's own native Buffer.readBigInt64BE() at
    // the same bytes, so these values are never hand-computed - a wrong
    // polyfill would disagree with the platform it exists to stand in for.
    function check(value: bigint) {
      const buf = Buffer.alloc(8);
      buf.writeBigInt64BE(value, 0);
      expect(readBigInt64BE(buf, 0)).toStrictEqual(value);
    }

    it('should read zero', () => check(0n));
    it('should read a small positive value', () => check(1234n));
    it("should read a small negative value (two's complement)", () =>
      check(-1234n));
    it('should read -1 (all bits set)', () => check(-1n));
    it('should read Number.MAX_SAFE_INTEGER and beyond', () =>
      check(BigInt(Number.MAX_SAFE_INTEGER) + 100n));
    it("should read int64's own min/max", () => {
      check(9223372036854775807n); // 2^63 - 1
      check(-9223372036854775808n); // -2^63
    });

    it('should read starting at a non-zero offset', () => {
      const buf = Buffer.alloc(16);
      buf.writeBigInt64BE(-42n, 8);
      expect(readBigInt64BE(buf, 8)).toStrictEqual(-42n);
    });

    it('should return 0n when the 8 bytes run past the buffer end', () => {
      // first/last both read past a 4-byte buffer at offset 0 - the
      // documented "not enough bytes" guard, not a thrown RangeError.
      const buf = Buffer.alloc(4);
      expect(readBigInt64BE(buf, 0)).toStrictEqual(0n);
    });
  });

  describe('writeBigUInt64BE()', () => {
    // Cross-checked the other way: write with the polyfill, read back with
    // Node's own native reader.
    function check(value: bigint) {
      const buf = Buffer.alloc(8);
      const nextOffset = writeBigUInt64BE(buf, value, 0);
      expect(nextOffset).toStrictEqual(8);
      // readBigInt64BE() (signed) is what round-trips a negative value
      // back to itself - readBigUInt64BE() would report its unsigned twin.
      expect(buf.readBigInt64BE(0)).toStrictEqual(value);
    }

    it('should write zero', () => check(0n));
    it('should write a small positive value', () => check(5678n));
    it('should write -1 (all bits set) despite its "UInt" name', () =>
      // Called from SmartBuffer.writeBigInt64BE() as the signed fallback,
      // so it has to round-trip negative values correctly too - the
      // bitwise & / >> it uses on a bigint operate on the infinite two's
      // complement representation, which is what makes that work.
      check(-1n));
    it('should write a small negative value', () => check(-5678n));
    it("should write int64's own min/max", () => {
      check(9223372036854775807n);
      check(-9223372036854775808n);
    });

    it('should write starting at a non-zero offset, without touching earlier bytes', () => {
      const buf = Buffer.alloc(16, 0xff);
      const nextOffset = writeBigUInt64BE(buf, 42n, 8);
      expect(nextOffset).toStrictEqual(16);
      expect(buf.readBigInt64BE(8)).toStrictEqual(42n);
      // Bytes before the offset are the caller's own concern, untouched.
      expect(buf.subarray(0, 8)).toStrictEqual(Buffer.alloc(8, 0xff));
    });
  });
});
