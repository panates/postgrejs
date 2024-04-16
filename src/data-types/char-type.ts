import { DataTypeOIDs } from '../constants.js';
import type { DataType } from '../interfaces/data-type.js';
import type { SmartBuffer } from '../protocol/smart-buffer.js';

export const CharType: DataType = {
  name: 'char',
  oid: DataTypeOIDs.char,
  jsType: 'string',

  parseBinary(v: Buffer): string {
    return v.toString('utf8');
  },

  encodeBinary(buf: SmartBuffer, v: string): void {
    buf.writeString((v ? '' + v : ' ')[0], 'utf8');
  },

  parseText(v): string {
    return '' + v;
  },

  isType(v: any): boolean {
    return typeof v === 'string' && v.length === 1;
  },
};

export const ArrayCharType: DataType = {
  ...CharType,
  name: '_char',
  oid: DataTypeOIDs._char,
  elementsOID: DataTypeOIDs.char,
};
