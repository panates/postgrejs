import { Connection, DataFormat, DataTypeOIDs } from 'postgresql-client';
import { testEncode, testParse } from './_testers.js';

export function createTests(conn: () => Connection) {
  it('should parse "numeric" field (text)', async function () {
    await testParse(conn(), DataTypeOIDs.numeric, ['321.2345', '-1232.567'], [321.2345, -1232.567], {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "numeric" field (binary)', async function () {
    await testParse(conn(), DataTypeOIDs.numeric, ['12345.123456789', '-1232.567'], [12345.123456789, -1232.567], {
      columnFormat: DataFormat.binary,
    });
  });

  it('should parse "numeric" array field (text)', async function () {
    const input = [
      [
        [-1.2, 2.5, null],
        [1.2, 2.5, null],
      ],
      [
        [-10.6, 4.5, 0],
        [null, 6.5, null],
      ],
    ];
    await testParse(conn(), DataTypeOIDs._numeric, input, input, { columnFormat: DataFormat.text });
  });

  it('should parse "numeric" array field (binary)', async function () {
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
    await testParse(conn(), DataTypeOIDs._numeric, input, input, { columnFormat: DataFormat.binary });
  });

  it('should encode "numeric" param', async function () {
    await testEncode(conn(), DataTypeOIDs.numeric, [-1.2345, 1232.567]);
  });

  it('should encode "numeric" array param', async function () {
    const input = [
      [
        [-1.25, 5.25],
        [0.9, 150.43],
      ],
      [
        [-10.6, 500.42, 0],
        [null, 2.53],
      ],
    ];
    const output = [
      [
        [-1.25, 5.25, null],
        [0.9, 150.43, null],
      ],
      [
        [-10.6, 500.42, 0],
        [null, 2.53, null],
      ],
    ];
    await testEncode(conn(), DataTypeOIDs._numeric, input, output);
  });
}
