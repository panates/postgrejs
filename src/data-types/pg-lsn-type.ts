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
    return (
      v.readUInt32BE(offset).toString(16).toUpperCase() +
      '/' +
      v
        .readUInt32BE(offset + 4)
        .toString(16)
        .toUpperCase()
    );
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
