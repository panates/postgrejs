import { DataFormat } from '../constants.js';
import type { DataTypeMap } from '../data-type-map.js';
import type { Protocol } from '../protocol/protocol.js';
import type { AnyParseFunction } from '../types.js';
import { decodeBinaryArray } from './decode-binaryarray.js';
import { parsePostgresArray } from './parse-array.js';

const DefaultColumnParser: AnyParseFunction = (data, offset, len) =>
  data.subarray(offset, offset + len);
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
            parsers[i] = (data, offset, len, options) =>
              decodeBinaryArray(
                data,
                offset,
                decode,
                options,
                dataTypeReg.fixedBinarySize,
              );
          } else if (dataTypeReg.fixedBinarySize != null) {
            const fixedSize = dataTypeReg.fixedBinarySize;
            parsers[i] = (data, offset, len, options) =>
              len === fixedSize
                ? decode(data, offset, options)
                : decode(data.subarray(offset, offset + len), 0, options);
          } else {
            parsers[i] = (data, offset, len, options) =>
              decode(data.subarray(offset, offset + len), 0, options);
          }
        }
      } else if (f.format === DataFormat.text) {
        const parse = dataTypeReg.decodeText;
        if (parse) {
          const parseBuffer = dataTypeReg.decodeTextBuffer;
          if (!isArray && parseBuffer) {
            parsers[i] = (data, offset, len, options) =>
              parseBuffer(data, offset, len, options);
          } else if (!isArray) {
            parsers[i] = (data, offset, len, options) =>
              parse(data.toString('utf8', offset, offset + len), options);
          } else {
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
