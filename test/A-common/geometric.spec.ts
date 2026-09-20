import { expect } from 'expect';
import {
  Box,
  Circle,
  DataTypeNames,
  GlobalTypeMap,
  Line,
  LineSegment,
  Path,
  Point,
  Polygon,
} from 'postgrejs';

describe('geometric classes', () => {
  it('should print what PostgreSQL prints', () => {
    expect(String(new Point(1, 2))).toStrictEqual('(1,2)');
    expect(String(new Circle(1, 2, 3))).toStrictEqual('<(1,2),3>');
    expect(String(new Box(1, 2, 3, 4))).toStrictEqual('(1,2),(3,4)');
    expect(String(new LineSegment(1, 2, 3, 4))).toStrictEqual('[(1,2),(3,4)]');
    expect(String(new Line(1, -1, 0))).toStrictEqual('{1,-1,0}');
    expect(
      String(new Polygon([new Point(1, 2), new Point(3, 4)])),
    ).toStrictEqual('((1,2),(3,4))');
    // A path prints its two forms differently, because they are two
    // different values rather than two spellings of one.
    expect(String(new Path([new Point(1, 2)]))).toStrictEqual('((1,2))');
    expect(String(new Path([new Point(1, 2)], false))).toStrictEqual('[(1,2)]');
  });

  it('should spell an extreme coordinate the way JavaScript does', () => {
    // The server writes `(1e+20,2)` and this writes the same double out
    // in full. Pinned rather than fixed: the value is identical, the
    // string still casts back to it, and `point`, `circle` and plain
    // `float8` have all behaved this way since long before these classes.
    expect(String(new Point(1e20, 2))).toStrictEqual(
      '(100000000000000000000,2)',
    );
    expect(String(new Line(1e20, 1, 0))).toStrictEqual(
      '{100000000000000000000,1,0}',
    );
  });

  it('should serialize to JSON as that string', () => {
    expect(JSON.stringify({ p: new Point(1, 2) })).toStrictEqual(
      '{"p":"(1,2)"}',
    );
  });

  it('should tell a box from an lseg, which the plain shapes could not', () => {
    // Both types' isType() accepted `{x1, y1, x2, y2}` and box is
    // registered later, so determine() answered box for every one of them
    // and an lseg parameter could not be expressed at all.
    const name = (v: any) => DataTypeNames[GlobalTypeMap.determine(v)];
    expect(name(new Box(1, 2, 3, 4))).toStrictEqual('box');
    expect(name(new LineSegment(1, 2, 3, 4))).toStrictEqual('lseg');
    expect(name(new Point(1, 2))).toStrictEqual('point');
    expect(name(new Circle(1, 2, 3))).toStrictEqual('circle');
    expect(name(new Line(1, 2, 3))).toStrictEqual('line');
  });

  it('should tell a path from a polygon, which are the same points', () => {
    // The same reasoning as box and lseg: nothing about a list of points
    // says which type it was meant for, so the class is what says it.
    const name = (v: any) => DataTypeNames[GlobalTypeMap.determine(v)];
    const points = [new Point(1, 2), new Point(3, 4)];
    expect(name(new Path(points))).toStrictEqual('path');
    expect(name(new Polygon(points))).toStrictEqual('polygon');
    // A bare array of points is a point[], and stays one - claiming it
    // for either type would take those arrays away from `point`.
    expect(name(points)).toStrictEqual('_point');
  });

  it("should keep a path's points as Points, however they were given", () => {
    const p = new Path([{ x: 1, y: 2 }, new Point(3, 4)]);
    expect(p.points).toStrictEqual([new Point(1, 2), new Point(3, 4)]);
    expect(p.points[0]).toBeInstanceOf(Point);
  });

  it('should still infer a plain object the way it always did', () => {
    // These classes are additive: code that builds the object literal
    // this type used to return keeps working, and keeps resolving the
    // same way - box included, which stays ambiguous with lseg because
    // nothing about the four numbers says which is meant.
    const name = (v: any) => DataTypeNames[GlobalTypeMap.determine(v)];
    expect(name({ x: 1, y: 2 })).toStrictEqual('point');
    expect(name({ x: 1, y: 2, r: 3 })).toStrictEqual('circle');
    expect(name({ x1: 1, y1: 2, x2: 3, y2: 4 })).toStrictEqual('box');
    // line is new and had no plain form to preserve, but `{a, b, c}` is
    // accepted for the same reason `{x, y}` is.
    expect(name({ a: 1, b: 2, c: 3 })).toStrictEqual('line');
  });

  it('should not let one two-point class be taken for the other', () => {
    // The shape check is limited to plain objects for this reason: a
    // LineSegment carries the same four numbers a box does.
    expect(Box.isTwoPointsLike(new LineSegment(1, 2, 3, 4))).toStrictEqual(
      false,
    );
    expect(Box.isTwoPointsLike({ x1: 1, y1: 2, x2: 3, y2: 4 })).toStrictEqual(
      true,
    );
    expect(Point.isPointLike(new Circle(1, 2, 3))).toStrictEqual(false);
  });
});
