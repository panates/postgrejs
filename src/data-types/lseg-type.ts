import { DataTypeOIDs } from '../constants.js';
import type { DataType, Rectangle } from '../interfaces/data-type.js';
import type { SmartBuffer } from '../protocol/smart-buffer.js';
import type { Maybe } from '../types.js';

const LSEG_PATTERN1 = /^\[ *\( *(-?\d+\.?\d*) *, *(-?\d+\.?\d*) *\) *, *\( *(-?\d+\.?\d*) *, *(-?\d+\.?\d*) *\) *]$/;
const LSEG_PATTERN2 = /^\( *\( *(-?\d+\.?\d*) *, *(-?\d+\.?\d*) *\) *, *\( *(-?\d+\.?\d*) *, *(-?\d+\.?\d*) *\) *\)$/;
const LSEG_PATTERN3 = /^\( *(-?\d+\.?\d*) *, *(-?\d+\.?\d*) *\) *, *\( *(-?\d+\.?\d*) *, *(-?\d+\.?\d*) *\)$/;
const LSEG_PATTERN4 = /^(-?\d+\.?\d*) *, *(-?\d+\.?\d*) *, *(-?\d+\.?\d*) *, *(-?\d+\.?\d*)$/;

export const LsegType: DataType = {
  name: 'lseg',
  oid: DataTypeOIDs.lseg,
  jsType: 'object',

  parseBinary(v: Buffer): Rectangle {
    return {
      x1: v.readDoubleBE(0),
      y1: v.readDoubleBE(8),
      x2: v.readDoubleBE(16),
      y2: v.readDoubleBE(24),
    };
  },

  encodeBinary(buf: SmartBuffer, v: Rectangle): void {
    buf.writeDoubleBE(v.x1);
    buf.writeDoubleBE(v.y1);
    buf.writeDoubleBE(v.x2);
    buf.writeDoubleBE(v.y2);
  },

  parseText(v: string): Maybe<Rectangle> {
    const m = v.match(LSEG_PATTERN1) || v.match(LSEG_PATTERN2) || v.match(LSEG_PATTERN3) || v.match(LSEG_PATTERN4);
    if (!m) return undefined;
    return {
      x1: parseFloat(m[1]),
      y1: parseFloat(m[2]),
      x2: parseFloat(m[3]),
      y2: parseFloat(m[4]),
    };
  },

  isType(v: any): boolean {
    return (
      typeof v === 'object' &&
      Object.keys(v).length === 4 &&
      typeof v.x1 === 'number' &&
      typeof v.y1 === 'number' &&
      typeof v.x2 === 'number' &&
      typeof v.y2 === 'number'
    );
  },
};

export const ArrayLsegType: DataType = {
  ...LsegType,
  name: '_lseg',
  oid: DataTypeOIDs._lseg,
  elementsOID: DataTypeOIDs.lseg,
};
