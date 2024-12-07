import { Connection, DataFormat, DataTypeOIDs } from 'postgrejs';
import { testEncode, testParse } from './_testers.js';

export function createTests(conn: () => Connection) {
  it('should parse "varchar" field (text)', async () => {
    const input = ['abc"\'', 'bcd'];
    await testParse(conn(), DataTypeOIDs.varchar, input, input, {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "varchar" field (binary)', async () => {
    const input = ['abc"\'', 'bcd'];
    await testParse(conn(), DataTypeOIDs.varchar, input, input, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should parse "varchar" array field (text)', async () => {
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
    await testParse(conn(), DataTypeOIDs._varchar, input, input, {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "varchar" array field (binary)', async () => {
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
    await testParse(conn(), DataTypeOIDs._varchar, input, input, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should encode "varchar" param', async () => {
    await testEncode(conn(), DataTypeOIDs.varchar, ['abc', 'bcd']);
  });

  it('should encode "varchar" array param', async () => {
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
    await testEncode(conn(), DataTypeOIDs._varchar, input);
  });
}
