import { expect } from 'expect';
import { OidVectorType } from '../../src/data-types/oid-vector-type.js';

describe('OidVectorType', () => {
  it('should encode as space-separated integers for the text/literal path', () => {
    expect(OidVectorType.encodeText!([1, 2, 6])).toStrictEqual('1 2 6');
  });

  it('should decode an empty binary array value as undefined', () => {
    expect(OidVectorType.decodeBinary!(Buffer.alloc(0), 0, {})).toStrictEqual(
      undefined,
    );
  });

  describe('isType()', () => {
    it('should accept an array of in-range, non-negative integers', () => {
      expect(OidVectorType.isType([0, 1, 4294967295])).toStrictEqual(true);
    });

    it('should refuse a non-array value', () => {
      expect(OidVectorType.isType('1 2 3')).toStrictEqual(false);
    });

    it('should refuse an array containing a non-integer number', () => {
      expect(OidVectorType.isType([1, 2.5])).toStrictEqual(false);
    });

    it('should refuse an array containing a non-number element', () => {
      expect(OidVectorType.isType([1, '2'])).toStrictEqual(false);
    });

    it('should refuse a negative value (oids are unsigned)', () => {
      expect(OidVectorType.isType([-1])).toStrictEqual(false);
    });

    it('should refuse a value above the oid range', () => {
      expect(OidVectorType.isType([4294967296])).toStrictEqual(false);
    });
  });
});
