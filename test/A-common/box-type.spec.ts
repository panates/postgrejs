import { expect } from 'expect';
import { BoxType } from '../../src/data-types/box-type.js';

describe('BoxType', () => {
  it('should encode as "(x1,y1),(x2,y2)" for the text/literal path', () => {
    expect(
      BoxType.encodeText!({ x1: 1.2, y1: 3.5, x2: 4.6, y2: 5.2 }),
    ).toStrictEqual('(1.2,3.5),(4.6,5.2)');
  });

  describe('decodeText()', () => {
    it('should parse the "(x1,y1),(x2,y2)" form (no outer parens)', () => {
      expect(BoxType.decodeText!('(4.2, 3.5), (4.6, 9.7)')).toStrictEqual({
        x1: 4.2,
        y1: 3.5,
        x2: 4.6,
        y2: 9.7,
      });
    });

    it('should parse the bare "x1,y1,x2,y2" form', () => {
      expect(BoxType.decodeText!('10.24, 40.1, 4.6, 8.2')).toStrictEqual({
        x1: 10.24,
        y1: 40.1,
        x2: 4.6,
        y2: 8.2,
      });
    });

    it('should return undefined for a string matching none of the forms', () => {
      expect(BoxType.decodeText!('not a box')).toStrictEqual(undefined);
    });
  });
});
