import { expect } from 'expect';
import { Range } from 'postgrejs';

describe('Range', () => {
  it('should default to the bounds PostgreSQL defaults to', () => {
    const r = new Range(1, 10);
    expect(r.lower).toStrictEqual(1);
    expect(r.upper).toStrictEqual(10);
    expect(r.lowerInclusive).toStrictEqual(true);
    expect(r.upperInclusive).toStrictEqual(false);
    expect(r.isEmpty).toStrictEqual(false);
  });

  it('should take the bounds the way the server writes them', () => {
    expect(String(new Range(1, 10, '[]'))).toStrictEqual('[1,10]');
    expect(String(new Range(1, 10, '()'))).toStrictEqual('(1,10)');
    expect(String(new Range(1, 10, '(]'))).toStrictEqual('(1,10]');
  });

  it('should never call an absent bound inclusive', () => {
    // The server prints `(` for an unbounded end whatever was asked for.
    const r = new Range(null, 10, '[]');
    expect(r.lowerInclusive).toStrictEqual(false);
    expect(String(r)).toStrictEqual('(,10]');
    expect(String(new Range(null, null))).toStrictEqual('(,)');
  });

  it('should keep empty apart from unbounded', () => {
    // `empty` contains no values; `(,)` contains all of them. Only the
    // flag tells them apart - the bounds are null either way.
    const empty = Range.empty();
    const all = new Range();
    expect(empty.isEmpty).toStrictEqual(true);
    expect(all.isEmpty).toStrictEqual(false);
    expect(String(empty)).toStrictEqual('empty');
    expect(String(all)).toStrictEqual('(,)');
  });

  it('should quote a bound that would otherwise be read as punctuation', () => {
    // What the server does: quotes when the value is empty or carries
    // whitespace or any of the literal's own characters, doubling a
    // quote and a backslash inside.
    expect(String(new Range('a', 'b'))).toStrictEqual('[a,b)');
    expect(String(new Range('a,b', 'c'))).toStrictEqual('["a,b",c)');
    expect(String(new Range('c"d', 'e'))).toStrictEqual('["c""d",e)');
    expect(String(new Range('e\\f', 'g'))).toStrictEqual('["e\\\\f",g)');
    expect(String(new Range(' g ', 'h'))).toStrictEqual('[" g ",h)');
    expect(String(new Range('[h]', 'i'))).toStrictEqual('["[h]",i)');
  });

  it('should print a Date bound as the instant it holds', () => {
    // It cannot do better: a Range holds Dates and does not know whether
    // it came from a daterange, a tsrange or a tstzrange, which the
    // server renders three different ways. The exact wire form comes from
    // passing the Range as a parameter instead.
    const r = new Range(
      new Date('2020-01-01T00:00:00Z'),
      new Date('2020-02-01T00:00:00Z'),
    );
    // Unquoted, since an ISO timestamp carries none of the characters
    // the literal itself uses - and it casts back (verified live: the
    // server reads this into the same tstzrange).
    expect(String(r)).toStrictEqual(
      '[2020-01-01T00:00:00.000Z,2020-02-01T00:00:00.000Z)',
    );
  });

  it('should serialize to JSON as the string', () => {
    expect(JSON.stringify({ r: new Range(1, 10) })).toBe('{"r":"[1,10)"}');
    expect(JSON.stringify({ r: Range.empty() })).toBe('{"r":"empty"}');
  });
});
