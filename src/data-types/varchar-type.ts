import { DataTypeOIDs } from '../constants.js';
import type { DataType } from '../interfaces/data-type.js';
import type { SmartBuffer } from '../protocol/smart-buffer.js';

export const VarcharType: DataType = {
  name: 'varchar',
  oid: DataTypeOIDs.varchar,
  jsType: 'string',

  parseBinary(v: Buffer): string {
    return v.toString('utf8');
  },

  encodeBinary(buf: SmartBuffer, v: string): void {
    buf.writeString('' + v, 'utf8');
  },

  parseText(v): string {
    return '' + v;
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
