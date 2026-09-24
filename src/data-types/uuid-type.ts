import { DataTypeOIDs } from '../constants.js';
import type { DataType } from '../interfaces/data-type.js';
import type { SmartBuffer } from '../protocol/smart-buffer.js';
import { writeHexBytes } from '../util/hex-text.js';

/**
 * The canonical text, written once and read back per value: 36 ASCII
 * characters whose four dashes never move, so only the hex is rewritten.
 * Reused rather than allocated because a decode fills it and converts it
 * before anything else can run.
 */
const TEXT = Buffer.allocUnsafe(36);
TEXT[8] = TEXT[13] = TEXT[18] = TEXT[23] = 45; /* - */
/** Where each of the sixteen bytes writes its two characters. */
const POSITIONS = [0, 2, 4, 6, 9, 11, 14, 16, 19, 21, 24, 26, 28, 30, 32, 34];

const GUID_PATTERN =
  /^[0-9a-fA-F]{8}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{12}$/;

export const UuidType: DataType = {
  name: 'uuid',
  oid: DataTypeOIDs.uuid,
  jsType: 'String',

  encodeText(v: any): string {
    return '' + v;
  },

  encodeBinary(buf: SmartBuffer, v: string): void {
    if (!GUID_PATTERN.test(v))
      throw new Error(`"${v}" is not a valid guid value`);
    const b = Buffer.from(v.replace(/-/g, ''), 'hex');
    buf.writeBytes(b);
  },

  decodeBinary(v: Buffer, offset: number = 0): string {
    writeHexBytes(TEXT, POSITIONS, v, offset, 16);
    return TEXT.toString('latin1');
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
