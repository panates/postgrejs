import { Connection, DataFormat, DataTypeOIDs } from 'postgrejs';
import { testEncode, testParse } from './_testers.js';

const input = ['16/B374D848', '0/0', '0/1', 'A/B', 'FFFFFFFF/FFFFFFFF'];
const output = input;

describe('DataType: pg_lsn', () => {
  const conn = new Connection();
  before(() => conn.connect());
  after(() => conn.close(0));

  it('should parse "pg_lsn" field (text)', async () => {
    await testParse(conn, DataTypeOIDs.pg_lsn, input, output, {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "pg_lsn" field (binary)', async () => {
    await testParse(conn, DataTypeOIDs.pg_lsn, input, output, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should parse "pg_lsn" array field (text)', async () => {
    await testParse(conn, DataTypeOIDs._pg_lsn, input, output, {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "pg_lsn" array field (binary)', async () => {
    await testParse(conn, DataTypeOIDs._pg_lsn, input, output, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should encode "pg_lsn" param', async () => {
    await testEncode(conn, DataTypeOIDs.pg_lsn, output, output);
  });

  it('should encode "pg_lsn" array param', async () => {
    await testEncode(conn, DataTypeOIDs._pg_lsn, output, output);
  });

  it('should accept a padded or lower-case spelling, as the server does', async () => {
    await testEncode(
      conn,
      DataTypeOIDs.pg_lsn,
      ['A/0000000B', '16/b374d848'],
      ['A/B', '16/B374D848'],
    );
  });
});
