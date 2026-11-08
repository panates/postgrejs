import { expect } from 'expect';
import { ByteaType } from '../../src/data-types/bytea-type.js';

describe('ByteaType', () => {
  it('should encode as the "\\x"-prefixed hex form for the text/literal path', () => {
    expect(
      ByteaType.encodeText!(Buffer.from([0xde, 0xad, 0xbe, 0xef])),
    ).toStrictEqual('\\xdeadbeef');
  });

  describe('decodeBinary()', () => {
    it('should return a view over the whole value when offset is 0', () => {
      const buf = Buffer.from([1, 2, 3]);
      const out = ByteaType.decodeBinary!(buf, 0, 3, {});
      expect([...out]).toStrictEqual([1, 2, 3]);
      // A view onto the caller's own bytes, not a copy of them.
      expect(out.buffer).toBe(buf.buffer);
    });

    it('should return a sliced sub-buffer when offset is non-zero', () => {
      const buf = Buffer.from([1, 2, 3, 4]);
      expect([...ByteaType.decodeBinary!(buf, 2, 2, {})]).toStrictEqual([3, 4]);
    });
  });

  describe('isType()', () => {
    it('should accept a Buffer', () => {
      expect(ByteaType.isType(Buffer.from('x'))).toStrictEqual(true);
    });

    it('should refuse a non-Buffer value', () => {
      expect(ByteaType.isType('x')).toStrictEqual(false);
    });
  });
});
