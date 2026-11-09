import { AsyncLocalStorage } from 'node:async_hooks';
import type { TracingChannel } from 'node:diagnostics_channel';
import { Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { expect } from 'expect';
import {
  Connection,
  DatabaseError,
  Pool,
  sql as sqlTag,
  tracingChannels,
} from 'postgrejs';

/**
 * The diagnostics_channel tracing channels an instrumentation package
 * (postgrejs-otel, or an APM agent) builds its spans from. Each test
 * subscribes, records which events arrived with what context, and
 * unsubscribes again, so the rest of the suite runs untraced.
 */
interface Recorded {
  event: string;
  channel: string;
  context: any;
}

function record(
  log: Recorded[],
  name: string,
  channel: TracingChannel<any, any>,
  onStart?: (ctx: any) => void,
): () => void {
  const handlers = {
    start(ctx: any) {
      log.push({ event: 'start', channel: name, context: ctx });
      onStart?.(ctx);
    },
    end(ctx: any) {
      log.push({ event: 'end', channel: name, context: ctx });
    },
    asyncStart(ctx: any) {
      log.push({ event: 'asyncStart', channel: name, context: ctx });
    },
    asyncEnd(ctx: any) {
      log.push({ event: 'asyncEnd', channel: name, context: ctx });
    },
    error(ctx: any) {
      log.push({ event: 'error', channel: name, context: ctx });
    },
  };
  channel.subscribe(handlers);
  return () => channel.unsubscribe(handlers);
}

function events(log: Recorded[], name?: string): string[] {
  return log
    .filter(r => !name || r.channel === name)
    .map(r => `${r.channel}:${r.event}`);
}

describe('tracing channels', () => {
  const conn = new Connection();
  before(() => conn.connect());
  after(() => conn.close(0));

  describe('postgrejs:query', () => {
    it('should publish start, end and asyncEnd with the result', async () => {
      const log: Recorded[] = [];
      const off = record(log, 'query', tracingChannels.query);
      let result: any;
      try {
        result = await conn.query('select $1::int as n', { params: [7] });
      } finally {
        off();
      }
      expect(events(log)).toStrictEqual([
        'query:start',
        'query:end',
        'query:asyncStart',
        'query:asyncEnd',
      ]);
      const ctx = log[0].context;
      expect(ctx.sql).toStrictEqual('select $1::int as n');
      expect(ctx.paramCount).toStrictEqual(1);
      expect(ctx.connection).toBe(conn);
      expect(ctx.result).toBe(result);
      expect(ctx.result.rows).toStrictEqual([[7]]);
    });

    it('should not publish the parameter values', async () => {
      const log: Recorded[] = [];
      const off = record(log, 'query', tracingChannels.query);
      try {
        await conn.query('select $1::text', { params: ['secret'] });
      } finally {
        off();
      }
      expect(JSON.stringify(Object.keys(log[0].context))).not.toContain(
        'params',
      );
      expect(log[0].context.paramCount).toStrictEqual(1);
    });

    it('should publish a statement built with the sql tag as sent', async () => {
      const log: Recorded[] = [];
      const off = record(log, 'query', tracingChannels.query);
      try {
        await conn.query(sqlTag`select ${1}::int, ${'a'}::text`);
      } finally {
        off();
      }
      expect(log[0].context.sql).toStrictEqual('select $1::int, $2::text');
      expect(log[0].context.paramCount).toStrictEqual(2);
    });

    it('should send the sql a start handler replaced', async () => {
      // How a trace comment reaches pg_stat_activity for database
      // monitoring: the server's own current_query() shows the text that
      // went over the wire.
      const log: Recorded[] = [];
      const off = record(log, 'query', tracingChannels.query, ctx => {
        ctx.sql = `/*traceparent='00-abc'*/ ${ctx.sql}`;
      });
      let result: any;
      try {
        result = await conn.query('select current_query()');
      } finally {
        off();
      }
      expect(result.rows[0][0]).toStrictEqual(
        "/*traceparent='00-abc'*/ select current_query()",
      );
    });

    it('should publish error and asyncEnd when the server refuses', async () => {
      const log: Recorded[] = [];
      const off = record(log, 'query', tracingChannels.query);
      let caught: unknown;
      try {
        await conn.query('select * from no_such_table_for_tracing');
      } catch (e) {
        caught = e;
      } finally {
        off();
      }
      expect(caught).toBeInstanceOf(DatabaseError);
      expect(events(log)).toStrictEqual([
        'query:start',
        'query:end',
        'query:error',
        'query:asyncStart',
        'query:asyncEnd',
      ]);
      expect(log[0].context.error).toBe(caught);
    });

    it('should reject, not throw, when the sql tag is given params too', async () => {
      const off = record([], 'query', tracingChannels.query);
      try {
        const q = conn.query(sqlTag`select ${1}`, { params: [2] });
        await expect(q).rejects.toThrow(TypeError);
      } finally {
        off();
      }
      // The untraced path the same way: query() is not async, so the
      // rejection has to be built by hand there.
      await expect(
        conn.query(sqlTag`select ${1}`, { params: [2] }),
      ).rejects.toThrow(TypeError);
    });

    it('should run the query inside a store bound to start', async () => {
      // This is what makes an OpenTelemetry span the active one while the
      // statement runs, so a span started underneath it gets the right
      // parent.
      const store = new AsyncLocalStorage<string>();
      tracingChannels.query.start.bindStore(store, ctx => ctx.sql);
      let seenInside: unknown;
      const off = record([], 'query', tracingChannels.query);
      try {
        conn.once('query', () => {
          seenInside = store.getStore();
        });
        await conn.query('select 1');
      } finally {
        off();
        tracingChannels.query.start.unbindStore(store);
      }
      expect(seenInside).toStrictEqual('select 1');
    });

    it('should publish nothing once unsubscribed', async () => {
      const log: Recorded[] = [];
      const off = record(log, 'query', tracingChannels.query);
      off();
      await conn.query('select 1');
      expect(log).toStrictEqual([]);
    });
  });

  describe('postgrejs:execute', () => {
    it('should publish the script and its result', async () => {
      const log: Recorded[] = [];
      const off = record(log, 'execute', tracingChannels.execute);
      let result: any;
      try {
        result = await conn.execute('select 1; select 2');
      } finally {
        off();
      }
      expect(events(log)).toStrictEqual([
        'execute:start',
        'execute:end',
        'execute:asyncStart',
        'execute:asyncEnd',
      ]);
      expect(log[0].context.sql).toStrictEqual('select 1; select 2');
      expect(log[0].context.connection).toBe(conn);
      expect(log[0].context.result).toBe(result);
      expect(result.results.length).toStrictEqual(2);
    });

    it('should send the script a start handler replaced', async () => {
      const off = record([], 'execute', tracingChannels.execute, ctx => {
        ctx.sql = `/*x*/ ${ctx.sql}`;
      });
      let result: any;
      try {
        result = await conn.execute('select current_query()');
      } finally {
        off();
      }
      expect(result.results[0].rows[0][0]).toStrictEqual(
        '/*x*/ select current_query()',
      );
    });

    it('should publish error when the server refuses', async () => {
      const log: Recorded[] = [];
      const off = record(log, 'execute', tracingChannels.execute);
      let caught: unknown;
      try {
        await conn.execute('select * from no_such_table_for_tracing');
      } catch (e) {
        caught = e;
      } finally {
        off();
      }
      expect(caught).toBeInstanceOf(DatabaseError);
      expect(events(log)).toContain('execute:error');
      expect(log[0].context.error).toBe(caught);
    });

    it('should publish a sql-tag script as stringified', async () => {
      const log: Recorded[] = [];
      const off = record(log, 'execute', tracingChannels.execute);
      try {
        await conn.execute(sqlTag`select ${5}::int`);
      } finally {
        off();
      }
      // Inlined by QueryRequest.stringify(), the Simple Query protocol
      // having no parameters.
      expect(log[0].context.sql).toStrictEqual("select '5'::int4::int");
    });

    it('should reject, not throw, when a sql-tag value has no literal form', async () => {
      // execute() is not async, so the TypeError stringify() throws has to
      // come back as a rejection, the way it did when execute() was async.
      const call = () => conn.execute(sqlTag`select ${Symbol('x')}`);
      let promise: Promise<unknown> | undefined;
      expect(() => {
        promise = call();
      }).not.toThrow();
      await expect(promise).rejects.toThrow(/has no text encoding/);
    });
  });

  describe('postgrejs:pool:acquire and postgrejs:connect', () => {
    it('should separate waiting for a connection from running the query', async () => {
      const pool = new Pool({ max: 1, pipeline: false });
      const log: Recorded[] = [];
      let queryProcessID: unknown;
      const offs = [
        record(log, 'acquire', tracingChannels.poolAcquire),
        record(log, 'connect', tracingChannels.connect),
        // Read while the query runs: a connection reports no processID
        // once the pool has closed it.
        record(log, 'query', tracingChannels.query, ctx => {
          queryProcessID = ctx.connection.processID;
        }),
      ];
      let result: any;
      try {
        result = await pool.query('select 1');
      } finally {
        offs.forEach(off => off());
        await pool.close(0);
      }
      expect(result.rows).toStrictEqual([[1]]);
      // Opening the first connection happens while the caller waits for
      // it, so connect sits inside acquire, and the query only starts once
      // both are over. (Both start synchronously in the same call, so
      // connect's synchronous end comes before acquire's.)
      expect(events(log)).toStrictEqual([
        'acquire:start',
        'connect:start',
        'connect:end',
        'acquire:end',
        'connect:asyncStart',
        'connect:asyncEnd',
        'acquire:asyncStart',
        'acquire:asyncEnd',
        'query:start',
        'query:end',
        'query:asyncStart',
        'query:asyncEnd',
      ]);
      const acquire = log.find(r => r.channel === 'acquire')!.context;
      const connect = log.find(r => r.channel === 'connect')!.context;
      const query = log.find(r => r.channel === 'query')!.context;
      expect(acquire.pool).toBe(pool);
      expect(acquire.result).toBe(query.connection);
      expect(connect.config).toBeDefined();
      expect(typeof connect.processID).toStrictEqual('number');
      expect(connect.processID).toStrictEqual(queryProcessID);
    });

    it('should publish error when a connection cannot be opened', async () => {
      const pool = new Pool({
        max: 1,
        acquireTimeoutMillis: 2000,
        port: 1,
      } as any);
      const log: Recorded[] = [];
      const offs = [
        record(log, 'acquire', tracingChannels.poolAcquire),
        record(log, 'connect', tracingChannels.connect),
      ];
      let caught: unknown;
      try {
        await pool.acquire();
      } catch (e) {
        caught = e;
      } finally {
        offs.forEach(off => off());
        await pool.close(0);
      }
      expect(caught).toBeDefined();
      expect(events(log, 'acquire')).toContain('acquire:error');
      expect(events(log, 'connect')).toContain('connect:error');
    });

    it('should publish connect for a standalone Connection', async () => {
      const c = new Connection();
      const log: Recorded[] = [];
      const off = record(log, 'connect', tracingChannels.connect);
      let processID: unknown;
      try {
        await c.connect();
        processID = c.processID;
        // Already connected: nothing to trace.
        await c.connect();
      } finally {
        off();
        await c.close(0);
      }
      expect(events(log)).toStrictEqual([
        'connect:start',
        'connect:end',
        'connect:asyncStart',
        'connect:asyncEnd',
      ]);
      expect(log[0].context.processID).toStrictEqual(processID);
    });
  });

  describe('postgrejs:copy', () => {
    const BIG_ROWS = 200_000;
    const BIG_EXPORT = `copy (select g, repeat('x', 100) from generate_series(1, ${BIG_ROWS}) g) to stdout`;

    /** Resolves once the channel has published asyncEnd. */
    async function settled(log: Recorded[]): Promise<void> {
      // A copy whose output is being discarded still has to receive all of
      // it, which takes a while for the big export below.
      const until = Date.now() + 10_000;
      while (Date.now() < until) {
        if (log.some(r => r.event === 'asyncEnd')) return;
        await new Promise(resolve => setTimeout(resolve, 5));
      }
      throw new Error('copy never settled');
    }

    async function drain(stream: Readable): Promise<string> {
      let out = '';
      await pipeline(
        stream,
        new Writable({
          write(chunk, _enc, cb) {
            out += chunk.toString();
            cb();
          },
        }),
      );
      return out;
    }

    before(() =>
      conn.execute(`
        drop table if exists copy_tracing_test;
        create table copy_tracing_test (id int4 primary key, name text);`),
    );
    beforeEach(() => conn.execute('truncate table copy_tracing_test'));
    after(() => conn.execute('drop table if exists copy_tracing_test'));

    it('should publish copyTo() with the rows and bytes received', async () => {
      await conn.execute(
        `insert into copy_tracing_test values (1, 'one'), (2, 'two')`,
      );
      const log: Recorded[] = [];
      const off = record(log, 'copy', tracingChannels.copy);
      let out: string;
      try {
        out = await drain(
          await conn.copyTo('copy copy_tracing_test to stdout'),
        );
        await settled(log);
      } finally {
        off();
      }
      expect(events(log)).toStrictEqual([
        'copy:start',
        'copy:end',
        'copy:asyncStart',
        'copy:asyncEnd',
      ]);
      const ctx = log[0].context;
      expect(ctx.direction).toStrictEqual('to');
      expect(ctx.sql).toStrictEqual('copy copy_tracing_test to stdout');
      expect(ctx.connection).toBe(conn);
      expect(ctx.table).toBeUndefined();
      expect(ctx.rowCount).toStrictEqual(2);
      expect(ctx.bytes).toStrictEqual(Buffer.byteLength(out));
      expect(ctx.aborted).toBeUndefined();
    });

    it('should stay open while a consumer that is not reading holds the server', async () => {
      // Far more than the stream's and the socket's buffers hold, so the
      // server is stopped by backpressure until the stream is read: the
      // operation outlives copyTo()'s resolution. A small export, sent in
      // one packet, would already be over by then, which is also correct.
      const log: Recorded[] = [];
      const off = record(log, 'copy', tracingChannels.copy);
      try {
        const stream = await conn.copyTo(BIG_EXPORT);
        await new Promise(resolve => setTimeout(resolve, 200));
        expect(events(log)).toStrictEqual(['copy:start', 'copy:end']);
        await drain(stream);
        await settled(log);
      } finally {
        off();
      }
      expect(log[0].context.rowCount).toStrictEqual(BIG_ROWS);
      expect(log[0].context.aborted).toBeUndefined();
    });

    it('should publish copyFrom() with the rows and bytes sent', async () => {
      const log: Recorded[] = [];
      const off = record(log, 'copy', tracingChannels.copy);
      const data = '1\tone\n2\ttwo\n3\tthree\n';
      try {
        const stream = await conn.copyFrom('copy copy_tracing_test from stdin');
        await pipeline(Readable.from([data]), stream);
        await settled(log);
      } finally {
        off();
      }
      expect(events(log)).not.toContain('copy:error');
      const ctx = log[0].context;
      expect(ctx.direction).toStrictEqual('from');
      expect(ctx.rowCount).toStrictEqual(3);
      expect(ctx.bytes).toStrictEqual(Buffer.byteLength(data));
    });

    it('should publish error when the server refuses the copy', async () => {
      const log: Recorded[] = [];
      const off = record(log, 'copy', tracingChannels.copy);
      try {
        await expect(
          conn.copyTo('copy no_such_table_for_tracing to stdout'),
        ).rejects.toThrow(DatabaseError);
        await settled(log);
      } finally {
        off();
      }
      expect(events(log)).toContain('copy:error');
      expect(log[0].context.error).toBeInstanceOf(DatabaseError);
      expect(log[0].context.error.code).toStrictEqual('42P01');
    });

    it('should publish error when a failing source sends CopyFail', async () => {
      const log: Recorded[] = [];
      const off = record(log, 'copy', tracingChannels.copy);
      try {
        const stream = await conn.copyFrom('copy copy_tracing_test from stdin');
        const source = Readable.from(
          (function* () {
            yield '1\tone\n';
            throw new Error('source exploded');
          })(),
        );
        await expect(pipeline(source, stream)).rejects.toThrow(
          'source exploded',
        );
        await settled(log);
      } finally {
        off();
      }
      expect(events(log)).toContain('copy:error');
      // query_canceled: how the server answers a CopyFail.
      expect(log[0].context.error.code).toStrictEqual('57014');
      expect(log[0].context.bytes).toStrictEqual(Buffer.byteLength('1\tone\n'));
    });

    it('should mark a copyTo() destroyed by its consumer as aborted, not failed', async () => {
      const log: Recorded[] = [];
      const off = record(log, 'copy', tracingChannels.copy);
      try {
        const stream = await conn.copyTo(BIG_EXPORT);
        stream.destroy();
        await settled(log);
      } finally {
        off();
      }
      expect(events(log)).not.toContain('copy:error');
      expect(log[0].context.aborted).toStrictEqual(true);
      // The server still finished the copy; what it sent was discarded.
      expect(log[0].context.rowCount).toStrictEqual(BIG_ROWS);
      const r = await conn.query('select 1');
      expect(r.rows).toStrictEqual([[1]]);
    });

    it('should name the table for copyFromRows()', async () => {
      const log: Recorded[] = [];
      const off = record(log, 'copy', tracingChannels.copy);
      try {
        const result = await conn.copyFromRows('copy_tracing_test', [
          [1, 'one'],
          [2, 'two'],
        ]);
        expect(result.rowCount).toStrictEqual(2);
        await settled(log);
      } finally {
        off();
      }
      const ctx = log[0].context;
      expect(ctx.table).toStrictEqual('copy_tracing_test');
      expect(ctx.direction).toStrictEqual('from');
      expect(ctx.sql).toStrictEqual(
        'copy "copy_tracing_test" ("id", "name") from stdin with (format binary)',
      );
      expect(ctx.rowCount).toStrictEqual(2);
      expect(ctx.bytes).toBeGreaterThan(0);
    });

    it('should send the statement a start handler replaced', async () => {
      const off = record([], 'copy', tracingChannels.copy, ctx => {
        ctx.sql = `/*traced*/ ${ctx.sql}`;
      });
      let out: string;
      try {
        out = await drain(
          await conn.copyTo('copy (select current_query()) to stdout'),
        );
      } finally {
        off();
      }
      expect(out).toStrictEqual(
        '/*traced*/ copy (select current_query()) to stdout\n',
      );
    });
  });

  describe('postgrejs:prepare and postgrejs:statement:execute', () => {
    it('should publish prepare() with the statement it created', async () => {
      const log: Recorded[] = [];
      const off = record(log, 'prepare', tracingChannels.prepare);
      let statement: any;
      try {
        statement = await conn.prepare('select $1::int', {
          paramTypes: [23],
        });
      } finally {
        off();
      }
      try {
        expect(events(log)).toStrictEqual([
          'prepare:start',
          'prepare:end',
          'prepare:asyncStart',
          'prepare:asyncEnd',
        ]);
        const ctx = log[0].context;
        expect(ctx.sql).toStrictEqual('select $1::int');
        expect(ctx.paramTypeCount).toStrictEqual(1);
        expect(ctx.connection).toBe(conn);
        expect(ctx.result).toBe(statement);
      } finally {
        await statement.close();
      }
    });

    it('should prepare the sql a start handler replaced', async () => {
      const off = record([], 'prepare', tracingChannels.prepare, ctx => {
        ctx.sql = `/*prepared*/ ${ctx.sql}`;
      });
      let statement: any;
      try {
        statement = await conn.prepare('select current_query()');
      } finally {
        off();
      }
      try {
        expect(statement.sql).toStrictEqual(
          '/*prepared*/ select current_query()',
        );
        const result = await statement.execute();
        expect(result.rows[0][0]).toStrictEqual(
          '/*prepared*/ select current_query()',
        );
      } finally {
        await statement.close();
      }
    });

    it('should publish error when the server refuses to prepare', async () => {
      const log: Recorded[] = [];
      const off = record(log, 'prepare', tracingChannels.prepare);
      let caught: unknown;
      try {
        await conn.prepare('select * from no_such_table_for_tracing');
      } catch (e) {
        caught = e;
      } finally {
        off();
      }
      expect(caught).toBeInstanceOf(DatabaseError);
      expect(events(log)).toContain('prepare:error');
      expect(log[0].context.error).toBe(caught);
      expect(log[0].context.paramTypeCount).toStrictEqual(0);
    });

    it('should publish pool.prepare() once', async () => {
      const pool = new Pool({ max: 1 });
      const log: Recorded[] = [];
      const off = record(log, 'prepare', tracingChannels.prepare);
      try {
        const statement = await pool.prepare('select 1');
        await statement.close();
      } finally {
        off();
        await pool.close(0);
      }
      expect(events(log, 'prepare')).toStrictEqual([
        'prepare:start',
        'prepare:end',
        'prepare:asyncStart',
        'prepare:asyncEnd',
      ]);
    });

    it('should publish execute() with the statement and the result', async () => {
      const statement = await conn.prepare('select $1::int + 1 as n');
      const log: Recorded[] = [];
      const off = record(log, 'statement', tracingChannels.statementExecute);
      let result: any;
      try {
        result = await statement.execute({ params: [41] });
      } finally {
        off();
        await statement.close();
      }
      expect(events(log)).toStrictEqual([
        'statement:start',
        'statement:end',
        'statement:asyncStart',
        'statement:asyncEnd',
      ]);
      const ctx = log[0].context;
      expect(ctx.sql).toStrictEqual('select $1::int + 1 as n');
      expect(ctx.statement).toBe(statement);
      expect(ctx.connection).toBe(conn);
      expect(ctx.paramCount).toStrictEqual(1);
      expect(ctx.batchSize).toBeUndefined();
      expect(ctx.result).toBe(result);
      expect(result.rows).toStrictEqual([[42]]);
    });

    it('should publish error when an execution fails', async () => {
      const statement = await conn.prepare('select 1 / $1::int');
      const log: Recorded[] = [];
      const off = record(log, 'statement', tracingChannels.statementExecute);
      let caught: unknown;
      try {
        await statement.execute({ params: [0] });
      } catch (e) {
        caught = e;
      } finally {
        off();
        await statement.close();
      }
      expect(caught).toBeInstanceOf(DatabaseError);
      expect((caught as DatabaseError).code).toStrictEqual('22012');
      expect(events(log)).toContain('statement:error');
      expect(log[0].context.error).toBe(caught);
    });

    it('should publish executeBatch() with its size and the batch result', async () => {
      const statement = await conn.prepare('select $1::int, $2::text');
      const log: Recorded[] = [];
      const off = record(log, 'statement', tracingChannels.statementExecute);
      let result: any;
      try {
        result = await statement.executeBatch([
          [1, 'a'],
          [2, 'b'],
          [3, 'c'],
        ]);
      } finally {
        off();
        await statement.close();
      }
      expect(events(log)).toStrictEqual([
        'statement:start',
        'statement:end',
        'statement:asyncStart',
        'statement:asyncEnd',
      ]);
      const ctx = log[0].context;
      expect(ctx.batchSize).toStrictEqual(3);
      expect(ctx.paramCount).toStrictEqual(2);
      expect(ctx.result).toBe(result);
      expect(result.results.length).toStrictEqual(3);
    });

    it('should publish an executeBatch() given no array as an error', async () => {
      const statement = await conn.prepare('select 1');
      const log: Recorded[] = [];
      const off = record(log, 'statement', tracingChannels.statementExecute);
      let caught: unknown;
      try {
        await statement.executeBatch('nope' as any);
      } catch (e) {
        caught = e;
      } finally {
        off();
        await statement.close();
      }
      expect(caught).toBeInstanceOf(TypeError);
      expect(log[0].context.batchSize).toStrictEqual(0);
      expect(log[0].context.paramCount).toStrictEqual(0);
      expect(events(log)).toContain('statement:error');
    });

    it('should publish only the query for a statement query() prepares itself', async () => {
      // A cursor, and autoCommit: false, take query()'s prepare-and-execute
      // route; the statement it prepares there is part of the query.
      const log: Recorded[] = [];
      const offs = [
        record(log, 'query', tracingChannels.query),
        record(log, 'prepare', tracingChannels.prepare),
        record(log, 'statement', tracingChannels.statementExecute),
      ];
      try {
        const r = await conn.query('select 1', { cursor: true });
        await r.cursor!.close();
        await conn.query('select 2', { autoCommit: false });
        await conn.rollback();
      } finally {
        for (const off of offs) off();
      }
      expect(events(log, 'prepare')).toStrictEqual([]);
      expect(events(log, 'statement')).toStrictEqual([]);
      expect(
        events(log, 'query').filter(e => e === 'query:start').length,
      ).toStrictEqual(2);
    });
  });

  describe('transaction commands on postgrejs:execute', () => {
    /** The command and sql of every execute start, in order. */
    function commands(log: Recorded[]): string[] {
      return log
        .filter(r => r.channel === 'execute' && r.event === 'start')
        .map(r => `${r.context.command ?? '-'} | ${r.context.sql}`);
    }

    async function traced(
      fn: () => Promise<unknown>,
      onStart?: (ctx: any) => void,
    ): Promise<Recorded[]> {
      const log: Recorded[] = [];
      const off = record(log, 'execute', tracingChannels.execute, onStart);
      try {
        await fn();
      } finally {
        off();
        if (conn.inTransaction) await conn.rollback();
      }
      return log;
    }

    it('should publish BEGIN and COMMIT, and nothing for a nested pair', async () => {
      const log = await traced(async () => {
        await conn.startTransaction();
        await conn.startTransaction();
        await conn.commit();
        await conn.commit();
      });
      expect(commands(log)).toStrictEqual(['BEGIN | BEGIN', 'COMMIT | COMMIT']);
      const begin = log.find(r => r.event === 'asyncEnd')!.context;
      expect(begin.connection).toBe(conn);
      expect(begin.result).toBeDefined();
    });

    it('should publish the BEGIN with the modes it carries', async () => {
      const log = await traced(async () => {
        await conn.startTransaction({ isolationLevel: 'serializable' });
        await conn.rollback();
      });
      expect(commands(log)).toStrictEqual([
        'BEGIN | BEGIN ISOLATION LEVEL SERIALIZABLE',
        'ROLLBACK | ROLLBACK',
      ]);
    });

    it('should publish the savepoint commands', async () => {
      const log = await traced(async () => {
        await conn.startTransaction();
        await conn.savepoint('sp1');
        await conn.rollbackToSavepoint('sp1');
        await conn.savepoint('sp2');
        await conn.releaseSavepoint('sp2');
        await conn.rollback();
      });
      expect(commands(log)).toStrictEqual([
        'BEGIN | BEGIN',
        'SAVEPOINT | BEGIN; SAVEPOINT sp1',
        'ROLLBACK TO SAVEPOINT | ROLLBACK TO SAVEPOINT sp1',
        'SAVEPOINT | BEGIN; SAVEPOINT sp2',
        'RELEASE SAVEPOINT | RELEASE SAVEPOINT sp2',
        'ROLLBACK | ROLLBACK',
      ]);
    });

    it('should publish what transaction() sends, savepoints included', async () => {
      const log = await traced(() =>
        conn.transaction(() => conn.transaction(async () => undefined)),
      );
      expect(commands(log).map(c => c.split(' | ')[0])).toStrictEqual([
        'BEGIN',
        'SAVEPOINT',
        'RELEASE SAVEPOINT',
        'COMMIT',
      ]);
    });

    it('should publish the rollback of a nested transaction() that failed', async () => {
      const log = await traced(() =>
        conn
          .transaction(() =>
            conn.transaction(async () => {
              throw new Error('inner');
            }),
          )
          .catch(() => undefined),
      );
      expect(commands(log).map(c => c.split(' | ')[0])).toStrictEqual([
        'BEGIN',
        'SAVEPOINT',
        'ROLLBACK TO SAVEPOINT',
        'ROLLBACK',
      ]);
    });

    it('should publish the two-phase commit commands, failed ones as errors', async () => {
      const log = await traced(async () => {
        await expect(conn.commitPrepared('no_such_gid')).rejects.toThrow();
        await expect(conn.rollbackPrepared('no_such_gid')).rejects.toThrow();
        await conn.startTransaction();
        // Refused where max_prepared_transactions is 0, accepted where it
        // is not; published either way.
        try {
          await conn.prepareTransaction('tracing_gid');
          await conn.rollbackPrepared('tracing_gid');
        } catch {
          // disabled on this server
        }
      });
      const cmds = commands(log).map(c => c.split(' | ')[0]);
      expect(cmds.slice(0, 4)).toStrictEqual([
        'COMMIT PREPARED',
        'ROLLBACK PREPARED',
        'BEGIN',
        'PREPARE TRANSACTION',
      ]);
      expect(commands(log)[0]).toStrictEqual(
        "COMMIT PREPARED | COMMIT PREPARED 'no_such_gid'",
      );
      expect(
        log.filter(r => r.event === 'error')[0].context.error.code,
      ).toStrictEqual('42704');
    });

    it('should not publish the BEGIN an autoCommit: false statement opens', async () => {
      const log = await traced(() =>
        conn.execute('select 1', { autoCommit: false }),
      );
      expect(commands(log)).toStrictEqual(['- | select 1']);
    });

    it('should keep treating a command as one behind a comment', async () => {
      // A tracer that comments every statement (postgrejs-otel's
      // sqlComment) used to hide a SET TRANSACTION from the check that
      // keeps it out of a savepoint, and the server refused it with 25001.
      const log = await traced(
        async () => {
          await conn.startTransaction();
          await conn.execute('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
          const r = await conn.query('show transaction_isolation');
          expect(r.rows![0][0]).toStrictEqual('serializable');
          await conn.commit();
          expect(conn.inTransaction).toStrictEqual(false);
        },
        ctx => {
          ctx.sql = `/*traced*/ ${ctx.sql}`;
        },
      );
      expect(commands(log)).toStrictEqual([
        'BEGIN | /*traced*/ BEGIN',
        '- | /*traced*/ SET TRANSACTION ISOLATION LEVEL SERIALIZABLE',
        'COMMIT | /*traced*/ COMMIT',
      ]);
    });
  });

  describe('postgrejs:pipeline', () => {
    it('should publish every statement and the results', async () => {
      const log: Recorded[] = [];
      const off = record(log, 'pipeline', tracingChannels.pipeline);
      let results: any;
      try {
        results = await conn.pipeline([
          'select 1',
          { sql: 'select $1::int, $2::text', params: [2, 'b'] },
          sqlTag`select ${3}::int`,
        ]);
      } finally {
        off();
      }
      expect(events(log)).toStrictEqual([
        'pipeline:start',
        'pipeline:end',
        'pipeline:asyncStart',
        'pipeline:asyncEnd',
      ]);
      const ctx = log[0].context;
      expect(ctx.statements).toStrictEqual([
        { sql: 'select 1', paramCount: 0 },
        { sql: 'select $1::int, $2::text', paramCount: 2 },
        { sql: 'select $1::int', paramCount: 1 },
      ]);
      expect(ctx.connection).toBe(conn);
      expect(ctx.result).toBe(results);
      expect(results.length).toStrictEqual(3);
    });

    it('should publish the error with the index of the rejected statement', async () => {
      const log: Recorded[] = [];
      const off = record(log, 'pipeline', tracingChannels.pipeline);
      let caught: any;
      try {
        await conn.pipeline([
          'select 1',
          'select * from no_such_table_for_tracing',
          'select 3',
        ]);
      } catch (e) {
        caught = e;
      } finally {
        off();
      }
      expect(caught).toBeInstanceOf(DatabaseError);
      expect(events(log)).toContain('pipeline:error');
      expect(log[0].context.error).toBe(caught);
      expect(log[0].context.error.failedIndex).toStrictEqual(1);
    });

    it('should send each statement as a start handler replaced it', async () => {
      const off = record([], 'pipeline', tracingChannels.pipeline, ctx => {
        for (const st of ctx.statements) st.sql = `/*traced*/ ${st.sql}`;
      });
      let results: any;
      try {
        results = await conn.pipeline([
          'select current_query()',
          'select current_query() as q',
        ]);
      } finally {
        off();
      }
      expect(results[0].rows[0][0]).toStrictEqual(
        '/*traced*/ select current_query()',
      );
      expect(results[1].rows[0][0]).toStrictEqual(
        '/*traced*/ select current_query() as q',
      );
    });

    it('should publish nothing for an empty pipeline', async () => {
      const log: Recorded[] = [];
      const off = record(log, 'pipeline', tracingChannels.pipeline);
      try {
        expect(await conn.pipeline([])).toStrictEqual([]);
      } finally {
        off();
      }
      expect(log).toStrictEqual([]);
    });
  });

  describe('postgrejs:cursor:fetch', () => {
    const SQL = 'select g from generate_series(1, 5) g';

    it('should publish each batch with its rows, after the query is over', async () => {
      const log: Recorded[] = [];
      const offs = [
        record(log, 'query', tracingChannels.query),
        record(log, 'fetch', tracingChannels.cursorFetch),
      ];
      const rows: any[] = [];
      try {
        const r = await conn.query(SQL, { cursor: true, fetchCount: 2 });
        for await (const row of r.cursor!) rows.push(row[0]);
      } finally {
        for (const off of offs) off();
      }
      expect(rows).toStrictEqual([1, 2, 3, 4, 5]);
      // Opening the cursor reads nothing: the query is over first.
      expect(events(log).indexOf('query:asyncEnd')).toBeLessThan(
        events(log).indexOf('fetch:start'),
      );
      const fetches = log.filter(
        r => r.channel === 'fetch' && r.event === 'asyncEnd',
      );
      expect(
        fetches.map(r => [r.context.rowCount, r.context.done ?? false]),
      ).toStrictEqual([
        [2, false],
        [2, false],
        [1, false],
        [0, true],
      ]);
      const ctx = fetches[0].context;
      expect(ctx.sql).toStrictEqual(SQL);
      expect(ctx.connection).toBe(conn);
      expect(ctx.fetchCount).toStrictEqual(2);
      expect(ctx.cursor).toBeDefined();
    });

    it("should publish the fetches of a prepared statement's cursor", async () => {
      const statement = await conn.prepare(SQL);
      const log: Recorded[] = [];
      const off = record(log, 'fetch', tracingChannels.cursorFetch);
      try {
        const r = await statement.execute({ cursor: true });
        expect((await r.cursor!.fetch(10)).length).toStrictEqual(5);
        await r.cursor!.close();
      } finally {
        off();
        await statement.close();
      }
      const ends = log.filter(r => r.event === 'asyncEnd');
      expect(ends.map(r => r.context.rowCount)).toStrictEqual([5, 0]);
      expect(ends[0].context.fetchCount).toStrictEqual(100);
    });

    it('should publish error when the portal is gone', async () => {
      const r = await conn.query(SQL, { cursor: true, fetchCount: 1 });
      // Another statement ends the implicit transaction the portal lives in.
      await conn.query('select 1');
      const log: Recorded[] = [];
      const off = record(log, 'fetch', tracingChannels.cursorFetch);
      let caught: any;
      try {
        await r.cursor!.next();
      } catch (e) {
        caught = e;
      } finally {
        off();
        await r.cursor!.close();
      }
      expect(caught?.code).toStrictEqual('34000');
      expect(events(log)).toContain('fetch:error');
      expect(log[0].context.error).toBe(caught);
    });
  });
});
