import { DataTypeOIDs } from '../constants.js';
import type { DataMappingOptions } from '../interfaces/data-mapping-options.js';
import type { DataType } from '../interfaces/data-type.js';
import type { SmartBuffer } from '../protocol/smart-buffer.js';
import type { Maybe } from '../types.js';
import { Box, TwoPoints } from './classes/geometric.js';

const BOX_PATTERN1 =
  /^\( *\( *(-?\d+\.?\d*) *, *(-?\d+\.?\d*) *\) *, *\( *(-?\d+\.?\d*) *, *(-?\d+\.?\d*) *\) *\)$/;
const BOX_PATTERN2 =
  /^\( *(-?\d+\.?\d*) *, *(-?\d+\.?\d*) *\) *, *\( *(-?\d+\.?\d*) *, *(-?\d+\.?\d*) *\)$/;
const BOX_PATTERN3 =
  /^(-?\d+\.?\d*) *, *(-?\d+\.?\d*) *, *(-?\d+\.?\d*) *, *(-?\d+\.?\d*)$/;

export const BoxType: DataType = {
  name: 'box',
  oid: DataTypeOIDs.box,
  jsType: 'Box',
  arraySeparator: ';',

  encodeText(v: Box): string {
    return `(${v.x1},${v.y1}),(${v.x2},${v.y2})`;
  },

  encodeBinary(buf: SmartBuffer, v: Box): void {
    buf.writeDoubleBE(v.x1);
    buf.writeDoubleBE(v.y1);
    buf.writeDoubleBE(v.x2);
    buf.writeDoubleBE(v.y2);
  },

  decodeBinary(v: Buffer, offset: number = 0): Box {
    return new Box(
      v.readDoubleBE(offset),
      v.readDoubleBE(offset + 8),
      v.readDoubleBE(offset + 16),
      v.readDoubleBE(offset + 24),
    );
  },

  decodeText(v: string): Maybe<Box> {
    const m =
      v.match(BOX_PATTERN1) || v.match(BOX_PATTERN2) || v.match(BOX_PATTERN3);
    if (!m) return undefined;
    return new Box(
      parseFloat(m[1]),
      parseFloat(m[2]),
      parseFloat(m[3]),
      parseFloat(m[4]),
    );
  },

  decodeTextBuffer(
    buf: Buffer,
    offset: number,
    len: number,
    options: DataMappingOptions,
  ): Maybe<Box> {
    return BoxType.decodeText(
      buf.toString('latin1', offset, offset + len),
      options,
    );
  },

  // A plain object of the four numbers is still accepted - it is what
  // this type returned before these classes existed - but only a plain
  // one: box and lseg carry the same four, so an instance of the other
  // must not be claimed here.
  isType(v: any): boolean {
    return v instanceof Box || TwoPoints.isTwoPointsLike(v);
  },
};

export const ArrayBoxType: DataType = {
  ...BoxType,
  name: '_box',
  oid: DataTypeOIDs._box,
  elementsOID: DataTypeOIDs.box,
};
