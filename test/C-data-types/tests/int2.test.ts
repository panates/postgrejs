import { Connection, DataFormat, DataTypeOIDs } from 'postgresql-client';
import { testEncode, testParse } from './_testers.js';

export function createTests(conn: () => Connection) {
  it('should parse "int2" field (text)', async function () {
    await testParse(conn(), DataTypeOIDs.int2, ['1', '-2'], [1, -2], { columnFormat: DataFormat.text });
  });

  it('should parse "int2" field (binary)', async function () {
    await testParse(conn(), DataTypeOIDs.int2, ['1', '-2'], [1, -2], { columnFormat: DataFormat.binary });
  });

  it('should parse "int2" array field (text)', async function () {
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
    await testParse(conn(), DataTypeOIDs._int2, input, input, { columnFormat: DataFormat.text });
  });

  it('should parse "int2" array field (binary)', async function () {
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
    await testParse(conn(), DataTypeOIDs._int2, input, input, { columnFormat: DataFormat.binary });
  });

  it('should encode "int2" param', async function () {
    await testEncode(conn(), DataTypeOIDs.int2, [-1, 5]);
  });

  it('should encode "int2" array param', async function () {
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
    await testEncode(conn(), DataTypeOIDs._int2, input, output);
  });
}
