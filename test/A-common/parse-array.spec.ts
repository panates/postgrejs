import { expect } from 'expect';
import { parsePostgresArray } from '../../src/util/parse-array.js';

describe('Parse PostgreSQL arrays', () => {
  it('should parse simple array string', async () => {
    const arr = parsePostgresArray('{1,2}');
    expect(arr).toStrictEqual(['1', '2']);
  });

  it('should keep spaces', async () => {
    const arr = parsePostgresArray('{1 , 2}');
    expect(arr).toStrictEqual(['1 ', ' 2']);
  });

  it('should detect null value', async () => {
    const arr = parsePostgresArray('{1,NULL}');
    expect(arr).toStrictEqual(['1', null]);
  });

  it('should not transform to null if value in double quote', async () => {
    const arr = parsePostgresArray('{1,"NULL"}');
    expect(arr).toStrictEqual(['1', 'NULL']);
  });

  it('should treat single quotes as literal characters, not quoting', async () => {
    // PostgreSQL's array text format only uses double quotes for quoting;
    // a single quote has no special meaning and is never escaped/stripped.
    // Verified against a live server: ARRAY['1', '''NULL''']::text[]::text
    // renders as {1,'NULL'} (unquoted, apostrophes kept literally).
    const arr = parsePostgresArray("{1,'NULL'}");
    expect(arr).toStrictEqual(['1', "'NULL'"]);
  });

  it('should not merge/corrupt elements containing an apostrophe', async () => {
    // Regression test: an apostrophe inside a quoted element (e.g. from a
    // text[]/varchar[] column) used to be misread as a quote toggle,
    // dropping the apostrophe and merging it with the next element.
    // Verified against a live server: ARRAY['O''Brien, Jr.', 'Smith']
    // renders as {"O'Brien, Jr.",Smith}.
    const arr = parsePostgresArray('{"O\'Brien, Jr.",Smith}');
    expect(arr).toStrictEqual(["O'Brien, Jr.", 'Smith']);
  });

  it('should keep a quoted empty element', async () => {
    // Regression: an element was pushed only when its token was
    // non-empty, so `""` - a real empty string, and the only way
    // PostgreSQL writes one - was skipped, leaving the array one short
    // and every later index shifted.
    expect(parsePostgresArray('{"",b,c}')).toStrictEqual(['', 'b', 'c']);
    expect(parsePostgresArray('{a,"",c}')).toStrictEqual(['a', '', 'c']);
    expect(parsePostgresArray('{a,b,""}')).toStrictEqual(['a', 'b', '']);
    expect(parsePostgresArray('{""}')).toStrictEqual(['']);
    expect(parsePostgresArray('{{1,""},{3,x}}')).toStrictEqual([
      ['1', ''],
      ['3', 'x'],
    ]);
  });

  it('should not let an empty element make the next NULL a string', async () => {
    // The same root cause, and the worse half of it: the "this one was
    // quoted" flag was reset only on the path that pushed, so it survived
    // the dropped element into the next one - and that flag is what tells
    // a real NULL apart from the string "NULL".
    expect(parsePostgresArray('{"",NULL}')).toStrictEqual(['', null]);
    expect(parsePostgresArray('{NULL,""}')).toStrictEqual([null, '']);
    expect(parsePostgresArray('{"","NULL",NULL}')).toStrictEqual([
      '',
      'NULL',
      null,
    ]);
  });

  it('should still skip an unquoted empty token', async () => {
    // Not output PostgreSQL produces - a null prints as the bare word
    // NULL and an empty string always as `""` - so this is a choice
    // rather than a requirement. Skipping is what keeps the separator
    // after a nested array from pushing an element of its own, which the
    // multi-dimensional cases below depend on.
    expect(parsePostgresArray('{a,,b}')).toStrictEqual(['a', 'b']);
    expect(parsePostgresArray('{}')).toStrictEqual([]);
    expect(parsePostgresArray('{{1},{2}}')).toStrictEqual([['1'], ['2']]);
  });

  it('should ignore separator and curly brackets characters in a quote', async () => {
    const arr = parsePostgresArray('{1,"{,}"}');
    expect(arr).toStrictEqual(['1', '{,}']);
  });

  it('should escape with backslash', async () => {
    const arr = parsePostgresArray('{1\\,2,"\\""}');
    expect(arr).toStrictEqual(['1,2', '"']);
  });

  it('should escape with backslash in quote', async () => {
    const arr = parsePostgresArray('{1,"\\"\\\\"}');
    expect(arr).toStrictEqual(['1', '"\\']);
  });

  it('should call transform callback', async () => {
    const arr = parsePostgresArray('{1,2,NULL}', {
      transform: s => parseInt(s, 10),
    });
    expect(arr).toStrictEqual([1, 2, null]);
  });

  it('should parse multi dimensional array string', async () => {
    const arr = parsePostgresArray(
      '{{{t,f,NULL},{f,t,NULL}},{{t,NULL,f},{NULL,f,NULL}}}',
    );
    expect(arr).toStrictEqual([
      [
        ['t', 'f', null],
        ['f', 't', null],
      ],
      [
        ['t', null, 'f'],
        [null, 'f', null],
      ],
    ]);
  });

  it('should use custom separator', async () => {
    const arr = parsePostgresArray('{1,2;2,5;NULL}', { separator: ';' });
    expect(arr).toStrictEqual(['1,2', '2,5', null]);
  });
});
