import { expect } from 'expect';
import {
  arrayLeaf,
  isUnspecifiedParam,
} from '../../src/util/unspecified-param.js';

/**
 * Which values go out with no declared type. Pinned here because the
 * answer is what decides whether the server or this client picks the
 * type, and the consequence of getting it wrong is silent - a value the
 * server reads as something else.
 */
describe('isUnspecifiedParam()', () => {
  it('should claim a string', () => {
    expect(isUnspecifiedParam('abc')).toStrictEqual(true);
    expect(isUnspecifiedParam('')).toStrictEqual(true);
  });

  it('should claim a Date', () => {
    expect(isUnspecifiedParam(new Date())).toStrictEqual(true);
  });

  it('should claim an array of either, however deep', () => {
    expect(isUnspecifiedParam(['a', 'b'])).toStrictEqual(true);
    expect(isUnspecifiedParam([[['a']]])).toStrictEqual(true);
    expect(isUnspecifiedParam([new Date()])).toStrictEqual(true);
    expect(isUnspecifiedParam([[new Date()]])).toStrictEqual(true);
  });

  it('should leave a value that can say what it is', () => {
    // A number, a boolean and a Buffer are already declared correctly
    // nearly everywhere, and sending them as text would give up the
    // binary encoding for nothing.
    expect(isUnspecifiedParam(5)).toStrictEqual(false);
    expect(isUnspecifiedParam(true)).toStrictEqual(false);
    expect(isUnspecifiedParam(Buffer.from('a'))).toStrictEqual(false);
    expect(isUnspecifiedParam([1, 2])).toStrictEqual(false);
    expect(isUnspecifiedParam({ a: 1 })).toStrictEqual(false);
  });

  it('should leave a value it cannot read an element from', () => {
    // An empty array and a null answer nothing, so determine() keeps
    // them - which is what it did before any of this.
    expect(isUnspecifiedParam([])).toStrictEqual(false);
    expect(isUnspecifiedParam(null)).toStrictEqual(false);
    expect(isUnspecifiedParam(undefined)).toStrictEqual(false);
  });
});

describe('arrayLeaf()', () => {
  it('should answer a scalar with itself', () => {
    expect(arrayLeaf('a')).toStrictEqual('a');
    expect(arrayLeaf(5)).toStrictEqual(5);
  });

  it('should descend every level of an array', () => {
    expect(arrayLeaf([[['a', 'b']]])).toStrictEqual('a');
  });

  it('should answer undefined for an empty array', () => {
    expect(arrayLeaf([])).toStrictEqual(undefined);
    expect(arrayLeaf([[]])).toStrictEqual(undefined);
  });
});
