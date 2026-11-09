import { expect } from 'expect';
import { BindParam, Connection, DataTypeOIDs } from 'postgrejs';

/**
 * A string parameter goes out with no declared type, so the server
 * resolves it from where it lands - which is what `pg` sends.
 *
 * It used to be declared `varchar`, which is what determine() answers,
 * and that stopped the server inferring anything: a json column, a uuid
 * comparison, an enum, `coalesce($1, 1)` and an integer column all
 * refused it with "expression is of type character varying". Every
 * query below was measured against `pg` as well, and the two now agree
 * on all of them.
 */
describe('String parameters', () => {
  const conn = new Connection();
  before(async () => {
    await conn.connect();
    await conn.execute(`
        drop table if exists t_strparam;
        drop type if exists t_strparam_color;
        create type t_strparam_color as enum ('red', 'green');
        create table t_strparam(
            j json, b jsonb, i int, d date, c t_strparam_color,
            ta text[], ia int[]);`);
  });
  after(async () => {
    await conn.execute(
      'drop table if exists t_strparam; drop type if exists t_strparam_color',
    );
    return conn.close(0);
  });

  /** What Parse actually declared, which is the whole subject here. */
  const declaredTypes = async (params: any[]): Promise<number[]> => {
    const socket = (conn as any)._intlCon.socket;
    let types: number[] = [];
    const onDebug = (e: any) => {
      if (e.args?.parse) types = e.args.parse.paramTypes;
    };
    socket.on('debug', onDebug);
    try {
      await conn.query('select $1::text as v', { params });
    } finally {
      socket.off('debug', onDebug);
    }
    return types;
  };

  it('should not declare a type for a string, or an array of them', async () => {
    expect(await declaredTypes(['abc'])).toStrictEqual([0]);
    expect(await declaredTypes([['a', 'b']])).toStrictEqual([0]);
  });

  it('should keep declaring the types that can say what they are', async () => {
    // The scope of the change, pinned: a number, a boolean and a Buffer
    // are right as they are, and go on being encoded as binary.
    expect(await declaredTypes([5])).toStrictEqual([DataTypeOIDs.int4]);
    expect(await declaredTypes([true])).toStrictEqual([DataTypeOIDs.bool]);
    expect(await declaredTypes([Buffer.from('a')])).toStrictEqual([
      DataTypeOIDs.bytea,
    ]);
  });

  it('should still declare the type BindParam names', async () => {
    // Naming the type is how a caller overrides the server's choice,
    // and it has to keep doing exactly what it says.
    expect(
      await declaredTypes([new BindParam(DataTypeOIDs.varchar, 'abc')]),
    ).toStrictEqual([DataTypeOIDs.varchar]);
    const r = await conn.query('select pg_typeof($1)::text as t', {
      params: [new BindParam(DataTypeOIDs.varchar, 'abc')],
      objectRows: true,
    });
    expect((r.rows?.[0] as any).t).toStrictEqual('character varying');
  });

  it('should go into a json column', async () => {
    // Two parameters for one value: the server deduces a type per
    // parameter, and one used as both json and jsonb is "inconsistent
    // types deduced" - under `pg` as well.
    const r = await conn.query(
      'insert into t_strparam(j, b) values($1, $2) returning j::text as j, b::text as b',
      { params: ['{"a":1}', '{"a":1}'], objectRows: true },
    );
    expect(r.rows?.[0]).toStrictEqual({ j: '{"a":1}', b: '{"a": 1}' });
  });

  it('should go into an integer, a date and an enum column', async () => {
    const r = await conn.query(
      'insert into t_strparam(i, d, c) values($1, $2, $3)' +
        ' returning i, d::text as d, c::text as c',
      { params: ['5', '2024-03-05', 'red'], objectRows: true },
    );
    expect(r.rows?.[0]).toStrictEqual({ i: 5, d: '2024-03-05', c: 'red' });
  });

  it('should compare against a column of any type', async () => {
    const r = await conn.query(
      "select '11111111-1111-1111-1111-111111111111'::uuid = $1 as u," +
        ' 5 = $2 as i, coalesce($3, 1) as c',
      {
        params: ['11111111-1111-1111-1111-111111111111', '5', '7'],
        objectRows: true,
      },
    );
    expect(r.rows?.[0]).toStrictEqual({ u: true, i: true, c: 7 });
  });

  it('should send an array of them as an array literal', async () => {
    // `'' + value` would hand the server `a,b`, which is not an array
    // literal at all - the braces and the quoting are what make the
    // undeclared value readable.
    const r = await conn.query(
      'insert into t_strparam(ta, ia) values($1, $2)' +
        ' returning ta::text as ta, ia::text as ia',
      {
        params: [
          ['a', 'b'],
          ['1', '2'],
        ],
        objectRows: true,
      },
    );
    expect(r.rows?.[0]).toStrictEqual({ ta: '{a,b}', ia: '{1,2}' });
  });

  it('should quote an element that needs it, and keep nulls', async () => {
    const input = ['a,b"c\\d{}', null, '', 'NULL'];
    const r = await conn.query('select $1::text[] as v', {
      params: [input],
      objectRows: true,
    });
    expect((r.rows?.[0] as any).v).toStrictEqual(input);
  });

  it('should send a nested array', async () => {
    const input = [
      ['a', 'b'],
      ['c', 'd'],
    ];
    const r = await conn.query('select $1::text[][] as v', {
      params: [input],
      objectRows: true,
    });
    expect((r.rows?.[0] as any).v).toStrictEqual(input);
  });

  it('should be usable with any()', async () => {
    const r = await conn.query("select 'b' = any($1) as v", {
      params: [['a', 'b']],
      objectRows: true,
    });
    expect((r.rows?.[0] as any).v).toStrictEqual(true);
  });

  it('should leave the value a value, not SQL', async () => {
    const evil = "'); drop table t_strparam; --";
    const r = await conn.query('select $1 as v', {
      params: [evil],
      objectRows: true,
    });
    expect((r.rows?.[0] as any).v).toStrictEqual(evil);
  });

  it('should raise where there is nothing to resolve it from', async () => {
    // The cost of the above, pinned so it stays a choice rather than a
    // surprise: a parameter with no context has no type. `pg` raises the
    // same 42P08 for the same query; `$1::text` or
    // `new BindParam(DataTypeOIDs.varchar, v)` says which type is meant.
    await expect(
      conn.query('select $1 is null as v', { params: ['a'] }),
    ).rejects.toThrow('could not determine data type');
    const r = await conn.query('select $1::text is null as v', {
      params: ['a'],
      objectRows: true,
    });
    expect((r.rows?.[0] as any).v).toStrictEqual(false);
  });
});
