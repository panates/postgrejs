import { Connection, DataFormat, DataTypeOIDs } from 'postgrejs';
import { testEncode, testParse } from './_testers.js';

const input = [
  '1010',
  '1',
  '',
  '111111111',
  '1000000000000001',
  '10'.repeat(35),
];

describe('DataType: varbit', () => {
  const conn = new Connection();
  before(() => conn.connect());
  after(() => conn.close(0));

  it('should parse "varbit" field (text)', async () => {
    await testParse(conn, DataTypeOIDs.varbit, input, input, {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "varbit" field (binary)', async () => {
    await testParse(conn, DataTypeOIDs.varbit, input, input, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should parse "varbit" array field (text)', async () => {
    await testParse(conn, DataTypeOIDs._varbit, input, input, {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "varbit" array field (binary)', async () => {
    await testParse(conn, DataTypeOIDs._varbit, input, input, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should encode "varbit" param', async () => {
    await testEncode(conn, DataTypeOIDs.varbit, input, input);
  });

  it('should encode "varbit" array param', async () => {
    await testEncode(conn, DataTypeOIDs._varbit, input, input);
  });
});
