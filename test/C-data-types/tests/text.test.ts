import { Connection, DataFormat, DataTypeOIDs } from 'postgresql-client';
import { testEncode, testParse } from './_testers.js';

export function createTests(conn: () => Connection) {
  it('should parse "text" field (text)', async function () {
    const input = ['abc', 'bcd'];
    await testParse(conn(), DataTypeOIDs.text, input, input, { columnFormat: DataFormat.text });
  });

  it('should parse "text" field (binary)', async function () {
    const input = ['abc', 'bcd'];
    await testParse(conn(), DataTypeOIDs.text, input, input, { columnFormat: DataFormat.binary });
  });

  it('should parse "text" array field (text)', async function () {
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
    await testParse(conn(), DataTypeOIDs._text, input, input, { columnFormat: DataFormat.text });
  });

  it('should parse "text" array field (binary)', async function () {
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
    await testParse(conn(), DataTypeOIDs._text, input, input, { columnFormat: DataFormat.binary });
  });

  it('should encode "text" param', async function () {
    const input = ['abc', 'bcd'];
    await testEncode(conn(), DataTypeOIDs.text, input, input);
  });

  it('should encode "text" array param', async function () {
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
    await testEncode(conn(), DataTypeOIDs._text, input, input);
  });
}
