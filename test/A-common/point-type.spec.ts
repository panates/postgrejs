import { expect } from 'expect';
import { PointType } from '../../src/data-types/point-type.js';

describe('PointType', () => {
  it('should encode as "(x,y)" for the text/literal path', () => {
    expect(PointType.encodeText!({ x: 1.2, y: 3.5 })).toStrictEqual(
      '(1.2,3.5)',
    );
  });

  describe('decodeText()', () => {
    it('should parse the bare "x,y" form (no parens)', () => {
      expect(PointType.decodeText!('10.24, 40.1')).toStrictEqual({
        x: 10.24,
        y: 40.1,
      });
    });

    it('should return undefined for a string matching neither form', () => {
      expect(PointType.decodeText!('not a point')).toStrictEqual(undefined);
    });
  });
});
