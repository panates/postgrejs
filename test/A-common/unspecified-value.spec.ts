import { expect } from 'expect';
import { Point } from '../../src/data-types/classes/geometric.js';
import {
  resolveToPostgres,
  unspecifiedText,
} from '../../src/util/unspecified-value.js';

/**
 * What a parameter with no declared type is written as. Pinned because
 * getting it wrong is silent: the old answer for an object was
 * `[object Object]`, which the server accepts into a text column and
 * writes a row for.
 */
describe('resolveToPostgres()', () => {
  it('should follow toPostgres() and keep following it', () => {
    const inner = { toPostgres: () => 'done' };
    expect(resolveToPostgres({ toPostgres: () => inner })).toStrictEqual(
      'done',
    );
  });

  it('should hand back whatever kind of value it reaches', () => {
    const d = new Date('2026-01-02T03:04:05Z');
    expect(resolveToPostgres({ toPostgres: () => d })).toBe(d);
    expect(resolveToPostgres({ toPostgres: () => [1, 2] })).toStrictEqual([
      1, 2,
    ]);
    expect(resolveToPostgres({ toPostgres: () => null })).toStrictEqual(null);
  });

  it('should leave a value that has none', () => {
    const o = { a: 1 };
    expect(resolveToPostgres(o)).toBe(o);
    expect(resolveToPostgres('abc')).toStrictEqual('abc');
    expect(resolveToPostgres(5)).toStrictEqual(5);
    expect(resolveToPostgres(null)).toStrictEqual(null);
    expect(resolveToPostgres(undefined)).toStrictEqual(undefined);
  });

  it('should refuse a cycle rather than hang', () => {
    const a: any = {};
    a.toPostgres = () => a;
    expect(() => resolveToPostgres(a)).toThrow(/[Cc]ircular/);
  });
});

describe('unspecifiedText()', () => {
  it('should write a plain object as JSON', () => {
    expect(unspecifiedText({ a: 1, b: 'x' })).toStrictEqual('{"a":1,"b":"x"}');
    expect(unspecifiedText({ a: { b: [1, 2] } })).toStrictEqual(
      '{"a":{"b":[1,2]}}',
    );
  });

  it('should prefer toPostgres() over JSON', () => {
    expect(
      unspecifiedText({ n: 5, toPostgres: () => 'custom:5' }),
    ).toStrictEqual('custom:5');
  });

  it('should leave this client s own classes exactly where they were', () => {
    // Every one of their toPostgres() is `return this.toString()`, so
    // this path reaches the same text it reached before rule 2 existed.
    const p = new Point(1, 2);
    expect(unspecifiedText(p)).toStrictEqual('(1,2)');
    expect(unspecifiedText(p)).toStrictEqual('' + p);
  });

  it('should leave the kinds that have a branch of their own', () => {
    // A Date, an array and a Buffer never reach this in the Bind, and
    // what it does with them is what `'' + v` did.
    const d = new Date('2026-01-02T03:04:05Z');
    expect(unspecifiedText(d)).toStrictEqual('' + d);
    expect(unspecifiedText([1, 2])).toStrictEqual('1,2');
    expect(unspecifiedText(Buffer.from('ab'))).toStrictEqual('ab');
  });

  it('should write anything else as its own text', () => {
    expect(unspecifiedText('abc')).toStrictEqual('abc');
    expect(unspecifiedText(1.5)).toStrictEqual('1.5');
    expect(unspecifiedText(10n)).toStrictEqual('10');
    expect(unspecifiedText(true)).toStrictEqual('true');
  });
});
