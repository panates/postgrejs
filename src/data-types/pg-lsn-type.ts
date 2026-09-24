import { DataTypeOIDs } from '../constants.js';
import type { DataType } from '../interfaces/data-type.js';
import type { SmartBuffer } from '../protocol/smart-buffer.js';

/**
 * A `pg_lsn` is a position in the write-ahead log - what
 * `pg_current_wal_lsn()` and every column of `pg_stat_replication`
 * answer with, so replication and monitoring tools read these routinely.
 *
 * It decodes to the `16/B374D848` string the server prints: the two
 * 32-bit halves in upper-case hex, separated by a slash and neither of
 * them padded - `0/0` and `A/B` are what the server writes for those,
 * not `0/00000000`. That spelling is how an LSN is written everywhere -
 * in logs, in
 * `recovery_target_lsn`, in the documentation - and it casts straight
 * back. A number would lose that and gain nothing, since the value is
 * compared rather than arithmetic.
 */

const LSN_PATTERN = /^([0-9a-fA-F]{1,8})\/([0-9a-fA-F]{1,8})$/;

/**
 * `0`-`F` as bytes, and the text written into one reused scratch.
 *
 * `toString(16).toUpperCase()` per half is two strings each and four per
 * value: 281 ns against 70 ns here, measured over values that vary. An
 * LSN is not decoded in bulk - it comes back from monitoring queries a
 * few rows at a time - so this is worth only the fifteen lines it takes
 * and no machinery beyond them.
 */
const HEX_UPPER = Buffer.from('0123456789ABCDEF', 'latin1');
const TEXT = Buffer.allocUnsafe(17);

/** Writes one half at `p`, unpadded, and answers where it ended. */
function writeHalf(value: number, p: number): number {
  let shift = 28;
  // Neither half is padded - the server writes `0/0` and `A/B` - so the
  // leading zeros are skipped, and the last nibble is written whatever
  // it is so that zero comes out as `0` rather than nothing.
  while (shift && !((value >>> shift) & 15)) shift -= 4;
  for (; shift >= 0; shift -= 4) TEXT[p++] = HEX_UPPER[(value >>> shift) & 15];
  return p;
}

export const PgLsnType: DataType = {
  name: 'pg_lsn',
  oid: DataTypeOIDs.pg_lsn,
  jsType: 'string',

  // See inet-type.ts: a string-shaped type stays out of inference.
  inferrable: false,

  encodeText(v: any): string {
    return '' + v;
  },

  /** One unsigned 64-bit value, written as its two halves. */
  encodeBinary(buf: SmartBuffer, v: any): void {
    const m = typeof v === 'string' ? LSN_PATTERN.exec(v) : undefined;
    if (!m) throw new Error(`"${v}" is not a valid pg_lsn value`);
    buf.writeUInt32BE(parseInt(m[1], 16));
    buf.writeUInt32BE(parseInt(m[2], 16));
  },

  decodeBinary(v: Buffer, offset: number = 0): string {
    let p = writeHalf(v.readUInt32BE(offset), 0);
    TEXT[p++] = 47; /* / */
    p = writeHalf(v.readUInt32BE(offset + 4), p);
    return TEXT.toString('latin1', 0, p);
  },

  decodeText(v: string): string {
    return v;
  },

  // Hex and a slash - see inet-type.ts for why 'latin1'.
  decodeTextBuffer(buf: Buffer, offset: number, len: number): string {
    return buf.toString('latin1', offset, offset + len);
  },

  isType(v: any): boolean {
    return typeof v === 'string' && LSN_PATTERN.test(v);
  },
};

export const ArrayPgLsnType: DataType = {
  ...PgLsnType,
  name: '_pg_lsn',
  oid: DataTypeOIDs._pg_lsn,
  elementsOID: DataTypeOIDs.pg_lsn,
};
