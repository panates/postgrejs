import { expect } from 'expect';
import { BindParam, Connection, DataTypeOIDs } from 'postgrejs';

/**
 * `money` arrives as an int64 of the smallest currency unit, and how
 * many of those make one unit is `lc_monetary` - which the server does
 * not report among its startup parameters. So the connection asks it,
 * once, the first time a money value is actually on its way back: the
 * rows are still raw bytes when the question is asked, so nothing has
 * been read against the wrong scale. A connection that never touches
 * money never asks - measured, asking at connect cost 4.3ms -> 6.8ms
 * per connection, paid by everyone.
 */
describe('Money format', () => {
  it('should not ask until a money value is on its way back', async () => {
    const conn = new Connection();
    const sent: string[] = [];
    // Attached before connect(), so the probe would be recorded.
    (conn as any)._intlCon.socket.on('debug', (e: any) => {
      const sql = e.args?.parse?.sql ?? e.args?.sql;
      if (typeof sql === 'string') sent.push(sql);
    });
    await conn.connect();
    try {
      await conn.query('select 1 as v');
      expect(sent.some(s => s.includes("'1'::money"))).toStrictEqual(false);

      const r = await conn.query("select '12.34'::money as v");
      expect(r.rows?.[0][0]).toStrictEqual(12.34);
      // Asked between the result arriving and its rows being read.
      expect(sent.some(s => s.includes("'1'::money"))).toStrictEqual(true);
      expect((conn as any)._intlCon._moneyFormat).toEqual({
        scale: expect.any(Number),
        decimalSeparator: expect.any(String),
      });
    } finally {
      await conn.close(0);
    }
  });

  it('should ask before a cursor reads its first row', async () => {
    // A cursor decodes inside the message loop, where there is nowhere
    // left to ask from - so the statement asks on the way in instead.
    const conn = new Connection();
    await conn.connect();
    try {
      const r = await conn.query(
        "select '12.34'::money as v from generate_series(1,3)",
        { cursor: true, fetchCount: 2 },
      );
      const row = await r.cursor!.next();
      expect(row?.[0]).toStrictEqual(12.34);
      await r.cursor!.close();
    } finally {
      await conn.close(0);
    }
  });

  it('should ask only once per connection', async () => {
    const conn = new Connection();
    const sent: string[] = [];
    (conn as any)._intlCon.socket.on('debug', (e: any) => {
      const sql = e.args?.parse?.sql ?? e.args?.sql;
      if (typeof sql === 'string' && sql.includes("'1'::money")) sent.push(sql);
    });
    await conn.connect();
    try {
      for (let i = 0; i < 3; i++) await conn.query("select '1.00'::money as v");
      expect(sent.length).toStrictEqual(1);
    } finally {
      await conn.close(0);
    }
  });

  it('should let the caller name the format instead', async () => {
    // The escape hatch: a caller that knows the server, or is reading a
    // value another server rendered, skips the question.
    const conn = new Connection();
    await conn.connect();
    try {
      const r = await conn.query("select '12.34'::money as v", {
        moneyFormat: { scale: 3, decimalSeparator: '.' },
      });
      // 1234 minor units read at three fraction digits.
      expect(r.rows?.[0][0]).toStrictEqual(1.234);
    } finally {
      await conn.close(0);
    }
  });

  it('should write a parameter against the same scale', async () => {
    const conn = new Connection();
    await conn.connect();
    try {
      const r = await conn.query('select ($1::money)::text as t', {
        params: [new BindParam(DataTypeOIDs.money, 12.34)],
        objectRows: true,
      });
      expect((r.rows?.[0] as any).t).toContain('12.34');
    } finally {
      await conn.close(0);
    }
  });
});
