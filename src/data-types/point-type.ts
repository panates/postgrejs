import { DataTypeOIDs } from '../constants.js';
import type { DataMappingOptions } from '../interfaces/data-mapping-options.js';
import type { DataType } from '../interfaces/data-type.js';
import type { SmartBuffer } from '../protocol/smart-buffer.js';
import type { Maybe } from '../types.js';
import { Point } from './classes/geometric.js';

const POINT_PATTERN1 = /^\( *(-?\d+\.?\d*) *, *(-?\d+\.?\d*) *\)$/;
const POINT_PATTERN2 = /^(-?\d+\.?\d*) *, *(-?\d+\.?\d*)$/;

export const PointType: DataType = {
  name: 'point',
  oid: DataTypeOIDs.point,
  jsType: 'Point',

  encodeText(v: Point): string {
    return `(${v.x},${v.y})`;
  },

  encodeBinary(buf: SmartBuffer, v: Point): void {
    buf.writeDoubleBE(v.x);
    buf.writeDoubleBE(v.y);
  },

  decodeBinary(v: Buffer, offset: number = 0): Point {
    return new Point(v.readDoubleBE(offset), v.readDoubleBE(offset + 8));
  },

  decodeText(v: string): Maybe<Point> {
    const m = v.match(POINT_PATTERN1) || v.match(POINT_PATTERN2);
    if (!m) return undefined;
    return new Point(parseFloat(m[1]), parseFloat(m[2]));
  },

  // See box-type.ts's decodeTextBuffer comment - same rationale.
  decodeTextBuffer(
    buf: Buffer,
    offset: number,
    len: number,
    options: DataMappingOptions,
  ): Maybe<Point> {
    return PointType.decodeText(
      buf.toString('latin1', offset, offset + len),
      options,
    );
  },

  // A plain `{x, y}` is still accepted: it is what this type returned
  // before Point existed, and code that builds one by hand should keep
  // working.
  isType(v: any): boolean {
    return v instanceof Point || Point.isPointLike(v);
  },
};

export const ArrayPointType: DataType = {
  ...PointType,
  name: '_point',
  oid: DataTypeOIDs._point,
  elementsOID: DataTypeOIDs.point,
};
