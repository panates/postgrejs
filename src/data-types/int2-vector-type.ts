import { DataTypeOIDs } from '../constants.js';
import type { DataMappingOptions } from '../interfaces/data-mapping-options.js';
import type { DataType } from '../interfaces/data-type.js';
import { SmartBuffer } from '../protocol/smart-buffer.js';
import { decodeBinaryArray } from '../util/decode-binaryarray.js';
import { encodeBinaryArray } from '../util/encode-binaryarray.js';
import { fastParseInt } from '../util/fast-parseint.js';

export const Int2VectorType: DataType = {
  name: 'int2vector',
  oid: DataTypeOIDs.int2vector,
  jsType: 'array',

  encodeBinary(buf: SmartBuffer, v: number[]): void {
    encodeBinaryArray(
      buf,
      v,
      DataTypeOIDs.int2,
      {},
      (io: SmartBuffer, x: number) => {
        io.writeInt16BE(x);
      },
      // A vector is genuinely 0-based, unlike every ordinary array -
      // `array_lower(pg_index.indkey, 1)` is 0 on the server.
      undefined,
      0,
    );
  },

  encodeCalculateDim(v: number[]): number[] {
    return [v.length];
  },

  decodeBinary(v: Buffer, offset: number = 0): number[] | undefined {
    return (
      decodeBinaryArray<number>(v, offset, (b, off) => b.readInt16BE(off)) ||
      undefined
    );
  },

  decodeText(str: string) {
    return str.split(' ').map(fastParseInt);
  },

  // See box-type.ts's decodeTextBuffer comment - same rationale (this text
  // grammar is pure ASCII digits/minus/space).
  decodeTextBuffer(
    buf: Buffer,
    offset: number,
    len: number,
    options: DataMappingOptions,
  ) {
    return Int2VectorType.decodeText(
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
            x >= -32768 &&
            x <= 32767
          ),
      )
    );
  },
};

export const ArrayInt2VectorType: DataType = {
  ...Int2VectorType,
  name: '_int2vector',
  oid: DataTypeOIDs._int2vector,
  elementsOID: DataTypeOIDs.int2vector,
};
