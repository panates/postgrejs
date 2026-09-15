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
    // selection (get-parsers.ts picks decodeBinary/decodeText by reading
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

  it('should auto-commit after execute() when already inside a manually-started transaction', async () => {
    await connection.startTransaction();
    const stmt = await connection.prepare('select 1 as v');
    try {
      const r = await stmt.execute({ autoCommit: true });
      expect(r.rows?.[0]).toStrictEqual([1]);
      expect(connection.inTransaction).toStrictEqual(false);
    } finally {
      await stmt.close();
    }
  });

  it('should accept an explicit rollbackOnError override', async () => {
    const stmt = await connection.prepare('select 1 / $1::int4 as v');
    try {
      await expect(
        stmt.execute({ params: [0], rollbackOnError: false }),
      ).rejects.toThrow('division by zero');
      const r = await connection.query('select 2 as v');
      expect(r.rows?.[0]).toStrictEqual([2]);
    } finally {
      await stmt.close();
    }
  });

  it('should cancel() delegate to the connection it belongs to', async () => {
    const stmt = await connection.prepare('select 1 as v');
    try {
      await stmt.cancel();
      // Nothing was running, so the cancel is a harmless no-op. Give the
      // out-of-band cancel connection a moment to fully land server-side
      // before moving on - otherwise a slow-to-process cancel could still
      // arrive after the *next* query below has started, and cancel that
      // one instead.
      await new Promise(resolve => setTimeout(resolve, 300));
      const r = await connection.query('select 2 as v');
      expect(r.rows?.[0]).toStrictEqual([2]);
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

  describe('executeBatch()', () => {
    it('should run one execution per parameter set and report each count', async () => {
      await connection.execute(
        'create temp table t_batch_counts (id int4 primary key, v text)',
      );
      await connection.execute(
        "insert into t_batch_counts values (1, 'a'), (2, 'b')",
      );
      const stmt = await connection.prepare(
        'update t_batch_counts set v = $1 where id = $2',
      );
      try {
        const r = await stmt.executeBatch([
          ['x', 1],
          ['y', 2],
          ['z', 99],
        ]);
        // The third set matches no row - the shape from the original
        // feature request, where a batch reports per-set counts rather
        // than one total.
        expect(r.results.map(x => x.rowsAffected)).toStrictEqual([1, 1, 0]);
        expect(r.results.map(x => x.command)).toStrictEqual([
          'UPDATE',
          'UPDATE',
          'UPDATE',
        ]);
        expect(r.totalRowsAffected).toStrictEqual(2);
      } finally {
        await stmt.close();
      }
    });

    it('should decode rows per set when the statement returns them', async () => {
      const stmt = await connection.prepare('select $1::int4 as v');
      try {
        const r = await stmt.executeBatch([[7], [8]], { objectRows: true });
        expect(r.results.map(x => x.rows?.[0])).toStrictEqual([
          { v: 7 },
          { v: 8 },
        ]);
        expect(r.fields?.length).toStrictEqual(1);
      } finally {
        await stmt.close();
      }
    });

    it('should leave rows undefined for a statement that returns none', async () => {
      await connection.execute('create temp table t_batch_norows (id int4)');
      const stmt = await connection.prepare(
        'insert into t_batch_norows values ($1)',
      );
      try {
        const r = await stmt.executeBatch([[1], [2]]);
        expect(r.results.every(x => x.rows === undefined)).toStrictEqual(true);
        expect(r.fields).toBeUndefined();
      } finally {
        await stmt.close();
      }
    });

    it('should report which set the server rejected, and what completed', async () => {
      await connection.execute(
        'create temp table t_batch_err (id int4 primary key)',
      );
      await connection.execute('insert into t_batch_err values (1)');
      const stmt = await connection.prepare(
        'insert into t_batch_err values ($1)',
      );
      try {
        let error: any;
        try {
          await stmt.executeBatch([[10], [1], [11]]);
        } catch (e: any) {
          error = e;
        }
        // The duplicate key is set #1; it stays a DatabaseError so the
        // usual PostgreSQL fields still work.
        expect(error?.code).toStrictEqual('23505');
        expect(error?.batchIndex).toStrictEqual(1);
        expect(error?.batchResults?.length).toStrictEqual(1);
      } finally {
        await stmt.close();
      }
    });

    it('should roll back every set when one fails', async () => {
      // A batch is a single Sync and therefore a single implicit
      // transaction: set #0 completed before the failure, but must not
      // survive it. Sets after the failure never ran at all.
      await connection.execute(
        'create temp table t_batch_atomic (id int4 primary key)',
      );
      await connection.execute('insert into t_batch_atomic values (1)');
      const stmt = await connection.prepare(
        'insert into t_batch_atomic values ($1)',
      );
      try {
        await expect(stmt.executeBatch([[10], [1], [11]])).rejects.toThrow();
        const r = await connection.query(
          'select count(*)::int4 as n from t_batch_atomic where id in (10, 11)',
        );
        expect(r.rows?.[0]).toStrictEqual([0]);
      } finally {
        await stmt.close();
      }
    });

    it('should accept an empty batch without touching the connection', async () => {
      const stmt = await connection.prepare('select $1::int4 as v');
      try {
        const r = await stmt.executeBatch([]);
        expect(r.results).toStrictEqual([]);
        expect(r.totalRowsAffected).toStrictEqual(0);
        // Connection still usable - nothing was sent.
        const q = await connection.query('select 1 as v');
        expect(q.rows?.[0]).toStrictEqual([1]);
      } finally {
        await stmt.close();
      }
    });

    it('should reject a cursor request, which a batch cannot honour', async () => {
      const stmt = await connection.prepare('select $1::int4 as v');
      try {
        await expect(
          stmt.executeBatch([[1]], { cursor: true }),
        ).rejects.toThrow(/cursor/);
      } finally {
        await stmt.close();
      }
    });

    it('should keep set-to-result mapping over a batch larger than one read', async () => {
      // fetchCount is deliberately ignored by executeBatch(); this also
      // covers a batch whose responses span many socket reads.
      const stmt = await connection.prepare('select $1::int4 as v');
      try {
        const sets = Array.from({ length: 500 }, (_, i) => [i]);
        const r = await stmt.executeBatch(sets, { fetchCount: 1 });
        expect(r.results.length).toStrictEqual(500);
        expect(r.results[0].rows?.[0]).toStrictEqual([0]);
        expect(r.results[499].rows?.[0]).toStrictEqual([499]);
      } finally {
        await stmt.close();
      }
    });
  });
});
