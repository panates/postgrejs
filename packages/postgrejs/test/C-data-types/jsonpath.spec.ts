import { Connection, DataFormat, DataTypeOIDs } from 'postgrejs';
import { testEncode, testParse } from './_testers.js';

// PostgreSQL's normalized spelling, which is what comes back whatever
// was written - `$.a` is stored and printed as `$."a"`.
const input = [
  '$."a"[*]."b"',
  '$."x"',
  'strict $."x"?(@ > 1)',
  '$[*]?(@ > 3)',
  '$."ü"',
];

describe('DataType: jsonpath', () => {
  const conn = new Connection();
  before(() => conn.connect());
  after(() => conn.close(0));

  it('should parse "jsonpath" field (text)', async () => {
    await testParse(conn, DataTypeOIDs.jsonpath, input, input, {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "jsonpath" field (binary)', async () => {
    await testParse(conn, DataTypeOIDs.jsonpath, input, input, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should parse "jsonpath" array field (text)', async () => {
    await testParse(conn, DataTypeOIDs._jsonpath, input, input, {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "jsonpath" array field (binary)', async () => {
    await testParse(conn, DataTypeOIDs._jsonpath, input, input, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should encode "jsonpath" param', async () => {
    await testEncode(conn, DataTypeOIDs.jsonpath, input, input);
  });

  it('should encode "jsonpath" array param', async () => {
    await testEncode(conn, DataTypeOIDs._jsonpath, input, input);
  });

  it('should normalize what it is given, as the server does', async () => {
    await testEncode(
      conn,
      DataTypeOIDs.jsonpath,
      ['$.a[*].b', 'lax $.a'],
      ['$."a"[*]."b"', '$."a"'],
    );
  });
});
