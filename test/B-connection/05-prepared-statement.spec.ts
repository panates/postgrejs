import { expect } from 'expect';
import { Connection, DataFormat } from 'postgrejs';

describe('PreparedStatement', () => {
  let connection: Connection;

  before(async () => {
    connection = new Connection();
    await connection.connect();
  });

  after(() => connection.close(0));

  it('should close() be idempotent', async () => {
    // Regression test: close() and the internal _close() both decremented
    // the ref-count, so a second close() call re-sent CLOSE+SYNC to the
    // server for an already-closed statement instead of being a no-op.
    const stmt = await connection.prepare('select 1 as v');
    await stmt.close();
    await stmt.close();
    await stmt.close();
    // Connection must still be usable afterward.
    const r = await connection.query('select 2 as v');
    expect(r.rows?.[0]).toStrictEqual([2]);
  });

  it('should execute() a prepared statement multiple times with different params', async () => {
    const stmt = await connection.prepare('select $1::int4 as v');
    try {
      for (let i = 0; i < 5; i++) {
        const r = await stmt.execute({ params: [i], objectRows: true });
        expect(r.rows?.[0]).toStrictEqual({ v: i });
      }
    } finally {
      await stmt.close();
    }
  });

  it('should execute() a prepared statement with different columnFormat across calls', async () => {
    // Regression test: PreparedStatement caches the RowDescription from
    // prepare()'s statement-level Describe and reuses it for every
    // execute() instead of re-Describing per call - the wire always
    // reports format 0 (text) for a statement-level Describe regardless
    // of what a later Bind requests, so the cached fields' .format must
    // be patched to each call's actual columnFormat before parser
    // selection (get-parsers.ts picks parseBinary/parseText by reading
    // it) or a binary-format call on a reused statement would silently
    // decode with the wrong parser.
    const stmt = await connection.prepare(
      'select $1::int4 as v, $2::text as t',
    );
    try {
      const r1 = await stmt.execute({
        params: [100, 'hello'],
        objectRows: true,
      });
      expect(r1.rows?.[0]).toStrictEqual({ v: 100, t: 'hello' });

      const r2 = await stmt.execute({
        params: [200, 'world'],
        objectRows: true,
        columnFormat: DataFormat.text,
      });
      expect(r2.rows?.[0]).toStrictEqual({ v: 200, t: 'world' });

      const r3 = await stmt.execute({
        params: [300, 'again'],
        objectRows: true,
        columnFormat: DataFormat.binary,
      });
      expect(r3.rows?.[0]).toStrictEqual({ v: 300, t: 'again' });
    } finally {
      await stmt.close();
    }
  });

  it('should remain usable after execute() fails, on the same prepared statement', async () => {
    // Regression test for the FIFO-desync bug class fixed earlier this
    // session: an ErrorResponse must not resolve/reject before the
    // guaranteed terminal ReadyForQuery arrives, or the connection is left
    // with a stray unrouted response for the next request.
    const stmt = await connection.prepare('select 1 / $1::int4 as v');
    try {
      await expect(
        stmt.execute({ params: [0], objectRows: true }),
      ).rejects.toThrow('division by zero');
      const r = await stmt.execute({ params: [1], objectRows: true });
      expect(r.rows?.[0]).toStrictEqual({ v: 1 });
    } finally {
      await stmt.close();
    }
  });

  it('should execute() a prepared statement with no result columns', async () => {
    await connection.execute(
      'create temp table t_prepared_noresult (id int4, v int4)',
    );
    await connection.execute('insert into t_prepared_noresult values (1, 10)');
    const stmt = await connection.prepare(
      'update t_prepared_noresult set v = $1 where id = $2',
    );
    try {
      const r = await stmt.execute({ params: [99, 1] });
      expect(r.command).toStrictEqual('UPDATE');
      expect(r.rowsAffected).toStrictEqual(1);
      expect(r.fields).toBeUndefined();
    } finally {
      await stmt.close();
    }
  });
});
