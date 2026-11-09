import { expect } from 'expect';
import { DataTypeOIDs, GlobalTypeMap } from 'postgrejs';
import { SmartBuffer } from '../../src/protocol/smart-buffer.js';

/**
 * These encoders used to accept anything: `fastParseInt()` answered NaN for
 * a value with no numeric reading, and `Buffer.writeInt32BE(NaN)` then
 * stored a silent zero that nothing downstream could tell from a real one.
 */
describe('numeric binary encode guards', () => {
  const encode = (oid: number, v: any): Buffer => {
    const io = new SmartBuffer();
    io.start();
    GlobalTypeMap.get(oid)!.encodeBinary!(io, v, {});
    return io.flush();
  };

  const INTEGERS: [string, number][] = [
    ['int2', DataTypeOIDs.int2],
    ['int4', DataTypeOIDs.int4],
    ['int8', DataTypeOIDs.int8],
    ['oid', DataTypeOIDs.oid],
  ];
  const REALS: [string, number][] = [
    ['float4', DataTypeOIDs.float4],
    ['float8', DataTypeOIDs.float8],
    ['numeric', DataTypeOIDs.numeric],
  ];
  const GARBAGE: [string, any][] = [
    ['an object', {}],
    ['a non-numeric string', 'abc'],
    ['an array', []],
    ['a boolean', true],
  ];

  for (const [typeName, oid] of [...INTEGERS, ...REALS]) {
    for (const [label, value] of GARBAGE) {
      it(`should refuse ${label} for "${typeName}"`, () => {
        expect(() => encode(oid, value)).toThrow();
      });
    }
  }

  for (const [typeName, oid] of INTEGERS) {
    it(`should refuse NaN for "${typeName}", which has no such value`, () => {
      expect(() => encode(oid, NaN)).toThrow();
    });
  }

  for (const [typeName, oid] of REALS) {
    it(`should still encode NaN for "${typeName}", where it is a value`, () => {
      // PostgreSQL stores NaN in a float or numeric column as something
      // distinct from NULL, so refusing it here would lose data a caller
      // meant to write - the opposite of the integer case above.
      expect(() => encode(oid, NaN)).not.toThrow();
      expect(() => encode(oid, Infinity)).not.toThrow();
      expect(() => encode(oid, -Infinity)).not.toThrow();
    });
  }

  it('should keep accepting numbers and numeric strings', () => {
    expect(encode(DataTypeOIDs.int4, 42).toString('hex')).toStrictEqual(
      '0000002a',
    );
    expect(encode(DataTypeOIDs.int4, '42').toString('hex')).toStrictEqual(
      '0000002a',
    );
    expect(encode(DataTypeOIDs.int4, ' -42 ').toString('hex')).toStrictEqual(
      'ffffffd6',
    );
    // A bigint is an integer a caller can perfectly well have in hand for
    // a narrower column, and the text path takes it.
    expect(encode(DataTypeOIDs.int4, 42n).toString('hex')).toStrictEqual(
      '0000002a',
    );
  });

  /**
   * Which encoding a value goes out as is not the caller's choice - it
   * follows from whether the type was declared and which statement cache
   * the query hit. So binary must refuse what the server refuses from
   * text, rather than quietly storing something else.
   */
  describe('the two encodings agree about what an integer is', () => {
    for (const [typeName, oid] of INTEGERS) {
      it(`should refuse a fractional value for "${typeName}"`, () => {
        // `'1.5'::int4` is 22P02 on the server, and this used to store 1 -
        // or -2 for -1.5, which was a floor rather than a truncation.
        expect(() => encode(oid, 1.5)).toThrow(/is not an integer/);
        expect(() => encode(oid, -1.5)).toThrow(/is not an integer/);
        expect(() => encode(oid, '1.5')).toThrow(/is not an integer/);
      });

      it(`should refuse a string the server would not read as one for "${typeName}"`, () => {
        // Every one of these used to encode: '0x10' as 0 (parseInt with a
        // radix of 10 stops at the 'x'), '' as 0 through BigInt for int8,
        // '1e3' as 1.
        expect(() => encode(oid, '0x10')).toThrow(/is not an integer/);
        expect(() => encode(oid, '')).toThrow();
        expect(() => encode(oid, '1e3')).toThrow(/is not an integer/);
      });
    }

    it('should refuse a value outside the type, naming it', () => {
      expect(() => encode(DataTypeOIDs.int2, 40000)).toThrow(
        /Cannot encode 40000 as int2: it is out of range \(-32768 to 32767\)/,
      );
      expect(() => encode(DataTypeOIDs.int4, 2 ** 40)).toThrow(/out of range/);
      expect(() => encode(DataTypeOIDs.oid, -1)).toThrow(/out of range/);
      expect(() => encode(DataTypeOIDs.int8, 2n ** 70n)).toThrow(
        /out of range/,
      );
    });

    it('should take the whole int8 range', () => {
      expect(
        encode(DataTypeOIDs.int8, 9223372036854775807n).toString('hex'),
      ).toStrictEqual('7fffffffffffffff');
      expect(
        encode(DataTypeOIDs.int8, '-9223372036854775808').toString('hex'),
      ).toStrictEqual('8000000000000000');
    });

    it('should refuse a fractional value for "xid" too', () => {
      expect(() => encode(DataTypeOIDs.xid, 1.5)).toThrow(/is not an integer/);
      expect(encode(DataTypeOIDs.xid, 42).toString('hex')).toStrictEqual(
        '0000002a',
      );
    });
  });
});
