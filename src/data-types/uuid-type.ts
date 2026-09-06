import { DataTypeOIDs } from '../constants.js';
import type { DataType } from '../interfaces/data-type.js';
import type { SmartBuffer } from '../protocol/smart-buffer.js';

const GUID_PATTERN =
  /^[0-9a-fA-F]{8}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{12}$/;

export const UuidType: DataType = {
  name: 'uuid',
  oid: DataTypeOIDs.uuid,
  jsType: 'String',
  fixedBinarySize: 16,

  decodeBinary(v: Buffer, offset: number = 0): string {
    return (
      v.toString('hex', offset, offset + 4) +
      '-' +
      v.toString('hex', offset + 4, offset + 6) +
      '-' +
      v.toString('hex', offset + 6, offset + 8) +
      '-' +
      v.toString('hex', offset + 8, offset + 10) +
      '-' +
      v.toString('hex', offset + 10, offset + 16)
    );
  },

  encodeBinary(buf: SmartBuffer, v: string): void {
    if (!GUID_PATTERN.test(v))
      throw new Error(`"${v}" is not a valid guid value`);
    const b = Buffer.from(v.replace(/-/g, ''), 'hex');
    buf.writeBuffer(b);
  },

  decodeText(v: string): string {
    return v;
  },

  // Canonical UUID text is fixed-format hex+dashes, pure ASCII - 'latin1'
  // decodes identically to 'utf8' here but skips V8's multi-byte-sequence
  // detection.
  decodeTextBuffer(buf: Buffer, offset: number, len: number): string {
    return buf.toString('latin1', offset, offset + len);
  },

  isType(v: any): boolean {
    return typeof v === 'string' && GUID_PATTERN.test(v);
  },
};

export const ArrayUuidType: DataType = {
  ...UuidType,
  name: '_uuid',
  oid: DataTypeOIDs._uuid,
  elementsOID: DataTypeOIDs.uuid,
};
