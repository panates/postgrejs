import { DataFormat } from '../constants.js';
import type { DataTypeMap } from '../data-type-map.js';
import type { Protocol } from '../protocol/protocol.js';
import type { AnyParseFunction } from '../types.js';
import { decodeBinaryArray } from './decode-binaryarray.js';
import { parsePostgresArray } from './parse-array.js';

// data is the ENTIRE row's raw buffer (see parse-row.ts) - offset/len
// locate this column's own value within it, so both defaults still need
// to bound themselves instead of assuming data starts at their own value.
const DefaultColumnParser: AnyParseFunction = (data, offset, len) =>
  data.subarray(offset, offset + len);
// Text-format columns need the UTF-8 conversion binary-format columns
// don't, to preserve returning a string for a column with no registered
// decodeText, same as before this row-buffer change - just bounded via
// toString's own start/end args now instead of a pre-sliced buffer.
const DefaultTextColumnParser: AnyParseFunction = (data, offset, len) =>
  data.toString('utf8', offset, offset + len);

export function getParsers(
  typeMap: DataTypeMap,
  fields: Protocol.RowDescription[],
): AnyParseFunction[] {
  const parsers: AnyParseFunction[] = new Array(fields.length);
  const l = fields.length;
  let f: Protocol.RowDescription;
  let i;
  for (i = 0; i < l; i++) {
    f = fields[i];
    const dataTypeReg = typeMap.get(f.dataTypeId);
    if (dataTypeReg) {
      const isArray = !!dataTypeReg.elementsOID;
      if (f.format === DataFormat.binary) {
        const decode = dataTypeReg.decodeBinary;
        if (decode) {
          if (isArray) {
            // Arrays are always self-terminating from their own ndims/
            // dims/per-element length prefixes (decodeBinaryArray never
            // needs an external end bound) regardless of whether the
            // ELEMENT type itself has a fixedBinarySize - never needs a
            // bounded slice of `data`.
            parsers[i] = (data, offset, len, options) =>
              decodeBinaryArray(
                data,
                offset,
                decode,
                options,
                dataTypeReg.fixedBinarySize,
              );
          } else if (dataTypeReg.fixedBinarySize != null) {
            // Fixed-width scalar (int2/int4/int8/oid/float4/float8/bool/
            // uuid/date/time/timestamp/timestamptz/box/circle/lseg/point):
            // decode reads exactly its own known width directly out of
            // the shared row buffer - no slice needed. Guarded by a
            // cross-check against the wire's own length prefix: for a
            // correctly-declared fixed-width type this is always true
            // (PostgreSQL's binary format guarantees that exact width),
            // so the comparison costs one always-predicted branch and the
            // fallback slice below never actually allocates in practice -
            // but if a type ever gets a wrong or mismatched fixedBinarySize
            // (a built-in typo, or a user-registered custom DataType),
            // this falls back to the safe bounded-slice path instead of
            // silently decoding past this column's true end into the rest
            // of the row's raw bytes.
            const fixedSize = dataTypeReg.fixedBinarySize;
            parsers[i] = (data, offset, len, options) =>
              len === fixedSize
                ? decode(data, offset, options)
                : decode(data.subarray(offset, offset + len), 0, options);
          } else {
            // CRITICAL: genuinely variable-width binary types (bytea,
            // json, jsonb, numeric, char, varchar, int2vector, and any
            // custom type without fixedBinarySize) have no way to find
            // their own value's end - bytea's decodeBinary reads to the
            // end of whatever buffer it's given, json/jsonb/varchar/char
            // use buf.toString('utf8', offset) with no end argument. They
            // MUST get a bounded slice here, or they will silently read
            // into the next column's bytes instead of throwing.
            parsers[i] = (data, offset, len, options) =>
              decode(data.subarray(offset, offset + len), 0, options);
          }
        }
      } else if (f.format === DataFormat.text) {
        const parse = dataTypeReg.decodeText;
        if (parse) {
          const parseBuffer = dataTypeReg.decodeTextBuffer;
          if (!isArray && parseBuffer) {
            // Fast path (int2/int4/oid/int8 today): decodeTextBuffer
            // implementations take an explicit offset/len (unlike
            // DecodeBinaryFunction, a text value has no constant byte
            // width) and read straight out of the shared row buffer - no
            // Buffer.subarray() needed, same technique as the fixed-width
            // binary path above.
            parsers[i] = (data, offset, len, options) =>
              parseBuffer(data, offset, len, options);
          } else if (!isArray) {
            // Buffer.prototype.toString(enc, start, end) takes bounds
            // directly - never needs a subarray at all (a real, new win
            // beyond the old per-column-sliced-buffer behavior).
            parsers[i] = (data, offset, len, options) =>
              parse(data.toString('utf8', offset, offset + len), options);
          } else {
            // Array literals ("{1,2,3}") need the full text for bracket/
            // separator parsing regardless of the element type's own fast
            // path, so this always goes through the string route.
            parsers[i] = (data, offset, len, options) =>
              parsePostgresArray(data.toString('utf8', offset, offset + len), {
                transform: x => parse(x, options),
                separator: dataTypeReg.arraySeparator,
              });
          }
        }
      }
    }
    parsers[i] =
      parsers[i] ||
      (f.format === DataFormat.text
        ? DefaultTextColumnParser
        : DefaultColumnParser);
  }
  return parsers;
}
