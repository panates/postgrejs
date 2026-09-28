import { DataTypeOIDs } from '../constants.js';
import type { DataType } from '../interfaces/data-type.js';
import type { SmartBuffer } from '../protocol/smart-buffer.js';

/** `json`, as the text the server stored - parsing it is the caller's to do, and their choice of parser. */
export const JsonType: DataType = {
  name: 'json',
  oid: DataTypeOIDs.json,
  jsType: 'string',

  decodeBinary(
    v: Buffer,
    offset: number = 0,
    len: number,
  ): object | null | undefined {
    const content = v.toString('utf8', offset, offset + len);
    return content ? JSON.parse(content) : undefined;
  },

  // json is stored as the text itself, so its binary form is those bytes.
  encodeBinary(buf: SmartBuffer, v: any): void {
    buf.writeString(JsonType.encodeText!(v, {}), 'utf8');
  },

  encodeText(v): string {
    // JSON.stringify() cannot serialize a BigInt itself (it throws), so a
    // bigint is written directly as a bare numeric literal instead.
    if (typeof v === 'bigint') return v.toString();
    if (typeof v === 'object') return JSON.stringify(v);
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    return '' + v;
  },

  decodeText: decodeJsonText,

  decodeTextBuffer(buf: Buffer, offset: number, len: number): object | null {
    return decodeJsonText(buf.toString('utf8', offset, offset + len));
  },

  isType(v: any): boolean {
    return v && typeof v === 'object';
  },
};

function decodeJsonText(v: string): object | null {
  return v ? JSON.parse(v) : null;
}

/** The `_json` array of {@link JsonType}. */
export const ArrayJsonType: DataType = {
  ...JsonType,
  name: '_json',
  oid: DataTypeOIDs._json,
  elementsOID: DataTypeOIDs.json,
};
