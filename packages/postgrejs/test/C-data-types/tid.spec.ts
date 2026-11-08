import { expect } from 'expect';
import { BindParam, Connection, DataFormat, DataTypeOIDs } from 'postgrejs';
import { testEncode, testParse } from './_testers.js';

const input = ['(0,1)', '(0,0)', '(123,45)', '(4294967295,65535)'];
const output = input;

describe('DataType: tid', () => {
  const conn = new Connection();
  before(() => conn.connect());
  after(() => conn.close(0));

  it('should parse "tid" field (text)', async () => {
    await testParse(conn, DataTypeOIDs.tid, input, output, {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "tid" field (binary)', async () => {
    await testParse(conn, DataTypeOIDs.tid, input, output, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should parse "tid" array field (text)', async () => {
    await testParse(conn, DataTypeOIDs._tid, input, output, {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "tid" array field (binary)', async () => {
    await testParse(conn, DataTypeOIDs._tid, input, output, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should encode "tid" param', async () => {
    await testEncode(conn, DataTypeOIDs.tid, output, output);
  });

  it('should encode "tid" array param', async () => {
    await testEncode(conn, DataTypeOIDs._tid, output, output);
  });

  it('should identify a row it was read from', async () => {
    // Which is the whole use of a ctid: read it, hand it back.
    await conn.execute(
      'drop table if exists t_ctid; create table t_ctid(a int)',
    );
    await conn.execute('insert into t_ctid values (1),(2)');
    const r = await conn.query('select ctid, a from t_ctid order by a', {
      objectRows: true,
      columnFormat: DataFormat.binary,
    });
    const first = r.rows?.[0] as any;
    const back = await conn.query('select a from t_ctid where ctid = $1', {
      params: [new BindParam(DataTypeOIDs.tid, first.ctid)],
    });
    expect(back.rows?.[0][0]).toStrictEqual(first.a);
    await conn.execute('drop table t_ctid');
  });
});
