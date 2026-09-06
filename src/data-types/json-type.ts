import { DataTypeOIDs } from '../constants.js';
import type { DataMappingOptions } from '../interfaces/data-mapping-options.js';
import type { DataType } from '../interfaces/data-type.js';
import type { SmartBuffer } from '../protocol/smart-buffer.js';

export const JsonType: DataType = {
  name: 'json',
  oid: DataTypeOIDs.json,
  jsType: 'string',

  decodeBinary(
    v: Buffer,
    offset: number = 0,
    options: DataMappingOptions,
  ): string | object | null | undefined {
    const content = v.toString('utf8', offset);
    const fetchAsString = options.fetchAsString?.includes(DataTypeOIDs.json);
    if (fetchAsString) return content;
    return content ? JSON.parse(content) : undefined;
  },

  // json is stored as the text itself, so its binary form is those bytes.
  encodeBinary(buf: SmartBuffer, v: any): void {
    buf.writeString(JsonType.encodeText!(v, {}), 'utf8');
  },

  encodeText(v): string {
    if (typeof v === 'object' || typeof v === 'bigint')
      return JSON.stringify(v);
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    return '' + v;
  },

  decodeText(v: string, options: DataMappingOptions): object | string | null {
    const fetchAsString = options.fetchAsString?.includes(DataTypeOIDs.json);
    if (fetchAsString) return v;
    return v ? JSON.parse(v) : null;
  },

  decodeTextBuffer(
    buf: Buffer,
    offset: number,
    len: number,
    options: DataMappingOptions,
  ): object | string | null {
    return JsonType.decodeText(
      buf.toString('utf8', offset, offset + len),
      options,
    );
  },

  isType(v: any): boolean {
    return v && typeof v === 'object';
  },
};

export const ArrayJsonType: DataType = {
  ...JsonType,
  name: '_json',
  oid: DataTypeOIDs._json,
  elementsOID: DataTypeOIDs.json,
};
