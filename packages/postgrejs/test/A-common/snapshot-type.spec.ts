import { expect } from 'expect';
import {
  PgSnapshotType,
  TxidSnapshotType,
} from '../../src/data-types/snapshot-type.js';
import { SmartBuffer } from '../../src/protocol/smart-buffer.js';

function wire(v: any): string {
  const buf = new SmartBuffer();
  PgSnapshotType.encodeBinary!(buf, v, {});
  // `buffer` is the whole allocation, `size` is how much was written.
  return buf.buffer.toString('hex', 0, buf.size);
}

function roundTrip(v: any): any {
  const buf = new SmartBuffer();
  PgSnapshotType.encodeBinary!(buf, v, {});
  return PgSnapshotType.decodeBinary!(buf.buffer, 0, buf.size, {});
}

function decodeHex(hex: string): string {
  const buf = Buffer.from(hex, 'hex');
  return PgSnapshotType.decodeBinary!(buf, 0, buf.length, {});
}

describe('PgSnapshotType / TxidSnapshotType', () => {
  it('should read a count, then xmin and xmax, then that many ids', () => {
    // Both hex strings are what the live server sent for the value named.
    expect(decodeHex('00000000000000000000000a0000000000000014')).toStrictEqual(
      '10:20:',
    );
    expect(
      decodeHex(
        '00000002000000000000000a0000000000000014' +
          '000000000000000c000000000000000f',
      ),
    ).toStrictEqual('10:20:12,15');
  });

  it('should write the same bytes back', () => {
    expect(wire('10:20:')).toStrictEqual(
      '00000000000000000000000a0000000000000014',
    );
    expect(wire('10:20:12,15')).toStrictEqual(
      '00000002000000000000000a0000000000000014' +
        '000000000000000c000000000000000f',
    );
  });

  it('should carry a transaction id past what a number holds', () => {
    // These are 64-bit counters, so the top of the range has to survive
    // both ways - read as a signed value it would come back as -1.
    const v = '18446744073709551615:18446744073709551615:';
    expect(roundTrip(v)).toStrictEqual(v);
    expect(decodeHex('00000000ffffffffffffffffffffffffffffffff')).toStrictEqual(
      v,
    );
  });

  it('should round-trip a list of in-flight ids', () => {
    for (const v of ['1:1:', '10:20:', '10:20:12,15', '10:20:10,11,12,13,14'])
      expect(roundTrip(v)).toStrictEqual(v);
  });

  it('should refuse anything that is not a snapshot', () => {
    expect(() => wire('10:20')).toThrow('not a valid pg_snapshot');
    expect(() => wire('10:20:x')).toThrow('not a valid pg_snapshot');
    expect(() => wire(42)).toThrow('not a valid pg_snapshot');
    const buf = new SmartBuffer();
    expect(() => TxidSnapshotType.encodeBinary!(buf, 'no', {})).toThrow(
      'not a valid txid_snapshot',
    );
  });

  it('should read from the offset it is given', () => {
    const buf = Buffer.from(
      'ffff00000000000000000000000a0000000000000014ffff',
      'hex',
    );
    expect(PgSnapshotType.decodeBinary!(buf, 2, 20, {})).toStrictEqual(
      '10:20:',
    );
  });

  it('should claim only the literal form, and not join inference', () => {
    expect(PgSnapshotType.isType('10:20:12,15')).toStrictEqual(true);
    expect(PgSnapshotType.isType('10:20')).toStrictEqual(false);
    expect(PgSnapshotType.isType(42)).toStrictEqual(false);
    expect(PgSnapshotType.inferrable).toStrictEqual(false);
    expect(TxidSnapshotType.inferrable).toStrictEqual(false);
  });

  it('should be the same codec under both names', () => {
    expect(TxidSnapshotType.name).toStrictEqual('txid_snapshot');
    expect(PgSnapshotType.name).toStrictEqual('pg_snapshot');
    expect(PgSnapshotType.oid).not.toStrictEqual(TxidSnapshotType.oid);
  });
});
