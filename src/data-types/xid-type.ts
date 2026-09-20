import { DataTypeOIDs } from '../constants.js';
import type { DataType } from '../interfaces/data-type.js';
import type { SmartBuffer } from '../protocol/smart-buffer.js';
import { fastParseInt, fastParseIntBuffer } from '../util/fast-parseint.js';

/**
 * `xid`, `xid8` and `cid` - the transaction and command counters behind
 * the `xmin`, `xmax`, `cmin` and `cmax` system columns, which an
 * application selects when it wants a row's identity for optimistic
 * locking. They are counters, so they decode to numbers.
 *
 * None of the three joins inference. A JavaScript number says nothing
 * about which of these it is, and claiming integers here would take them
 * from `int4` and `int8`, where they almost always belong - name the
 * type to use one.
 */

const BIG32 = BigInt(32);
/**
 * A 64-bit value is only exactly a JavaScript number while its high half
 * is at most this: 0x1fffff * 2^32 + 0xffffffff is exactly
 * Number.MAX_SAFE_INTEGER.
 */
const MAX_SAFE_HIGH = 0x1fffff;

/** Both 64-bit types here are unsigned, so the halves are read apart. */
function readUInt64(v: Buffer, offset: number): bigint | number {
  const hi = v.readUInt32BE(offset);
  const lo = v.readUInt32BE(offset + 4);
  if (hi <= MAX_SAFE_HIGH) return hi * 4294967296 + lo;
  return (BigInt(hi) << BIG32) | BigInt(lo);
}

function writeUInt64(buf: SmartBuffer, v: any): void {
  const n = typeof v === 'bigint' ? v : BigInt(fastParseInt(v));
  buf.writeUInt32BE(Number(n >> BIG32));
  buf.writeUInt32BE(Number(n & BigInt(0xffffffff)));
}

function createUInt32Type(name: string, oid: number): DataType {
  return {
    name,
    oid,
    jsType: 'number',
    inferrable: false,

    encodeText(v: any): string {
      return '' + v;
    },

    encodeBinary(buf: SmartBuffer, v: any): void {
      buf.writeUInt32BE(fastParseInt(v));
    },

    decodeBinary(v: Buffer, offset: number = 0): number {
      return v.readUInt32BE(offset);
    },

    decodeText: fastParseInt,
    decodeTextBuffer: fastParseIntBuffer,

    isType(v: any): boolean {
      return (
        typeof v === 'number' &&
        Number.isInteger(v) &&
        v >= 0 &&
        v <= 4294967295
      );
    },
  };
}

export const XidType: DataType = createUInt32Type('xid', DataTypeOIDs.xid);

export const ArrayXidType: DataType = {
  ...XidType,
  name: '_xid',
  oid: DataTypeOIDs._xid,
  elementsOID: DataTypeOIDs.xid,
};

export const CidType: DataType = createUInt32Type('cid', DataTypeOIDs.cid);

export const ArrayCidType: DataType = {
  ...CidType,
  name: '_cid',
  oid: DataTypeOIDs._cid,
  elementsOID: DataTypeOIDs.cid,
};

export const Xid8Type: DataType = {
  name: 'xid8',
  oid: DataTypeOIDs.xid8,
  // A number while the value fits one exactly, a BigInt after that -
  // the same contract int8 has.
  jsType: 'BigInt',
  inferrable: false,

  encodeText(v: any): string {
    return '' + v;
  },

  encodeBinary: writeUInt64,

  decodeBinary(v: Buffer, offset: number = 0): bigint | number {
    return readUInt64(v, offset);
  },

  decodeText(s: string): bigint | number {
    // A full transaction id never has a sign, so the digit count alone
    // decides whether it can be a number.
    if (s.length <= 15) return Number(s);
    const v = BigInt(s);
    return v <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(v) : v;
  },

  decodeTextBuffer(buf: Buffer, offset: number, len: number): bigint | number {
    if (len <= 15) return fastParseIntBuffer(buf, offset, len);
    return Xid8Type.decodeText(
      buf.toString('latin1', offset, offset + len),
      {},
    );
  },

  isType(v: any): boolean {
    return (
      typeof v === 'bigint' ||
      (typeof v === 'number' && Number.isInteger(v) && v >= 0)
    );
  },
};

export const ArrayXid8Type: DataType = {
  ...Xid8Type,
  name: '_xid8',
  oid: DataTypeOIDs._xid8,
  elementsOID: DataTypeOIDs.xid8,
};
