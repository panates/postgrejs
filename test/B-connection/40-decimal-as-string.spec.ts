import { expect } from 'expect';
import { Connection, DataTypeOIDs, Numeric } from 'postgrejs';

/**
 * `money` and `numeric` against a live server, with the scale the
 * server itself reported.
 *
 * The table below is what the three answers look like side by side. The
 * middle one was unreachable before this option: `fetchAsString` asks
 * the server, and the server writes what `lc_monetary` tells it to.
 *
 * ```
 *                        -1234.50::money
 *   default              -1234.5          (a number)
 *   decimalAsString      "-1234.50"
 *   fetchAsString        "-$1,234.50"
 * ```
 */
describe('decimalAsString', () => {
  const conn = new Connection();
  before(() => conn.connect());
  after(() => conn.close(0));

  const SQL =
    "select '-1234.50'::money m1, '12.34'::money m2," +
    " '92233720368547758.07'::money m3," +
    " array['-1234.50','12.34']::money[] ma," +
    " '19.99'::numeric n1, '1.50'::numeric n2," +
    " '{1.5,2.5}'::numeric[] na, numrange(1.5,2.5) nr";

  const row = async (options?: any) =>
    (await conn.query(SQL, { objectRows: true, ...options })).rows?.[0] as any;

  it('should hand back the exact decimal, with nothing added', async () => {
    const r = await row({ decimalAsString: true });
    expect(r.m1).toStrictEqual('-1234.50');
    expect(r.m2).toStrictEqual('12.34');
    // Past a double, and every digit still there.
    expect(r.m3).toStrictEqual('92233720368547758.07');
    expect(r.ma).toStrictEqual(['-1234.50', '12.34']);
    expect(r.n1).toStrictEqual('19.99');
    // The stored scale, which is the first thing a number loses.
    expect(r.n2).toStrictEqual('1.50');
    expect(r.na).toStrictEqual(['1.5', '2.5']);
    // A range decodes through its element, so its bounds follow.
    expect(r.nr.lower).toStrictEqual('1.5');
  });

  it('should be the value, where fetchAsString is the server’s rendering', async () => {
    const asked = await row({ fetchAsString: [DataTypeOIDs.money] });
    expect(asked.m1).toStrictEqual('-$1,234.50');
    const exact = await row({ decimalAsString: true });
    expect(exact.m1).toStrictEqual('-1234.50');
  });

  it('should take only the types the array names', async () => {
    const money = await row({ decimalAsString: [DataTypeOIDs.money] });
    expect(money.m1).toStrictEqual('-1234.50');
    expect(money.n1).toStrictEqual(19.99);
    const numeric = await row({ decimalAsString: [DataTypeOIDs.numeric] });
    expect(numeric.m1).toStrictEqual(-1234.5);
    expect(numeric.n1).toStrictEqual('19.99');
  });

  it('should answer the same way in the text wire format', async () => {
    const r = await row({ decimalAsString: true, prepare: false });
    expect(r.m1).toStrictEqual('-1234.50');
    expect(r.n2).toStrictEqual('1.50');
  });

  it('should leave the default alone', async () => {
    const r = await row();
    expect(r.m1).toStrictEqual(-1234.5);
    expect(r.n1).toStrictEqual(19.99);
    // A Numeric without the option, because no double carries it - the
    // exact decimal was always there, just not as a string.
    expect(r.m3).toBeInstanceOf(Numeric);
    expect(String(r.m3)).toStrictEqual('92233720368547758.07');
  });

  it('should work from the connection, and lose to the call', async () => {
    const c = new Connection({ decimalAsString: true });
    await c.connect();
    try {
      const all = (await c.query(SQL, { objectRows: true })).rows?.[0] as any;
      expect(all.m1).toStrictEqual('-1234.50');
      expect(all.n1).toStrictEqual('19.99');
      const off = (
        await c.query(SQL, { objectRows: true, decimalAsString: false })
      ).rows?.[0] as any;
      expect(off.m1).toStrictEqual(-1234.5);
      expect(off.n1).toStrictEqual(19.99);
    } finally {
      await c.close(0);
    }
  });

  it('should refuse a type that carries no exact decimal, at the call', async () => {
    await expect(
      conn.query(SQL, { decimalAsString: [DataTypeOIDs.float8] }),
    ).rejects.toThrow(/only numeric \(1700\) and money \(790\)/);
  });

  it('should send one back as a parameter unchanged', async () => {
    // The string is what money and numeric already accept as input, so
    // a value read this way round-trips without a conversion.
    const r = await conn.query(
      'select ($1::numeric)::text a, ($2::money)::text b',
      { objectRows: true, params: ['1.50', '-1234.50'] },
    );
    expect((r.rows?.[0] as any).a).toStrictEqual('1.50');
    expect((r.rows?.[0] as any).b).toStrictEqual('-$1,234.50');
  });
});
