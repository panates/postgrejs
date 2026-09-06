import { DataTypeOIDs } from '../constants.js';
import type { DataMappingOptions } from '../interfaces/data-mapping-options.js';
import type { DataType } from '../interfaces/data-type.js';
import { BufferReader } from '../protocol/buffer-reader.js';
import type { SmartBuffer } from '../protocol/smart-buffer.js';

export const JsonbType: DataType = {
  name: 'jsonb',
  oid: DataTypeOIDs.jsonb,
  jsType: 'string',

  decodeBinary(
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
    // A string or number is taken as JSON text already, same as json-type.
    // This used to prepend "\x0001" - the binary format's version header,
    // in the text encoder - which sent a NUL byte the server rejected
    // outright ("invalid byte sequence for encoding UTF8: 0x00").
    return '' + v;
  },

  // jsonb's binary form is a one-byte version header followed by the same
  // JSON text.
  encodeBinary(buf: SmartBuffer, v: any): void {
    buf.writeUInt8(1);
    buf.writeString(JsonbType.encodeText!(v, {}), 'utf8');
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
