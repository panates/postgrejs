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
});
