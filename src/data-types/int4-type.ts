import { DataTypeOIDs } from '../constants.js';
import type { DataType } from '../interfaces/data-type.js';
import type { SmartBuffer } from '../protocol/smart-buffer.js';
import { fastParseInt, fastParseIntBuffer } from '../util/fast-parseint.js';

export const Int4Type: DataType = {
  name: 'int4',
  oid: DataTypeOIDs.int4,
  jsType: 'number',
  fixedBinarySize: 4,

  decodeBinary(v: Buffer, offset: number = 0): number {
    return v.readInt32BE(offset);
  },

  encodeText(v: any): string {
    return '' + v;
  },

  encodeBinary(buf: SmartBuffer, v: number): void {
    buf.writeInt32BE(fastParseInt(v));
  },

  decodeText: fastParseInt,
  decodeTextBuffer: fastParseIntBuffer,

  isType(v: any): boolean {
    return (
      typeof v === 'number' &&
      Number.isInteger(v) &&
      v >= -2147483648 &&
      v <= 2147483647
    );
  },
};

export const ArrayInt4Type: DataType = {
  ...Int4Type,
  name: '_int4',
  oid: DataTypeOIDs._int4,
  elementsOID: DataTypeOIDs.int4,
};
