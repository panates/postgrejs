import { DataTypeOIDs } from '../constants.js';
import type { DataMappingOptions } from '../interfaces/data-mapping-options.js';
import type { DataType } from '../interfaces/data-type.js';
import { BufferReader } from '../protocol/buffer-reader.js';

export const JsonbType: DataType = {
  name: 'jsonb',
  oid: DataTypeOIDs.jsonb,
  jsType: 'string',

  parseBinary(
    v: Buffer,
    offset: number = 0,
    options: DataMappingOptions,
  ): object | string | null | undefined {
    const buf = new BufferReader(offset ? v.subarray(offset) : v);
    if (buf.readUInt8() !== 1)
      throw new Error('Unexpected Jsonb version value in header');
    const fetchAsString = options.fetchAsString?.includes(DataTypeOIDs.jsonb);
    const content = buf.readLString(buf.length - buf.offset);
    if (fetchAsString) return content;
    return content ? JSON.parse(content) : undefined;
  },

  encodeText(v): string {
    if (typeof v === 'object' || typeof v === 'bigint')
      return JSON.stringify(v);
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    return '\x0001' + v;
  },

  parseText(v: string, options: DataMappingOptions): object | string | null {
    const fetchAsString = options.fetchAsString?.includes(DataTypeOIDs.jsonb);
    if (fetchAsString) return v;
    return v ? JSON.parse(v) : null;
  },

  // See json-type.ts's parseTextBuffer comment - same rationale.
  parseTextBuffer(
    buf: Buffer,
    offset: number,
    len: number,
    options: DataMappingOptions,
  ): object | string | null {
    return JsonbType.parseText(
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
