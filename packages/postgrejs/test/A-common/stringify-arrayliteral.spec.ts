import { expect } from 'expect';
import { stringifyArrayLiteral } from 'postgrejs';

describe('stringifyArrayLiteral()', () => {
  it('should stringify a flat array', () => {
    // A number's text is written bare, the way the server prints it -
    // nothing in it is special to the literal grammar. Anything else is
    // quoted.
    expect(stringifyArrayLiteral([1, 2, 3])).toStrictEqual('{1,2,3}');
  });

  it('should stringify an empty array', () => {
    expect(stringifyArrayLiteral([])).toStrictEqual('{}');
  });

  it('should turn null/undefined elements into NULL, unquoted', () => {
    expect(stringifyArrayLiteral([1, null, undefined, 2])).toStrictEqual(
      '{1,NULL,NULL,2}',
    );
  });

  it('should escape embedded backslashes and double quotes', () => {
    // Backslashes and double quotes are the two characters the array
    // literal grammar itself gives meaning to - both must be escaped, or
    // the server would misparse the value's own boundaries.
    expect(stringifyArrayLiteral(['a"b', 'c\\d'])).toStrictEqual(
      '{"a\\"b","c\\\\d"}',
    );
  });

  it('should quote a string that needs no escaping', () => {
    // The escape pass is skipped when neither character is present, which
    // must not also skip the quotes: a comma, a brace or a space inside an
    // unquoted element would end it or be trimmed.
    expect(stringifyArrayLiteral(['a,b', '{c}', ' d '])).toStrictEqual(
      '{"a,b","{c}"," d "}',
    );
  });

  it('should keep the string "NULL" apart from a null element', () => {
    expect(stringifyArrayLiteral(['NULL', null])).toStrictEqual(
      '{"NULL",NULL}',
    );
  });

  it('should stringify a 2D array', () => {
    expect(
      stringifyArrayLiteral([
        [1, 2],
        [3, 4],
      ]),
    ).toStrictEqual('{{1,2},{3,4}}');
  });

  it('should pad a ragged nested array out to the widest row with NULL', () => {
    // arrayCalculateDim() sizes every sub-level to the LONGEST row it
    // finds, so a shorter row is walked past its own end - missing
    // elements there read as `undefined`, which must render as NULL like
    // any other missing value, not throw or silently truncate the row.
    expect(stringifyArrayLiteral([[1, 2, 3], [4]])).toStrictEqual(
      '{{1,2,3},{4,NULL,NULL}}',
    );
  });

  it('should wrap a bare scalar found at a non-leaf level into its own (NULL-padded) row', () => {
    // A ragged input where one row is a scalar instead of a nested array
    // (e.g. [[1, 2], 3]) still has to produce a rectangular literal - the
    // scalar becomes a one-element row, then padded like any other row.
    expect(stringifyArrayLiteral([[1, 2], 3])).toStrictEqual(
      '{{1,2},{3,NULL}}',
    );
  });

  it('should recurse into a nested array found where a leaf value is expected', () => {
    expect(stringifyArrayLiteral([1, [2, 3]])).toStrictEqual(
      '{{1,NULL},{2,3}}',
    );
  });

  it('should apply the encode function to each leaf value before quoting it', () => {
    const encode = (v: any) => `<${v}>`;
    expect(stringifyArrayLiteral([1, 2], undefined, encode)).toStrictEqual(
      '{"<1>","<2>"}',
    );
  });

  it('should pass options through to the encode function', () => {
    const encode = (v: any, options: any) => `${v}:${options.tag}`;
    expect(
      stringifyArrayLiteral([1], { tag: 'x' } as any, encode),
    ).toStrictEqual('{"1:x"}');
  });

  it('should stringify and quote scalar elements when no encode function is given', () => {
    expect(stringifyArrayLiteral([1, 2.5, true])).toStrictEqual(
      '{1,2.5,"true"}',
    );
  });

  describe('which elements go out bare', () => {
    it('should write every shape of number a JS value can print', () => {
      expect(
        stringifyArrayLiteral([0, -0, -12, 2.5, -0.125, 1e-7, 1.5e21, 1e21]),
      ).toStrictEqual('{0,0,-12,2.5,-0.125,1e-7,1.5e+21,1e+21}');
    });

    it('should write a bigint bare', () => {
      expect(stringifyArrayLiteral([9223372036854775807n, -1n])).toStrictEqual(
        '{9223372036854775807,-1}',
      );
    });

    it('should quote the numbers that are words', () => {
      // NaN and Infinity are read the same either way, so they take the
      // quoted path rather than widening the test that lets a value out
      // unquoted.
      expect(stringifyArrayLiteral([NaN, Infinity, -Infinity])).toStrictEqual(
        '{"NaN","Infinity","-Infinity"}',
      );
    });

    it('should quote a string, whatever it looks like', () => {
      // The test is applied to what a number encoded to, never to a value
      // that was a string to begin with - so a text[] element keeps its
      // quotes even when it reads as a number.
      expect(stringifyArrayLiteral(['1', '2.5'])).toStrictEqual('{"1","2.5"}');
    });

    it('should quote what an encoder made of a number when it is not a number', () => {
      // A number handed to a type whose text form is not numeric - the
      // encoder decides, and only its answer is looked at.
      const encode = (v: any) => new Date(v).toISOString().substring(0, 10);
      expect(
        stringifyArrayLiteral([0, 86400000], undefined, encode),
      ).toStrictEqual('{"1970-01-01","1970-01-02"}');
    });
  });
});
