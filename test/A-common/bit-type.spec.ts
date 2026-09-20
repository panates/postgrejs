import { expect } from 'expect';
import { BitType, VarbitType } from '../../src/data-types/bit-type.js';
import { SmartBuffer } from '../../src/protocol/smart-buffer.js';

function wire(v: any): string {
  const buf = new SmartBuffer();
  VarbitType.encodeBinary!(buf, v, {});
  // `buffer` is the whole allocation, `size` is how much of it was written.
  return buf.buffer.toString('hex', 0, buf.size);
}

function roundTrip(v: any): string {
  const buf = new SmartBuffer();
  VarbitType.encodeBinary!(buf, v, {});
  return VarbitType.decodeBinary!(buf.buffer, 0, buf.size, {});
}

function decodeHex(hex: string): string {
  const buf = Buffer.from(hex, 'hex');
  return VarbitType.decodeBinary!(buf, 0, buf.length, {});
}

describe('BitType / VarbitType', () => {
  describe('decodeBinary()', () => {
    // Each hex string is what the live server sent for the value named.
    it('should read an int32 count and then the packed bits', () => {
      expect(decodeHex('00000004a0')).toStrictEqual('1010');
      expect(decodeHex('00000008b1')).toStrictEqual('10110001');
      expect(decodeHex('000000108001')).toStrictEqual('1000000000000001');
    });

    it('should stop at the bit count, not at the end of the last byte', () => {
      // A single 1 arrives as a whole padded byte; reading the byte would
      // answer '10000000'.
      expect(decodeHex('0000000180')).toStrictEqual('1');
      expect(decodeHex('00000009ff80')).toStrictEqual('111111111');
    });

    it('should read a zero-length value, which is the count and nothing else', () => {
      expect(decodeHex('00000000')).toStrictEqual('');
    });

    it('should read from the offset it is given', () => {
      // Which is how it arrives: pointed into the shared row buffer.
      const buf = Buffer.from('ffff00000004a0ffff', 'hex');
      expect(VarbitType.decodeBinary!(buf, 2, 5, {})).toStrictEqual('1010');
    });
  });

  describe('encodeBinary()', () => {
    it('should pack the bits most-significant first and pad the last byte', () => {
      expect(wire('1010')).toStrictEqual('00000004a0');
      expect(wire('1')).toStrictEqual('0000000180');
      expect(wire('111111111')).toStrictEqual('00000009ff80');
    });

    it('should write a zero-length value as the count alone', () => {
      expect(wire('')).toStrictEqual('00000000');
    });

    it('should round-trip every length, whole bytes or not', () => {
      for (const v of [
        '',
        '0',
        '1',
        '1010',
        '11111111',
        '111111111',
        '10110001',
        '1000000000000001',
        '0'.repeat(70),
        '1'.repeat(70),
        '10'.repeat(35),
      ]) {
        expect(roundTrip(v)).toStrictEqual(v);
      }
    });

    it('should refuse anything but a string of 0 and 1', () => {
      expect(() => wire('1012')).toThrow('not a valid varbit');
      expect(() => wire('hello')).toThrow('not a valid varbit');
      expect(() => wire(1010)).toThrow('not a valid varbit');
      const buf = new SmartBuffer();
      expect(() => BitType.encodeBinary!(buf, '2', {})).toThrow(
        'not a valid bit',
      );
    });
  });

  describe('isType()', () => {
    it('should accept a string of 0 and 1, including an empty one', () => {
      expect(VarbitType.isType('1010')).toStrictEqual(true);
      expect(VarbitType.isType('')).toStrictEqual(true);
      expect(BitType.isType('1')).toStrictEqual(true);
    });

    it('should refuse anything else', () => {
      expect(VarbitType.isType('1012')).toStrictEqual(false);
      expect(VarbitType.isType(1010)).toStrictEqual(false);
      expect(VarbitType.isType(null)).toStrictEqual(false);
    });

    it('should not be offered to inference', () => {
      // "0" and "1" are ordinary strings far more often than bit strings.
      expect(BitType.inferrable).toStrictEqual(false);
      expect(VarbitType.inferrable).toStrictEqual(false);
    });
  });

  it('should carry the two types under their own names and OIDs', () => {
    expect(BitType.name).toStrictEqual('bit');
    expect(VarbitType.name).toStrictEqual('varbit');
    expect(BitType.oid).not.toStrictEqual(VarbitType.oid);
  });

  it('should hand the text path over as written', () => {
    expect(VarbitType.encodeText!('1010', {})).toStrictEqual('1010');
    expect(VarbitType.decodeText!('1010', {})).toStrictEqual('1010');
    const buf = Buffer.from('  1010  ');
    expect(VarbitType.decodeTextBuffer!(buf, 2, 4, {})).toStrictEqual('1010');
  });
});
