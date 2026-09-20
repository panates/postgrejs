import { Connection, DataFormat, DataTypeOIDs } from 'postgrejs';
import { testEncode, testParse } from './_testers.js';

const input = [
  '192.168.0.1',
  '192.168.0.1/24',
  '0.0.0.0/0',
  '::1',
  '2001:4f8:3:ba::/64',
  '::ffff:1.2.3.4',
  '1:0:0:2::3',
];

describe('DataType: inet', () => {
  const conn = new Connection();
  before(() => conn.connect());
  after(() => conn.close(0));

  it('should parse "inet" field (text)', async () => {
    await testParse(conn, DataTypeOIDs.inet, input, input, {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "inet" field (binary)', async () => {
    await testParse(conn, DataTypeOIDs.inet, input, input, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should parse "inet" array field (text)', async () => {
    await testParse(conn, DataTypeOIDs._inet, input, input, {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "inet" array field (binary)', async () => {
    await testParse(conn, DataTypeOIDs._inet, input, input, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should encode "inet" param', async () => {
    await testEncode(conn, DataTypeOIDs.inet, input, input);
  });

  it('should encode "inet" array param', async () => {
    await testEncode(conn, DataTypeOIDs._inet, input, input);
  });

  it('should accept the abbreviated forms the server does', async () => {
    // `10/8` is a whole address to PostgreSQL, and both paths have to
    // agree about that - the text one hands it over untouched, the binary
    // one fills in the octets itself.
    await testEncode(
      conn,
      DataTypeOIDs.inet,
      ['10/8', '10.0/16'],
      ['10.0.0.0/8', '10.0.0.0/16'],
    );
  });
});
