import { expect } from 'expect';
import { BindParam, Connection, DataFormat, DataTypeOIDs } from 'postgrejs';
import { testEncode, testParse } from './_testers.js';

/**
 * money is an int64 of the smallest currency unit, and how many of those
 * make one is the server's `lc_monetary` - which it never reports. The
 * connection asks it once on its way up, so both formats decode to the
 * same exact value; the currency symbol is the server's rendering of
 * that value rather than part of it, and `fetchAsString` is how a caller
 * asks for the rendering.
 */
describe('DataType: money', () => {
  const conn = new Connection();
  before(() => conn.connect());
  after(() => conn.close(0));

  it('should parse "money" field (text)', async () => {
    await testParse(
      conn,
      DataTypeOIDs.money,
      ['12.34', '-0.05', '0'],
      [12.34, -0.05, 0],
      { columnFormat: DataFormat.text },
    );
  });

  it('should parse "money" field (binary)', async () => {
    await testParse(
      conn,
      DataTypeOIDs.money,
      ['12.34', '-0.05', '0'],
      [12.34, -0.05, 0],
      { columnFormat: DataFormat.binary },
    );
  });

  it('should parse "money" array field (text)', async () => {
    await testParse(
      conn,
      DataTypeOIDs._money,
      ['1.00', '2.50', null],
      [1, 2.5, null],
      { columnFormat: DataFormat.text },
    );
  });

  it('should parse "money" array field (binary)', async () => {
    await testParse(
      conn,
      DataTypeOIDs._money,
      ['1.00', '2.50', null],
      [1, 2.5, null],
      { columnFormat: DataFormat.binary },
    );
  });

  it('should encode "money" param', async () => {
    await testEncode(conn, DataTypeOIDs.money, [12.34, -0.05], [12.34, -0.05]);
  });

  it('should encode "money" array param', async () => {
    await testEncode(conn, DataTypeOIDs._money, [1, 2.5, null], [1, 2.5, null]);
  });

  it('should decode both formats to the same value', async () => {
    // The two paths read the value differently - one from the int64,
    // one from the rendered text - so they are worth comparing directly.
    const sql = "select '1234.56'::money as v";
    const bin = await conn.query(sql, { columnFormat: DataFormat.binary });
    const txt = await conn.query(sql, { columnFormat: DataFormat.text });
    expect(bin.rows?.[0][0]).toStrictEqual(1234.56);
    expect(txt.rows?.[0][0]).toStrictEqual(1234.56);
  });

  it('should keep a value a double cannot carry', async () => {
    // money runs to 2^63 minor units, so it leaves the safe integers far
    // behind - and then it widens to Numeric, the way numeric does.
    const r = await conn.query("select '92233720368547758.07'::money as v");
    expect(String(r.rows?.[0][0])).toStrictEqual('92233720368547758.07');
  });

  it("should hand back the server's own rendering when asked", async () => {
    const r = await conn.query("select '12.34'::money as v", {
      fetchAsString: [DataTypeOIDs.money],
    });
    // Whatever lc_monetary renders - '$12.34' on a C/en_US server.
    expect(typeof r.rows?.[0][0]).toStrictEqual('string');
    expect(r.rows?.[0][0]).toContain('12');
  });

  it('should round-trip through a money column', async () => {
    await conn.execute(
      'drop table if exists t_money; create table t_money(v money)',
    );
    for (const v of [12.34, -0.05, 0]) {
      await conn.query('insert into t_money values($1)', {
        params: [new BindParam(DataTypeOIDs.money, v)],
      });
    }
    const r = await conn.query('select v from t_money order by v');
    expect(r.rows).toStrictEqual([[-0.05], [0], [12.34]]);
    await conn.execute('drop table t_money');
  });

  it('should not be inferred from a plain number', async () => {
    // A JavaScript number is int4, float8 or numeric long before anyone
    // means money by it.
    const r = await conn.query('select pg_typeof($1)::text as t', {
      params: [12.34],
      objectRows: true,
    });
    expect((r.rows?.[0] as any).t).not.toStrictEqual('money');
  });
});
