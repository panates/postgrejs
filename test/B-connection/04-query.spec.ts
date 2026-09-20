import assert from 'assert';
import { expect } from 'expect';
import {
  BindParam,
  Connection,
  Cursor,
  DataFormat,
  DataTypeMap,
  GlobalTypeMap,
  RowDecoder,
  sql,
} from 'postgrejs';

(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

describe('query() (Extended Query)', () => {
  let connection: Connection;

  before(async () => {
    connection = new Connection();
    await connection.connect();
  });

  after(async () => {
    await connection.close();
  });

  it('should return QueryResult', async () => {
    const result = await connection.query(
      `select * from countries order by code`,
      { timing: true },
    );
    expect(result).toBeDefined();
    expect(result.fields).toBeDefined();
    expect(result.rows).toBeDefined();
    expect(result.executeTime).toBeDefined();
    expect(result.command).toStrictEqual('SELECT');
    assert(result.fields);
    expect(result.fields[0].fieldName).toStrictEqual('code');
    expect(result.fields[1].fieldName).toStrictEqual('name');
    assert(result.rows);
    expect(result.rows[0][0]).toStrictEqual('CA');
    expect(result.rows[0][1]).toStrictEqual('Canada');
  });

  it('should not measure execution time unless "timing" is enabled', async () => {
    const result = await connection.query(
      `select * from countries order by code`,
    );
    expect(result.executeTime).toBeUndefined();
  });

  it('should correctly decode a fixed-width column following a variable-width one (binary)', async () => {
    // Regression test for the row-level buffer decode change: bytea/json
    // have no fixedBinarySize (their decodeBinary has no way to know
    // where its own value ends other than the buffer it's handed), so
    // get-parsers.ts MUST give them a bounded slice - if that gate were
    // ever wrong, a following column would silently decode using the
    // wrong offset/bytes instead of throwing.
    const result = await connection.query(
      `select '\\xdeadbeef'::bytea as blob, 12345::int4 as after_bytea,
              '{"a":1}'::json as js, 999::int4 as after_json,
              'hello world'::varchar as txt, 42::int4 as after_varchar`,
      { objectRows: true, columnFormat: DataFormat.binary },
    );
    assert(result.rows);
    const row = result.rows[0] as Record<string, any>;
    expect(row.blob).toStrictEqual(Buffer.from([0xde, 0xad, 0xbe, 0xef]));
    expect(row.after_bytea).toStrictEqual(12345);
    expect(row.js).toStrictEqual({ a: 1 });
    expect(row.after_json).toStrictEqual(999);
    expect(row.txt).toStrictEqual('hello world');
    expect(row.after_varchar).toStrictEqual(42);
  });

  it('should return object rows', async () => {
    const result = await connection.query(
      `select * from countries order by code`,
      { objectRows: true },
    );
    expect(result).toBeDefined();
    expect(result.command).toStrictEqual('SELECT');
    assert(result.fields);
    expect(result.fields[0].fieldName).toStrictEqual('code');
    expect(result.fields[1].fieldName).toStrictEqual('name');
    assert(result.rows);
    expect(result.rows[0].code).toStrictEqual('CA');
    expect(result.rows[0].name).toStrictEqual('Canada');
  });

  it("should return object rows via rowDecoder: 'object'", async () => {
    const result = await connection.query(
      `select * from countries order by code`,
      { rowDecoder: 'object' },
    );
    expect(result.rowType).toStrictEqual('object');
    assert(result.rows);
    expect(result.rows[0].code).toStrictEqual('CA');
  });

  it('should let rowDecoder win over objectRows when both are set', async () => {
    const result = await connection.query(
      `select * from countries order by code`,
      { objectRows: true, rowDecoder: 'array' },
    );
    expect(result.rowType).toStrictEqual('array');
    assert(result.rows);
    expect(result.rows[0][0]).toStrictEqual('CA');
  });

  it('should decode rows with a custom RowDecoder', async () => {
    class UppercaseNameRowDecoder extends RowDecoder {
      decode(parsers: any[], data: Buffer, columnCount: number, options: any) {
        const row: any[] = [];
        let offset = 0;
        for (let i = 0; i < columnCount; i++) {
          const len = data.readInt32BE(offset);
          offset += 4;
          if (len < 0) {
            row.push(null);
          } else {
            row.push(parsers[i](data, offset, len, options));
            offset += len;
          }
        }
        return { code: row[0], name: String(row[1]).toUpperCase() };
      }
    }
    const result = await connection.query(
      `select * from countries order by code`,
      { rowDecoder: new UppercaseNameRowDecoder() },
    );
    expect(result.rowType).toStrictEqual('custom');
    assert(result.rows);
    expect(result.rows[0]).toStrictEqual({ code: 'CA', name: 'CANADA' });
  });

  it('should limit number of returning rows with "fetchCount" property', async () => {
    const result = await connection.query(`select * from customers`, {
      fetchCount: 10,
    });
    expect(result).toBeDefined();
    expect(result.command).toStrictEqual('SELECT');
    expect(result.rowType).toStrictEqual('array');
    assert(result.rows);
    expect(result.rows.length).toStrictEqual(10);
  });

  it('should check "fetchCount" value range', async () => {
    await expect(() =>
      connection.query(`select * from customers`, { fetchCount: -1 }),
    ).rejects.toThrow('fetchCount can be between');
    await expect(() =>
      connection.query(`select * from customers`, { fetchCount: 4294967296 }),
    ).rejects.toThrow('fetchCount can be between');
  });

  it('should use bind parameters', async () => {
    const result = await connection.query(
      `select * from customers where id=$1`,
      { params: [1], objectRows: true },
    );
    expect(result).toBeDefined();
    expect(result.command).toStrictEqual('SELECT');
    expect(result.rowType).toStrictEqual('object');
    assert(result.rows);
    expect(result.rows.length).toStrictEqual(1);
    expect(result.rows[0].id).toStrictEqual(1);
    expect(result.rows[0].given_name).toStrictEqual('Wynne');
  });

  it('should pass null value to bind parameters', async () => {
    const result = await connection.query(
      `select * from customers where id=$1`,
      { params: [null], objectRows: true },
    );
    expect(result).toBeDefined();
  });

  it('should detect bool value when binding parameters', async () => {
    const result = await connection.query(
      `select f_bool from data_types where f_bool = $1`,
      {
        params: [true],
        objectRows: false,
      },
    );
    expect(result).toBeDefined();
    assert(result.rows);
    expect(result.rows.length).toStrictEqual(1);
    expect(result.rows[0][0]).toStrictEqual(true);
  });

  it('should detect uuid value when binding parameters', async () => {
    const result = await connection.query(
      `select f_uuid from data_types where f_uuid = $1`,
      {
        params: ['87d48838-02b3-4e26-8fec-bcc8c00e3772'],
        objectRows: false,
      },
    );
    expect(result).toBeDefined();
    assert(result.rows);
    expect(result.rows.length).toStrictEqual(1);
    expect(result.rows[0][0]).toStrictEqual(
      '87d48838-02b3-4e26-8fec-bcc8c00e3772',
    );
  });

  it('should use bind array parameters', async () => {
    let result = await connection.query(
      `select * from customers where id = ANY($1)`,
      {
        params: [[1, 2, 3]],
        objectRows: true,
      },
    );
    expect(result).toBeDefined();
    expect(result.command).toStrictEqual('SELECT');
    expect(result.rowType).toStrictEqual('object');
    assert(result.rows);
    expect(result.rows.length).toStrictEqual(3);
    expect(result.rows[0].id).toStrictEqual(1);
    expect(result.rows[1].id).toStrictEqual(2);
    expect(result.rows[2].id).toStrictEqual(3);

    const arr = ['DE', 'US', 'TR'];
    result = await connection.query(
      `select * from customers where country_code = ANY($1)`,
      {
        params: [arr],
        objectRows: true,
      },
    );
    expect(result).toBeDefined();
    expect(result.command).toStrictEqual('SELECT');
    expect(result.rowType).toStrictEqual('object');
    assert(result.rows);
    for (const row of result.rows) {
      expect(arr).toContain(row.country_code);
    }
  });

  it('should wrap undefined parameters to null ', async () => {
    const result = await connection.query(`select $1`, {
      params: [null],
      objectRows: false,
    });
    expect(result).toBeDefined();
    assert(result.rows);
    expect(result.rows.length).toStrictEqual(1);
    expect(result.rows[0][0]).toStrictEqual(null);
  });

  it('should return cursor', async () => {
    const result = await connection.query(`select * from customers`, {
      objectRows: true,
      cursor: true,
    });
    expect(result).toBeDefined();
    expect(result.cursor).toBeDefined();
    expect(result.cursor).toBeInstanceOf(Cursor);
  });

  it('should select sql return data rows', async () => {
    const result = await connection.query(`select * from data_types`, {
      objectRows: true,
    });
    expect(result).toBeDefined();
    expect(result.rows).toBeDefined();
    assert(result.rows);
    const row = result.rows[0];
    expect(row).toBeDefined();
    expect(row.id).toStrictEqual(1);
    expect(row.f_int2).toStrictEqual(1);
    expect(row.f_int4).toStrictEqual(12345);
    expect(row.f_int8).toStrictEqual(BigInt('9007199254740995'));
    // 1.2 is not exactly representable in 32 bits, but it is the shortest
    // decimal that reads back as the float4 that was stored, so that is
    // what comes out - the number the server prints, not the double that
    // spells its binary approximation out in full.
    expect(row.f_float4).toStrictEqual(1.2);
    expect(row.f_float8).toStrictEqual(5.12345);
    expect(row.f_char).toStrictEqual('a');
    expect(row.f_varchar).toStrictEqual('abcd');
    expect(row.f_text).toStrictEqual('abcde');
    expect(row.f_bpchar).toStrictEqual('abcdef');
    expect(row.f_json).toStrictEqual({ a: 1 });
    expect(row.f_xml).toStrictEqual('<tag1>123</tag1>');
    expect(row.f_date).toStrictEqual(new Date('2010-03-22T00:00:00'));
    expect(row.f_timestamp).toStrictEqual(new Date('2020-01-10T15:45:12.123'));
    expect(row.f_timestamptz).toStrictEqual(
      new Date('2005-07-01T01:21:11.123+03:00'),
    );
    expect(row.f_bytea).toStrictEqual(Buffer.from([65, 66, 67, 68, 69]));
    expect(row.f_point).toStrictEqual({ x: -1.2, y: 3.5 });
    expect(row.f_circle).toStrictEqual({ x: -1.2, y: 3.5, r: 4.6 });
    expect(row.f_lseg).toStrictEqual({ x1: 1.2, y1: 3.5, x2: 4.6, y2: 5.2 });
    expect(row.f_box).toStrictEqual({ x1: 4.6, y1: 3, x2: -1.6, y2: 0.1 });
  });

  it('should not crash protocol on invalid query ', async () => {
    await expect(() => connection.query(`invalid sql`)).rejects.toThrow(
      'invalid',
    );
    await connection.execute('select 1');
  });

  it('should return a column named __proto__ as its own property, with its value', async () => {
    const result = await connection.query(`select 42 as "__proto__", 7 as ok`, {
      objectRows: true,
    });
    const row = result.rows?.[0] as any;
    // Defined as an own property rather than assigned, so it can't reach
    // Object.prototype...
    expect(Object.prototype.hasOwnProperty.call(row, '__proto__')).toBe(true);
    expect(({} as any).polluted).toBeUndefined();
    expect(Object.getPrototypeOf(row)).toBe(Object.prototype);
    // ...but it must still carry the column's actual value, not undefined.
    expect(Object.getOwnPropertyDescriptor(row, '__proto__')?.value).toBe(42);
    expect(row.ok).toBe(7);
  });

  it('should decode normally through a typeMap copied from the global one', async () => {
    // A copy that lost the OID index leaves get-parsers.ts with no parser
    // for any column, so every value came back as a raw Buffer with
    // nothing reported - the shape a per-connection type override takes.
    const typeMap = new DataTypeMap(GlobalTypeMap);
    const r = await connection.query(
      'select 1::int4 as a, 2::int8 as b, $1::text as c',
      { params: ['x'], typeMap, objectRows: true },
    );
    expect(r.rows?.[0]).toStrictEqual({ a: 1, b: 2, c: 'x' });
  });

  describe('pipeline()', () => {
    it('should run different statements in one round trip and map results by position', async () => {
      await connection.execute(
        'create temp table t_pipe (id int4 primary key, a int4, b text)',
      );
      await connection.execute("insert into t_pipe values (1, 0, 'x')");
      const r = await connection.pipeline([
        { sql: 'update t_pipe set a = $1 where id = $2', params: [5, 1] },
        { sql: 'insert into t_pipe values ($1, $2, $3)', params: [2, 1, 'y'] },
        { sql: 'select id, b from t_pipe where id = $1', params: [1] },
      ]);
      expect(r.length).toStrictEqual(3);
      expect(r[0].command).toStrictEqual('UPDATE');
      expect(r[0].rowsAffected).toStrictEqual(1);
      expect(r[1].command).toStrictEqual('INSERT');
      expect(r[2].command).toStrictEqual('SELECT');
      expect(r[2].rows?.[0]).toStrictEqual([1, 'x']);
      expect(r[2].fields?.length).toStrictEqual(2);
    });

    it('should accept plain strings, objects and sql tag output alike', async () => {
      const r = await connection.pipeline([
        'select 1 as v',
        { sql: 'select $1::int4 as v', params: [7] },
        sql`select ${9}::int4 as v`,
      ]);
      expect(r.map(x => x.rows?.[0])).toStrictEqual([[1], [7], [9]]);
    });

    it('should apply options to every statement', async () => {
      const r = await connection.pipeline(['select 1 as v', 'select 2 as v'], {
        objectRows: true,
      });
      expect(r.map(x => x.rows?.[0])).toStrictEqual([{ v: 1 }, { v: 2 }]);
    });

    it('should report which statement the server rejected', async () => {
      await connection.execute(
        'create temp table t_pipe_err (id int4 primary key)',
      );
      await connection.execute('insert into t_pipe_err values (1)');
      let error: any;
      try {
        await connection.pipeline([
          { sql: 'insert into t_pipe_err values ($1)', params: [50] },
          { sql: 'insert into t_pipe_err values ($1)', params: [1] },
          { sql: 'insert into t_pipe_err values ($1)', params: [51] },
        ]);
      } catch (e: any) {
        error = e;
      }
      expect(error?.code).toStrictEqual('23505');
      expect(error?.failedIndex).toStrictEqual(1);
      const q = await connection.query('select 1 as v');
      expect(q.rows?.[0]).toStrictEqual([1]);
    });

    it('should roll every statement back when one fails', async () => {
      // One Sync means one implicit transaction: statement 0 completed
      // before the failure but must not survive it, and statement 2 never
      // ran at all.
      await connection.execute(
        'create temp table t_pipe_atomic (id int4 primary key)',
      );
      await connection.execute('insert into t_pipe_atomic values (1)');
      await expect(
        connection.pipeline([
          { sql: 'insert into t_pipe_atomic values ($1)', params: [50] },
          { sql: 'insert into t_pipe_atomic values ($1)', params: [1] },
          { sql: 'insert into t_pipe_atomic values ($1)', params: [51] },
        ]),
      ).rejects.toThrow();
      const q = await connection.query(
        'select count(*)::int4 as n from t_pipe_atomic where id in (50, 51)',
      );
      expect(q.rows?.[0]).toStrictEqual([0]);
    });

    it('should accept an empty pipeline without touching the connection', async () => {
      expect(await connection.pipeline([])).toStrictEqual([]);
      const q = await connection.query('select 1 as v');
      expect(q.rows?.[0]).toStrictEqual([1]);
    });

    it('should reject a cursor request, which a pipeline cannot honour', async () => {
      await expect(
        connection.pipeline(['select 1 as v'], { cursor: true }),
      ).rejects.toThrow(/cursor/);
    });

    it('should keep results aligned when only some statements return rows', async () => {
      const r = await connection.pipeline([
        'select 1 as v',
        'create temp table t_pipe_norows (id int4)',
        'select 2 as v',
      ]);
      expect(r[0].rows?.[0]).toStrictEqual([1]);
      expect(r[1].rows).toBeUndefined();
      expect(r[2].rows?.[0]).toStrictEqual([2]);
    });

    describe('prepared statement reuse', () => {
      const open = async (cfg?: any) => {
        const c = new Connection(cfg);
        await c.connect();
        return c;
      };
      const prepared = async (c: Connection) =>
        (
          await c.query(
            'select count(*)::int4 as n from pg_prepared_statements',
            { prepare: false },
          )
        ).rows?.[0][0];

      it('should bind a repeat of the same SQL to one prepared statement', async () => {
        // The second occurrence earns the name; the third binds to it
        // rather than parsing a third time. An unnamed statement could not
        // be reused this way - the statement in between replaces it.
        const c = await open();
        try {
          const r = await c.pipeline([
            { sql: 'select $1::int4 as v', params: [1] },
            { sql: 'select $1::int4 * 10 as v', params: [2] },
            { sql: 'select $1::int4 as v', params: [3] },
            { sql: 'select $1::int4 as v', params: [4] },
          ]);
          expect(r.map(x => x.rows?.[0][0])).toStrictEqual([1, 20, 3, 4]);
          expect(await prepared(c)).toStrictEqual(1);
        } finally {
          await c.close(0);
        }
      });

      it('should stop preparing once every statement is cached', async () => {
        const c = await open();
        try {
          const reqs = [
            { sql: 'select $1::int4 as v', params: [7] },
            { sql: 'select $1::int4 * 10 as v', params: [8] },
          ];
          await c.pipeline(reqs);
          await c.pipeline(reqs);
          const settled = await prepared(c);
          const r = await c.pipeline(reqs);
          expect(r.map(x => x.rows?.[0][0])).toStrictEqual([7, 80]);
          expect(await prepared(c)).toStrictEqual(settled);
        } finally {
          await c.close(0);
        }
      });

      it('should keep row counts and columns right for a cached statement', async () => {
        // A cached statement sends no Describe, so its columns have to
        // come from the cache entry instead of the wire.
        const c = await open();
        try {
          await c.execute('create temp table t_pipe_cache (id int4)');
          for (let i = 0; i < 3; i++) {
            const r = await c.pipeline([
              { sql: 'insert into t_pipe_cache values ($1)', params: [i] },
              { sql: 'select count(*)::int4 as n from t_pipe_cache' },
            ]);
            expect(r[0].command).toStrictEqual('INSERT');
            expect(r[0].rowsAffected).toStrictEqual(1);
            expect(r[1].rows?.[0]).toStrictEqual([i + 1]);
            expect(r[1].fields?.length).toStrictEqual(1);
          }
        } finally {
          await c.close(0);
        }
      });

      it('should recover when a schema change invalidates a cached plan', async () => {
        const c = await open();
        try {
          await c.execute(
            'create temp table t_pipe_ddl (a int4); insert into t_pipe_ddl values (1)',
          );
          for (let i = 0; i < 3; i++)
            await c.pipeline([{ sql: 'select * from t_pipe_ddl' }]);
          await c.execute('alter table t_pipe_ddl add column b text');
          const r = await c.pipeline([{ sql: 'select * from t_pipe_ddl' }]);
          expect(r[0].rows?.[0].length).toStrictEqual(2);
        } finally {
          await c.close(0);
        }
      });

      it('should prepare nothing when prepare is off', async () => {
        const c = await open();
        try {
          const before = await prepared(c);
          for (let i = 0; i < 3; i++)
            await c.pipeline([{ sql: 'select $1::int8 as v', params: [1] }], {
              prepare: false,
            });
          expect(await prepared(c)).toStrictEqual(before);
        } finally {
          await c.close(0);
        }
      });

      it('should honour columnFormat per call on a cached statement', async () => {
        const c = await open();
        try {
          const reqs = [{ sql: 'select $1::int4 as v', params: [5] }];
          await c.pipeline(reqs);
          await c.pipeline(reqs);
          const text = await c.pipeline(reqs, {
            columnFormat: DataFormat.text,
          });
          const binary = await c.pipeline(reqs, {
            columnFormat: DataFormat.binary,
          });
          expect(text[0].rows?.[0]).toStrictEqual([5]);
          expect(binary[0].rows?.[0]).toStrictEqual([5]);
        } finally {
          await c.close(0);
        }
      });
    });
  });

  describe('prepared statement cache', () => {
    const open = async (cfg?: any) => {
      const c = new Connection(cfg);
      await c.connect();
      return c;
    };
    // prepare: false matters here rather than being tidiness - without it
    // this helper is itself cached on its second call and starts counting
    // its own statement alongside the one under test.
    const serverStatements = async (c: Connection) =>
      (
        await c.query(
          'select count(*)::int4 as n from pg_prepared_statements',
          { prepare: false },
        )
      ).rows?.[0][0];

    it('should not prepare a statement the connection has seen only once', async () => {
      const c = await open();
      try {
        await c.query('select $1::int4 as cache_once', { params: [1] });
        expect(await serverStatements(c)).toStrictEqual(0);
      } finally {
        await c.close(0);
      }
    });

    it('should prepare on the second use and reuse it afterwards', async () => {
      const c = await open();
      try {
        const text = 'select $1::int4 as cache_twice';
        await c.query(text, { params: [1] });
        await c.query(text, { params: [2] });
        expect(await serverStatements(c)).toStrictEqual(1);
        // Still correct, and still one statement rather than a new one per
        // call.
        const r = await c.query(text, { params: [42] });
        expect(r.rows?.[0]).toStrictEqual([42]);
        expect(await serverStatements(c)).toStrictEqual(1);
      } finally {
        await c.close(0);
      }
    });

    it('should stay off when prepare is false, per call or per connection', async () => {
      const text = 'select $1::int4 as cache_off';
      const c = await open();
      try {
        await c.query(text, { params: [1], prepare: false });
        await c.query(text, { params: [1], prepare: false });
        expect(await serverStatements(c)).toStrictEqual(0);
      } finally {
        await c.close(0);
      }
      const c2 = await open({ prepare: false });
      try {
        await c2.query(text, { params: [1] });
        await c2.query(text, { params: [1] });
        expect(await serverStatements(c2)).toStrictEqual(0);
      } finally {
        await c2.close(0);
      }
    });

    it('should recover when a schema change invalidates a cached plan', async () => {
      // PostgreSQL answers 0A000 "cached plan must not change result type"
      // here. Without handling it, every later call on this connection
      // would fail the same way instead of just the first.
      const c = await open();
      try {
        await c.execute(
          'create temp table t_cache_ddl (a int4); insert into t_cache_ddl values (1)',
        );
        await c.query('select * from t_cache_ddl');
        await c.query('select * from t_cache_ddl');
        await c.execute('alter table t_cache_ddl add column b text');
        const r = await c.query('select * from t_cache_ddl');
        expect(r.rows?.[0].length).toStrictEqual(2);
        const again = await c.query('select * from t_cache_ddl');
        expect(again.rows?.[0].length).toStrictEqual(2);
      } finally {
        await c.close(0);
      }
    });

    it('should recover when a type a cached plan refers to is recreated', async () => {
      // PostgreSQL answers XX000 "cache lookup failed for type <oid>"
      // here, not 0A000, so the recovery that catches a schema change
      // used to miss it - and because the entry stayed in the cache, the
      // connection failed that way for every later call, not just the
      // first.
      const c = await open();
      try {
        const setup = () =>
          c.execute(
            'drop table if exists t_cache_type;' +
              ' drop type if exists t_cache_mood cascade;' +
              " create type t_cache_mood as enum ('sad','happy');" +
              ' create table t_cache_type (id serial primary key,' +
              ' m t_cache_mood)',
          );
        await setup();
        const stmt = 'insert into t_cache_type (m) values ($1) returning id';
        const opts = () => ({ params: [new BindParam(0, 'happy')] });
        // Past PREPARE_AFTER_USES, so the statement is bound to a name.
        for (let i = 0; i < 4; i++) await c.query(stmt, opts());
        await setup();
        const r = await c.query(stmt, opts());
        expect(r.rows?.[0][0]).toStrictEqual(1);
        // The second call is what proves the entry was dropped rather
        // than the first one getting lucky.
        const again = await c.query(stmt, opts());
        expect(again.rows?.[0][0]).toStrictEqual(2);
      } finally {
        await c
          .execute(
            'drop table if exists t_cache_type;' +
              ' drop type if exists t_cache_mood cascade',
          )
          .catch(() => undefined);
        await c.close(0);
      }
    });

    it('should keep the cached statement when a query fails for its own reasons', async () => {
      // The other half of the same decision: only a stale plan retires an
      // entry. Dropping one on every failure would self-heal too, but a
      // unique violation on a hot upsert would keep costing the statement
      // its name - and re-running something that failed on its own merits
      // buys nothing.
      const c = await open();
      try {
        await c.execute('create temp table t_cache_err (id int4 primary key)');
        const stmt = 'insert into t_cache_err (id) values ($1)';
        for (let i = 0; i < 4; i++) await c.query(stmt, { params: [i] });
        const before = await serverStatements(c);
        await expect(c.query(stmt, { params: [1] })).rejects.toThrow(
          /duplicate key/,
        );
        expect(await serverStatements(c)).toStrictEqual(before);
        // And it is still usable, rather than having been quietly retired.
        await c.query(stmt, { params: [99] });
        expect(await serverStatements(c)).toStrictEqual(before);
      } finally {
        await c.close(0);
      }
    });

    it('should close the least recently used statement once the cache is full', async () => {
      const c = await open({ preparedStatementCacheSize: 5 });
      try {
        for (let i = 0; i < 20; i++) {
          const text = `select ${i}::int4 as v, $1::int4 as p`;
          await c.query(text, { params: [1] });
          await c.query(text, { params: [1] });
        }
        // Without eviction this would be 20, and would keep growing for
        // an application that builds SQL text dynamically.
        expect(await serverStatements(c)).toBeLessThanOrEqual(5);
      } finally {
        await c.close(0);
      }
    });

    describe('inside a transaction', () => {
      it('should reuse a cached statement rather than prepare per call', async () => {
        const c = await open();
        try {
          await c.startTransaction();
          for (let i = 0; i < 4; i++)
            await c.query('select $1::int4 as v', { params: [i] });
          // One named statement for the four calls. The pre-cache path
          // prepared and closed one per call, so this counted 0.
          expect(await serverStatements(c)).toStrictEqual(1);
          await c.rollback();
        } finally {
          await c.close(0);
        }
      });

      it('should recover from an invalidated plan without losing the transaction', async () => {
        // The savepoint is what makes this recoverable at all: 0A000
        // aborts the block like any other error, so the retry would answer
        // 25P02 if there were nothing to roll back to.
        const c = await open();
        try {
          await c.execute(
            'create temp table t_txn_ddl (a int4); insert into t_txn_ddl values (1)',
          );
          await c.startTransaction();
          await c.query('select * from t_txn_ddl');
          await c.query('select * from t_txn_ddl');
          await c.execute('alter table t_txn_ddl add column b text');
          const r = await c.query('select * from t_txn_ddl');
          expect(r.rows?.[0].length).toStrictEqual(2);
          expect(c.inTransaction).toStrictEqual(true);
          const again = await c.query('select * from t_txn_ddl');
          expect(again.rows?.[0].length).toStrictEqual(2);
          await c.rollback();
        } finally {
          await c.close(0);
        }
      });

      it('should keep concurrent calls apart though they share one savepoint name', async () => {
        // Every call now writes SAVEPOINT, its statement and RELEASE as
        // one buffer, so concurrent calls queue as whole groups instead of
        // interleaving their savepoint commands with each other.
        const c = await open();
        try {
          await c.startTransaction();
          const rows = await Promise.all(
            Array.from({ length: 25 }, (_, i) =>
              c.query('select $1::int4 as v', {
                params: [i],
                objectRows: true,
              }),
            ),
          );
          expect(rows.map(r => (r.rows?.[0] as any).v)).toStrictEqual(
            Array.from({ length: 25 }, (_, i) => i),
          );
          expect(c.inTransaction).toStrictEqual(true);
          await c.rollback();
        } finally {
          await c.close(0);
        }
      });

      it('should still commit for an explicit autoCommit while a transaction is open', async () => {
        // The one case the cached path does not take over.
        const c = await open();
        try {
          await c.startTransaction();
          await c.query('select 1 as v', { autoCommit: true });
          expect(c.inTransaction).toStrictEqual(false);
        } finally {
          await c.close(0);
        }
      });

      it('should keep a cached statement usable after the transaction rolls back', async () => {
        // Protocol-level Parse is not undone by ROLLBACK the way SQL-level
        // PREPARE is, so a cache entry earned inside a transaction still
        // names something the server has afterwards. The cache would hand
        // out a dead name otherwise.
        const c = await open();
        try {
          await c.startTransaction();
          for (let i = 0; i < 3; i++)
            await c.query('select $1::int4 as v', { params: [i] });
          await c.rollback();
          const r = await c.query('select $1::int4 as v', {
            params: [9],
            objectRows: true,
          });
          expect(r.rows?.[0]).toStrictEqual({ v: 9 });
        } finally {
          await c.close(0);
        }
      });

      it('should leave a transaction command unwrapped', async () => {
        const c = await open();
        try {
          await c.startTransaction();
          await c.query('commit');
          expect(c.inTransaction).toStrictEqual(false);
        } finally {
          await c.close(0);
        }
      });
    });
  });
});
