import { expect } from 'expect';
import {
  Box,
  Circle,
  DataTypeNames,
  GlobalTypeMap,
  LineSegment,
  Point,
} from 'postgrejs';

describe('geometric classes', () => {
  it('should print what PostgreSQL prints', () => {
    expect(String(new Point(1, 2))).toStrictEqual('(1,2)');
    expect(String(new Circle(1, 2, 3))).toStrictEqual('<(1,2),3>');
    expect(String(new Box(1, 2, 3, 4))).toStrictEqual('(1,2),(3,4)');
    expect(String(new LineSegment(1, 2, 3, 4))).toStrictEqual('[(1,2),(3,4)]');
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
