import { DataTypeOIDs } from '../constants.js';
import type { DataType } from '../interfaces/data-type.js';
import type { SmartBuffer } from '../protocol/smart-buffer.js';

const GUID_PATTERN = /^[0-9a-fA-F]{8}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{12}$/;

export const UuidType: DataType = {
  name: 'uuid',
  oid: DataTypeOIDs.uuid,
  jsType: 'String',

  parseBinary(v: Buffer): string {
    return (
      v.toString('hex', 0, 4) +
      '-' +
      v.toString('hex', 4, 6) +
      '-' +
      v.toString('hex', 6, 8) +
      '-' +
      v.toString('hex', 8, 10) +
      '-' +
      v.toString('hex', 10, 16)
    );
  },

  encodeBinary(buf: SmartBuffer, v: string): void {
    if (!GUID_PATTERN.test(v)) throw new Error(`"${v}" is not a valid guid value`);
    const b = Buffer.from(v.replace(/-/g, ''), 'hex');
    buf.writeBuffer(b);
  },

  parseText(v: string): string {
    return v;
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
