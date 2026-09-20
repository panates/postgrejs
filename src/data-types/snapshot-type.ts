import { DataTypeOIDs } from '../constants.js';
import type { DataType } from '../interfaces/data-type.js';
import type { SmartBuffer } from '../protocol/smart-buffer.js';

/**
 * `pg_snapshot` and its older name `txid_snapshot` - what
 * `pg_current_snapshot()` answers with, and what tells you which
 * transactions were in flight at a moment.
 *
 * Both decode to the `xmin:xmax:xip,xip` string the server prints. The
 * parts are transaction ids, and there is nothing to do with them but
 * compare them against another snapshot - which the server's own
 * operators do far better than JavaScript could, since these are the
 * 64-bit counters `xid8` carries. The string is the whole value and
 * casts straight back.
 */

const BIG32 = BigInt(32);
const MASK32 = BigInt(0xffffffff);
/** The largest high half a JavaScript number still holds exactly. */
const MAX_SAFE_HIGH = 0x1fffff;

const SNAPSHOT_PATTERN = /^(\d+):(\d+):(\d+(?:,\d+)*)?$/;

/** A 64-bit transaction id as its decimal text, whatever its magnitude. */
function readXid(v: Buffer, offset: number): string {
  const hi = v.readUInt32BE(offset);
  const lo = v.readUInt32BE(offset + 4);
  if (hi <= MAX_SAFE_HIGH) return '' + (hi * 4294967296 + lo);
  return ((BigInt(hi) << BIG32) | BigInt(lo)).toString();
}

function writeXid(buf: SmartBuffer, s: string): void {
  const n = BigInt(s);
  buf.writeUInt32BE(Number(n >> BIG32));
  buf.writeUInt32BE(Number(n & MASK32));
}

function createType(name: string, oid: number): DataType {
  return {
    name,
    oid,
    jsType: 'string',

    // See inet-type.ts: a string-shaped type stays out of inference.
    inferrable: false,

    encodeText(v: any): string {
      return '' + v;
    },

    /**
     * An int32 count of in-flight transactions, then xmin and xmax, then
     * that many ids - each of them 64 bits.
     */
    encodeBinary(buf: SmartBuffer, v: any): void {
      const m = typeof v === 'string' ? SNAPSHOT_PATTERN.exec(v) : undefined;
      if (!m) throw new Error(`"${v}" is not a valid ${name} value`);
      const xip = m[3] ? m[3].split(',') : [];
      buf.writeInt32BE(xip.length);
      writeXid(buf, m[1]);
      writeXid(buf, m[2]);
      let i: number;
      const l = xip.length;
      for (i = 0; i < l; i++) writeXid(buf, xip[i]);
    },

    decodeBinary(v: Buffer, offset: number = 0): string {
      const count = v.readInt32BE(offset);
      let out = readXid(v, offset + 4) + ':' + readXid(v, offset + 12) + ':';
      let i: number;
      let p = offset + 20;
      for (i = 0; i < count; i++, p += 8) {
        if (i) out += ',';
        out += readXid(v, p);
      }
      return out;
    },

    decodeText(v: string): string {
      return v;
    },

    // Digits, colons and commas - see inet-type.ts for why 'latin1'.
    decodeTextBuffer(buf: Buffer, offset: number, len: number): string {
      return buf.toString('latin1', offset, offset + len);
    },

    isType(v: any): boolean {
      return typeof v === 'string' && SNAPSHOT_PATTERN.test(v);
    },
  };
}

export const PgSnapshotType: DataType = createType(
  'pg_snapshot',
  DataTypeOIDs.pg_snapshot,
);

export const ArrayPgSnapshotType: DataType = {
  ...PgSnapshotType,
  name: '_pg_snapshot',
  oid: DataTypeOIDs._pg_snapshot,
  elementsOID: DataTypeOIDs.pg_snapshot,
};

export const TxidSnapshotType: DataType = createType(
  'txid_snapshot',
  DataTypeOIDs.txid_snapshot,
);

export const ArrayTxidSnapshotType: DataType = {
  ...TxidSnapshotType,
  name: '_txid_snapshot',
  oid: DataTypeOIDs._txid_snapshot,
  elementsOID: DataTypeOIDs.txid_snapshot,
};
