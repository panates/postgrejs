import { expect } from 'expect';
import { stringifyArrayLiteral } from 'postgrejs';

describe('stringifyArrayLiteral()', () => {
  it('should stringify a flat array', () => {
    // Every leaf value is quoted via escapeArrayItem() regardless of type -
    // there is no bare/unquoted form, even for a number or boolean.
    expect(stringifyArrayLiteral([1, 2, 3])).toStrictEqual('{"1","2","3"}');
  });

  it('should stringify an empty array', () => {
    expect(stringifyArrayLiteral([])).toStrictEqual('{}');
  });

  it('should turn null/undefined elements into NULL, unquoted', () => {
    expect(stringifyArrayLiteral([1, null, undefined, 2])).toStrictEqual(
      '{"1",NULL,NULL,"2"}',
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

  it('should stringify a 2D array', () => {
    expect(
      stringifyArrayLiteral([
        [1, 2],
        [3, 4],
      ]),
    ).toStrictEqual('{{"1","2"},{"3","4"}}');
  });

  it('should pad a ragged nested array out to the widest row with NULL', () => {
    // arrayCalculateDim() sizes every sub-level to the LONGEST row it
    // finds, so a shorter row is walked past its own end - missing
    // elements there read as `undefined`, which must render as NULL like
    // any other missing value, not throw or silently truncate the row.
    expect(stringifyArrayLiteral([[1, 2, 3], [4]])).toStrictEqual(
      '{{"1","2","3"},{"4",NULL,NULL}}',
    );
  });

  it('should wrap a bare scalar found at a non-leaf level into its own (NULL-padded) row', () => {
    // A ragged input where one row is a scalar instead of a nested array
    // (e.g. [[1, 2], 3]) still has to produce a rectangular literal - the
    // scalar becomes a one-element row, then padded like any other row.
    expect(stringifyArrayLiteral([[1, 2], 3])).toStrictEqual(
      '{{"1","2"},{"3",NULL}}',
    );
  });

  it('should recurse into a nested array found where a leaf value is expected', () => {
    expect(stringifyArrayLiteral([1, [2, 3]])).toStrictEqual(
      '{{"1",NULL},{"2","3"}}',
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
      '{"1","2.5","true"}',
    );
  });
});
