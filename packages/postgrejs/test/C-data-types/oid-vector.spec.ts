import { Connection, DataFormat, DataTypeOIDs } from 'postgrejs';
import { testEncode, testParse } from './_testers.js';

// oidvector (30) is a list of OIDs in its own right, not the array type of
// oid - that is _oid (1028). Its own array type is _oidvector (1013).
describe('DataType: oidvector', () => {
  const conn = new Connection();
  before(() => conn.connect());
  after(() => conn.close(0));

  it('should parse "oidvector" field (text)', async () => {
    await testParse(
      conn,
      DataTypeOIDs.oidvector,
      [['1', '2', '6']],
      [[1, 2, 6]],
      {
        columnFormat: DataFormat.text,
      },
    );
  });

  it('should parse "oidvector" field (binary)', async () => {
    await testParse(conn, DataTypeOIDs.oidvector, [[2, 4, 6]], [[2, 4, 6]], {
      columnFormat: DataFormat.binary,
    });
  });

  it('should parse "_oidvector" array field (text)', async () => {
    const input = ['1 5 6', '100 150 200'];
    const output = [
      [1, 5, 6],
      [100, 150, 200],
    ];
    await testParse(conn, DataTypeOIDs._oidvector, input, output, {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "_oidvector" array field (binary)', async () => {
    const input = ['1 5 6', '100 150 200'];
    const output = [
      [1, 5, 6],
      [100, 150, 200],
    ];
    await testParse(conn, DataTypeOIDs._oidvector, input, output, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should encode "_oidvector" param', async () => {
    await testEncode(conn, DataTypeOIDs._oidvector, [
      [1, 5, 6],
      [100, 150, 200],
    ]);
  });
});
