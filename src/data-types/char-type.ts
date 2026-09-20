import { DataTypeOIDs } from '../constants.js';
import type { DataType } from '../interfaces/data-type.js';
import type { SmartBuffer } from '../protocol/smart-buffer.js';

export const CharType: DataType = {
  name: 'char',
  oid: DataTypeOIDs.char,
  jsType: 'string',

  encodeText(v: any): string {
    return '' + v;
  },

  encodeBinary(buf: SmartBuffer, v: string): void {
    buf.writeString((v ? '' + v : ' ')[0], 'utf8');
  },

  decodeBinary(v: Buffer, offset: number = 0, len: number): string {
    return v.toString('utf8', offset, offset + len);
  },

  decodeText(v): string {
    return v;
  },

  decodeTextBuffer(buf: Buffer, offset: number, len: number): string {
    return buf.toString('utf8', offset, offset + len);
  },

  isType(v: any): boolean {
    return typeof v === 'string' && Buffer.byteLength(v, 'utf8') === 1;
  },

  /**
   * 18 is PostgreSQL's internal single-byte `"char"`, not `char(n)` and
   * not `varchar`. A one-character JavaScript string fits it, which is why
   * `isType` says so, but nobody passing `'A'` to a query means that type:
   * inference used to answer 18 for every such value and declare the
   * parameter `"char"` to the server.
   *
   * Comparisons and inserts survived on an implicit cast, but concatenation
   * had no single obvious one - `select code || $1` answered `operator is
   * not unique: character varying || "char"` - and an array was worse
   * still. determine() types an array from its first element alone, so
   * `['A', 'BB', 'CCC']` became `_char` and came back `['A', 'B', 'C']`,
   * every later element cut to one byte with nothing reported.
   */
  inferrable: false,
};

export const ArrayCharType: DataType = {
  ...CharType,
  name: '_char',
  oid: DataTypeOIDs._char,
  elementsOID: DataTypeOIDs.char,
};
