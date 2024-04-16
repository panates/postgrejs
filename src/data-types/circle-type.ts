import { DataTypeOIDs } from '../constants.js';
import type { Circle, DataType } from '../interfaces/data-type.js';
import type { SmartBuffer } from '../protocol/smart-buffer.js';
import type { Maybe } from '../types.js';

const CIRCLE_PATTERN1 = /^< *\( *(-?\d+\.?\d*) *, *(-?\d+\.?\d*) *\) *, *(-?\d+\.?\d*) *>$/;
const CIRCLE_PATTERN2 = /^\( *\( *(-?\d+\.?\d*) *, *(-?\d+\.?\d*) *\) *, *(-?\d+\.?\d*) *\)$/;
const CIRCLE_PATTERN3 = /^\( *(-?\d+\.?\d*) *, *(-?\d+\.?\d*) *\) *, *(-?\d+\.?\d*)$/;
const CIRCLE_PATTERN4 = /^(-?\d+\.?\d*) *, *(-?\d+\.?\d*) *, *(-?\d+\.?\d*)$/;

export const CircleType: DataType = {
  name: 'circle',
  oid: DataTypeOIDs.circle,
  jsType: 'object',

  parseBinary(v: Buffer): Circle {
    return {
      x: v.readDoubleBE(0),
      y: v.readDoubleBE(8),
      r: v.readDoubleBE(16),
    } as Circle;
  },

  encodeBinary(buf: SmartBuffer, v: Circle): void {
    buf.writeDoubleBE(v.x);
    buf.writeDoubleBE(v.y);
    buf.writeDoubleBE(v.r);
  },

  parseText(v: string): Maybe<Circle> {
    const m =
      v.match(CIRCLE_PATTERN1) || v.match(CIRCLE_PATTERN2) || v.match(CIRCLE_PATTERN3) || v.match(CIRCLE_PATTERN4);
    if (!m) return undefined;
    return {
      x: parseFloat(m[1]),
      y: parseFloat(m[2]),
      r: parseFloat(m[3]),
    } as Circle;
  },

  isType(v: any): boolean {
    return (
      typeof v === 'object' &&
      Object.keys(v).length === 3 &&
      typeof v.x === 'number' &&
      typeof v.y === 'number' &&
      typeof v.r === 'number'
    );
  },
};

export const ArrayCircleType: DataType = {
  ...CircleType,
  name: '_circle',
  oid: DataTypeOIDs._circle,
  elementsOID: DataTypeOIDs.circle,
};
