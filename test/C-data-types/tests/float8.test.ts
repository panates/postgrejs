import { Connection, DataFormat, DataTypeOIDs } from 'postgresql-client';
import { testEncode, testParse } from './_testers.js';

export function createTests(conn: () => Connection) {
  it('should parse "float8" field (text)', async function () {
    await testParse(conn(), DataTypeOIDs.float8, ['1.2', '-2.5'], [1.2, -2.5], { columnFormat: DataFormat.text });
  });

  it('should parse "float8" field (binary)', async function () {
    await testParse(conn(), DataTypeOIDs.float8, ['1.25', '-2.5'], [1.25, -2.5], { columnFormat: DataFormat.binary });
  });

  it('should parse "float8" array field (text)', async function () {
    const input = [
      [
        [-1.2, 5.2456, null],
        [0.9025, 150.42563, null],
      ],
      [
        [-10.6, 500.422, 0],
        [null, 2.536322, null],
      ],
    ];
    await testParse(conn(), DataTypeOIDs._float8, input, input, { columnFormat: DataFormat.text });
  });

  it('should parse "float8" array field (binary)', async function () {
    const input = [
      [
        [-1.25, 5.25, null],
        [0.8, 150.4, null],
      ],
      [
        [-10.6, 500.4, 0],
        [null, 2.5, null],
      ],
    ];
    await testParse(conn(), DataTypeOIDs._float8, input, input, { columnFormat: DataFormat.binary });
  });

  it('should encode "float8" param', async function () {
    await testEncode(conn(), DataTypeOIDs.float8, [-1.2, 5.5]);
  });

  it('should encode "float8" array param', async function () {
    const input = [
      [
        [-1.25, 5.2456],
        [0.9025, 150.42563],
      ],
      [
        [-10.6, 500.422, 0],
        [null, 2.536322],
      ],
    ];
    const output = [
      [
        [-1.25, 5.2456, null],
        [0.9025, 150.42563, null],
      ],
      [
        [-10.6, 500.422, 0],
        [null, 2.536322, null],
      ],
    ];
    await testEncode(conn(), DataTypeOIDs._float8, input, output);
  });
}
