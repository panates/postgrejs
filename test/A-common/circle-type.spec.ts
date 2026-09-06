import { expect } from 'expect';
import { CircleType } from '../../src/data-types/circle-type.js';

describe('CircleType', () => {
  it('should encode as "<(x,y),r>" for the text/literal path', () => {
    expect(CircleType.encodeText!({ x: 1.2, y: 3.5, r: 4.6 })).toStrictEqual(
      '<(1.2,3.5),4.6>',
    );
  });

  describe('decodeText()', () => {
    it('should parse the "<(x,y),r>" form', () => {
      expect(CircleType.decodeText!('<(1.2, 3.5), 4.6>')).toStrictEqual({
        x: 1.2,
        y: 3.5,
        r: 4.6,
      });
    });

    it('should parse the "((x,y),r)" form', () => {
      expect(CircleType.decodeText!('((-1.6, 3.0), 4.6)')).toStrictEqual({
        x: -1.6,
        y: 3,
        r: 4.6,
      });
    });

    it('should parse the "(x,y),r" form', () => {
      expect(CircleType.decodeText!('(4.2, 3.5), 4.6')).toStrictEqual({
        x: 4.2,
        y: 3.5,
        r: 4.6,
      });
    });

    it('should parse the bare "x,y,r" form', () => {
      expect(CircleType.decodeText!('10.24, 40.1, 4.6')).toStrictEqual({
        x: 10.24,
        y: 40.1,
        r: 4.6,
      });
    });

    it('should return undefined for a string matching none of the forms', () => {
      expect(CircleType.decodeText!('not a circle')).toStrictEqual(undefined);
    });
  });

  describe('isType()', () => {
    it('should accept an object with exactly x/y/r, all numbers', () => {
      expect(CircleType.isType({ x: 1, y: 2, r: 3 })).toStrictEqual(true);
    });

    it('should refuse a non-object value', () => {
      expect(CircleType.isType('1,2,3')).toStrictEqual(false);
    });

    it('should refuse an object with a missing or extra key', () => {
      expect(CircleType.isType({ x: 1, y: 2 })).toStrictEqual(false);
      expect(CircleType.isType({ x: 1, y: 2, r: 3, z: 4 })).toStrictEqual(
        false,
      );
    });

    it('should refuse an object whose coordinates are not all numbers', () => {
      expect(CircleType.isType({ x: '1', y: 2, r: 3 })).toStrictEqual(false);
    });
  });
});
