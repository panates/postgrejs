import { expect } from 'expect';
import { Int2VectorType } from '../../src/data-types/int2-vector-type.js';

describe('Int2VectorType', () => {
  it('should encode as space-separated integers for the text/literal path', () => {
    expect(Int2VectorType.encodeText!([1, 2, 6])).toStrictEqual('1 2 6');
  });

  it('should decode an empty binary array value as undefined', () => {
    expect(Int2VectorType.decodeBinary!(Buffer.alloc(0), 0, {})).toStrictEqual(
      undefined,
    );
  });

  describe('isType()', () => {
    it('should accept an array of in-range integers', () => {
      expect(Int2VectorType.isType([1, -2, 32767, -32768])).toStrictEqual(true);
    });

    it('should refuse a non-array value', () => {
      expect(Int2VectorType.isType('1 2 3')).toStrictEqual(false);
    });

    it('should refuse an array containing a non-integer number', () => {
      expect(Int2VectorType.isType([1, 2.5])).toStrictEqual(false);
    });

    it('should refuse an array containing a non-number element', () => {
      expect(Int2VectorType.isType([1, '2'])).toStrictEqual(false);
    });

    it('should refuse a value above the int2 range', () => {
      expect(Int2VectorType.isType([32768])).toStrictEqual(false);
    });

    it('should refuse a value below the int2 range', () => {
      expect(Int2VectorType.isType([-32769])).toStrictEqual(false);
    });
  });
});
