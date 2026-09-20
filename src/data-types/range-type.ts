import { DataTypeOIDs } from '../constants.js';
import type { DataMappingOptions } from '../interfaces/data-mapping-options.js';
import type { DataType } from '../interfaces/data-type.js';
import type { SmartBuffer } from '../protocol/smart-buffer.js';
import type { OID } from '../types.js';
import { Range, type RangeBounds } from './classes/range.js';
import { setTypeOid } from './classes/type-oid.js';
import { DateType } from './date-type.js';
import { Int4Type } from './int4-type.js';
import { Int8Type } from './int8-type.js';
import { NumericType } from './numeric-type.js';
import { TimestampType } from './timestamp-type.js';
import { TimestamptzType } from './timestamptz-type.js';

// src/include/utils/rangetypes.h
const RANGE_EMPTY = 0x01;
const RANGE_LB_INC = 0x02;
const RANGE_UB_INC = 0x04;
const RANGE_LB_INF = 0x08;
const RANGE_UB_INF = 0x10;

/** `empty`, or two bounds with the brackets that say whether each is included. */
const RANGE_PATTERN = /^\s*([[(])(.*),(.*)([\])])\s*$/s;

function boundsOf(r: Range): RangeBounds {
  return ((r.lowerInclusive && r.lower !== null ? '[' : '(') +
    (r.upperInclusive && r.upper !== null ? ']' : ')')) as RangeBounds;
}

/**
 * Reads one bound out of a range literal. An empty string is an absent
 * bound; a quoted one has its doubled quotes and backslashes put back.
 */
function parseBound(
  s: string,
  decode: (v: string, options: DataMappingOptions) => any,
  options: DataMappingOptions,
): any {
  const t = s.trim();
  if (t === '') return null;
  if (t.charAt(0) === '"') {
    let out = '';
    let i = 1;
    while (i < t.length) {
      const c = t.charAt(i);
      if (c === '\\') {
        out += t.charAt(i + 1);
        i += 2;
        continue;
      }
      if (c === '"') {
        // A doubled quote is one quote; a single one ends the bound.
        if (t.charAt(i + 1) === '"') {
          out += '"';
          i += 2;
          continue;
        }
        break;
      }
      out += c;
      i++;
    }
    return decode(out, options);
  }
  return decode(t, options);
}

function toRange(v: any): Range {
  if (v instanceof Range) return v;
  if (Array.isArray(v)) return new Range(v[0] ?? null, v[1] ?? null);
  throw new TypeError(
    `"${typeof v}" cannot be encoded as a range - pass a Range, or a ` +
      '[lower, upper] pair',
  );
}

/**
 * Builds the DataType pair for one of PostgreSQL's range types.
 *
 * Every range shares one wire format regardless of what it ranges over -
 * a flags byte, then each bound that exists as a length-prefixed value of
 * the element type - so the element's own codec does the work and this
 * only has to say which bounds are there.
 *
 * Note what is deliberately not set: `elementsOID`. That marks an *array*
 * type, and get-parsers.ts routes anything carrying it through
 * decodeBinaryArray. A range is a scalar whose parts happen to be typed.
 */
