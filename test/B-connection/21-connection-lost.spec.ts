import { expect } from 'expect';
import { Connection, ConnectionLostError, Pool } from 'postgrejs';

/** Resolves with the first emission of `event`, or rejects on a timeout. */
function once(emitter: any, event: string, ms = 5000): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timed out waiting for '${event}'`)),
      ms,
    );
    emitter.once(event, (...args: any[]) => {
      clearTimeout(timer);
      resolve(args);
    });
  });
}

describe('lost connection', () => {
  let killer: Connection;

  before(async () => {
    killer = new Connection();
    await killer.connect();
  });
  after(() => killer.close(0));

  const kill = (pid: number) =>
    killer.query('select pg_terminate_backend($1)', { params: [pid] });

  it('should report a pooled connection that dies with a query in flight', async () => {
    const pool = new Pool({ max: 2, min: 0 });
    try {
      const destroyed = once(pool, 'destroy');
      const errored = once(pool, 'error');
      const connection = await pool.acquire();
      const pid = connection.processID!;
      const running = connection.query('select pg_sleep(5)');
      // The rejection the caller already got before any of this existed -
      // pinned so the new reporting does not quietly replace it.
      const rejected = running.then(
        () => undefined,
        (e: any) => e,
      );
      await new Promise(resolve => setTimeout(resolve, 200));
      await kill(pid);
      expect((await rejected).message).toStrictEqual('Connection closed');
      const [, reason] = await destroyed;
      // The message is exactly what other drivers report for this, so
      // anything matching on it keeps working; what happened to this
      // connection is on the object instead.
      expect(reason).toBeInstanceOf(ConnectionLostError);
      expect(reason.message).toStrictEqual(
        'Connection terminated unexpectedly',
      );
      expect(reason.code).toStrictEqual('08006');
      expect(reason.processID).toStrictEqual(pid);
      const [err] = await errored;
      expect(err).toBe(reason);
    } finally {
      await pool.close(0);
    }
  });

  it('should report a pooled connection that dies while idle', async () => {
    // The case that reported nothing at all: no query to reject, and a
    // bare `destroy` that looked exactly like an idle-timeout eviction.
    const pool = new Pool({ max: 2, min: 0 });
    try {
      const r = await pool.query('select pg_backend_pid() as p', {
        objectRows: true,
      });
      const pid = (r.rows as any)[0].p;
      await new Promise(resolve => setTimeout(resolve, 150));
      expect(pool.idleConnections).toStrictEqual(1);
      const destroyed = once(pool, 'destroy');
      const errored = once(pool, 'error');
      await kill(pid);
      const [, reason] = await destroyed;
      expect(reason.code).toStrictEqual('08006');
      expect(reason.processID).toStrictEqual(pid);
      expect((await errored)[0]).toBe(reason);
      // And the pool healed, as it always did.
      const r2 = await pool.query('select pg_backend_pid() as p', {
        objectRows: true,
      });
      expect((r2.rows as any)[0].p).not.toStrictEqual(pid);
    } finally {
      await pool.close(0);
    }
  });

  it('should leave an ordinary eviction without a reason', async () => {
    // What tells the two apart: a connection the pool retired on purpose
    // must not look like one that died.
    const pool = new Pool({ max: 2, min: 0 });
    const reasons: any[] = [];
    let errors = 0;
    pool.on('destroy', (_c: any, reason: any) => reasons.push(reason));
    pool.on('error', () => errors++);
    await pool.query('select 1');
    await new Promise(resolve => setTimeout(resolve, 150));
    await pool.close(0);
    await new Promise(resolve => setTimeout(resolve, 200));
    expect(reasons.length).toBeGreaterThan(0);
    expect(reasons.every(x => x === undefined)).toStrictEqual(true);
    expect(errors).toStrictEqual(0);
  });

  it('should not throw when nothing is listening for the error', async () => {
    // Node's default is to throw on an unhandled 'error' event;
    // SafeEventEmitter drops it instead, which is what makes reporting
    // this safe to do unconditionally.
    const pool = new Pool({ max: 2, min: 0 });
    try {
      const r = await pool.query('select pg_backend_pid() as p', {
        objectRows: true,
      });
      const destroyed = once(pool, 'destroy');
      await kill((r.rows as any)[0].p);
      await destroyed;
      expect(pool.idleConnections).toStrictEqual(0);
      const r2 = await pool.query('select 1');
      expect(r2.rows?.length).toStrictEqual(1);
    } finally {
      await pool.close(0);
    }
  });

  describe('Connection', () => {
    it("should give 'close' a reason when the backend is terminated", async () => {
      const connection = new Connection();
      await connection.connect();
      const pid = connection.processID!;
      const closed = once(connection, 'close');
      await kill(pid);
      const [reason] = await closed;
      expect(reason).toBeInstanceOf(ConnectionLostError);
      expect(reason.code).toStrictEqual('08006');
      expect(reason.processID).toStrictEqual(pid);
    });

    it("should leave 'close' without a reason when it was asked for", async () => {
      const connection = new Connection();
      await connection.connect();
      const closed = once(connection, 'close');
      await connection.close(0);
      expect((await closed)[0]).toBeUndefined();
    });
  });
});
