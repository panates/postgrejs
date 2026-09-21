import { expect } from 'expect';
import { Connection, Pool } from 'postgrejs';

/**
 * A server NOTICE has to reach the caller. Everything below the
 * connection was already in place - PgSocket emits `'notice'` and the
 * backend codec parses the payload - but nothing forwarded it, and every
 * in-query message loop dropped it, so `connection.on('notice')` never
 * fired for anything.
 *
 * `DROP TABLE IF EXISTS` is the realistic case and needs no PL/pgSQL:
 * PostgreSQL raises its own "skipping" notice for it.
 */
function collect(emitter: any): any[] {
  const seen: any[] = [];
  emitter.on('notice', (msg: any) => seen.push(msg));
  return seen;
}

describe('notice', () => {
  const conn = new Connection();
  before(() => conn.connect());
  after(() => conn.close(0));

  it('should deliver one raised by query()', async () => {
    const seen = collect(conn);
    await conn.query("do $$ begin raise notice 'from query'; end $$");
    expect(seen.map(m => m.message)).toStrictEqual(['from query']);
  });

  it('should deliver one raised by execute()', async () => {
    // A different message loop from query()'s - there are six of them,
    // and each dropped the message on its own.
    const seen = collect(conn);
    await conn.execute("do $$ begin raise notice 'from execute'; end $$");
    expect(seen.map(m => m.message)).toStrictEqual(['from execute']);
  });

  it("should deliver PostgreSQL's own notice, with no PL/pgSQL", async () => {
    const seen = collect(conn);
    await conn.execute('drop table if exists no_such_table_here');
    expect(seen.length).toStrictEqual(1);
    expect(seen[0].message).toContain('no_such_table_here');
    // Parsed the way an ErrorResponse is, so the fields pg exposes are
    // all here.
    expect(seen[0].severity).toBeDefined();
    expect(seen[0].code).toBeDefined();
  });

  it('should deliver one raised by a prepared statement, once', async () => {
    // A prepared execute runs through the connection's message loop, not
    // through the three the statement keeps for its own close and cancel
    // traffic - so it arrives on the Connection, which is what a caller
    // holding one needs, and exactly once rather than twice.
    const st = await conn.prepare(
      "do $$ begin raise notice 'prepared'; end $$",
    );
    const onConn = collect(conn);
    const onStatement = collect(st);
    await st.execute();
    expect(onConn.map(m => m.message)).toStrictEqual(['prepared']);
    expect(onStatement).toStrictEqual([]);
    await st.close();
  });

  it('should not affect the result, and not reject', async () => {
    const seen = collect(conn);
    const r = await conn.query("do $$ begin raise notice 'ignored'; end $$");
    expect(r.command).toStrictEqual('DO');
    const after = await conn.query('select 1 as n', { objectRows: true });
    expect(after.rows?.[0]).toStrictEqual({ n: 1 });
    expect(seen.length).toStrictEqual(1);
  });

  it('should not throw when nothing is listening', async () => {
    // SafeEventEmitter drops an unheard event rather than throwing, but
    // the cost of a notice with no listener has to be nothing at all.
    const quiet = new Connection();
    await quiet.connect();
    expect(quiet.listenerCount('notice')).toStrictEqual(0);
    await quiet.execute('drop table if exists still_not_here');
    await quiet.query("do $$ begin raise notice 'unheard'; end $$");
    await quiet.close(0);
  });

  it('should name the connection when a pool forwards it', async () => {
    // pool.query() hands the caller no Connection at all, so without
    // this a notice raised by their own statement is unreachable.
    const pool = new Pool({ max: 1 });
    const seen: any[] = [];
    pool.on('notice', (msg: any, connection: any) =>
      seen.push({ message: msg.message, connection }),
    );
    await pool.query("do $$ begin raise notice 'from pool'; end $$");
    expect(seen.length).toStrictEqual(1);
    expect(seen[0].message).toStrictEqual('from pool');
    expect(seen[0].connection).toBeDefined();
    await pool.close(0);
  });
});
