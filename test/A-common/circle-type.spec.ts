import { expect } from 'expect';
import { Circle } from 'postgrejs';
import { CircleType } from '../../src/data-types/circle-type.js';

describe('CircleType', () => {
  it('should encode as "<(x,y),r>" for the text/literal path', () => {
    expect(CircleType.encodeText!(new Circle(1.2, 3.5, 4.6))).toStrictEqual(
      '<(1.2,3.5),4.6>',
    );
  });

  it('should encode a plain object under either spelling of the radius', () => {
    expect(
      CircleType.encodeText!({ x: 1, y: 2, radius: 3 } as any),
    ).toStrictEqual('<(1,2),3>');
    expect(CircleType.encodeText!({ x: 1, y: 2, r: 3 } as any)).toStrictEqual(
      '<(1,2),3>',
    );
  });

  describe('decodeText()', () => {
    it('should parse the "<(x,y),r>" form', () => {
      expect(CircleType.decodeText!('<(1.2, 3.5), 4.6>')).toStrictEqual(
        new Circle(1.2, 3.5, 4.6),
      );
    });

    it('should parse the "((x,y),r)" form', () => {
      expect(CircleType.decodeText!('((-1.6, 3.0), 4.6)')).toStrictEqual(
        new Circle(-1.6, 3, 4.6),
      );
    });

    it('should parse the "(x,y),r" form', () => {
      expect(CircleType.decodeText!('(4.2, 3.5), 4.6')).toStrictEqual(
        new Circle(4.2, 3.5, 4.6),
      );
    });

    it('should parse the bare "x,y,r" form', () => {
      expect(CircleType.decodeText!('10.24, 40.1, 4.6')).toStrictEqual(
        new Circle(10.24, 40.1, 4.6),
      );
    });

    it('should return undefined for a string matching none of the forms', () => {
      expect(CircleType.decodeText!('not a circle')).toStrictEqual(undefined);
    });
  });

  describe('isType()', () => {
    it('should accept an object with exactly x/y/radius, all numbers', () => {
      expect(CircleType.isType(new Circle(1, 2, 3))).toStrictEqual(true);
      expect(CircleType.isType({ x: 1, y: 2, radius: 3 })).toStrictEqual(true);
    });

    it('should still accept the released `r` spelling', () => {
      // `{x, y, r}` is what this client both returned and accepted up to
      // 3.9, so a parameter written against that keeps working.
      expect(CircleType.isType({ x: 1, y: 2, r: 3 })).toStrictEqual(true);
    });

    it('should refuse a non-object value', () => {
      expect(CircleType.isType('1,2,3')).toStrictEqual(false);
    });

    it('should refuse an object with a missing or extra key', () => {
      expect(CircleType.isType({ x: 1, y: 2 })).toStrictEqual(false);
      expect(CircleType.isType({ x: 1, y: 2, radius: 3, z: 4 })).toStrictEqual(
        false,
      );
    });

    it('should refuse an object whose coordinates are not all numbers', () => {
      expect(CircleType.isType({ x: '1', y: 2, radius: 3 })).toStrictEqual(
        false,
      );
      expect(CircleType.isType({ x: 1, y: 2, radius: '3' })).toStrictEqual(
        false,
      );
    });
  });
});
