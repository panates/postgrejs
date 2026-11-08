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
      // The caller learns it the same way a pool listener does, down to
      // the object - so branching on `code` works in a catch, and the
      // two can be correlated by identity.
      const err: any = await rejected;
      expect(err).toBeInstanceOf(ConnectionLostError);
      expect(err.code).toStrictEqual('08006');
      expect(err.processID).toStrictEqual(pid);
      const [, reason] = await destroyed;
      expect(err).toBe(reason);
      // The message is exactly what other drivers report for this, so
      // anything matching on it keeps working; what happened to this
      // connection is on the object instead.
      expect(reason).toBeInstanceOf(ConnectionLostError);
      expect(reason.message).toStrictEqual(
        'Connection terminated unexpectedly',
      );
      expect(reason.code).toStrictEqual('08006');
      expect(reason.processID).toStrictEqual(pid);
      // One object for all three: the rejection, the destroy reason and
      // the pool's error.
      expect((await errored)[0]).toBe(reason);
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

  it('should keep the plain error when the close was asked for', async () => {
    // Nothing was lost here - the caller raced a shutdown it asked for -
    // so this stays a bare Error rather than claiming a connection died.
    const connection = new Connection();
    await connection.connect();
    const running = connection.query('select pg_sleep(5)').then(
      () => undefined,
      (e: any) => e,
    );
    await new Promise(resolve => setTimeout(resolve, 200));
    await connection.close(0);
    const err: any = await running;
    expect(err).not.toBeInstanceOf(ConnectionLostError);
    expect(err.message).toStrictEqual('Connection closed');
    expect(err.code).toBeUndefined();
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

    describe("'error'", () => {
      /** Every event this connection emits, in the order it emits them. */
      function record(connection: Connection): string[] {
        const seen: string[] = [];
        connection.on('error', (e: any) =>
          seen.push('error:' + e.code + ':' + e.processID),
        );
        connection.on('close', (r: any) =>
          seen.push('close:' + (r ? r.code : 'none')),
        );
        return seen;
      }

      it('should fire with a query in flight, on the same object', async () => {
        // `pg` reports a lost connection on 'error' as well as rejecting
        // the query, and this emitted only 'close' - so a handler ported
        // from it was attached and never fired. Nothing crashed, which
        // is worse than crashing: the handler looked alive.
        const connection = new Connection();
        await connection.connect();
        const pid = connection.processID!;
        const seen = record(connection);
        const errored = once(connection, 'error');
        const rejected = connection.query('select pg_sleep(5)').then(
          () => undefined,
          (e: any) => e,
        );
        await new Promise(resolve => setTimeout(resolve, 200));
        await kill(pid);
        const [err] = await errored;
        expect(err).toBeInstanceOf(ConnectionLostError);
        expect(err.code).toStrictEqual('08006');
        expect(err.processID).toStrictEqual(pid);
        // One object for both, as it already is for the pool.
        expect(await rejected).toBe(err);
        // The loss is the cause and the close is the consequence.
        await new Promise(resolve => setTimeout(resolve, 200));
        expect(seen).toStrictEqual(['error:08006:' + pid, 'close:08006']);
      });

      it('should fire when the connection was idle', async () => {
        // The case pg's own documentation is about: no query to reject,
        // so this event is the only report there can be.
        const connection = new Connection();
        await connection.connect();
        const pid = connection.processID!;
        const errored = once(connection, 'error');
        await kill(pid);
        const [err] = await errored;
        expect(err.code).toStrictEqual('08006');
        expect(err.processID).toStrictEqual(pid);
      });

      it('should stay quiet for a close that was asked for', async () => {
        const connection = new Connection();
        await connection.connect();
        const seen = record(connection);
        await connection.close(0);
        await new Promise(resolve => setTimeout(resolve, 200));
        expect(seen).toStrictEqual(['close:none']);
      });

      it('should stay quiet for a connect that never got up', async () => {
        // There was no connection to lose, and connect() already
        // rejects - two reports for one failure is one too many.
        const connection = new Connection({ port: 5999 });
        const seen = record(connection);
        await expect(connection.connect()).rejects.toThrow();
        await new Promise(resolve => setTimeout(resolve, 200));
        expect(seen.filter(e => e.startsWith('error'))).toStrictEqual([]);
      });

      it('should report a socket error once, not twice', async () => {
        // A socket that fails rather than closing cleanly emits 'error'
        // and then 'close', and both used to reach this - the first as
        // the raw Node error, with no SQLSTATE on it. Now the close is
        // the single report and the socket error is its `cause`.
        const connection = new Connection();
        await connection.connect();
        const seen = record(connection);
        const rejected = connection.query('select pg_sleep(5)').then(
          () => undefined,
          (e: any) => e,
        );
        await new Promise(resolve => setTimeout(resolve, 200));
        const boom = new Error('boom');
        (connection as any)._intlCon.socket._socket.destroy(boom);
        const err: any = await rejected;
        await new Promise(resolve => setTimeout(resolve, 300));
        expect(err.code).toStrictEqual('08006');
        expect(err.cause).toBe(boom);
        expect(seen.filter(e => e.startsWith('error'))).toHaveLength(1);
      });

      it('should not throw when nothing is listening', async () => {
        // SafeEventEmitter drops an 'error' with no listener instead of
        // throwing, which is what makes this safe to emit for everyone.
        const connection = new Connection();
        await connection.connect();
        const pid = connection.processID!;
        const closed = once(connection, 'close');
        await kill(pid);
        await closed;
      });
    });
  });
});
