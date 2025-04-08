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

  it('should not transform to null if value in single quote', async () => {
    const arr = parsePostgresArray("{1,'NULL'}");
    expect(arr).toStrictEqual(['1', 'NULL']);
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
