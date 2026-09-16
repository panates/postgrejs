import { Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { expect } from 'expect';
import { Connection } from 'postgrejs';

describe('COPY support', () => {
  let connection: Connection;

  async function collect(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    await pipeline(
      stream,
      new Writable({
        write(chunk, _enc, cb) {
          chunks.push(chunk);
          cb();
        },
      }),
    );
    return Buffer.concat(chunks);
  }

  before(async () => {
    connection = new Connection();
    await connection.connect();
    await connection.execute(`
      drop table if exists copy_test;
      create table copy_test (id int4 primary key, name varchar(64));`);
  });

  beforeEach(async () => {
    await connection.execute('truncate table copy_test');
  });

  after(async () => {
    await connection.execute('drop table if exists copy_test');
    await connection.close(0);
  });

  describe('copyTo()', () => {
    beforeEach(async () => {
      await connection.execute(
        `insert into copy_test values (1, 'one'), (2, 'two'), (3, 'three')`,
      );
    });

    it('should stream text format', async () => {
      const stream = await connection.copyTo(`copy copy_test to stdout`);
      const out = await collect(stream);
      expect(out.toString('utf8')).toStrictEqual('1\tone\n2\ttwo\n3\tthree\n');
      expect(stream.rowCount).toStrictEqual(3);
    });

    it('should stream csv format', async () => {
      const stream = await connection.copyTo(
        `copy copy_test to stdout (format csv, header true)`,
      );
      const out = await collect(stream);
      expect(out.toString('utf8')).toStrictEqual(
        'id,name\n1,one\n2,two\n3,three\n',
      );
    });

    it('should stream binary format and report its formats', async () => {
      const stream = await connection.copyTo(
        `copy copy_test to stdout (format binary)`,
      );
      const out = await collect(stream);
      // Binary COPY starts with the signature "PGCOPY\n\xff\r\n\0".
      expect(out.subarray(0, 11).toString('binary')).toStrictEqual(
        'PGCOPY\n\xff\r\n\0',
      );
      expect(stream.overallFormat).toStrictEqual(1);
      expect(stream.columnFormats).toStrictEqual([1, 1]);
    });

    it('should stream an empty table', async () => {
      await connection.execute('truncate table copy_test');
      const stream = await connection.copyTo(`copy copy_test to stdout`);
      const out = await collect(stream);
      expect(out.length).toStrictEqual(0);
      expect(stream.rowCount).toStrictEqual(0);
    });

    it('should reject a statement that is not a COPY TO STDOUT', async () => {
      await expect(connection.copyTo(`select 1`)).rejects.toThrow(
        /did not start a COPY TO STDOUT/,
      );
      // The connection must survive it.
      const r = await connection.query('select 1 as one');
      expect(r.rows?.[0][0]).toStrictEqual(1);
    });

    it('should surface a server error', async () => {
      await expect(
        connection.copyTo(`copy no_such_table_here to stdout`),
      ).rejects.toThrow(/no_such_table_here/);
      const r = await connection.query('select 1 as one');
      expect(r.rows?.[0][0]).toStrictEqual(1);
    });

    it('should leave the connection usable after destroying early', async () => {
      const stream = await connection.copyTo(`copy copy_test to stdout`);
      stream.destroy();
      await new Promise(resolve => setTimeout(resolve, 100));
      const r = await connection.query('select 1 as one');
      expect(r.rows?.[0][0]).toStrictEqual(1);
    });
  });

  describe('copyFrom()', () => {
    it('should import text format', async () => {
      const stream = await connection.copyFrom(`copy copy_test from stdin`);
      await pipeline(
        Readable.from(['1\tone\n', '2\ttwo\n', '3\tthree\n']),
        stream,
      );
      expect(stream.rowCount).toStrictEqual(3);
      const r = await connection.query(
        'select count(*)::int4 as c from copy_test',
      );
      expect(r.rows?.[0][0]).toStrictEqual(3);
    });

    it('should import csv format', async () => {
      const stream = await connection.copyFrom(
        `copy copy_test from stdin (format csv)`,
      );
      await pipeline(Readable.from(['1,one\n2,two\n']), stream);
      expect(stream.rowCount).toStrictEqual(2);
    });

    it('should round-trip a copyTo export back in', async () => {
      await connection.execute(
        `insert into copy_test values (7, 'seven'), (8, 'eight')`,
      );
      const exported = await collect(
        await connection.copyTo(`copy copy_test to stdout (format binary)`),
      );
      await connection.execute('truncate table copy_test');
      const inp = await connection.copyFrom(
        `copy copy_test from stdin (format binary)`,
      );
      await pipeline(Readable.from([exported]), inp);
      expect(inp.rowCount).toStrictEqual(2);
      const r = await connection.query(
        `select name from copy_test order by id`,
        { objectRows: true },
      );
      expect(r.rows?.map((x: any) => x.name)).toStrictEqual(['seven', 'eight']);
    });

    it('should report a server-side data error and stay usable', async () => {
      const stream = await connection.copyFrom(`copy copy_test from stdin`);
      await expect(
        pipeline(Readable.from(['not-an-int\tone\n']), stream),
      ).rejects.toThrow(/invalid input syntax/);
      const r = await connection.query('select 1 as one');
      expect(r.rows?.[0][0]).toStrictEqual(1);
    });

    it('should send CopyFail when the source fails, and stay usable', async () => {
      const stream = await connection.copyFrom(`copy copy_test from stdin`);
      const source = Readable.from(
        (function* () {
          yield '1\tone\n';
          throw new Error('source exploded');
        })(),
      );
      await expect(pipeline(source, stream)).rejects.toThrow('source exploded');
      const r = await connection.query(
        'select count(*)::int4 as c from copy_test',
      );
      // The aborted copy must not have been committed.
      expect(r.rows?.[0][0]).toStrictEqual(0);
    });

    it('should reject a statement that is not a COPY FROM STDIN', async () => {
      await expect(connection.copyFrom(`select 1`)).rejects.toThrow(
        /did not start a COPY FROM STDIN/,
      );
      const r = await connection.query('select 1 as one');
      expect(r.rows?.[0][0]).toStrictEqual(1);
    });
  });

  describe('execute() guards', () => {
    it('should refuse COPY FROM STDIN instead of hanging', async () => {
      await expect(
        connection.execute(`copy copy_test from stdin`),
      ).rejects.toThrow(/use copyFrom\(\)/);
      const r = await connection.query('select 1 as one');
      expect(r.rows?.[0][0]).toStrictEqual(1);
    });

    it('should refuse COPY TO STDOUT instead of dropping rows', async () => {
      await expect(
        connection.execute(`copy copy_test to stdout`),
      ).rejects.toThrow(/use copyTo\(\)/);
      const r = await connection.query('select 1 as one');
      expect(r.rows?.[0][0]).toStrictEqual(1);
    });
  });

  describe('copyFromRows()', () => {
    const D = new Date('2020-01-01T00:00:00Z');
    const COLS = { columns: ['id', 'name', 'amount', 'ts', 'tags', 'flag'] };

    beforeEach(async () => {
      await connection.execute(
        'drop table if exists t_bincopy; create table t_bincopy(' +
          'id int4, name text, amount float8, ts timestamptz, tags text[], flag bool)',
      );
    });

    it('should copy rows in binary, including arrays and NULLs', async () => {
      const r = await connection.copyFromRows(
        't_bincopy',
        [
          [1, 'John', 10.5, D, ['a', 'b'], true],
          [2, 'Jane', 20, D, null, false],
        ],
        COLS,
      );
      expect(r.rowCount).toStrictEqual(2);
      const q = await connection.query(
        'select id, name, amount, tags, flag from t_bincopy order by id',
      );
      expect(q.rows?.[0]).toStrictEqual([1, 'John', 10.5, ['a', 'b'], true]);
      expect(q.rows?.[1]).toStrictEqual([2, 'Jane', 20, null, false]);
    });

    it('should read column types from the server when none are given', async () => {
      const r = await connection.copyFromRows('t_bincopy', [
        [7, 'probe', 1.5, D, null, true],
      ]);
      expect(r.rowCount).toStrictEqual(1);
      const q = await connection.query('select id, name from t_bincopy');
      expect(q.rows?.[0]).toStrictEqual([7, 'probe']);
    });

    it('should accept object rows keyed by column name', async () => {
      await connection.copyFromRows('t_bincopy', [
        { id: 5, name: 'obj', amount: 2.5, ts: D, tags: null, flag: false },
      ]);
      const q = await connection.query('select id, name from t_bincopy');
      expect(q.rows?.[0]).toStrictEqual([5, 'obj']);
    });

    it('should stream from an async iterable without buffering it', async () => {
      const rows = (async function* () {
        for (let i = 0; i < 5000; i++)
          yield [i, 'r' + i, i * 1.5, D, null, true];
      })();
      const r = await connection.copyFromRows('t_bincopy', rows, COLS);
      expect(r.rowCount).toStrictEqual(5000);
      const q = await connection.query(
        'select count(*)::int4 n, max(id)::int4 m from t_bincopy',
      );
      expect(q.rows?.[0]).toStrictEqual([5000, 4999]);
    });

    it('should keep NaN and Infinity in a float column, not turn them into NULL', async () => {
      // PostgreSQL stores both as values distinct from NULL on every
      // supported version - NaN has always been valid for float and
      // numeric, unlike numeric's infinities, which needed PG 14.
      await connection.copyFromRows(
        't_bincopy',
        [
          [1, 'nan', NaN, D, null, true],
          [2, 'inf', Infinity, D, null, true],
        ],
        COLS,
      );
      const q = await connection.query(
        'select amount, amount is null as isnull from t_bincopy order by id',
      );
      expect(Number.isNaN(q.rows?.[0][0])).toStrictEqual(true);
      expect(q.rows?.[0][1]).toStrictEqual(false);
      expect(q.rows?.[1][0]).toStrictEqual(Infinity);
    });

    it('should name the row and column for a value it cannot encode', async () => {
      let error: any;
      try {
        await connection.copyFromRows(
          't_bincopy',
          [
            [1, 'a', 1, D, null, true],
            ['abc', 'b', 1, D, null, true],
          ],
          COLS,
        );
      } catch (e: any) {
        error = e;
      }
      expect(error?.message).toMatch(/row 1/);
      expect(error?.message).toMatch(/"id"/);
      // The CopyFail this sends comes back as an ErrorResponse; the
      // connection has to survive it.
      const q = await connection.query('select 1 as v');
      expect(q.rows?.[0]).toStrictEqual([1]);
    });

    it('should null just the offending value under onInvalidValue: null', async () => {
      const r = await connection.copyFromRows(
        't_bincopy',
        [
          [1, 'a', 1, D, null, true],
          ['abc', 'b', 2, D, null, true],
        ],
        { ...COLS, onInvalidValue: 'null' },
      );
      expect(r.rowCount).toStrictEqual(2);
      expect(r.nulledValues).toStrictEqual(1);
      const q = await connection.query(
        'select id, amount from t_bincopy order by name',
      );
      // The rest of the row survives - only the column that failed is NULL.
      expect(q.rows?.[1]).toStrictEqual([null, 2]);
    });

    it('should drop the whole row under onInvalidValue: skip', async () => {
      const r = await connection.copyFromRows(
        't_bincopy',
        [
          [1, 'a', 1, D, null, true],
          ['abc', 'b', 2, D, null, true],
          [3, 'c', 3, D, null, true],
        ],
        { ...COLS, onInvalidValue: 'skip' },
      );
      expect(r.rowCount).toStrictEqual(2);
      expect(r.skippedRows).toStrictEqual(1);
      const q = await connection.query(
        'select count(*)::int4 n from t_bincopy',
      );
      expect(q.rows?.[0]).toStrictEqual([2]);
    });

    it('should accept a schema-qualified table name', async () => {
      await connection.execute(
        'create schema if not exists s_bincopy; ' +
          'drop table if exists s_bincopy.t1; create table s_bincopy.t1(a int4)',
      );
      try {
        const r = await connection.copyFromRows('s_bincopy.t1', [[42]]);
        expect(r.rowCount).toStrictEqual(1);
        const q = await connection.query('select a from s_bincopy.t1');
        expect(q.rows?.[0]).toStrictEqual([42]);
      } finally {
        await connection.execute('drop schema s_bincopy cascade');
      }
    });
  });
});
