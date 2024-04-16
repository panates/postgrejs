import { Connection, DataFormat, DataTypeOIDs } from 'postgresql-client';
import { testEncode, testParse } from './_testers.js';

export function createTests(conn: () => Connection) {
  it('should parse "oid" field (text)', async function () {
    await testParse(conn(), DataTypeOIDs.oid, ['1', '2'], [1, 2], { columnFormat: DataFormat.text });
  });

  it('should parse "oid" field (binary)', async function () {
    await testParse(conn(), DataTypeOIDs.oid, ['1', '2'], [1, 2], { columnFormat: DataFormat.binary });
  });

  it('should parse "oid" array field (text)', async function () {
    const input = [
      [
        [1, 5, null],
        [100, 150, null],
      ],
      [
        [10, 500, 0],
        [null, 2, null],
      ],
    ];
    await testParse(conn(), DataTypeOIDs._oid, input, input, { columnFormat: DataFormat.text });
  });

  it('should parse "oid" array field (binary)', async function () {
    const input = [
      [
        [1, 5, null],
        [100, 150, null],
      ],
      [
        [10, 500, 0],
        [null, 2, null],
      ],
    ];
    await testParse(conn(), DataTypeOIDs._oid, input, input, { columnFormat: DataFormat.binary });
  });

  it('should encode "oid" param', async function () {
    await testEncode(conn(), DataTypeOIDs.oid, [1, 5]);
  });

  it('should encode "oid" array param', async function () {
    const input = [
      [
        [1, 5],
        [100, 150],
      ],
      [
        [10, 500, 0],
        [null, 2],
      ],
    ];
    const output = [
      [
        [1, 5, null],
        [100, 150, null],
      ],
      [
        [10, 500, 0],
        [null, 2, null],
      ],
    ];
    await testEncode(conn(), DataTypeOIDs._oid, input, output);
  });
}
