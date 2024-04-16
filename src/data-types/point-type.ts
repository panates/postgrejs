import { DataTypeOIDs } from '../constants.js';
import type { DataType, Point } from '../interfaces/data-type.js';
import type { SmartBuffer } from '../protocol/smart-buffer.js';
import type { Maybe } from '../types.js';

const POINT_PATTERN1 = /^\( *(-?\d+\.?\d*) *, *(-?\d+\.?\d*) *\)$/;
const POINT_PATTERN2 = /^(-?\d+\.?\d*) *, *(-?\d+\.?\d*)$/;

export const PointType: DataType = {
  name: 'point',
  oid: DataTypeOIDs.point,
  jsType: 'object',

  parseBinary(v: Buffer): Point {
    return {
      x: v.readDoubleBE(0),
      y: v.readDoubleBE(8),
    };
  },

  encodeBinary(buf: SmartBuffer, v: Point): void {
    buf.writeDoubleBE(v.x);
    buf.writeDoubleBE(v.y);
  },

  parseText(v: string): Maybe<Point> {
    const m = v.match(POINT_PATTERN1) || v.match(POINT_PATTERN2);
    if (!m) return undefined;
    return {
      x: parseFloat(m[1]),
      y: parseFloat(m[2]),
    };
  },

  isType(v: any): boolean {
    return typeof v === 'object' && Object.keys(v).length === 2 && typeof v.x === 'number' && typeof v.y === 'number';
  },
};

export const ArrayPointType: DataType = {
  ...PointType,
  name: '_point',
  oid: DataTypeOIDs._point,
  elementsOID: DataTypeOIDs.point,
};
