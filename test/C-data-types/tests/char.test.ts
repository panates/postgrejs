import { Connection, DataFormat, DataTypeOIDs } from 'postgrejs';
import { testEncode, testParse } from './_testers.js';

export function createTests(conn: () => Connection) {
  it('should parse "char" field (text)', async () => {
    await testParse(conn(), DataTypeOIDs.char, ['abc', 'bcd'], ['a', 'b'], {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "char" field (binary)', async () => {
    await testParse(conn(), DataTypeOIDs.char, ['abc', 'bcd'], ['a', 'b'], {
      columnFormat: DataFormat.binary,
    });
  });

  it('should parse "char" array field (text)', async () => {
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
    await testParse(conn(), DataTypeOIDs._char, input, output, {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "char" array field (binary)', async () => {
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
    await testParse(conn(), DataTypeOIDs._char, input, output, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should encode "char" param', async () => {
    await testEncode(conn(), DataTypeOIDs.char, ['abc', 'bcd'], ['a', 'b']);
  });

  it('should encode "char" array param', async () => {
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
