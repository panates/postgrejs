import { DataTypeOIDs } from '../constants.js';
import type { DataMappingOptions } from '../interfaces/data-mapping-options.js';
import type { DataType } from '../interfaces/data-type.js';
import type { SmartBuffer } from '../protocol/smart-buffer.js';

export const JsonbType: DataType = {
  name: 'jsonb',
  oid: DataTypeOIDs.jsonb,
  jsType: 'string',

  encodeText(v): string {
    if (typeof v === 'object' || typeof v === 'bigint')
      return JSON.stringify(v);
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    return '' + v;
  },

  encodeBinary(buf: SmartBuffer, v: any): void {
    buf.writeUInt8(1);
    buf.writeString(JsonbType.encodeText!(v, {}), 'utf8');
  },

  decodeBinary(
    v: Buffer,
    offset: number = 0,
    len: number,
    options: DataMappingOptions,
  ): object | string | null | undefined {
    // jsonb's binary form is a one-byte version followed by the JSON text,
    // which carries no terminator of its own - so its end is whatever
    // `len` says, not the end of the buffer it happens to sit in.
    if (v[offset] !== 1)
      throw new Error('Unexpected Jsonb version value in header');
    const content = v.toString('utf8', offset + 1, offset + len);
    const fetchAsString = options.fetchAsString?.includes(DataTypeOIDs.jsonb);
    if (fetchAsString) return content;
    return content ? JSON.parse(content) : undefined;
  },

  decodeText(v: string, options: DataMappingOptions): object | string | null {
    const fetchAsString = options.fetchAsString?.includes(DataTypeOIDs.jsonb);
    if (fetchAsString) return v;
    return v ? JSON.parse(v) : null;
  },

  // See json-type.ts's decodeTextBuffer comment - same rationale.
  decodeTextBuffer(
    buf: Buffer,
    offset: number,
    len: number,
    options: DataMappingOptions,
  ): object | string | null {
    return JsonbType.decodeText(
      buf.toString('utf8', offset, offset + len),
      options,
    );
  },

  isType(v: any): boolean {
    return v && typeof v === 'object';
  },
};

export const ArrayJsonbType: DataType = {
  ...JsonbType,
  name: '_jsonb',
  oid: DataTypeOIDs._jsonb,
  elementsOID: DataTypeOIDs.jsonb,
};
