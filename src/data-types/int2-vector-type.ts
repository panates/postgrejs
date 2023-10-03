import { SmartBuffer } from 'postgresql-client';
import { DataTypeOIDs } from '../constants.js';
import type { DataType } from '../interfaces/data-type.js';
import { decodeBinaryArray } from '../util/decode-binaryarray.js';
import { encodeBinaryArray } from '../util/encode-binaryarray.js';
import { fastParseInt } from '../util/fast-parseint.js';

export const Int2VectorType: DataType = {
  name: "int2vector",
  oid: DataTypeOIDs.int2vector,
  jsType: "array",

  parseBinary(v: Buffer): number[] | undefined {
    return decodeBinaryArray<number>(v, (b) => b.readInt16BE()) || undefined;
  },

  encodeBinary(buf: SmartBuffer, v: number[]): void {
    encodeBinaryArray(buf, v, DataTypeOIDs.int2, {},
        (io: SmartBuffer, x: number) => {
          io.writeInt16BE(x);
        })
  },

  encodeCalculateDim(v: number[]): number[] {
    return [v.length];
  },

  parseText(str: string) {
    return str.split(' ').map(fastParseInt);
  },

  encodeText(v: number[]) {
    return v.join(' ');
  },

  isType(v: any): boolean {
    return Array.isArray(v) &&
        !v.find(x => !(typeof x === "number" && Number.isInteger(x) && x >= -32768 && x <= 32767));
  }
};


export const ArrayInt2VectorType: DataType = {
  ...Int2VectorType,
  name: "_int2vector",
  oid: DataTypeOIDs._int2vector,
  elementsOID: DataTypeOIDs.int2vector,
};
