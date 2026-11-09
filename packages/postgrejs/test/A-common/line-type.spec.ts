import { expect } from 'expect';
import { Line } from 'postgrejs';
import { LineType } from '../../src/data-types/line-type.js';
import { SmartBuffer } from '../../src/protocol/smart-buffer.js';

function roundTrip(v: any): any {
  const buf = new SmartBuffer();
  LineType.encodeBinary!(buf, v, {});
  return LineType.decodeBinary!(buf.buffer, 0, buf.size, {});
}

describe('LineType', () => {
  it('should encode as "{a,b,c}" for the text/literal path', () => {
    expect(LineType.encodeText!(new Line(1, -1, 0), {})).toStrictEqual(
      '{1,-1,0}',
    );
  });

  it('should round-trip the three coefficients through binary', () => {
    // Three float8s and nothing else - Ax + By + C = 0.
    expect(roundTrip(new Line(1, -1, 0))).toStrictEqual(new Line(1, -1, 0));
    expect(roundTrip(new Line(-1.5, 2.25, 0.5))).toStrictEqual(
      new Line(-1.5, 2.25, 0.5),
    );
    const buf = new SmartBuffer();
    LineType.encodeBinary!(buf, new Line(1, -1, 0), {});
    expect(buf.size).toStrictEqual(24);
  });

  it('should read from the offset it is given', () => {
    // Which is how it arrives: pointed into the shared row buffer.
    const buf = new SmartBuffer();
    buf.writeBytes(Buffer.alloc(4, 0xff));
    LineType.encodeBinary!(buf, new Line(0, 1, -5), {});
    expect(LineType.decodeBinary!(buf.buffer, 4, 24, {})).toStrictEqual(
      new Line(0, 1, -5),
    );
  });

  describe('decodeText()', () => {
    it('should parse the "{a,b,c}" form the server prints', () => {
      expect(LineType.decodeText!('{1,-1,0}', {})).toStrictEqual(
        new Line(1, -1, 0),
      );
      expect(LineType.decodeText!('{ -1.5 , 2.25 , 0.5 }', {})).toStrictEqual(
        new Line(-1.5, 2.25, 0.5),
      );
    });

    it('should parse an exponent, which a float8 may be printed as', () => {
      expect(LineType.decodeText!('{1e+20,1,0}', {})).toStrictEqual(
        new Line(1e20, 1, 0),
      );
      expect(LineType.decodeText!('{1e-07,1,0}', {})).toStrictEqual(
        new Line(1e-7, 1, 0),
      );
    });

    it('should return undefined for anything else', () => {
      expect(LineType.decodeText!('not a line', {})).toStrictEqual(undefined);
      expect(LineType.decodeText!('{1,2}', {})).toStrictEqual(undefined);
      expect(LineType.decodeText!('(1,2),(3,4)', {})).toStrictEqual(undefined);
    });

    it('should read the text buffer at an offset too', () => {
      const buf = Buffer.from('  {1,-1,0}  ');
      expect(LineType.decodeTextBuffer!(buf, 2, 8, {})).toStrictEqual(
        new Line(1, -1, 0),
      );
    });
  });

  describe('isType()', () => {
    it('should accept a Line and a plain {a, b, c}', () => {
      expect(LineType.isType(new Line(1, 2, 3))).toStrictEqual(true);
      expect(LineType.isType({ a: 1, b: 2, c: 3 })).toStrictEqual(true);
    });

    it('should refuse a missing or extra key, and a non-number', () => {
      expect(LineType.isType({ a: 1, b: 2 })).toStrictEqual(false);
      expect(LineType.isType({ a: 1, b: 2, c: 3, d: 4 })).toStrictEqual(false);
      expect(LineType.isType({ a: '1', b: 2, c: 3 })).toStrictEqual(false);
      expect(LineType.isType('{1,2,3}')).toStrictEqual(false);
    });
  });
});
