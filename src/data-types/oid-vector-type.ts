import { DataTypeOIDs } from '../constants.js';
import type { DataMappingOptions } from '../interfaces/data-mapping-options.js';
import type { DataType } from '../interfaces/data-type.js';
import { SmartBuffer } from '../protocol/smart-buffer.js';
import { decodeBinaryArray } from '../util/decode-binaryarray.js';
import { encodeBinaryArray } from '../util/encode-binaryarray.js';
import { fastParseInt } from '../util/fast-parseint.js';

/**
 * `oidvector` (OID 30) is a list of OIDs, not the array type of `oid` -
 * that is `_oid` (1028). It has its own array type, `_oidvector` (1013),
 * exactly as `int2vector` has `_int2vector`, and its text form is
 * space-separated rather than braced.
 */
export const OidVectorType: DataType = {
  name: 'oidvector',
  oid: DataTypeOIDs.oidvector,
  jsType: 'array',

  encodeBinary(buf: SmartBuffer, v: number[]): void {
    encodeBinaryArray(
      buf,
      v,
      DataTypeOIDs.oid,
      {},
      (io: SmartBuffer, x: number) => {
        io.writeUInt32BE(x);
      },
    );
  },

  encodeCalculateDim(v: number[]): number[] {
    return [v.length];
  },

  decodeBinary(v: Buffer): number[] | undefined {
    return decodeBinaryArray<number>(v, 0, b => b.readUInt32BE()) || undefined;
  },

  decodeText(str: string) {
    return str.split(' ').map(fastParseInt);
  },

  // See box-type.ts's decodeTextBuffer comment - same rationale (this text
  // grammar is pure ASCII digits and spaces).
  decodeTextBuffer(
    buf: Buffer,
    offset: number,
    len: number,
    options: DataMappingOptions,
  ) {
    return OidVectorType.decodeText(
      buf.toString('latin1', offset, offset + len),
      options,
    );
  },

  encodeText(v: number[]) {
    return v.join(' ');
  },

  isType(v: any): boolean {
    return (
      Array.isArray(v) &&
      !v.find(
        x =>
          !(
            typeof x === 'number' &&
            Number.isInteger(x) &&
            x >= 0 &&
            x <= 4294967295
          ),
      )
    );
  },
};

export const ArrayOidVectorType: DataType = {
  ...OidVectorType,
  name: '_oidvector',
  oid: DataTypeOIDs._oidvector,
  elementsOID: DataTypeOIDs.oidvector,
};