export function createRangeType(
  name: string,
  oid: OID,
  element: DataType,
): DataType {
  return {
    name,
    oid,
    jsType: 'Range',

    decodeBinary(
      v: Buffer,
      offset: number = 0,
      _len: number,
      options: DataMappingOptions,
    ): Range {
      const flags = v[offset];
      // Stamped with the type it came from, so it can go back as that
      // type without being named again - which nothing about a Range
      // could otherwise tell.
      if (flags & RANGE_EMPTY) return Range.empty(oid);
      let p = offset + 1;
      let lower: any = null;
      let upper: any = null;
      let l: number;
      if (!(flags & RANGE_LB_INF)) {
        l = v.readInt32BE(p);
        p += 4;
        lower = element.decodeBinary(v, p, l, options);
        p += l;
      }
      if (!(flags & RANGE_UB_INF)) {
        l = v.readInt32BE(p);
        p += 4;
        upper = element.decodeBinary(v, p, l, options);
      }
      return new Range(
        lower,
        upper,
        ((flags & RANGE_LB_INC ? '[' : '(') +
          (flags & RANGE_UB_INC ? ']' : ')')) as RangeBounds,
        oid,
      );
    },

    encodeBinary(buf: SmartBuffer, v: any, options: DataMappingOptions): void {
      const r = toRange(v);
      if (r.isEmpty) {
        buf.writeUInt8(RANGE_EMPTY);
        return;
      }
      let flags = 0;
      if (r.lower === null) flags |= RANGE_LB_INF;
      else if (r.lowerInclusive) flags |= RANGE_LB_INC;
      if (r.upper === null) flags |= RANGE_UB_INF;
      else if (r.upperInclusive) flags |= RANGE_UB_INC;
      buf.writeUInt8(flags);
      let pos: number;
      if (r.lower !== null) {
        buf.writeInt32BE(0); // reserved for the bound's length
        pos = buf.position;
        element.encodeBinary!(buf, r.lower, options);
        buf.buffer.writeInt32BE(buf.size - pos, pos - 4);
      }
      if (r.upper !== null) {
        buf.writeInt32BE(0);
        pos = buf.position;
        element.encodeBinary!(buf, r.upper, options);
        buf.buffer.writeInt32BE(buf.size - pos, pos - 4);
      }
    },

    decodeText(v: string, options: DataMappingOptions): Range {
      if (v.trim() === 'empty') return Range.empty(oid);
      const m = RANGE_PATTERN.exec(v);
      if (!m) throw new Error(`"${v}" is not a ${name} literal`);
      return new Range(
        parseBound(m[2], element.decodeText, options),
        parseBound(m[3], element.decodeText, options),
        (m[1] + m[4]) as RangeBounds,
        oid,
      );
    },

    encodeText(v: any, options: DataMappingOptions): string {
      const r = toRange(v);
      if (r.isEmpty) return 'empty';
      // Rendered through the element's own encodeText rather than
      // Range.toString(), which has no element type to ask and falls back
      // on String() - the difference shows on a Date bound.
      const render = (x: any) =>
        x === null
          ? ''
          : quote(
              element.encodeText ? element.encodeText(x, options) : String(x),
            );
      const bounds = boundsOf(r);
      return (
        bounds.charAt(0) +
        render(r.lower) +
        ',' +
        render(r.upper) +
        bounds.charAt(1)
      );
    },

    isType(v: any): boolean {
      return v instanceof Range;
    },
    // Every one of the six range types answers `instanceof Range` for the
    // same value, and nothing about a Range says which it is - bounds of
    // numbers fit int4range, int8range and numrange alike, Dates fit
    // daterange, tsrange and tstzrange. So determine() would pick
    // whichever was registered first and send an int4range as a
    // tstzrange, which is what it did before this line: `new Range(1, 10)`
    // arrived as `[1970-01-01T00:00:00.001Z,...)`. Ask for the one you
    // mean with `new BindParam(DataTypeOIDs.int4range, value)`.
    inferrable: false,
  };
}

