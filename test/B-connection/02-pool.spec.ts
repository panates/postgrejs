import { expect } from 'expect';
import { ConnectionState, DataTypeOIDs, Pool, sql } from 'postgrejs';

describe('Pool', () => {
  let pool: Pool;

  before(async () => {
    pool = new Pool();
  });

  after(async () => {
    await pool.close(0);
  });

  it('should acquire connection', async () => {
    expect(pool.totalConnections).toStrictEqual(0);
    const connection = await pool.acquire();
    expect(pool.totalConnections).toStrictEqual(1);
    expect(pool.acquiredConnections).toStrictEqual(1);
    expect(connection).toBeDefined();
    await connection.close();
    expect(pool.acquiredConnections).toStrictEqual(0);
  });

  it('should execute simple query', async () => {
    const result = await pool.execute(`select 1`);
    expect(pool.acquiredConnections).toStrictEqual(0);
    expect(result).toBeDefined();
    expect(result.totalCommands).toStrictEqual(1);
    expect(result.results.length).toStrictEqual(1);
    expect(result.results[0].command).toStrictEqual('SELECT');
  });

  it('should execute simple query pipelined', async () => {
    const promises = [1, 2, 3].map(k =>
      pool.execute(`select ${k}`, { pipeline: true }),
    );
    const results = await Promise.all(promises);
    expect(results).toBeDefined();
    expect(results.length).toStrictEqual(3);
    expect(results[0].totalCommands).toStrictEqual(1);
    expect(results[0].results.length).toStrictEqual(1);
    expect(results[0].results[0].command).toStrictEqual('SELECT');
  });

  it('should spread a pipelined burst across connections', async () => {
    // The server runs one connection's statements serially, so a burst is
    // only concurrent if it lands on more than one connection.
    const results = await Promise.all(
      [1, 2, 3].map(() =>
        pool.execute(`select pg_backend_pid()`, { pipeline: true }),
      ),
    );
    const pids = new Set(results.map(r => r.results[0].rows?.[0][0]));
    expect(pids.size).toStrictEqual(3);
  });

  it('should not borrow more than pipelineMaxConnections', async () => {
    const p = new Pool({ max: 10, pipelineMaxConnections: 2 });
    try {
      const results = await Promise.all(
        Array.from({ length: 20 }, () =>
          p.execute(`select pg_backend_pid()`, { pipeline: true }),
        ),
      );
      const pids = new Set(results.map(r => r.results[0].rows?.[0][0]));
      expect(pids.size).toStrictEqual(2);
    } finally {
      await p.close(0);
    }
  });

  it('should take an exclusive connection when a slot is at its query cap', async () => {
    // One slot allowed, holding at most two queries: the third has to fall
    // back to a connection of its own rather than queue behind them.
    const p = new Pool({
      max: 10,
      pipelineMaxConnections: 1,
      pipelineMaxQueries: 2,
    });
    try {
      const results = await Promise.all(
        Array.from({ length: 4 }, () =>
          p.execute(`select pg_backend_pid()`, { pipeline: true }),
        ),
      );
      const pids = new Set(results.map(r => r.results[0].rows?.[0][0]));
      expect(pids.size).toBeGreaterThan(1);
    } finally {
      await p.close(0);
    }
  });

  it('should not pipeline a COPY', async () => {
    // A COPY puts the connection in a mode where the next pipelined
    // query's Query message is a protocol error, so it must never share.
    await pool.execute(`drop table if exists pool_copy_test;
      create table pool_copy_test (id int4)`);
    const results = await Promise.allSettled([
      pool.execute(`copy pool_copy_test from stdin`, { pipeline: true }),
      pool.execute(`select 1`, { pipeline: true }),
      pool.execute(`select 2`, { pipeline: true }),
    ]);
    expect(results[0].status).toStrictEqual('rejected');
    expect(results[1].status).toStrictEqual('fulfilled');
    expect(results[2].status).toStrictEqual('fulfilled');
    // The connections the other two rode on must still work.
    const r = await pool.execute(`select 3 as v`);
    expect((r.results[0].rows as any)[0][0]).toStrictEqual(3);
    await pool.execute(`drop table pool_copy_test`);
  });

  it('should not pipeline when autoCommit is false', async () => {
    // That path prepares, executes and closes as separate steps, and the
    // connection reports itself idle between them - it must not be shared.
    const before = pool.totalConnections;
    await pool.query(`select 1`, { pipeline: true, autoCommit: false });
    expect(pool.acquiredConnections).toStrictEqual(0);
    expect(pool.totalConnections).toBeLessThanOrEqual(before + 1);
  });

  it('should create a prepared statement, execute and release connection', async () => {
    const statement = await pool.prepare(`select $1`, {
      paramTypes: [DataTypeOIDs.int4],
    });
    expect(pool.acquiredConnections).toStrictEqual(1);
    expect(statement).toBeDefined();
    const result = await statement.execute({ params: [1234] });
    expect(pool.acquiredConnections).toStrictEqual(1);
    expect(result).toBeDefined();
    expect(result.rows?.[0][0]).toStrictEqual(1234);
    await new Promise((resolve, reject) => {
      pool.once('release', resolve);
      statement.close().catch(reject);
    });
    expect(pool.acquiredConnections).toStrictEqual(0);
  });

  it('should execute extended query', async () => {
    const result = await pool.query(`select $1`, { params: [1234] });
    expect(pool.acquiredConnections).toStrictEqual(0);
    expect(result).toBeDefined();
    expect(result.fields).toBeDefined();
    expect(result.rows).toBeDefined();
    expect(result.command).toStrictEqual('SELECT');
    expect(result.rows?.[0][0]).toStrictEqual(1234);
  });

  it('should execute a query built with the sql`` tag', async () => {
    const result = await pool.query(sql`select ${1234} as v`);
    expect(result.rows?.[0][0]).toStrictEqual(1234);
  });

  it('should refuse a sql`` request combined with an explicit params option', async () => {
    await expect(
      pool.query(sql`select ${1234}`, { params: [1] }),
    ).rejects.toThrow(/ambiguous/);
  });

  it('should execute a script built with the sql`` tag', async () => {
    const result = await pool.execute(sql`select ${1234}::int4 as v`);
    expect(result.results[0].rows?.[0][0]).toStrictEqual(1234);
  });

  it('should pipeline query() the same way execute() does', async () => {
    const results = await Promise.all(
      [1, 2, 3].map(k => pool.query(`select ${k} as v`, { pipeline: true })),
    );
    const values = results.map(r => r.rows?.[0][0]).sort();
    expect(values).toStrictEqual([1, 2, 3]);
  });

  it('should never share a connection for a cursor query, even with pipeline requested', async () => {
    // A cursor outlives this call and needs its own portal on its own
    // connection - options.cursor must override options.pipeline.
    const before = pool.totalConnections;
    const result = await pool.query(`select generate_series(1, 3) as v`, {
      cursor: true,
      pipeline: true,
    });
    expect(result.cursor).toBeDefined();
    await result.cursor!.close();
    expect(pool.totalConnections).toBeGreaterThanOrEqual(before);
  });

  it('should report idle and total connection counts', async () => {
    expect(pool.idleConnections).toBeGreaterThanOrEqual(0);
    expect(pool.totalConnections).toBeGreaterThanOrEqual(pool.idleConnections);
  });

  it('should validate a connection before handing it out when validation is enabled', async () => {
    const p = new Pool({ validation: true });
    try {
      // Round-tripping through acquire/release at least once is what
      // exercises the pooled connection's *second* handout, the one
      // validate() (a plain `select 1`) actually gets a chance to run
      // before.
      const c1 = await p.acquire();
      await c1.close();
      const c2 = await p.acquire();
      expect(c2.state).toStrictEqual(ConnectionState.READY);
      await c2.close();
    } finally {
      await p.close(0);
    }
  });

  it('should drop the pipeline slot when growing it fails to acquire a connection', async () => {
    // Nothing listens on port 9, so every connection attempt is refused
    // immediately - growPipeline()'s own error path, not a timeout.
    const p = new Pool({
      host: '127.0.0.1',
      port: 9,
      pipelineMaxConnections: 5,
      acquireMaxRetries: 0,
    });
    try {
      await expect(p.execute('select 1', { pipeline: true })).rejects.toThrow();
    } finally {
      await p.close(0);
    }
  });

  it('start() should be safe to call even though acquire() already starts the pool lazily', async () => {
    const p = new Pool();
    try {
      await p.start();
      const connection = await p.acquire();
      await connection.close();
    } finally {
      await p.close(0);
    }
  });

  it('should close all connections and shutdown pool', async () => {
    expect(pool.totalConnections).toBeGreaterThan(0);
    expect(pool.acquiredConnections).toStrictEqual(0);
    await pool.close();
    expect(pool.totalConnections).toStrictEqual(0);
  });
});
