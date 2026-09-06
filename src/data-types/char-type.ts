import { DataTypeOIDs } from '../constants.js';
import type { DataType } from '../interfaces/data-type.js';
import type { SmartBuffer } from '../protocol/smart-buffer.js';

export const CharType: DataType = {
  name: 'char',
  oid: DataTypeOIDs.char,
  jsType: 'string',

  decodeBinary(v: Buffer, offset: number = 0): string {
    return v.toString('utf8', offset);
  },

  encodeText(v: any): string {
    return '' + v;
  },

  encodeBinary(buf: SmartBuffer, v: string): void {
    buf.writeString((v ? '' + v : ' ')[0], 'utf8');
  },

  decodeText(v): string {
    // The wire decoder always hands this a string (see intl-connection.ts's
    // DataRow handling) - no coercion needed.
    return v;
  },

  // char(1) can hold a multi-byte Unicode character (e.g. 'é'), so this
  // must stay 'utf8' - see varchar-type.ts's decodeTextBuffer comment.
  decodeTextBuffer(buf: Buffer, offset: number, len: number): string {
    return buf.toString('utf8', offset, offset + len);
  },

  isType(v: any): boolean {
    return typeof v === 'string' && Buffer.byteLength(v, 'utf8') === 1;
  },
};

export const ArrayCharType: DataType = {
  ...CharType,
  name: '_char',
  oid: DataTypeOIDs._char,
  elementsOID: DataTypeOIDs.char,
};