function quote(s: string): string {
  if (s === '' || /["\\()[\],]|\s/.test(s))
    return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '""') + '"';
  return s;
}

/**
 * The multirange counterpart: a count, then each range length-prefixed,
 * and in text a brace-wrapped comma-separated list. The ranges themselves
 * are the same format, so this delegates to the range type rather than
 * repeating it.
 */
export function createMultiRangeType(
  name: string,
  oid: OID,
  range: DataType,
): DataType {
  return {
    name,
    oid,
    jsType: 'Range[]',

    decodeBinary(
      v: Buffer,
      offset: number = 0,
      _len: number,
      options: DataMappingOptions,
    ): Range[] {
      const count = v.readInt32BE(offset);
      let p = offset + 4;
      const out: Range[] = new Array(count);
      let l: number;
      let i: number;
      for (i = 0; i < count; i++) {
        l = v.readInt32BE(p);
        p += 4;
        out[i] = range.decodeBinary(v, p, l, options);
        p += l;
      }
      // The array carries the multirange's own OID; its elements already
      // carry the range type's.
      return setTypeOid(out, oid);
    },

    encodeBinary(buf: SmartBuffer, v: any, options: DataMappingOptions): void {
      const items: any[] = Array.isArray(v) ? v : [v];
      buf.writeInt32BE(items.length);
      let pos: number;
      let i: number;
      for (i = 0; i < items.length; i++) {
        buf.writeInt32BE(0); // reserved for this range's length
        pos = buf.position;
        range.encodeBinary!(buf, items[i], options);
        buf.buffer.writeInt32BE(buf.size - pos, pos - 4);
      }
    },

    decodeText(v: string, options: DataMappingOptions): Range[] {
      const s = v.trim();
      if (!s.startsWith('{') || !s.endsWith('}'))
        throw new Error(`"${v}" is not a ${name} literal`);
      const body = s.substring(1, s.length - 1).trim();
      if (!body) return setTypeOid([], oid);
      // Ranges are split on the comma that follows a closing bracket, so
      // the comma between a range's own two bounds is left alone.
      const out: Range[] = [];
      let depth = 0;
      let start = 0;
      let quoted = false;
      let i: number;
      let c: string;
      for (i = 0; i < body.length; i++) {
        c = body.charAt(i);
        if (quoted) {
          if (c === '\\') i++;
          else if (c === '"') quoted = false;
          continue;
        }
        if (c === '"') quoted = true;
        else if (c === '[' || c === '(') depth++;
        else if (c === ']' || c === ')') depth--;
        else if (c === ',' && depth === 0) {
          out.push(range.decodeText(body.substring(start, i), options));
          start = i + 1;
        }
      }
      out.push(range.decodeText(body.substring(start), options));
      return setTypeOid(out, oid);
    },

    encodeText(v: any, options: DataMappingOptions): string {
      const items: any[] = Array.isArray(v) ? v : [v];
      return (
        '{' + items.map(x => range.encodeText!(x, options)).join(',') + '}'
      );
    },

    isType(v: any): boolean {
      return (
        Array.isArray(v) && v.length > 0 && v.every(x => x instanceof Range)
      );
    },
    // An array of Ranges is also what a `Range[]` column decodes to, so
    // leaving this to inference would make the two indistinguishable for
    // an untyped parameter. Ask for it with BindParam when you mean it.
    inferrable: false,
  };
}

/**
 * The six range types PostgreSQL ships, their multirange counterparts and
 * the array form of each - twelve scalar types over one format, which is
 * why they are built here rather than written out one file at a time.
 */
const BUILT_IN: [string, OID, OID, OID, OID, OID, DataType][] = [
  [
    'int4range',
    DataTypeOIDs.int4range,
    DataTypeOIDs._int4range,
    DataTypeOIDs.int4multirange,
    DataTypeOIDs._int4multirange,
    DataTypeOIDs.int4,
    Int4Type,
  ],
  [
    'int8range',
    DataTypeOIDs.int8range,
    DataTypeOIDs._int8range,
    DataTypeOIDs.int8multirange,
    DataTypeOIDs._int8multirange,
    DataTypeOIDs.int8,
    Int8Type,
  ],
  [
    'numrange',
    DataTypeOIDs.numrange,
    DataTypeOIDs._numrange,
    DataTypeOIDs.nummultirange,
    DataTypeOIDs._nummultirange,
    DataTypeOIDs.numeric,
    NumericType,
  ],
  [
    'daterange',
    DataTypeOIDs.daterange,
    DataTypeOIDs._daterange,
    DataTypeOIDs.datemultirange,
    DataTypeOIDs._datemultirange,
    DataTypeOIDs.date,
    DateType,
  ],
  [
    'tsrange',
    DataTypeOIDs.tsrange,
    DataTypeOIDs._tsrange,
    DataTypeOIDs.tsmultirange,
    DataTypeOIDs._tsmultirange,
    DataTypeOIDs.timestamp,
    TimestampType,
  ],
  [
    'tstzrange',
    DataTypeOIDs.tstzrange,
    DataTypeOIDs._tstzrange,
    DataTypeOIDs.tstzmultirange,
    DataTypeOIDs._tstzmultirange,
    DataTypeOIDs.timestamptz,
    TimestamptzType,
  ],
];

export const RangeTypes: DataType[] = [];
for (const [
  name,
  oid,
  arrayOid,
  multiOid,
  multiArrayOid,
  ,
  element,
] of BUILT_IN) {
  const rangeType = createRangeType(name, oid, element);
  const multiName = name.replace('range', 'multirange');
  const multiType = createMultiRangeType(multiName, multiOid, rangeType);
  RangeTypes.push(
    rangeType,
    { ...rangeType, name: '_' + name, oid: arrayOid, elementsOID: oid },
    multiType,
    {
      ...multiType,
      name: '_' + multiName,
      oid: multiArrayOid,
      elementsOID: multiOid,
    },
  );
}
