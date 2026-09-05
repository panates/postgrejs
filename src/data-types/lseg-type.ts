import { DataTypeOIDs } from '../constants.js';
import type { DataMappingOptions } from '../interfaces/data-mapping-options.js';
import type { DataType, Rectangle } from '../interfaces/data-type.js';
import type { SmartBuffer } from '../protocol/smart-buffer.js';
import type { Maybe } from '../types.js';

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
  jsType: 'object',
  fixedBinarySize: 32,

  parseBinary(v: Buffer, offset: number = 0): Rectangle {
    return {
      x1: v.readDoubleBE(offset),
      y1: v.readDoubleBE(offset + 8),
      x2: v.readDoubleBE(offset + 16),
      y2: v.readDoubleBE(offset + 24),
    };
  },

  encodeBinary(buf: SmartBuffer, v: Rectangle): void {
    buf.writeDoubleBE(v.x1);
    buf.writeDoubleBE(v.y1);
    buf.writeDoubleBE(v.x2);
    buf.writeDoubleBE(v.y2);
  },

  parseText(v: string): Maybe<Rectangle> {
    const m =
      v.match(LSEG_PATTERN1) ||
      v.match(LSEG_PATTERN2) ||
      v.match(LSEG_PATTERN3) ||
      v.match(LSEG_PATTERN4);
    if (!m) return undefined;
    return {
      x1: parseFloat(m[1]),
      y1: parseFloat(m[2]),
      x2: parseFloat(m[3]),
      y2: parseFloat(m[4]),
    };
  },

  // See box-type.ts's parseTextBuffer comment - same rationale.
  parseTextBuffer(
    buf: Buffer,
    offset: number,
    len: number,
    options: DataMappingOptions,
  ): Maybe<Rectangle> {
    return LsegType.parseText(
      buf.toString('latin1', offset, offset + len),
      options,
    );
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
