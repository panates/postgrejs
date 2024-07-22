import { Connection, DataFormat, DataTypeOIDs } from 'postgrejs';
import { testEncode, testParse } from './_testers.js';

export function createTests(conn: () => Connection) {
  it('should parse "int4" field (text)', async () => {
    await testParse(conn(), DataTypeOIDs.int4, ['1', '-2'], [1, -2], { columnFormat: DataFormat.text });
  });

  it('should parse "int4" field (binary)', async () => {
    await testParse(conn(), DataTypeOIDs.int4, ['1', '-2'], [1, -2], { columnFormat: DataFormat.binary });
  });

  it('should parse "int4" array field (text)', async () => {
    const input = [
      [
        [-1, 5, null],
        [100, 150, null],
      ],
      [
        [-10, 500, 0],
        [null, 2, null],
      ],
    ];
    await testParse(conn(), DataTypeOIDs._int4, input, input, { columnFormat: DataFormat.text });
  });

  it('should parse "int4" array field (binary)', async () => {
    const input = [
      [
        [-1, 5, null],
        [100, 150, null],
      ],
      [
        [-10, 500, 0],
        [null, 2, null],
      ],
    ];
    await testParse(conn(), DataTypeOIDs._int4, input, input, { columnFormat: DataFormat.binary });
  });

  it('should encode "int4" param', async () => {
    await testEncode(conn(), DataTypeOIDs.int4, [-1, 5]);
  });

  it('should encode "int4" array param', async () => {
    const input = [
      [
        [-1, 5],
        [100, 150],
      ],
      [
        [-10, 500, 0],
        [null, 2],
      ],
    ];
    const output = [
      [
        [-1, 5, null],
        [100, 150, null],
      ],
      [
        [-10, 500, 0],
        [null, 2, null],
      ],
    ];
    await testEncode(conn(), DataTypeOIDs._int4, input, output);
  });
}
