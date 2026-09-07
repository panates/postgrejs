import { DataTypeOIDs } from '../constants.js';
import type { DataType } from '../interfaces/data-type.js';
import type { SmartBuffer } from '../protocol/smart-buffer.js';

export const VarcharType: DataType = {
  name: 'varchar',
  oid: DataTypeOIDs.varchar,
  jsType: 'string',

  encodeText(v: any): string {
    return '' + v;
  },

  encodeBinary(buf: SmartBuffer, v: string): void {
    buf.writeString('' + v, 'utf8');
  },

  decodeBinary(v: Buffer, offset: number = 0): string {
    return v.toString('utf8', offset);
  },

  decodeText(v): string {
    // The wire decoder always hands this a string (see intl-connection.ts's
    // DataRow handling) - no coercion needed.
    return v;
  },

  // varchar can hold arbitrary Unicode text, so this must stay 'utf8' -
  // same allocation as the default (v.toString('utf8')) path, this only
  // skips the extra decodeText wrapper-closure call get-parsers.ts would
  // otherwise add.
  decodeTextBuffer(buf: Buffer, offset: number, len: number): string {
    return buf.toString('utf8', offset, offset + len);
  },

  isType(v: any): boolean {
    return typeof v === 'string';
  },
};

export const ArrayVarcharType: DataType = {
  ...VarcharType,
  name: '_varchar',
  oid: DataTypeOIDs._varchar,
  elementsOID: DataTypeOIDs.varchar,
};
