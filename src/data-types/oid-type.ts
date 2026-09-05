import { DataTypeNames, DataTypeOIDs } from '../constants.js';
import type { DataType } from '../interfaces/data-type.js';
import type { SmartBuffer } from '../protocol/smart-buffer.js';
import { fastParseInt, fastParseIntBuffer } from '../util/fast-parseint.js';

export const OidType: DataType = {
  name: 'oid',
  oid: DataTypeOIDs.oid,
  jsType: 'number',
  fixedBinarySize: 4,

  parseBinary(v: Buffer, offset: number = 0): number {
    return v.readUInt32BE(offset);
  },

  encodeBinary(buf: SmartBuffer, v: number): void {
    buf.writeUInt32BE(fastParseInt(v));
  },

  parseText: fastParseInt,
  parseTextBuffer: fastParseIntBuffer,

  isType(v: any): boolean {
    return typeof v === 'number' && Number.isInteger(v) && !!DataTypeNames[v];
  },
};

export const ArrayOidType: DataType = {
  ...OidType,
  name: '_oid',
  oid: DataTypeOIDs._oid,
  elementsOID: DataTypeOIDs.oid,
};

export const VectorOidType: DataType = {
  ...OidType,
  name: '_oidvector',
  oid: DataTypeOIDs.oidvector,
  elementsOID: DataTypeOIDs.oid,
};
