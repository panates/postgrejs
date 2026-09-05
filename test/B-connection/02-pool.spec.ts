import { expect } from 'expect';
import { DataTypeOIDs, Pool } from 'postgrejs';

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

  it('should close all connections and shutdown pool', async () => {
    expect(pool.totalConnections).toBeGreaterThan(0);
    expect(pool.acquiredConnections).toStrictEqual(0);
    await pool.close();
    expect(pool.totalConnections).toStrictEqual(0);
  });
});
