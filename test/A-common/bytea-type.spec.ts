import { expect } from 'expect';
import { ByteaType } from '../../src/data-types/bytea-type.js';

describe('ByteaType', () => {
  it('should encode as the "\\x"-prefixed hex form for the text/literal path', () => {
    expect(
      ByteaType.encodeText!(Buffer.from([0xde, 0xad, 0xbe, 0xef])),
    ).toStrictEqual('\\xdeadbeef');
  });

  describe('decodeBinary()', () => {
    it('should return the buffer unchanged when offset is 0', () => {
      const buf = Buffer.from([1, 2, 3]);
      expect(ByteaType.decodeBinary!(buf, 0, {})).toBe(buf);
    });

    it('should return a sliced sub-buffer when offset is non-zero', () => {
      const buf = Buffer.from([1, 2, 3, 4]);
      expect([...ByteaType.decodeBinary!(buf, 2, {})]).toStrictEqual([3, 4]);
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
