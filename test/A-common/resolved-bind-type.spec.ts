import { expect } from 'expect';
import { DataTypeOIDs } from '../../src/constants.js';
import { resolvedBindTypes } from '../../src/util/resolved-bind-type.js';

/**
 * Which parameters a named statement's Bind may encode binary against
 * the type the server resolved. Pinned here because getting it wrong is
 * silent twice over: a value stored as something else, or an encoder
 * handed a shape it cannot read.
 */
describe('resolvedBindTypes()', () => {
  const d = new Date('2026-01-02T03:04:05Z');

  it('should take the resolved type for a Date', () => {
    expect(
      resolvedBindTypes([0], [d], [DataTypeOIDs.timestamptz]),
    ).toStrictEqual([DataTypeOIDs.timestamptz]);
    expect(resolvedBindTypes([0], [d], [DataTypeOIDs.timestamp])).toStrictEqual(
      [DataTypeOIDs.timestamp],
    );
    expect(resolvedBindTypes([0], [d], [DataTypeOIDs.date])).toStrictEqual([
      DataTypeOIDs.date,
    ]);
  });

  it('should take it for an array of Dates, however deep', () => {
    expect(
      resolvedBindTypes([0], [[d, d]], [DataTypeOIDs._timestamptz]),
    ).toStrictEqual([DataTypeOIDs._timestamptz]);
    expect(resolvedBindTypes([0], [[[d]]], [DataTypeOIDs._date])).toStrictEqual(
      [DataTypeOIDs._date],
    );
  });

  it('should refuse time, whose binary encoder cannot take a Date', () => {
    // TimeType.encodeBinary() multiplies the whole epoch by 1000 and
    // overflows: measured, the server answers 22008 "time out of range"
    // for any ordinary instant, where the text path stores the wall
    // clock correctly.
    expect(resolvedBindTypes([0], [d], [DataTypeOIDs.time])).toStrictEqual([0]);
    expect(resolvedBindTypes([0], [d], [DataTypeOIDs.timetz])).toStrictEqual([
      0,
    ]);
  });

  it('should refuse a type whose arity does not match the value', () => {
    // getBindMessage() picks its encoder from the type alone, so a
    // scalar type would be handed the whole array.
    expect(
      resolvedBindTypes([0], [[d]], [DataTypeOIDs.timestamptz]),
    ).toStrictEqual([0]);
    expect(
      resolvedBindTypes([0], [d], [DataTypeOIDs._timestamptz]),
    ).toStrictEqual([0]);
  });

  it('should leave anything that is not a Date', () => {
    const declared = [0, 0, 0, 0];
    const params = [1.5, 'a', [1, 2], Buffer.from([1])];
    const resolved = [
      DataTypeOIDs.timestamptz,
      DataTypeOIDs.timestamptz,
      DataTypeOIDs._timestamptz,
      DataTypeOIDs.timestamptz,
    ];
    expect(resolvedBindTypes(declared, params, resolved)).toStrictEqual(
      declared,
    );
  });

  it('should leave a type the caller named', () => {
    // A named type is an answer, not a guess.
    expect(
      resolvedBindTypes(
        [DataTypeOIDs.timestamp],
        [d],
        [DataTypeOIDs.timestamptz],
      ),
    ).toStrictEqual([DataTypeOIDs.timestamp]);
  });

  it('should return what it was given when nothing can be improved', () => {
    // The common call: same reference back, so it allocates nothing.
    const declared = [0];
    expect(resolvedBindTypes(declared, [1], [DataTypeOIDs.int4])).toBe(
      declared,
    );
    expect(resolvedBindTypes(declared, [d], undefined)).toBe(declared);
    expect(
      resolvedBindTypes(declared, undefined, [DataTypeOIDs.timestamptz]),
    ).toBe(declared);
    expect(
      resolvedBindTypes(undefined, [d], [DataTypeOIDs.int4]),
    ).toBeUndefined();
  });

  it('should fill a vector when the caller declared none at all', () => {
    expect(
      resolvedBindTypes(
        undefined,
        [d, 1],
        [DataTypeOIDs.timestamptz, DataTypeOIDs.int4],
      ),
    ).toStrictEqual([DataTypeOIDs.timestamptz, 0]);
  });
});
