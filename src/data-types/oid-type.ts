import { DataTypeNames, DataTypeOIDs } from '../constants.js';
import type { DataType } from '../interfaces/data-type.js';
import type { SmartBuffer } from '../protocol/smart-buffer.js';
import { assertInteger } from '../util/assert-integer.js';
import { fastParseInt, fastParseIntBuffer } from '../util/fast-parseint.js';

/** `oid`, as a number. */
export const OidType: DataType = {
  name: 'oid',
  oid: DataTypeOIDs.oid,
  jsType: 'number',

  encodeText(v: any): string {
    return '' + v;
  },

  encodeBinary(buf: SmartBuffer, v: number): void {
    buf.writeUInt32BE(assertInteger(v, 'oid', 0, 4294967295));
  },

  decodeBinary(v: Buffer, offset: number = 0): number {
    return v.readUInt32BE(offset);
  },

  decodeText: fastParseInt,
  decodeTextBuffer: fastParseIntBuffer,

  isType(v: any): boolean {
    return typeof v === 'number' && Number.isInteger(v) && !!DataTypeNames[v];
  },
};

/** The `_oid` array of {@link OidType}. */
export const ArrayOidType: DataType = {
  ...OidType,
  name: '_oid',
  oid: DataTypeOIDs._oid,
  elementsOID: DataTypeOIDs.oid,
};
