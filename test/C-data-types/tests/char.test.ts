import { Connection, DataFormat, DataTypeOIDs } from 'postgresql-client';
import { testEncode, testParse } from './_testers.js';

export function createTests(conn: () => Connection) {
  it('should parse "char" field (text)', async function () {
    await testParse(conn(), DataTypeOIDs.char, ['abc', 'bcd'], ['a', 'b'], { columnFormat: DataFormat.text });
  });

  it('should parse "char" field (binary)', async function () {
    await testParse(conn(), DataTypeOIDs.char, ['abc', 'bcd'], ['a', 'b'], { columnFormat: DataFormat.binary });
  });

  it('should parse "char" array field (text)', async function () {
    const input = [
      [
        ['a', 'b', null],
        ['c', 'd', null],
      ],
      [
        ['e', 'fg', 'jkl'],
        [null, 'h', null],
      ],
    ];
    const output = [
      [
        ['a', 'b', null],
        ['c', 'd', null],
      ],
      [
        ['e', 'f', 'j'],
        [null, 'h', null],
      ],
    ];
    await testParse(conn(), DataTypeOIDs._char, input, output, { columnFormat: DataFormat.text });
  });

  it('should parse "char" array field (binary)', async function () {
    const input = [
      [
        ['a', 'b', null],
        ['c', 'd', null],
      ],
      [
        ['e', 'fg', 'jkl'],
        [null, 'h', null],
      ],
    ];
    const output = [
      [
        ['a', 'b', null],
        ['c', 'd', null],
      ],
      [
        ['e', 'f', 'j'],
        [null, 'h', null],
      ],
    ];
    await testParse(conn(), DataTypeOIDs._char, input, output, { columnFormat: DataFormat.binary });
  });

  it('should encode "char" param', async function () {
    await testEncode(conn(), DataTypeOIDs.char, ['abc', 'bcd'], ['a', 'b']);
  });

  it('should encode "char" array param', async function () {
    const input = [
      [
        ['a', 'b', null],
        ['c', 'd', null],
      ],
      [
        ['e', 'fg', 'jkl'],
        [null, 'h', null],
      ],
    ];
    const output = [
      [
        ['a', 'b', null],
        ['c', 'd', null],
      ],
      [
        ['e', 'f', 'j'],
        [null, 'h', null],
      ],
    ];
    await testEncode(conn(), DataTypeOIDs._char, input, output);
  });
}
