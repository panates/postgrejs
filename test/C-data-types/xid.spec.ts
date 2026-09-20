import { Connection, DataFormat, DataTypeOIDs } from 'postgrejs';
import { testEncode, testParse } from './_testers.js';

const input = ['0', '42', '4294967295'];
const output = [0, 42, 4294967295];

describe('DataType: xid', () => {
  const conn = new Connection();
  before(() => conn.connect());
  after(() => conn.close(0));

  it('should parse "xid" field (text)', async () => {
    await testParse(conn, DataTypeOIDs.xid, input, output, {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "xid" field (binary)', async () => {
    await testParse(conn, DataTypeOIDs.xid, input, output, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should parse "xid" array field (text)', async () => {
    await testParse(conn, DataTypeOIDs._xid, input, output, {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "xid" array field (binary)', async () => {
    await testParse(conn, DataTypeOIDs._xid, input, output, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should encode "xid" param', async () => {
    await testEncode(conn, DataTypeOIDs.xid, output, output);
  });

  it('should encode "xid" array param', async () => {
    await testEncode(conn, DataTypeOIDs._xid, output, output);
  });
});
