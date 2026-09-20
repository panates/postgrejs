import { DataTypeOIDs } from '../constants.js';
import type { DataMappingOptions } from '../interfaces/data-mapping-options.js';
import type { DataType } from '../interfaces/data-type.js';
import type { SmartBuffer } from '../protocol/smart-buffer.js';
import type { Maybe } from '../types.js';
import { Line } from './classes/geometric.js';

const LINE_PATTERN =
  /^\{ *(-?[\d.]+(?:e[-+]?\d+)?) *, *(-?[\d.]+(?:e[-+]?\d+)?) *, *(-?[\d.]+(?:e[-+]?\d+)?) *\}$/i;

export const LineType: DataType = {
  name: 'line',
  oid: DataTypeOIDs.line,
  jsType: 'Line',

  encodeText(v: Line): string {
    return `{${v.a},${v.b},${v.c}}`;
  },

  /** Three float8s: the A, B and C of Ax + By + C = 0. */
  encodeBinary(buf: SmartBuffer, v: Line): void {
    buf.writeDoubleBE(v.a);
    buf.writeDoubleBE(v.b);
    buf.writeDoubleBE(v.c);
  },

  decodeBinary(v: Buffer, offset: number = 0): Line {
    return new Line(
      v.readDoubleBE(offset),
      v.readDoubleBE(offset + 8),
      v.readDoubleBE(offset + 16),
    );
  },

  decodeText(v: string): Maybe<Line> {
    const m = v.match(LINE_PATTERN);
    if (!m) return undefined;
    return new Line(parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]));
  },

  // See box-type.ts's decodeTextBuffer comment - same rationale.
  decodeTextBuffer(
    buf: Buffer,
    offset: number,
    len: number,
    options: DataMappingOptions,
  ): Maybe<Line> {
    return LineType.decodeText(
      buf.toString('latin1', offset, offset + len),
      options,
    );
  },

  // A plain `{a, b, c}` is accepted for the same reason `{x, y}` is by
  // point - see point-type.ts.
  isType(v: any): boolean {
    return v instanceof Line || Line.isLineLike(v);
  },
};

export const ArrayLineType: DataType = {
  ...LineType,
  name: '_line',
  oid: DataTypeOIDs._line,
  elementsOID: DataTypeOIDs.line,
};
