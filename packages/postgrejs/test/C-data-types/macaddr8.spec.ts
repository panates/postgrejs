import { Connection, DataFormat, DataTypeOIDs } from 'postgrejs';
import { testEncode, testParse } from './_testers.js';

const input = [
  '08:00:2b:01:02:03:04:05',
  '00:00:00:00:00:00:00:00',
  'ff:ff:ff:ff:ff:ff:ff:ff',
];

describe('DataType: macaddr8', () => {
  const conn = new Connection();
  before(() => conn.connect());
  after(() => conn.close(0));

  it('should parse "macaddr8" field (text)', async () => {
    await testParse(conn, DataTypeOIDs.macaddr8, input, input, {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "macaddr8" field (binary)', async () => {
    await testParse(conn, DataTypeOIDs.macaddr8, input, input, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should parse "macaddr8" array field (text)', async () => {
    await testParse(conn, DataTypeOIDs._macaddr8, input, input, {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "macaddr8" array field (binary)', async () => {
    await testParse(conn, DataTypeOIDs._macaddr8, input, input, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should encode "macaddr8" param', async () => {
    await testEncode(conn, DataTypeOIDs.macaddr8, input, input);
  });

  it('should encode "macaddr8" array param', async () => {
    await testEncode(conn, DataTypeOIDs._macaddr8, input, input);
  });

  it('should widen a six-byte address the way the server does', async () => {
    await testEncode(
      conn,
      DataTypeOIDs.macaddr8,
      ['08:00:2b:01:02:03'],
      ['08:00:2b:ff:fe:01:02:03'],
    );
  });
});
