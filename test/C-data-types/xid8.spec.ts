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
  // xid8 arrived in PostgreSQL 13 and CI runs 12 as well. Asked of the
  // server rather than worked out from a version number, which is both
  // exact and one less thing to keep in step with the release notes.
  let supported = false;
  before(async () => {
    await conn.connect();
    const r = await conn.query("select to_regtype('xid8') is not null as f");
    supported = !!r.rows?.[0][0];
  });
  beforeEach(function () {
    if (!supported) this.skip();
  });
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
