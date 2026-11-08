import { expect } from 'expect';
import { CidType, Xid8Type, XidType } from '../../src/data-types/xid-type.js';
import { SmartBuffer } from '../../src/protocol/smart-buffer.js';

function wire(t: typeof XidType, v: any): string {
  const buf = new SmartBuffer();
  t.encodeBinary!(buf, v, {});
  // `buffer` is the whole allocation, `size` is how much was written.
  return buf.buffer.toString('hex', 0, buf.size);
}

function roundTrip(t: typeof XidType, v: any): any {
  const buf = new SmartBuffer();
  t.encodeBinary!(buf, v, {});
  return t.decodeBinary!(buf.buffer, 0, buf.size, {});
}

function decodeHex(t: typeof XidType, hex: string): any {
  const buf = Buffer.from(hex, 'hex');
  return t.decodeBinary!(buf, 0, buf.length, {});
}

describe('XidType / CidType', () => {
  it('should read an unsigned 32-bit counter', () => {
    // Unsigned: a transaction id runs to 4294967295, which read as
    // signed would come back as -1.
    expect(decodeHex(XidType, 'ffffffff')).toStrictEqual(4294967295);
    expect(decodeHex(XidType, '0000002a')).toStrictEqual(42);
    expect(decodeHex(CidType, '00000000')).toStrictEqual(0);
  });

  it('should write four bytes', () => {
    expect(wire(XidType, 42)).toStrictEqual('0000002a');
    expect(wire(XidType, 4294967295)).toStrictEqual('ffffffff');
    expect(wire(CidType, 42)).toStrictEqual('0000002a');
  });

  it('should read the text form as a number', () => {
    expect(XidType.decodeText!('4294967295', {})).toStrictEqual(4294967295);
    const buf = Buffer.from('  42  ');
    expect(XidType.decodeTextBuffer!(buf, 2, 2, {})).toStrictEqual(42);
  });

  it('should stay out of inference, or it would swallow every integer', () => {
    // It is registered after int4, so it would be asked first and would
    // claim every positive integer that fits 32 bits.
    expect(XidType.inferrable).toStrictEqual(false);
    expect(CidType.inferrable).toStrictEqual(false);
    expect(Xid8Type.inferrable).toStrictEqual(false);
  });

  it('should still answer isType truthfully', () => {
    expect(XidType.isType(42)).toStrictEqual(true);
    expect(XidType.isType(4294967296)).toStrictEqual(false);
    expect(XidType.isType(-1)).toStrictEqual(false);
    expect(XidType.isType('42')).toStrictEqual(false);
  });
});

describe('Xid8Type', () => {
  it('should read the two halves unsigned', () => {
    expect(decodeHex(Xid8Type, '0000000000000000')).toStrictEqual(0);
    expect(decodeHex(Xid8Type, '00000000499602d2')).toStrictEqual(1234567890);
  });

  it('should hand back a number while one is exact, and a BigInt after', () => {
    // 0x1fffffffffffff is Number.MAX_SAFE_INTEGER, the last value a
    // number holds without losing a digit.
    expect(decodeHex(Xid8Type, '001fffffffffffff')).toStrictEqual(
      9007199254740991,
    );
    expect(decodeHex(Xid8Type, '0020000000000000')).toStrictEqual(
      9007199254740992n,
    );
    // The whole range, which read as signed would be -1.
    expect(decodeHex(Xid8Type, 'ffffffffffffffff')).toStrictEqual(
      18446744073709551615n,
    );
  });

  it('should round-trip a number and a BigInt alike', () => {
    expect(roundTrip(Xid8Type, 1234567890)).toStrictEqual(1234567890);
    expect(roundTrip(Xid8Type, 18446744073709551615n)).toStrictEqual(
      18446744073709551615n,
    );
    expect(wire(Xid8Type, 1234567890)).toStrictEqual('00000000499602d2');
  });

  it('should read the text form the same way', () => {
    expect(Xid8Type.decodeText!('1234567890', {})).toStrictEqual(1234567890);
    expect(Xid8Type.decodeText!('18446744073709551615', {})).toStrictEqual(
      18446744073709551615n,
    );
    const buf = Buffer.from('18446744073709551615');
    expect(Xid8Type.decodeTextBuffer!(buf, 0, buf.length, {})).toStrictEqual(
      18446744073709551615n,
    );
  });
});
