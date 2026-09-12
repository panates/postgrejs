import { expect } from 'expect';
import { readBigInt64BE } from '../../src/util/bigint-methods.js';

describe('bigint-methods (Buffer.readBigInt64BE polyfill)', () => {
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
});
