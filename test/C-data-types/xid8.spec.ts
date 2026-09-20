import { Connection, DataFormat, DataTypeOIDs } from 'postgrejs';
import { testEncode, testParse } from './_testers.js';

const input = [
  '0',
  '1234567890',
  '9007199254740991',
  '9007199254740992',
  '18446744073709551615',
];
// A number while one holds the value exactly, a BigInt past that.
const output = [
  0,
  1234567890,
  9007199254740991,
  9007199254740992n,
  18446744073709551615n,
];

describe('DataType: xid8', () => {
  const conn = new Connection();
  before(() => conn.connect());
  after(() => conn.close(0));

  it('should parse "xid8" field (text)', async () => {
    await testParse(conn, DataTypeOIDs.xid8, input, output, {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "xid8" field (binary)', async () => {
    await testParse(conn, DataTypeOIDs.xid8, input, output, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should parse "xid8" array field (text)', async () => {
    await testParse(conn, DataTypeOIDs._xid8, input, output, {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "xid8" array field (binary)', async () => {
    await testParse(conn, DataTypeOIDs._xid8, input, output, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should encode "xid8" param', async () => {
    await testEncode(conn, DataTypeOIDs.xid8, output, output);
  });

  it('should encode "xid8" array param', async () => {
    await testEncode(conn, DataTypeOIDs._xid8, output, output);
  });
});
