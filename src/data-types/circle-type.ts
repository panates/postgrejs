import { DataTypeOIDs } from '../constants.js';
import type { DataMappingOptions } from '../interfaces/data-mapping-options.js';
import type { DataType } from '../interfaces/data-type.js';
import type { SmartBuffer } from '../protocol/smart-buffer.js';
import type { Maybe } from '../types.js';
import { Circle } from './classes/geometric.js';

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
  jsType: 'Circle',

  encodeText(v: Circle): string {
    return `<(${v.x},${v.y}),${v.r}>`;
  },

  encodeBinary(buf: SmartBuffer, v: Circle): void {
    buf.writeDoubleBE(v.x);
    buf.writeDoubleBE(v.y);
    buf.writeDoubleBE(v.r);
  },

  decodeBinary(v: Buffer, offset: number = 0): Circle {
    return new Circle(
      v.readDoubleBE(offset),
      v.readDoubleBE(offset + 8),
      v.readDoubleBE(offset + 16),
    );
  },

  decodeText(v: string): Maybe<Circle> {
    const m =
      v.match(CIRCLE_PATTERN1) ||
      v.match(CIRCLE_PATTERN2) ||
      v.match(CIRCLE_PATTERN3) ||
      v.match(CIRCLE_PATTERN4);
    if (!m) return undefined;
    return new Circle(parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]));
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

  // See point-type.ts: the plain object shape is still accepted.
  isType(v: any): boolean {
    return v instanceof Circle || Circle.isCircleLike(v);
  },
};

export const ArrayCircleType: DataType = {
  ...CircleType,
  name: '_circle',
  oid: DataTypeOIDs._circle,
  elementsOID: DataTypeOIDs.circle,
};
