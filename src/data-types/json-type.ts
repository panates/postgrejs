import { DataTypeOIDs } from '../constants.js';
import type { DataMappingOptions } from '../interfaces/data-mapping-options.js';
import type { DataType } from '../interfaces/data-type.js';

export const JsonType: DataType = {
  name: 'json',
  oid: DataTypeOIDs.json,
  jsType: 'string',

  parseBinary(v: Buffer, options: DataMappingOptions): string {
    const content = v.toString('utf8');
    const fetchAsString = options.fetchAsString && options.fetchAsString.includes(DataTypeOIDs.jsonb);
    if (fetchAsString) return content;
    return content ? JSON.parse(content) : undefined;
  },

  encodeText(v): string {
    if (typeof v === 'object' || typeof v === 'bigint') return JSON.stringify(v);
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    return '' + v;
  },

  parseText(v: string, options: DataMappingOptions): object | string | null {
    const fetchAsString = options.fetchAsString && options.fetchAsString.includes(DataTypeOIDs.jsonb);
    if (fetchAsString) return v;
    return v ? JSON.parse(v) : null;
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
