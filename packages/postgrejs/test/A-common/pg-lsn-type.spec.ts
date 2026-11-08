import { expect } from 'expect';
import { PgLsnType } from '../../src/data-types/pg-lsn-type.js';

/**
 * The text is written into one reused scratch and read back, instead of
 * `toString(16).toUpperCase()` per half - four strings a value, 245 ns
 * against 76 ns over values that vary.
 *
 * `test/C-data-types/pg_lsn.spec.ts` checks the spelling against a live
 * server; what is left for here is the part a shared buffer brings with
 * it, and the unpadded halves the loop has to get right on its own.
 */
describe('PgLsnType.decodeBinary()', () => {
  const wire = (hi: number, lo: number): Buffer => {
    const b = Buffer.alloc(8);
    b.writeUInt32BE(hi, 0);
    b.writeUInt32BE(lo, 4);
    return b;
  };
  const decode = (hi: number, lo: number): string =>
    PgLsnType.decodeBinary!(wire(hi, lo), 0, 8, {}) as string;

  it('should pad neither half, and still write a zero as one digit', () => {
    expect(decode(0, 0)).toStrictEqual('0/0');
    expect(decode(0, 1)).toStrictEqual('0/1');
    expect(decode(1, 0)).toStrictEqual('1/0');
    expect(decode(0xa, 0xb)).toStrictEqual('A/B');
    expect(decode(0x16, 0xb374d848)).toStrictEqual('16/B374D848');
    expect(decode(0xffffffff, 0xffffffff)).toStrictEqual('FFFFFFFF/FFFFFFFF');
  });

  it('should keep the zeros that are not leading ones', () => {
    expect(decode(0, 0x10000000)).toStrictEqual('0/10000000');
    expect(decode(0x100, 0x1000001)).toStrictEqual('100/1000001');
  });

  it('should not let one value reach into the next', () => {
    // The scratch is shared and the halves are variable-width, so a
    // longer value read after a shorter one must not leave its tail
    // behind - the string is taken at the length that was written.
    const long = decode(0xffffffff, 0xffffffff);
    const short = decode(0, 0);
    expect(long).toStrictEqual('FFFFFFFF/FFFFFFFF');
    expect(short).toStrictEqual('0/0');
    expect(decode(0xa, 0xb)).toStrictEqual('A/B');
  });

  it('should read from the offset it is given', () => {
    const buf = Buffer.concat([Buffer.alloc(3, 0xee), wire(0x16, 0xb374d848)]);
    expect(PgLsnType.decodeBinary!(buf, 3, 8, {})).toStrictEqual('16/B374D848');
  });

  it('should hand the string over as written for the literal path', () => {
    expect(PgLsnType.encodeText!('16/B374D848', {})).toStrictEqual(
      '16/B374D848',
    );
  });
});
