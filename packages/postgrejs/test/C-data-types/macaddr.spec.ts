import { Connection, DataFormat, DataTypeOIDs } from 'postgrejs';
import { testEncode, testParse } from './_testers.js';

const input = ['08:00:2b:01:02:03', '00:00:00:00:00:00', 'ff:ff:ff:ff:ff:ff'];

describe('DataType: macaddr', () => {
  const conn = new Connection();
  before(() => conn.connect());
  after(() => conn.close(0));

  it('should parse "macaddr" field (text)', async () => {
    await testParse(conn, DataTypeOIDs.macaddr, input, input, {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "macaddr" field (binary)', async () => {
    await testParse(conn, DataTypeOIDs.macaddr, input, input, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should parse "macaddr" array field (text)', async () => {
    await testParse(conn, DataTypeOIDs._macaddr, input, input, {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "macaddr" array field (binary)', async () => {
    await testParse(conn, DataTypeOIDs._macaddr, input, input, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should encode "macaddr" param', async () => {
    await testEncode(conn, DataTypeOIDs.macaddr, input, input);
  });

  it('should encode "macaddr" array param', async () => {
    await testEncode(conn, DataTypeOIDs._macaddr, input, input);
  });

  it('should accept every spelling the server does', async () => {
    await testEncode(
      conn,
      DataTypeOIDs.macaddr,
      ['08002b-010203', '0800.2b01.0203', '08002b010203'],
      ['08:00:2b:01:02:03', '08:00:2b:01:02:03', '08:00:2b:01:02:03'],
    );
  });
});
