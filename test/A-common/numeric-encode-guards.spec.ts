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
    // Truncating a float into an integer column is long-standing behaviour
    // and stays - only "not a number at all" is refused.
    expect(encode(DataTypeOIDs.int4, 3.7).toString('hex')).toStrictEqual(
      '00000003',
    );
  });
});
