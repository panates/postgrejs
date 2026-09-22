import { DataFormat } from '../constants.js';
import type { DataTypeMap } from '../data-type-map.js';
import type { DataMappingOptions } from '../interfaces/data-mapping-options.js';
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
  mappingOptions?: DataMappingOptions,
): AnyParseFunction[] {
  const parsers: AnyParseFunction[] = new Array(fields.length);
  const asString = mappingOptions?.fetchAsString;
  const l = fields.length;
  let f: Protocol.RowDescription;
  let i;
  for (i = 0; i < l; i++) {
    f = fields[i];
    // fetchAsString asks for the value exactly as the server renders it,
    // and resolveColumnFormats() has already asked the server to send this
    // column as text - so there is nothing left to do but hand the bytes
    // back. An array column only reaches here when its own array OID was
    // listed, and then the whole literal is the string that comes back.
    // The format check is not redundant: a column can still arrive binary
    // when its types were unknown at Bind time (a pipelined one-shot), and
    // then the registered decoder is the only thing that can read it.
    if (
      asString &&
      f.format === DataFormat.text &&
      asString.includes(f.dataTypeId)
    ) {
      parsers[i] = DefaultTextColumnParser;
      continue;
    }
    const dataTypeReg = typeMap.get(f.dataTypeId);
    // The other half of the same ask: the list named this column's
    // *element* type, so the literal is split and the elements are handed
    // back as the server wrote them - an array of what naming the scalar
    // OID gives for a scalar column. Naming the array's own OID still
    // means the whole literal, above; the two remain tellable apart
    // because they name different OIDs.
    if (
      asString &&
      f.format === DataFormat.text &&
      dataTypeReg?.elementsOID &&
      asString.includes(dataTypeReg.elementsOID)
    ) {
      const separator = dataTypeReg.arraySeparator;
      parsers[i] = (data, offset, len) =>
        parsePostgresArray(data.toString('utf8', offset, offset + len), {
          separator,
        });
      continue;
    }
    if (dataTypeReg) {
      const isArray = !!dataTypeReg.elementsOID;
      if (f.format === DataFormat.binary) {
        const decode = dataTypeReg.decodeBinary;
        if (decode) {
          if (isArray) {
            parsers[i] = (data, offset, len, options) =>
              decodeBinaryArray(data, offset, decode, options);
          } else {
            // Straight through: decodeBinary is told where its value starts
            // and how long it is, so there is nothing to slice first.
            parsers[i] = decode;
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
