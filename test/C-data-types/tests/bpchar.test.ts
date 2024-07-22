import { Connection, DataFormat, DataTypeOIDs } from 'postgrejs';
import { testEncode, testParse } from './_testers.js';

export function createTests(conn: () => Connection) {
  it('should parse "bpchar" field (text)', async () => {
    const input = ['abc', 'bcd'];
    await testParse(conn(), DataTypeOIDs.bpchar, input, input, { columnFormat: DataFormat.text });
  });

  it('should parse "bpchar" field (binary)', async () => {
    const input = ['abc', 'bcd'];
    await testParse(conn(), DataTypeOIDs.bpchar, input, input, { columnFormat: DataFormat.binary });
  });

  it('should parse "bpchar" array field (text)', async () => {
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
    await testParse(conn(), DataTypeOIDs._bpchar, input, input, { columnFormat: DataFormat.text });
  });

  it('should parse "bpchar" array field (binary)', async () => {
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
    await testParse(conn(), DataTypeOIDs._bpchar, input, input, { columnFormat: DataFormat.binary });
  });

  it('should encode "bpchar" param', async () => {
    await testEncode(conn(), DataTypeOIDs.bpchar, ['abc', 'bcd']);
  });

  it('should encode "bpchar" array param', async () => {
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
    await testEncode(conn(), DataTypeOIDs._bpchar, input);
  });
}
