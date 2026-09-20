import { Connection, DataFormat, DataTypeOIDs } from 'postgrejs';
import { testEncode, testParse } from './_testers.js';

const input = [
  '192.168.1.0/24',
  '192.168.1.1/32',
  '10.0.0.0/8',
  '0.0.0.0/0',
  '2001:4f8:3:ba::/64',
  '::/0',
];

describe('DataType: cidr', () => {
  const conn = new Connection();
  before(() => conn.connect());
  after(() => conn.close(0));

  it('should parse "cidr" field (text)', async () => {
    await testParse(conn, DataTypeOIDs.cidr, input, input, {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "cidr" field (binary)', async () => {
    await testParse(conn, DataTypeOIDs.cidr, input, input, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should parse "cidr" array field (text)', async () => {
    await testParse(conn, DataTypeOIDs._cidr, input, input, {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "cidr" array field (binary)', async () => {
    await testParse(conn, DataTypeOIDs._cidr, input, input, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should encode "cidr" param', async () => {
    await testEncode(conn, DataTypeOIDs.cidr, input, input);
  });

  it('should encode "cidr" array param', async () => {
    await testEncode(conn, DataTypeOIDs._cidr, input, input);
  });

  it('should print the mask even when it covers the whole address', async () => {
    // Which is the only thing that distinguishes cidr from inet on the
    // way out, and it comes from a flag byte the server sends.
    await testParse(
      conn,
      DataTypeOIDs.cidr,
      ['192.168.1.1'],
      ['192.168.1.1/32'],
      { columnFormat: DataFormat.binary },
    );
  });
});
