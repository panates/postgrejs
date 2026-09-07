import { expect } from 'expect';
import { Int2Type } from '../../src/data-types/int2-type.js';
import { OidType } from '../../src/data-types/oid-type.js';

describe('OidType', () => {
  it('should encode as its string form for the text/literal path', () => {
    expect(OidType.encodeText!(23)).toStrictEqual('23');
  });

  describe('isType()', () => {
    it("should accept an integer that names a known type's own oid", () => {
      expect(OidType.isType(23)).toStrictEqual(true);
    });

    it('should refuse an integer with no matching registered type', () => {
      expect(OidType.isType(999999)).toStrictEqual(false);
    });
  });
});

describe('Int2Type', () => {
  it('should encode as its string form for the text/literal path', () => {
    expect(Int2Type.encodeText!(42)).toStrictEqual('42');
  });

  describe('isType()', () => {
    it('should refuse a value below the int2 range', () => {
      expect(Int2Type.isType(-32769)).toStrictEqual(false);
    });

    it('should refuse a value above the int2 range', () => {
      expect(Int2Type.isType(32768)).toStrictEqual(false);
    });
  });
});
