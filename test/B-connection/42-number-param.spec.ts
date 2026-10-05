import { expect } from 'expect';
import { BindParam, Connection, DataTypeOIDs } from 'postgrejs';

/**
 * A non-integer number parameter goes out declared `numeric`, not the
 * `float8` its value suggests.
 *
 * `determine()` answers by value, so the declared type used to depend on
 * whether the amount had a fractional part - and `int4 -> money` is a
 * cast PostgreSQL has while `float8 -> money` is not. The same statement
 * against the same column therefore worked with `12` and failed `42846`
 * with `12.34`, which is the shape money usually arrives in. The money
 * cases below agree with `pg` now and did not before.
 *
 * Where the two still differ, they differ in this client's favour and
 * for the reason the declaration exists: `select $1 * 2` with `1.5` is
 * `22P02` under `pg`, because an undeclared parameter beside `* 2`
 * resolves to integer, and `select $1` hands back the string `'1.5'`
 * rather than a number. Declaring numeric keeps both. The one case that
 * still goes the other way is `$1::interval` from a number, which has
 * its own test at the end.
 */
describe('Number parameters', () => {
  const conn = new Connection();
  before(async () => {
    await conn.connect();
    await conn.execute(`
        drop table if exists t_numparam;
        create table t_numparam(m money, f float8, n numeric);`);
  });
  after(async () => {
    await conn.execute('drop table if exists t_numparam');
    return conn.close(0);
  });

  /** What Parse actually declared, which is the subject here. */
  const declaredTypes = async (params: any[]): Promise<number[]> => {
    const socket = (conn as any)._intlCon.socket;
    let types: number[] = [];
    const onDebug = (e: any) => {
      if (e.args?.parse) types = e.args.parse.paramTypes;
    };
    socket.on('debug', onDebug);
    try {
      await conn.query('select $1::float8 as v', { params });
    } finally {
      socket.off('debug', onDebug);
    }
    return types;
  };

  it('should declare numeric for a non-integer and leave an integer alone', async () => {
    expect(await declaredTypes([12.34])).toStrictEqual([DataTypeOIDs.numeric]);
    expect(await declaredTypes([12])).toStrictEqual([DataTypeOIDs.int4]);
  });

  it('should leave a non-finite number declared float8', async () => {
    // numeric only grew Infinity in PostgreSQL 14; float8 carries all
    // three everywhere, so these keep the type that always works.
    expect(await declaredTypes([Infinity])).toStrictEqual([
      DataTypeOIDs.float8,
    ]);
    expect(await declaredTypes([NaN])).toStrictEqual([DataTypeOIDs.float8]);
  });

  it('should cast a non-integer to money, which float8 cannot', async () => {
    const r = await conn.query('select ($1::money)::text as v', {
      params: [12.34],
      objectRows: true,
    });
    expect(r.rows![0].v).toStrictEqual('$12.34');
  });

  it('should insert a non-integer into a money column', async () => {
    await conn.query('insert into t_numparam(m) values ($1)', {
      params: [12.34],
    });
    const r = await conn.query('select m::text as v from t_numparam', {
      objectRows: true,
    });
    expect(r.rows![0].v).toStrictEqual('$12.34');
  });

  it('should round-trip a double through a float8 column unchanged', async () => {
    // numeric -> float8 is an implicit cast, so the common case must be
    // bit-for-bit what it was when the parameter was declared float8.
    const values = [
      0.1,
      -2.25,
      0.30000000000000004,
      1e-7,
      5e-324,
      Math.PI,
      123456789.12345679,
    ];
    await conn.query('delete from t_numparam');
    for (const v of values)
      await conn.query('insert into t_numparam(f) values ($1)', {
        params: [v],
      });
    const r = await conn.query('select f from t_numparam order by f', {
      objectRows: true,
    });
    expect(r.rows!.map(x => x.f)).toStrictEqual(
      [...values].sort((a, b) => a - b),
    );
  });

  it('should still resolve the numeric family it already resolved', async () => {
    // The reason scalars are declared at all: unlike their array forms
    // they have operators across the family, and declaring numeric must
    // not take that away.
    const q = async (sql: string, v: any) =>
      (await conn.query(sql, { params: [v], objectRows: true })).rows![0].v;
    expect(await q('select $1 as v', 1.5)).toStrictEqual(1.5);
    expect(await q('select $1 * 2 as v', 1.5)).toStrictEqual(3);
    expect(await q('select ($1 + 0.5) as v', 1.5)).toStrictEqual(2);
    expect(await q('select (1.5::numeric = $1) as v', 1.5)).toStrictEqual(true);
    expect(await q('select ($1::float8)::text as v', 1.5)).toStrictEqual('1.5');
  });

  it('should leave an integer-from-number interval to a named type', async () => {
    // Recorded rather than fixed: there is no cast to interval from any
    // numeric type, so only an undeclared parameter reaches it.
    await expect(
      conn.query('select ($1::interval)::text as v', { params: [5] }),
    ).rejects.toThrow(/interval/);
    const r = await conn.query('select ($1::interval)::text as v', {
      params: [new BindParam(0, 5)],
      objectRows: true,
    });
    expect(r.rows![0].v).toStrictEqual('00:00:05');
  });
});
