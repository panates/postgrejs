import { DataTypeOIDs } from '../constants.js';
import type { DataType } from '../interfaces/data-type.js';
import type { SmartBuffer } from '../protocol/smart-buffer.js';

/**
 * A `tid` is where a row physically sits - the `ctid` system column,
 * which applications select to identify a row without a key, to
 * deduplicate, or to update exactly one of a set of identical rows.
 *
 * It decodes to the `(block,offset)` string the server prints. The two
 * numbers are a physical address that VACUUM is free to change, so there
 * is nothing to compute with them; what a caller does with a ctid is
 * compare it or hand it straight back, and the string does both. `pg`
 * leaves it a string too.
 */

const TID_PATTERN = /^\(\s*(\d+)\s*,\s*(\d+)\s*\)$/;

export const TidType: DataType = {
  name: 'tid',
  oid: DataTypeOIDs.tid,
  jsType: 'string',

  // `(0,1)` is an ordinary-looking string - see inet-type.ts.
  inferrable: false,

  encodeText(v: any): string {
    return '' + v;
  },

  /** A uint32 block number and a uint16 offset within it. */
  encodeBinary(buf: SmartBuffer, v: any): void {
    const m = typeof v === 'string' ? TID_PATTERN.exec(v) : undefined;
    if (!m) throw new Error(`"${v}" is not a valid tid value`);
    buf.writeUInt32BE(+m[1]);
    buf.writeUInt16BE(+m[2]);
  },

  decodeBinary(v: Buffer, offset: number = 0): string {
    return (
      '(' + v.readUInt32BE(offset) + ',' + v.readUInt16BE(offset + 4) + ')'
    );
  },

  decodeText(v: string): string {
    return v;
  },

  // Digits, a comma and two parentheses - see inet-type.ts for 'latin1'.
  decodeTextBuffer(buf: Buffer, offset: number, len: number): string {
    return buf.toString('latin1', offset, offset + len);
  },

  isType(v: any): boolean {
    return typeof v === 'string' && TID_PATTERN.test(v);
  },
};

export const ArrayTidType: DataType = {
  ...TidType,
  name: '_tid',
  oid: DataTypeOIDs._tid,
  elementsOID: DataTypeOIDs.tid,
};
