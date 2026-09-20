import { expect } from 'expect';
import { Connection, DataFormat, DataTypeOIDs } from 'postgrejs';
import { testEncode, testParse } from './_testers.js';

const input = ['10:20:', '10:20:12,15', '1:1:', '10:20:10,11,12,13,14'];

describe('DataType: pg_snapshot', () => {
  const conn = new Connection();
  before(() => conn.connect());
  after(() => conn.close(0));

  it('should parse "pg_snapshot" field (text)', async () => {
    await testParse(conn, DataTypeOIDs.pg_snapshot, input, input, {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "pg_snapshot" field (binary)', async () => {
    await testParse(conn, DataTypeOIDs.pg_snapshot, input, input, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should parse "pg_snapshot" array field (text)', async () => {
    await testParse(conn, DataTypeOIDs._pg_snapshot, input, input, {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "pg_snapshot" array field (binary)', async () => {
    await testParse(conn, DataTypeOIDs._pg_snapshot, input, input, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should encode "pg_snapshot" param', async () => {
    await testEncode(conn, DataTypeOIDs.pg_snapshot, input, input);
  });

  it('should encode "pg_snapshot" array param', async () => {
    await testEncode(conn, DataTypeOIDs._pg_snapshot, input, input);
  });

  it('should read what the server is looking at right now', async () => {
    const r = await conn.query('select pg_current_snapshot() f', {
      columnFormat: DataFormat.binary,
    });
    const printed = await conn.query('select pg_current_snapshot()::text f');
    expect(typeof r.rows?.[0][0]).toStrictEqual('string');
    expect(String(r.rows?.[0][0])).toMatch(/^\d+:\d+:/);
    expect(String(printed.rows?.[0][0])).toMatch(/^\d+:\d+:/);
  });
});
