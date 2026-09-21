import { expect } from 'expect';
import { Connection, Pool } from 'postgrejs';

/**
 * Statements share a connection by default: several can be on the wire
 * at once, each under its own Sync and so with its own error boundary.
 * `pipeline: false` asks for the wire alone.
 *
 * What is asserted is the order the statements go out in, not how long
 * they take: PostgreSQL runs one connection's statements serially either
 * way, so timing cannot tell the two apart. The socket's `debug` event
 * reports each send, and each query appends its own completion - so a
 * pipelined run reads `send send send done done done` and a serialised
 * one `send done send done send done`.
 */
describe('pipeline option', () => {
  const sleeping = (i: number) => `select pg_sleep(0.02), ${i}`;

  /** The sends and completions of three concurrent statements, in order. */
  async function traceThree(conn: Connection, options?: any) {
    const socket = (conn as any)._intlCon.socket;
    const events: string[] = [];
    const onDebug = (e: any) => {
      const sql = e.args?.parse?.sql ?? e.args?.sql;
      if (typeof sql === 'string' && sql.startsWith('select'))
        events.push('send' + sql.slice(-1));
    };
    socket.on('debug', onDebug);
    try {
      await Promise.all(
        [1, 2, 3].map(i =>
          conn
            .query(sleeping(i), { ...options })
            .then(() => events.push('done' + i)),
        ),
      );
    } finally {
      socket.off('debug', onDebug);
    }
    return events.join(' ');
  }

  describe('on a connection', () => {
    it('should keep sending rather than wait for each reply', async () => {
      const conn = new Connection();
      await conn.connect();
      try {
        expect(await traceThree(conn)).toStrictEqual(
          'send1 send2 send3 done1 done2 done3',
        );
      } finally {
        await conn.close(0);
      }
    });

    it('should give the wire to one statement when asked', async () => {
      const conn = new Connection();
      await conn.connect();
      try {
        expect(await traceThree(conn, { pipeline: false })).toStrictEqual(
          'send1 done1 send2 done2 send3 done3',
        );
      } finally {
        await conn.close(0);
      }
    });

    it('should take the connection setting when the call says nothing', async () => {
      const conn = new Connection({ pipeline: false });
      await conn.connect();
      try {
        expect(await traceThree(conn)).toStrictEqual(
          'send1 done1 send2 done2 send3 done3',
        );
        // ...and the call still overrides it.
        expect(await traceThree(conn, { pipeline: true })).toStrictEqual(
          'send1 send2 send3 done1 done2 done3',
        );
      } finally {
        await conn.close(0);
      }
    });

    it('should hold back the statements that arrive while it runs', async () => {
      // The third asked to be pipelined, but it arrived after the second
      // put the lock up - "nothing else starts until it finishes" is
      // the half of the contract that the second one is owed.
      const conn = new Connection();
      await conn.connect();
      try {
        const socket = (conn as any)._intlCon.socket;
        const events: string[] = [];
        socket.on('debug', (e: any) => {
          const sql = e.args?.parse?.sql ?? e.args?.sql;
          if (typeof sql === 'string' && sql.startsWith('select'))
            events.push('send' + sql.slice(-1));
        });
        await Promise.all([
          conn.query(sleeping(1)).then(() => events.push('done1')),
          conn
            .query(sleeping(2), { pipeline: false })
            .then(() => events.push('done2')),
          conn.query(sleeping(3)).then(() => events.push('done3')),
        ]);
        expect(events.join(' ')).toStrictEqual(
          'send1 done1 send2 done2 send3 done3',
        );
      } finally {
        await conn.close(0);
      }
    });

    it('should serialise execute() the same way', async () => {
      const conn = new Connection();
      await conn.connect();
      try {
        const results = await Promise.all([
          conn.execute('select 1', { pipeline: false }),
          conn.execute('select 2', { pipeline: false }),
        ]);
        expect(results.map(r => r.totalCommands)).toStrictEqual([1, 1]);
      } finally {
        await conn.close(0);
      }
    });
  });

  describe('on a pool', () => {
    it('should let a query share a pooled connection by default', async () => {
      const pool: any = new Pool({ max: 2 });
      try {
        expect(
          pool._canPipeline(undefined, 'select 1', undefined, undefined),
        ).toStrictEqual(true);
        expect(
          pool._canPipeline(true, 'select 1', undefined, undefined),
        ).toStrictEqual(true);
        expect(
          pool._canPipeline(false, 'select 1', undefined, undefined),
        ).toStrictEqual(false);
      } finally {
        await pool.close(0);
      }
    });

    it('should take the pool setting when the call says nothing', async () => {
      const pool: any = new Pool({ max: 2, pipeline: false });
      try {
        expect(
          pool._canPipeline(undefined, 'select 1', undefined, undefined),
        ).toStrictEqual(false);
        expect(
          pool._canPipeline(true, 'select 1', undefined, undefined),
        ).toStrictEqual(true);
      } finally {
        await pool.close(0);
      }
    });

    it('should keep a statement that needs the connection to itself', async () => {
      // Not policy: each of these outlives the call that started it, so
      // it cannot share a connection with anything.
      const pool: any = new Pool({ max: 2 });
      const ac = new AbortController();
      try {
        expect(
          pool._canPipeline(true, 'begin', undefined, undefined),
        ).toStrictEqual(false);
        expect(
          pool._canPipeline(true, 'copy t from stdin', undefined, undefined),
        ).toStrictEqual(false);
        expect(
          pool._canPipeline(true, 'select 1', false, undefined),
        ).toStrictEqual(false);
        expect(
          pool._canPipeline(true, 'select 1', undefined, ac.signal),
        ).toStrictEqual(false);
      } finally {
        await pool.close(0);
      }
    });

    it('should run a burst through one pooled connection correctly', async () => {
      const pool = new Pool({ max: 1 });
      try {
        const rows = await Promise.all(
          Array.from({ length: 20 }, (_, i) =>
            pool.query('select $1::int as v', {
              params: [i],
              objectRows: true,
            }),
          ),
        );
        expect(rows.map(r => (r.rows?.[0] as any).v)).toStrictEqual(
          Array.from({ length: 20 }, (_, i) => i),
        );
      } finally {
        await pool.close(0);
      }
    });
  });
});
