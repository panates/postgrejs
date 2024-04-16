import { Connection, DataFormat, DataTypeOIDs } from 'postgresql-client';
import { testEncode, testParse } from './_testers.js';

export function createTests(conn: () => Connection) {
  it('should parse "bool" field (text)', async function () {
    await testParse(conn(), DataTypeOIDs.bool, ['true', 'false'], [true, false], { columnFormat: DataFormat.text });
  });

  it('should parse "bool" field (binary)', async function () {
    await testParse(conn(), DataTypeOIDs.bool, ['true', 'false'], [true, false], { columnFormat: DataFormat.binary });
  });

  it('should parse "bool" array field (text)', async function () {
    const input = [
      [
        [true, false, null],
        [false, true, null],
      ],
      [
        [true, null, false],
        [null, false, null],
      ],
    ];
    await testParse(conn(), DataTypeOIDs._bool, input, input, { columnFormat: DataFormat.text });
  });

  it('should parse "bool" array field (binary)', async function () {
    const arr = [
      [
        [true, false, null],
        [false, true, null],
      ],
      [
        [true, null, false],
        [null, false, null],
      ],
    ];
    await testParse(conn(), DataTypeOIDs._bool, arr, arr, { columnFormat: DataFormat.binary });
  });

  it('should encode "bool" param', async function () {
    const input = [true, false];
    await testEncode(conn(), DataTypeOIDs.bool, input, input);
  });

  it('should encode "bool" array param', async function () {
    const input = [
      [
        [true, false],
        [false, true, true],
      ],
      [[true], [null, false]],
    ];
    const output = [
      [
        [true, false, null],
        [false, true, true],
      ],
      [
        [true, null, null],
        [null, false, null],
      ],
    ];
    await testEncode(conn(), DataTypeOIDs._bool, input, output);
  });
}
