import { expect } from 'expect';
import { fastParseFloatBuffer } from '../../src/util/fast-parsefloat.js';

/** Decodes `str` from inside a larger buffer, so offset/len are exercised too. */
function parse(str: string): number {
  const buf = Buffer.from('##' + str + '##', 'latin1');
  return fastParseFloatBuffer(buf, 2, Buffer.byteLength(str, 'latin1'));
}

/** What the implementation this replaced did, and must keep agreeing with. */
function reference(str: string): number {
  return parseFloat(str);
}

describe('fastParseFloatBuffer()', () => {
  it('should decode the shapes PostgreSQL emits for a float column', () => {
    expect(parse('0')).toStrictEqual(0);
    expect(parse('1')).toStrictEqual(1);
    expect(parse('-1')).toStrictEqual(-1);
    expect(parse('1.5')).toStrictEqual(1.5);
    expect(parse('-1.5')).toStrictEqual(-1.5);
    expect(parse('3.14159265358979')).toStrictEqual(3.14159265358979);
    expect(parse('1e10')).toStrictEqual(1e10);
    expect(parse('1E10')).toStrictEqual(1e10);
    expect(parse('1e+10')).toStrictEqual(1e10);
    expect(parse('1e-10')).toStrictEqual(1e-10);
    expect(parse('-2.5e-7')).toStrictEqual(-2.5e-7);
  });

  it('should keep negative zero distinct from zero', () => {
    // PostgreSQL emits "-0", and Object.is is what tells the two apart.
    expect(Object.is(parse('-0'), -0)).toStrictEqual(true);
    expect(Object.is(parse('-0.0'), -0)).toStrictEqual(true);
    expect(Object.is(parse('0'), 0)).toStrictEqual(true);
  });

  it('should defer to parseFloat for the non-finite words', () => {
    expect(parse('NaN')).toBeNaN();
    expect(parse('Infinity')).toStrictEqual(Infinity);
    expect(parse('-Infinity')).toStrictEqual(-Infinity);
  });

  it('should return NaN for input that is not a number at all', () => {
    for (const s of ['', 'x', '--1', '.', 'e5', '+', '-'])
      expect(parse(s)).toBeNaN();
  });

  it('should stop at the first character that cannot belong to the number', () => {
    // parseFloat() reads a valid prefix and ignores the rest; anything that
    // does not consume the whole input has to be handed to it to match.
    for (const s of ['1.5x', '1.2.3', '5.', '1e', '1e+', '1ee5', '1 2'])
      expect(parse(s)).toStrictEqual(reference(s));
  });

  it('should match parseFloat past the range it can decode exactly', () => {
    // More digits than a double carries exactly, or an exponent whose power
    // of ten is not itself exact - both fall back rather than approximate.
    for (const s of [
      '1234567890123456',
      '12345678901234567890',
      '9007199254740993',
      '0.000000000000000000001',
      '1e23',
      '1e-23',
      '5.35e+234',
      '1.7976931348623157e308',
      '5e-324',
      '1e309',
      '1e-400',
    ])
      expect(parse(s)).toStrictEqual(reference(s));
  });

  it('should not mistake a large exponent for a small one', () => {
    // Regression: an exponent read digit by digit and clamped mid-way would
    // turn 234 into 23 and decode a number off by 211 orders of magnitude,
    // silently, instead of falling back.
    expect(parse('5.35e+234')).toStrictEqual(5.35e234);
    expect(parse('-3.04897278547287e+288')).toStrictEqual(
      -3.04897278547287e288,
    );
    expect(parse('1e1000')).toStrictEqual(Infinity);
    expect(parse('1e-1000')).toStrictEqual(0);
    // Long enough that the running exponent value is pinned rather than
    // accumulated any further.
    expect(parse('1e99999')).toStrictEqual(Infinity);
    expect(parse('-1e99999')).toStrictEqual(-Infinity);
    expect(parse('1e-99999')).toStrictEqual(0);
  });

  it('should still decode exactly when a large exponent folds into a small mantissa', () => {
    // 1.2345678e+30 needs 10^23, which is not exact - but scaling its
    // eight-digit mantissa up by 10 keeps it a whole number a double holds
    // exactly, leaving a single exact power of ten to multiply by.
    expect(parse('1.2345678e+30')).toStrictEqual(1.2345678e30);
    expect(parse('-9.8765425e+30')).toStrictEqual(-9.8765425e30);
    expect(parse('1e30')).toStrictEqual(1e30);
    expect(parse('123e40')).toStrictEqual(123e40);
    // Past what folding can rescue, it goes back to parseFloat.
    expect(parse('1.234567890123456e+100')).toStrictEqual(
      reference('1.234567890123456e+100'),
    );
    expect(parse('123456789012345e30')).toStrictEqual(
      reference('123456789012345e30'),
    );
  });

  it('should agree with parseFloat across the exactness boundary', () => {
    const mantissa = '1234567890123456789';
    for (let digits = 1; digits <= 18; digits++) {
      for (let exponent = -30; exponent <= 30; exponent++) {
        for (const sign of ['', '-']) {
          const s = `${sign}${mantissa.slice(0, digits)}e${exponent}`;
          expect(parse(s)).toStrictEqual(reference(s));
        }
      }
    }
  });

  it('should default offset and length to the whole buffer', () => {
    expect(fastParseFloatBuffer(Buffer.from('2.5', 'latin1'))).toStrictEqual(
      2.5,
    );
    expect(
      fastParseFloatBuffer(Buffer.from('xx2.5', 'latin1'), 2),
    ).toStrictEqual(2.5);
  });
});
