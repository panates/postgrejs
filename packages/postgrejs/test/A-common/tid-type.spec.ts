import { expect } from 'expect';
import { PgLsnType } from '../../src/data-types/pg-lsn-type.js';
import { TidType } from '../../src/data-types/tid-type.js';
import { SmartBuffer } from '../../src/protocol/smart-buffer.js';

function wire(t: typeof TidType, v: any): string {
  const buf = new SmartBuffer();
  t.encodeBinary!(buf, v, {});
  return buf.buffer.toString('hex', 0, buf.size);
}

function decodeHex(t: typeof TidType, hex: string): any {
  const buf = Buffer.from(hex, 'hex');
  return t.decodeBinary!(buf, 0, buf.length, {});
}

describe('TidType', () => {
  it('should read a uint32 block and a uint16 offset', () => {
    expect(decodeHex(TidType, '000000000001')).toStrictEqual('(0,1)');
    expect(decodeHex(TidType, '0000007b002d')).toStrictEqual('(123,45)');
    // Both halves unsigned, to the top of their range.
    expect(decodeHex(TidType, 'ffffffffffff')).toStrictEqual(
      '(4294967295,65535)',
    );
  });

  it('should write six bytes', () => {
    expect(wire(TidType, '(0,1)')).toStrictEqual('000000000001');
    expect(wire(TidType, '(4294967295,65535)')).toStrictEqual('ffffffffffff');
    expect(wire(TidType, '( 123 , 45 )')).toStrictEqual('0000007b002d');
  });

  it('should refuse anything that is not a tid', () => {
    expect(() => wire(TidType, '0,1')).toThrow('not a valid tid');
    expect(() => wire(TidType, '(a,b)')).toThrow('not a valid tid');
    expect(() => wire(TidType, 42)).toThrow('not a valid tid');
  });

  it('should read from the offset it is given', () => {
    const buf = Buffer.from('ffff000000000001ffff', 'hex');
    expect(TidType.decodeBinary!(buf, 2, 6, {})).toStrictEqual('(0,1)');
  });

  it('should claim only the literal form, and not join inference', () => {
    expect(TidType.isType('(0,1)')).toStrictEqual(true);
    expect(TidType.isType('(0,1,2)')).toStrictEqual(false);
    expect(TidType.isType(42)).toStrictEqual(false);
    expect(TidType.inferrable).toStrictEqual(false);
  });
});

describe('PgLsnType', () => {
  it('should print both halves in upper-case hex, neither padded', () => {
    // `0/0` and `A/B` are what the server writes - not `0/00000000`.
    expect(decodeHex(PgLsnType, '00000016b374d848')).toStrictEqual(
      '16/B374D848',
    );
    expect(decodeHex(PgLsnType, '0000000000000000')).toStrictEqual('0/0');
    expect(decodeHex(PgLsnType, '0000000000000001')).toStrictEqual('0/1');
    expect(decodeHex(PgLsnType, '0000000a0000000b')).toStrictEqual('A/B');
    expect(decodeHex(PgLsnType, 'ffffffffffffffff')).toStrictEqual(
      'FFFFFFFF/FFFFFFFF',
    );
  });

  it('should write the two halves back', () => {
    expect(wire(PgLsnType, '16/B374D848')).toStrictEqual('00000016b374d848');
    expect(wire(PgLsnType, '0/0')).toStrictEqual('0000000000000000');
    // A padded spelling is accepted; the server prints it back trimmed.
    expect(wire(PgLsnType, 'A/0000000B')).toStrictEqual('0000000a0000000b');
    expect(wire(PgLsnType, '16/b374d848')).toStrictEqual('00000016b374d848');
  });

  it('should refuse anything that is not an LSN', () => {
    expect(() => wire(PgLsnType, '16')).toThrow('not a valid pg_lsn');
    expect(() => wire(PgLsnType, '16/GGGGGGGG')).toThrow('not a valid pg_lsn');
    expect(() => wire(PgLsnType, '123456789/0')).toThrow('not a valid pg_lsn');
    expect(() => wire(PgLsnType, 42)).toThrow('not a valid pg_lsn');
  });

  it('should claim only the literal form, and not join inference', () => {
    expect(PgLsnType.isType('16/B374D848')).toStrictEqual(true);
    expect(PgLsnType.isType('16')).toStrictEqual(false);
    expect(PgLsnType.inferrable).toStrictEqual(false);
    const buf = Buffer.from('  0/1  ');
    expect(PgLsnType.decodeTextBuffer!(buf, 2, 3, {})).toStrictEqual('0/1');
  });
});
