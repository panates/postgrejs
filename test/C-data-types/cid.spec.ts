import { Connection, DataFormat, DataTypeOIDs } from 'postgrejs';
import { testEncode, testParse } from './_testers.js';

const input = ['0', '42', '4294967295'];
const output = [0, 42, 4294967295];

describe('DataType: cid', () => {
  const conn = new Connection();
  before(() => conn.connect());
  after(() => conn.close(0));

  it('should parse "cid" field (text)', async () => {
    await testParse(conn, DataTypeOIDs.cid, input, output, {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "cid" field (binary)', async () => {
    await testParse(conn, DataTypeOIDs.cid, input, output, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should parse "cid" array field (text)', async () => {
    await testParse(conn, DataTypeOIDs._cid, input, output, {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "cid" array field (binary)', async () => {
    await testParse(conn, DataTypeOIDs._cid, input, output, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should encode "cid" param', async () => {
    await testEncode(conn, DataTypeOIDs.cid, output, output);
  });

  it('should encode "cid" array param', async () => {
    await testEncode(conn, DataTypeOIDs._cid, output, output);
  });
});
