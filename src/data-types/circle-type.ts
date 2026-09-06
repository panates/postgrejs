import { DataTypeOIDs } from '../constants.js';
import type { DataMappingOptions } from '../interfaces/data-mapping-options.js';
import type { Circle, DataType } from '../interfaces/data-type.js';
import type { SmartBuffer } from '../protocol/smart-buffer.js';
import type { Maybe } from '../types.js';

const CIRCLE_PATTERN1 =
  /^< *\( *(-?\d+\.?\d*) *, *(-?\d+\.?\d*) *\) *, *(-?\d+\.?\d*) *>$/;
const CIRCLE_PATTERN2 =
  /^\( *\( *(-?\d+\.?\d*) *, *(-?\d+\.?\d*) *\) *, *(-?\d+\.?\d*) *\)$/;
const CIRCLE_PATTERN3 =
  /^\( *(-?\d+\.?\d*) *, *(-?\d+\.?\d*) *\) *, *(-?\d+\.?\d*)$/;
const CIRCLE_PATTERN4 = /^(-?\d+\.?\d*) *, *(-?\d+\.?\d*) *, *(-?\d+\.?\d*)$/;

export const CircleType: DataType = {
  name: 'circle',
  oid: DataTypeOIDs.circle,
  jsType: 'object',
  fixedBinarySize: 24,

  decodeBinary(v: Buffer, offset: number = 0): Circle {
    return {
      x: v.readDoubleBE(offset),
      y: v.readDoubleBE(offset + 8),
      r: v.readDoubleBE(offset + 16),
    } as Circle;
  },

  encodeBinary(buf: SmartBuffer, v: Circle): void {
    buf.writeDoubleBE(v.x);
    buf.writeDoubleBE(v.y);
    buf.writeDoubleBE(v.r);
  },

  decodeText(v: string): Maybe<Circle> {
    const m =
      v.match(CIRCLE_PATTERN1) ||
      v.match(CIRCLE_PATTERN2) ||
      v.match(CIRCLE_PATTERN3) ||
      v.match(CIRCLE_PATTERN4);
    if (!m) return undefined;
    return {
      x: parseFloat(m[1]),
      y: parseFloat(m[2]),
      r: parseFloat(m[3]),
    } as Circle;
  },

  // See box-type.ts's decodeTextBuffer comment - same rationale.
  decodeTextBuffer(
    buf: Buffer,
    offset: number,
    len: number,
    options: DataMappingOptions,
  ): Maybe<Circle> {
    return CircleType.decodeText(
      buf.toString('latin1', offset, offset + len),
      options,
    );
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
