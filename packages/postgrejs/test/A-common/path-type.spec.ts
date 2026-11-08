import { expect } from 'expect';
import { Path, Point, Polygon } from 'postgrejs';
import { PathType, PolygonType } from '../../src/data-types/path-type.js';
import { SmartBuffer } from '../../src/protocol/smart-buffer.js';

function roundTrip(t: typeof PathType, v: any): any {
  const buf = new SmartBuffer();
  t.encodeBinary!(buf, v, {});
  return t.decodeBinary!(buf.buffer, 0, buf.size, {});
}

const pts = [new Point(1, 2), new Point(3, 4), new Point(5, 6)];

describe('PathType', () => {
  it('should encode the two forms differently for the text/literal path', () => {
    expect(PathType.encodeText!(new Path(pts), {})).toStrictEqual(
      '((1,2),(3,4),(5,6))',
    );
    expect(PathType.encodeText!(new Path(pts, false), {})).toStrictEqual(
      '[(1,2),(3,4),(5,6)]',
    );
  });

  it('should carry the closed flag through binary, which is part of the value', () => {
    expect(roundTrip(PathType, new Path(pts))).toStrictEqual(new Path(pts));
    expect(roundTrip(PathType, new Path(pts, false))).toStrictEqual(
      new Path(pts, false),
    );
  });

  it('should write a flag byte, then an int32 count, then the points', () => {
    const buf = new SmartBuffer();
    PathType.encodeBinary!(buf, new Path([new Point(1, 2)], false), {});
    expect(buf.size).toStrictEqual(1 + 4 + 16);
    expect(buf.buffer[0]).toStrictEqual(0);
    expect(buf.buffer.readInt32BE(1)).toStrictEqual(1);
  });

  it('should take a plain array of points, closed by default', () => {
    // It cannot be inferred - determine() answers point[] for one - but
    // it is unambiguous once the type has been named with a BindParam.
    expect(roundTrip(PathType, [{ x: 1, y: 2 }])).toStrictEqual(
      new Path([new Point(1, 2)]),
    );
  });

  it('should refuse a value that is not points at all', () => {
    const buf = new SmartBuffer();
    expect(() => PathType.encodeBinary!(buf, 42, {})).toThrow(
      'cannot be encoded as a path',
    );
    expect(() => PolygonType.encodeBinary!(buf, 'x', {})).toThrow(
      'cannot be encoded as a polygon',
    );
  });

  it('should read from the offset it is given', () => {
    const buf = new SmartBuffer();
    buf.writeBytes(Buffer.alloc(3, 0xff));
    PathType.encodeBinary!(buf, new Path(pts), {});
    expect(
      PathType.decodeBinary!(buf.buffer, 3, buf.size - 3, {}),
    ).toStrictEqual(new Path(pts));
  });

  describe('decodeText()', () => {
    it('should read "(...)" as closed and "[...]" as open', () => {
      expect(PathType.decodeText!('((1,2),(3,4))', {})).toStrictEqual(
        new Path([new Point(1, 2), new Point(3, 4)]),
      );
      expect(PathType.decodeText!('[(1,2),(3,4)]', {})).toStrictEqual(
        new Path([new Point(1, 2), new Point(3, 4)], false),
      );
    });

    it('should read a single point, and an exponent', () => {
      expect(PathType.decodeText!('((1,2))', {})).toStrictEqual(
        new Path([new Point(1, 2)]),
      );
      expect(PathType.decodeText!('[(1e+20,-2.5)]', {})).toStrictEqual(
        new Path([new Point(1e20, -2.5)], false),
      );
    });

    it('should return undefined for anything else', () => {
      expect(PathType.decodeText!('not a path', {})).toStrictEqual(undefined);
      expect(PathType.decodeText!('{1,2,3}', {})).toStrictEqual(undefined);
      // An odd number of coordinates is not a list of points.
      expect(PathType.decodeText!('((1,2),(3))', {})).toStrictEqual(undefined);
    });

    it('should read the text buffer at an offset too', () => {
      const buf = Buffer.from('  ((1,2))  ');
      expect(PathType.decodeTextBuffer!(buf, 2, 7, {})).toStrictEqual(
        new Path([new Point(1, 2)]),
      );
    });
  });

  it('should claim only a Path, never a bare array', () => {
    expect(PathType.isType(new Path(pts))).toStrictEqual(true);
    expect(PathType.isType(new Polygon(pts))).toStrictEqual(false);
    expect(PathType.isType(pts)).toStrictEqual(false);
  });
});

describe('PolygonType', () => {
  it('should encode as "(...)" for the text/literal path', () => {
    expect(PolygonType.encodeText!(new Polygon(pts), {})).toStrictEqual(
      '((1,2),(3,4),(5,6))',
    );
  });

  it('should write an int32 count and the points, with no flag byte', () => {
    const buf = new SmartBuffer();
    PolygonType.encodeBinary!(buf, new Polygon([new Point(1, 2)]), {});
    expect(buf.size).toStrictEqual(4 + 16);
    expect(buf.buffer.readInt32BE(0)).toStrictEqual(1);
    expect(roundTrip(PolygonType, new Polygon(pts))).toStrictEqual(
      new Polygon(pts),
    );
  });

  it('should take a plain array of points', () => {
    expect(roundTrip(PolygonType, [{ x: 1, y: 2 }])).toStrictEqual(
      new Polygon([new Point(1, 2)]),
    );
  });

  it('should read the "(...)" form', () => {
    expect(PolygonType.decodeText!('((1,2),(3,4))', {})).toStrictEqual(
      new Polygon([new Point(1, 2), new Point(3, 4)]),
    );
    expect(PolygonType.decodeText!('nope', {})).toStrictEqual(undefined);
    const buf = Buffer.from('  ((1,2))  ');
    expect(PolygonType.decodeTextBuffer!(buf, 2, 7, {})).toStrictEqual(
      new Polygon([new Point(1, 2)]),
    );
  });

  it('should claim only a Polygon, never a Path or a bare array', () => {
    expect(PolygonType.isType(new Polygon(pts))).toStrictEqual(true);
    expect(PolygonType.isType(new Path(pts))).toStrictEqual(false);
    expect(PolygonType.isType(pts)).toStrictEqual(false);
  });
});
