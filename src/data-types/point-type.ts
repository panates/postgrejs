import { DataTypeOIDs } from '../constants.js';
import type { DataMappingOptions } from '../interfaces/data-mapping-options.js';
import type { DataType, Point } from '../interfaces/data-type.js';
import type { SmartBuffer } from '../protocol/smart-buffer.js';
import type { Maybe } from '../types.js';

const POINT_PATTERN1 = /^\( *(-?\d+\.?\d*) *, *(-?\d+\.?\d*) *\)$/;
const POINT_PATTERN2 = /^(-?\d+\.?\d*) *, *(-?\d+\.?\d*)$/;

export const PointType: DataType = {
  name: 'point',
  oid: DataTypeOIDs.point,
  jsType: 'object',
  fixedBinarySize: 16,

  decodeBinary(v: Buffer, offset: number = 0): Point {
    return {
      x: v.readDoubleBE(offset),
      y: v.readDoubleBE(offset + 8),
    };
  },

  encodeBinary(buf: SmartBuffer, v: Point): void {
    buf.writeDoubleBE(v.x);
    buf.writeDoubleBE(v.y);
  },

  decodeText(v: string): Maybe<Point> {
    const m = v.match(POINT_PATTERN1) || v.match(POINT_PATTERN2);
    if (!m) return undefined;
    return {
      x: parseFloat(m[1]),
      y: parseFloat(m[2]),
    };
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

  isType(v: any): boolean {
    return (
      typeof v === 'object' &&
      Object.keys(v).length === 2 &&
      typeof v.x === 'number' &&
      typeof v.y === 'number'
    );
  },
};

export const ArrayPointType: DataType = {
  ...PointType,
  name: '_point',
  oid: DataTypeOIDs._point,
  elementsOID: DataTypeOIDs.point,
};
