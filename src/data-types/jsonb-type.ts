import { DataTypeOIDs } from '../constants.js';
import type { DataMappingOptions } from '../interfaces/data-mapping-options.js';
import type { DataType } from '../interfaces/data-type.js';
import { BufferReader } from '../protocol/buffer-reader.js';

export const JsonbType: DataType = {
  name: 'jsonb',
  oid: DataTypeOIDs.jsonb,
  jsType: 'string',

  parseBinary(v: Buffer, options: DataMappingOptions): object | string | null {
    const buf = new BufferReader(v);
    if (buf.readUInt8() !== 1) throw new Error('Unexpected Jsonb version value in header');
    const fetchAsString = options.fetchAsString && options.fetchAsString.includes(DataTypeOIDs.json);
    const content = buf.readLString(buf.length - buf.offset);
    if (fetchAsString) return content;
    return content ? JSON.parse(content) : undefined;
  },

  encodeText(v): string {
    if (typeof v === 'object' || typeof v === 'bigint') return JSON.stringify(v);
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    return '\x0001' + v;
  },

  parseText(v: string, options: DataMappingOptions): object | string | null {
    const fetchAsString = options.fetchAsString && options.fetchAsString.includes(DataTypeOIDs.json);
    if (fetchAsString) return v;
    return v ? JSON.parse(v) : null;
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
