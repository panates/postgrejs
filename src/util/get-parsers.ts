import { DataFormat } from '../constants.js';
import { DataTypeMap } from '../data-type-map.js';
import { DataMappingOptions } from '../interfaces/data-mapping-options.js';
import { Protocol } from '../protocol/protocol.js';
import { AnyParseFunction } from '../types.js';
import { decodeBinaryArray } from './decode-binaryarray.js';
import { parsePostgresArray } from './parse-array.js';

const DefaultColumnParser = (v: any) => v;

export function getParsers(typeMap: DataTypeMap, fields: Protocol.RowDescription[]): AnyParseFunction[] {
  const parsers = new Array(fields.length);
  const l = fields.length;
  let f: Protocol.RowDescription;
  let i;
  for (i = 0; i < l; i++) {
    f = fields[i];
    const dataTypeReg = typeMap.get(f.dataTypeId);
    if (dataTypeReg) {
      const isArray = !!dataTypeReg.elementsOID;
      if (f.format === DataFormat.binary) {
        const decode = dataTypeReg.parseBinary;
        if (decode) {
          parsers[i] = !isArray
            ? decode
            : (v: Buffer, options: DataMappingOptions) => decodeBinaryArray(v, decode, options);
        }
      } else if (f.format === DataFormat.text) {
        const parse = dataTypeReg.parseText;
        if (parse) {
          parsers[i] = !isArray
            ? parse
            : (v: string, options: DataMappingOptions) =>
                parsePostgresArray(v, {
                  transform: x => parse(x, options),
                  separator: dataTypeReg.arraySeparator,
                });
        }
      }
    }
    parsers[i] = parsers[i] || DefaultColumnParser;
  }
  return parsers;
}
