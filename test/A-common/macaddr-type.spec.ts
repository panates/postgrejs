import { expect } from 'expect';
import {
  Macaddr8Type,
  MacaddrType,
} from '../../src/data-types/macaddr-type.js';
import { SmartBuffer } from '../../src/protocol/smart-buffer.js';

function wire(t: typeof MacaddrType, v: any): string {
  const buf = new SmartBuffer();
  t.encodeBinary!(buf, v, {});
  // `buffer` is the whole allocation, `size` is how much of it was written.
  return buf.buffer.toString('hex', 0, buf.size);
}

function decodeHex(t: typeof MacaddrType, hex: string): string {
  const buf = Buffer.from(hex, 'hex');
  return t.decodeBinary!(buf, 0, buf.length, {});
}

describe('MacaddrType / Macaddr8Type', () => {
  describe('encodeBinary()', () => {
    it('should write the address bytes and nothing else', () => {
      expect(wire(MacaddrType, '08:00:2b:01:02:03')).toStrictEqual(
        '08002b010203',
      );
      expect(wire(Macaddr8Type, '08:00:2b:01:02:03:04:05')).toStrictEqual(
        '08002b0102030405',
      );
    });

    it('should accept every spelling the server does', () => {
      // All of these are the same address to PostgreSQL.
      for (const v of [
        '08:00:2b:01:02:03',
        '08-00-2b-01-02-03',
        '0800.2b01.0203',
        '0800-2b01-0203',
        '08002b:010203',
        '08002b-010203',
        '08002b010203',
      ]) {
        expect(wire(MacaddrType, v)).toStrictEqual('08002b010203');
      }
    });

    it('should widen a six-byte address into a macaddr8', () => {
      // The modified EUI-64 rule: ff:fe goes in the middle, which is what
      // the server stores for `macaddr8 '08:00:2b:01:02:03'`.
      expect(wire(Macaddr8Type, '08:00:2b:01:02:03')).toStrictEqual(
        '08002bfffe010203',
      );
    });

    it('should not accept an eight-byte address as a macaddr', () => {
      expect(() => wire(MacaddrType, '08:00:2b:01:02:03:04:05')).toThrow(
        'not a valid macaddr',
      );
    });

    it('should refuse a wrong length, a non-hex digit and a non-string', () => {
      expect(() => wire(MacaddrType, '08:00:2b:01:02')).toThrow(
        'not a valid macaddr',
      );
      expect(() => wire(MacaddrType, '08:00:2b:01:02:0g')).toThrow(
        'not a valid macaddr',
      );
      expect(() => wire(Macaddr8Type, '08:00:2b:01:02:03:04')).toThrow(
        'not a valid macaddr8',
      );
      expect(() => wire(MacaddrType, 42)).toThrow('not a valid macaddr');
    });
  });

  describe('decodeBinary()', () => {
    it('should print colon-separated lower-case hex', () => {
      expect(decodeHex(MacaddrType, '08002B010203')).toStrictEqual(
        '08:00:2b:01:02:03',
      );
      expect(decodeHex(Macaddr8Type, '08002b0102030405')).toStrictEqual(
        '08:00:2b:01:02:03:04:05',
      );
    });

    it('should keep the leading zero of every byte', () => {
      expect(decodeHex(MacaddrType, '000000000000')).toStrictEqual(
        '00:00:00:00:00:00',
      );
    });

    it('should read from the offset it is given', () => {
      // Which is how it arrives: pointed into the shared row buffer.
      const buf = Buffer.from('ffff08002b010203ffff', 'hex');
      expect(MacaddrType.decodeBinary!(buf, 2, 6, {})).toStrictEqual(
        '08:00:2b:01:02:03',
      );
    });
  });

  describe('isType()', () => {
    it('should accept what it can encode and refuse what it cannot', () => {
      expect(MacaddrType.isType('08:00:2b:01:02:03')).toStrictEqual(true);
      expect(MacaddrType.isType('08002b010203')).toStrictEqual(true);
      expect(MacaddrType.isType('08:00:2b:01:02')).toStrictEqual(false);
      expect(MacaddrType.isType(42)).toStrictEqual(false);
      expect(Macaddr8Type.isType('08:00:2b:01:02:03:04:05')).toStrictEqual(
        true,
      );
    });

    it('should not be offered to inference - see inet-type.spec.ts', () => {
      expect(MacaddrType.inferrable).toStrictEqual(false);
      expect(Macaddr8Type.inferrable).toStrictEqual(false);
    });
  });

  it('should hand the text path over to the server as written', () => {
    expect(MacaddrType.encodeText!('08002b-010203', {})).toStrictEqual(
      '08002b-010203',
    );
    expect(MacaddrType.decodeText!('08:00:2b:01:02:03', {})).toStrictEqual(
      '08:00:2b:01:02:03',
    );
    const buf = Buffer.from('  08:00:2b:01:02:03  ');
    expect(MacaddrType.decodeTextBuffer!(buf, 2, 17, {})).toStrictEqual(
      '08:00:2b:01:02:03',
    );
  });
});
