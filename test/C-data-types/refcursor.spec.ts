import { expect } from 'expect';
import { Connection, DataFormat, DataTypeOIDs } from 'postgrejs';
import { testEncode, testParse } from './_testers.js';

const input = ['c1', 'my_cursor', 'imleç ü'];

describe('DataType: refcursor', () => {
  const conn = new Connection();
  before(() => conn.connect());
  after(() => conn.close(0));

  it('should parse "refcursor" field (text)', async () => {
    await testParse(conn, DataTypeOIDs.refcursor, input, input, {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "refcursor" field (binary)', async () => {
    await testParse(conn, DataTypeOIDs.refcursor, input, input, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should parse "refcursor" array field (text)', async () => {
    await testParse(conn, DataTypeOIDs._refcursor, input, input, {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "refcursor" array field (binary)', async () => {
    await testParse(conn, DataTypeOIDs._refcursor, input, input, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should encode "refcursor" param', async () => {
    await testEncode(conn, DataTypeOIDs.refcursor, input, input);
  });

  it('should encode "refcursor" array param', async () => {
    await testEncode(conn, DataTypeOIDs._refcursor, input, input);
  });

  it('should be what a cursor-returning function hands back', async () => {
    // Which is where one is actually met: a PL/pgSQL function declares
    // RETURNS refcursor and the name comes back as this type. It used to
    // arrive as a Buffer.
    await conn.execute('begin');
    await conn.execute(
      'create or replace function pg_temp.f_cur() returns refcursor as $$' +
        " declare c refcursor := 'the_cursor';" +
        ' begin open c for select 1; return c; end $$ language plpgsql',
    );
    const r = await conn.query('select pg_temp.f_cur() f', {
      columnFormat: DataFormat.binary,
    });
    expect(r.rows?.[0][0]).toStrictEqual('the_cursor');
    await conn.execute('commit');
  });
});
