import { Connection, DataFormat, DataTypeOIDs } from 'postgrejs';
import { testEncode, testParse } from './_testers.js';

describe('DataType: text', () => {
  const conn = new Connection();
  before(() => conn.connect());
  after(() => conn.close(0));

  it('should parse "text" field (text)', async () => {
    const input = ['abc', 'bcd'];
    await testParse(conn, DataTypeOIDs.text, input, input, {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "text" field (binary)', async () => {
    const input = ['abc', 'bcd'];
    await testParse(conn, DataTypeOIDs.text, input, input, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should parse "text" array field (text)', async () => {
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
    await testParse(conn, DataTypeOIDs._text, input, input, {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "text" array field (binary)', async () => {
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
    await testParse(conn, DataTypeOIDs._text, input, input, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should parse "text" array field with empty elements (text)', async () => {
    // Regression: the text-format parser pushed an element only when its
    // token was non-empty, so a quoted `""` was dropped and every later
    // index shifted - and the flag that tells a real NULL apart from the
    // string "NULL" leaked into the next element, so a null following an
    // empty string came back as four characters of text.
    const input = [
      ['', 'b', null],
      [null, '', 'NULL'],
    ];
    await testParse(conn, DataTypeOIDs._text, input, input, {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "text" array field with empty elements (binary)', async () => {
    // The same input through the other path - decodeBinaryArray was never
    // affected, and asserting both is what pins them to the same answer.
    const input = [
      ['', 'b', null],
      [null, '', 'NULL'],
    ];
    await testParse(conn, DataTypeOIDs._text, input, input, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should encode "text" param', async () => {
    const input = ['abc', 'bcd'];
    await testEncode(conn, DataTypeOIDs.text, input, input);
  });

  it('should encode "text" array param', async () => {
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
    await testEncode(conn, DataTypeOIDs._text, input, input);
  });
});
