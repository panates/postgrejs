import { getEventListeners } from 'node:events';
import { expect } from 'expect';
import { Connection, Pool } from 'postgrejs';

describe('Query cancellation (AbortSignal)', () => {
  let connection: Connection;

  const SLOW = 'select pg_sleep(10)';

  async function expectAborted(
    promise: Promise<any>,
    name = 'AbortError',
  ): Promise<any> {
    let error: any;
    try {
      await promise;
    } catch (e) {
      error = e;
    }
    expect(error).toBeDefined();
    expect(error.name).toStrictEqual(name);
    return error;
  }

  before(async () => {
    connection = new Connection();
    await connection.connect();
  });

  after(async () => {
    await connection.close(0);
  });

  it('should cancel a running query', async () => {
    const ac = new AbortController();
    const started = Date.now();
    setTimeout(() => ac.abort(), 200);
    const error = await expectAborted(
      connection.query(SLOW, { signal: ac.signal }),
    );
    // It really stopped instead of running its full ten seconds.
    expect(Date.now() - started).toBeLessThan(5000);
    // The database error that ended it stays reachable.
    expect(error.cause?.code).toStrictEqual('57014');
  });

  it('should cancel a script executed with execute()', async () => {
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 200);
    const error = await expectAborted(
      connection.execute(SLOW, { signal: ac.signal }),
    );
    expect(error.cause?.code).toStrictEqual('57014');
  });

  it('should cancel a prepared statement execution', async () => {
    const statement = await connection.prepare(SLOW);
    try {
      const ac = new AbortController();
      setTimeout(() => ac.abort(), 200);
      await expectAborted(statement.execute({ signal: ac.signal }));
    } finally {
      await statement.close().catch(() => undefined);
    }
  });

  it('should use the signal reason, so timeout() reports itself', async () => {
    // AbortSignal.timeout() is what makes this a per-query timeout.
    const error = await expectAborted(
      connection.query(SLOW, { signal: AbortSignal.timeout(200) }),
      'TimeoutError',
    );
    expect(error.cause?.code).toStrictEqual('57014');
  });

  it('should reject an already-aborted signal without running anything', async () => {
    await connection.execute(`
      drop table if exists cancel_test;
      create table cancel_test (id int4)`);
    try {
      await expectAborted(
        connection.query(`insert into cancel_test values (1)`, {
          signal: AbortSignal.abort(),
        }),
      );
      const r = await connection.query(
        'select count(*)::int4 as c from cancel_test',
      );
      expect(r.rows?.[0][0]).toStrictEqual(0);
    } finally {
      await connection.execute('drop table if exists cancel_test');
    }
  });

  it('should leave the connection usable after a cancellation', async () => {
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 200);
    await expectAborted(connection.query(SLOW, { signal: ac.signal }));
    const r = await connection.query('select 42 as v');
    expect(r.rows?.[0][0]).toStrictEqual(42);
  });

  it('should not leak a listener per query on a shared signal', async () => {
    // One long-lived signal covering many queries must not accumulate a
    // listener for each of them.
    const ac = new AbortController();
    for (let i = 0; i < 5; i++)
      await connection.query('select 1', { signal: ac.signal });
    expect(getEventListeners(ac.signal, 'abort').length).toStrictEqual(0);
  });

  it('should cancel through the pool without pipelining', async () => {
    // Cancelling targets a backend, so a shared connection would lose the
    // wrong query - passing a signal has to take an exclusive connection.
    const pool = new Pool({ max: 2, validation: false });
    try {
      const ac = new AbortController();
      setTimeout(() => ac.abort(), 200);
      await expectAborted(
        pool.query(SLOW, { signal: ac.signal, pipeline: true }),
      );
      const r = await pool.query('select 7 as v');
      expect(r.rows?.[0][0]).toStrictEqual(7);
    } finally {
      await pool.close(0);
    }
  });
});
