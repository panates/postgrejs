import { DataTypeOIDs } from '../constants.js';
import type { DataMappingOptions } from '../interfaces/data-mapping-options.js';
import type { DataType } from '../interfaces/data-type.js';
import type { SmartBuffer } from '../protocol/smart-buffer.js';
import type { Maybe } from '../types.js';
import { LineSegment, TwoPoints } from './classes/geometric.js';

const LSEG_PATTERN1 =
  /^\[ *\( *(-?\d+\.?\d*) *, *(-?\d+\.?\d*) *\) *, *\( *(-?\d+\.?\d*) *, *(-?\d+\.?\d*) *\) *]$/;
const LSEG_PATTERN2 =
  /^\( *\( *(-?\d+\.?\d*) *, *(-?\d+\.?\d*) *\) *, *\( *(-?\d+\.?\d*) *, *(-?\d+\.?\d*) *\) *\)$/;
const LSEG_PATTERN3 =
  /^\( *(-?\d+\.?\d*) *, *(-?\d+\.?\d*) *\) *, *\( *(-?\d+\.?\d*) *, *(-?\d+\.?\d*) *\)$/;
const LSEG_PATTERN4 =
  /^(-?\d+\.?\d*) *, *(-?\d+\.?\d*) *, *(-?\d+\.?\d*) *, *(-?\d+\.?\d*)$/;

export const LsegType: DataType = {
  name: 'lseg',
  oid: DataTypeOIDs.lseg,
  jsType: 'LineSegment',

  encodeText(v: LineSegment): string {
    return `[(${v.x1},${v.y1}),(${v.x2},${v.y2})]`;
  },

  encodeBinary(buf: SmartBuffer, v: LineSegment): void {
    buf.writeDoubleBE(v.x1);
    buf.writeDoubleBE(v.y1);
    buf.writeDoubleBE(v.x2);
    buf.writeDoubleBE(v.y2);
  },

  decodeBinary(v: Buffer, offset: number = 0): LineSegment {
    return new LineSegment(
      v.readDoubleBE(offset),
      v.readDoubleBE(offset + 8),
      v.readDoubleBE(offset + 16),
      v.readDoubleBE(offset + 24),
    );
  },

  decodeText(v: string): Maybe<LineSegment> {
    const m =
      v.match(LSEG_PATTERN1) ||
      v.match(LSEG_PATTERN2) ||
      v.match(LSEG_PATTERN3) ||
      v.match(LSEG_PATTERN4);
    if (!m) return undefined;
    return new LineSegment(
      parseFloat(m[1]),
      parseFloat(m[2]),
      parseFloat(m[3]),
      parseFloat(m[4]),
    );
  },

  // See box-type.ts's decodeTextBuffer comment - same rationale.
  decodeTextBuffer(
    buf: Buffer,
    offset: number,
    len: number,
    options: DataMappingOptions,
  ): Maybe<LineSegment> {
    return LsegType.decodeText(
      buf.toString('latin1', offset, offset + len),
      options,
    );
  },

  // A plain object of the four numbers is still accepted - it is what
  // this type returned before these classes existed - but only a plain
  // one: box and lseg carry the same four, so an instance of the other
  // must not be claimed here.
  isType(v: any): boolean {
    return v instanceof LineSegment || TwoPoints.isTwoPointsLike(v);
  },
};

export const ArrayLsegType: DataType = {
  ...LsegType,
  name: '_lseg',
  oid: DataTypeOIDs._lseg,
  elementsOID: DataTypeOIDs.lseg,
};
