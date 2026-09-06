import { expect } from 'expect';
import { LsegType } from '../../src/data-types/lseg-type.js';

describe('LsegType', () => {
  it('should encode as a bracketed pair of points for the text/literal path', () => {
    expect(
      LsegType.encodeText!({ x1: 1.2, y1: 3.5, x2: 4.6, y2: 5.2 }),
    ).toStrictEqual('[(1.2,3.5),(4.6,5.2)]');
  });

  describe('decodeText()', () => {
    it('should parse the bracketed form "[(x1,y1),(x2,y2)]"', () => {
      expect(LsegType.decodeText!('[(1.2, 3.5), (4.6, 5.2)]')).toStrictEqual({
        x1: 1.2,
        y1: 3.5,
        x2: 4.6,
        y2: 5.2,
      });
    });

    it('should parse the parenthesized form "((x1,y1),(x2,y2))"', () => {
      expect(LsegType.decodeText!('((-1.6, 3.0), (4.6, 0.1))')).toStrictEqual({
        x1: -1.6,
        y1: 3,
        x2: 4.6,
        y2: 0.1,
      });
    });

    it('should parse the unwrapped form "(x1,y1),(x2,y2)"', () => {
      expect(LsegType.decodeText!('(4.2, 3.5), (4.6, 9.7)')).toStrictEqual({
        x1: 4.2,
        y1: 3.5,
        x2: 4.6,
        y2: 9.7,
      });
    });

    it('should parse the bare form "x1,y1,x2,y2"', () => {
      expect(LsegType.decodeText!('10.24, 40.1, 4.6, 8.2')).toStrictEqual({
        x1: 10.24,
        y1: 40.1,
        x2: 4.6,
        y2: 8.2,
      });
    });

    it('should return undefined for a string matching none of the forms', () => {
      expect(LsegType.decodeText!('not a line segment')).toStrictEqual(
        undefined,
      );
    });
  });

  describe('isType()', () => {
    it('should accept an object with exactly x1/y1/x2/y2, all numbers', () => {
      expect(LsegType.isType({ x1: 1, y1: 2, x2: 3, y2: 4 })).toStrictEqual(
        true,
      );
    });

    it('should refuse a non-object value', () => {
      expect(LsegType.isType('1,2,3,4')).toStrictEqual(false);
    });

    it('should refuse an object with a missing or extra key', () => {
      expect(LsegType.isType({ x1: 1, y1: 2, x2: 3 })).toStrictEqual(false);
      expect(
        LsegType.isType({ x1: 1, y1: 2, x2: 3, y2: 4, z: 5 }),
      ).toStrictEqual(false);
    });

    it('should refuse an object whose coordinates are not all numbers', () => {
      expect(LsegType.isType({ x1: '1', y1: 2, x2: 3, y2: 4 })).toStrictEqual(
        false,
      );
    });
  });
});
