import { Connection, DataFormat, DataTypeOIDs } from 'postgresql-client';
import { testEncode, testParse } from './_testers.js';

export function createTests(conn: () => Connection) {
  it('should parse "int2Vector" field (text)', async () => {
    await testParse(conn(), DataTypeOIDs.int2vector, [['1', '2', '6']], [[1, 2, 6]], { columnFormat: DataFormat.text });
  });

  it('should parse "int2Vector" field (binary)', async () => {
    await testParse(conn(), DataTypeOIDs.int2vector, [[2, 4, 6]], [[2, 4, 6]], { columnFormat: DataFormat.binary });
  });

  it('should parse "_int2Vector" array field (text)', async () => {
    const input = ['-1 5 6', '100 150 200'];
    const output = [
      [-1, 5, 6],
      [100, 150, 200],
    ];
    await testParse(conn(), DataTypeOIDs._int2vector, input, output, { columnFormat: DataFormat.text });
  });

  it('should parse "_int2Vector" array field (binary)', async () => {
    const input = ['-1 5 6', '100 150 200'];
    const output = [
      [-1, 5, 6],
      [100, 150, 200],
    ];
    await testParse(conn(), DataTypeOIDs._int2vector, input, output, { columnFormat: DataFormat.binary });
  });

  it('should encode "_int2Vector" param', async () => {
    await testEncode(conn(), DataTypeOIDs._int2vector, [
      [-1, 5, 6],
      [100, 150, 200],
    ]);
  });
}
