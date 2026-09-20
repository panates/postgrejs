import { DataTypeOIDs } from '../constants.js';
import type { DataMappingOptions } from '../interfaces/data-mapping-options.js';
import type { DataType } from '../interfaces/data-type.js';
import type { SmartBuffer } from '../protocol/smart-buffer.js';
import type { Maybe } from '../types.js';
import { Path, Point, Polygon } from './classes/geometric.js';

/**
 * `path` and `polygon` are a series of points each, and differ on the
 * wire only in that a path carries a flag saying whether it is closed.
 * They share this file the way `box` and `lseg` share their shape, and
 * for the same reason they are two classes: nothing about the points
 * themselves says which type they were meant for.
 */

/**
 * Every coordinate in the literal, in order. The server writes
 * `((1,2),(3,4))` for a closed path or a polygon and `[(1,2),(3,4)]` for
 * an open path, and a float8 may reach exponent form - so the numbers
 * are read out rather than matched against a fixed shape.
 */
const NUMBER_PATTERN = /-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi;
const POINTS_PATTERN = /^\s*([[(])\s*\(.*\)\s*[\])]\s*$/;

function parsePoints(v: string): Maybe<Point[]> {
  if (!POINTS_PATTERN.test(v)) return undefined;
  const nums = v.match(NUMBER_PATTERN);
  // A path or polygon holds at least one point, and coordinates come in
  // pairs - an odd count is a literal this does not understand.
  if (!nums || !nums.length || nums.length % 2) return undefined;
  const points = new Array<Point>(nums.length / 2);
  let i: number;
  for (i = 0; i < points.length; i++)
    points[i] = new Point(parseFloat(nums[i * 2]), parseFloat(nums[i * 2 + 1]));
  return points;
}

/** An int32 count, then each point as two float8s. */
function writePoints(buf: SmartBuffer, points: Point[]): void {
  const l = points.length;
  buf.writeInt32BE(l);
  let i: number;
  for (i = 0; i < l; i++) {
    buf.writeDoubleBE(points[i].x);
    buf.writeDoubleBE(points[i].y);
  }
}

function readPoints(v: Buffer, offset: number): Point[] {
  const count = v.readInt32BE(offset);
  const points = new Array<Point>(count);
  let i: number;
  let p = offset + 4;
  for (i = 0; i < count; i++) {
    points[i] = new Point(v.readDoubleBE(p), v.readDoubleBE(p + 8));
    p += 16;
  }
  return points;
}

/**
 * A plain array of points is accepted as a parameter - it cannot be
 * inferred, since `determine()` answers `point[]` for one, but it is
 * unambiguous once the type has been named with a BindParam.
 */
function toPoints(v: any, name: string): Point[] {
  if (Array.isArray(v)) return v.map(p => new Point(p.x, p.y));
  if (v && Array.isArray(v.points)) return v.points;
  throw new TypeError(
    `"${typeof v}" cannot be encoded as a ${name} - pass a ${name === 'path' ? 'Path' : 'Polygon'} or an array of points`,
  );
}

export const PathType: DataType = {
  name: 'path',
  oid: DataTypeOIDs.path,
  jsType: 'Path',

  encodeText(v: any): string {
    return v instanceof Path
      ? v.toString()
      : new Path(toPoints(v, 'path')).toString();
  },

  /** A closed flag, then the count and the points. */
  encodeBinary(buf: SmartBuffer, v: any): void {
    buf.writeUInt8(v instanceof Path ? (v.isClosed ? 1 : 0) : 1);
    writePoints(buf, toPoints(v, 'path'));
  },

  decodeBinary(v: Buffer, offset: number = 0): Path {
    return new Path(readPoints(v, offset + 1), !!v[offset]);
  },

  decodeText(v: string): Maybe<Path> {
    const points = parsePoints(v);
    if (!points) return undefined;
    // `[...]` is an open path, `(...)` a closed one.
    return new Path(points, v.trimStart()[0] !== '[');
  },

  // See box-type.ts's decodeTextBuffer comment - same rationale.
  decodeTextBuffer(
    buf: Buffer,
    offset: number,
    len: number,
    options: DataMappingOptions,
  ): Maybe<Path> {
    return PathType.decodeText(
      buf.toString('latin1', offset, offset + len),
      options,
    );
  },

  // Only a Path: a plain array of points is a `point[]` as far as
  // inference is concerned, and claiming it here would take those arrays
  // away from that type.
  isType(v: any): boolean {
    return v instanceof Path;
  },
};

export const ArrayPathType: DataType = {
  ...PathType,
  name: '_path',
  oid: DataTypeOIDs._path,
  elementsOID: DataTypeOIDs.path,
};

export const PolygonType: DataType = {
  name: 'polygon',
  oid: DataTypeOIDs.polygon,
  jsType: 'Polygon',

  encodeText(v: any): string {
    return v instanceof Polygon
      ? v.toString()
      : new Polygon(toPoints(v, 'polygon')).toString();
  },

  encodeBinary(buf: SmartBuffer, v: any): void {
    writePoints(buf, toPoints(v, 'polygon'));
  },

  decodeBinary(v: Buffer, offset: number = 0): Polygon {
    return new Polygon(readPoints(v, offset));
  },

  decodeText(v: string): Maybe<Polygon> {
    const points = parsePoints(v);
    return points && new Polygon(points);
  },

  // See box-type.ts's decodeTextBuffer comment - same rationale.
  decodeTextBuffer(
    buf: Buffer,
    offset: number,
    len: number,
    options: DataMappingOptions,
  ): Maybe<Polygon> {
    return PolygonType.decodeText(
      buf.toString('latin1', offset, offset + len),
      options,
    );
  },

  // See PathType.isType().
  isType(v: any): boolean {
    return v instanceof Polygon;
  },
};

export const ArrayPolygonType: DataType = {
  ...PolygonType,
  name: '_polygon',
  oid: DataTypeOIDs._polygon,
  elementsOID: DataTypeOIDs.polygon,
};
