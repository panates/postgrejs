import { expect } from 'expect';
import { Connection, Pool } from 'postgrejs';

/**
 * PostgreSQL takes a transaction's modes on the `BEGIN` itself, so
 * asking for them costs nothing beyond the BEGIN that was going out
 * anyway. Without this, a caller wanting an isolation level either
 * spent a second round trip on `SET TRANSACTION` or sent their own
 * `BEGIN ...` as raw SQL, which leaves the nesting counter one behind
 * the server.
 */
describe('Transaction options', () => {
  const conn = new Connection();
  before(() => conn.connect());
  after(() => conn.close(0));

  const setting = async (name: string) =>
    ((await conn.query('show ' + name, { objectRows: true })).rows?.[0] as any)[
      name
    ];

  it('should set the isolation level on the BEGIN', async () => {
    for (const level of [
      'serializable',
      'repeatable read',
      'read committed',
    ] as const) {
      await conn.startTransaction({ isolationLevel: level });
      try {
        expect(await setting('transaction_isolation')).toStrictEqual(level);
      } finally {
        await conn.rollback();
      }
    }
  });

  it('should set read-only and deferrable', async () => {
    await conn.startTransaction({
      isolationLevel: 'serializable',
      readOnly: true,
      deferrable: true,
    });
    try {
      expect(await setting('transaction_read_only')).toStrictEqual('on');
      expect(await setting('transaction_deferrable')).toStrictEqual('on');
      await expect(
        conn.query('create temp table t_tx_ro(i int)'),
      ).rejects.toThrow(/read-only transaction/);
    } finally {
      await conn.rollback();
    }
  });

  it('should say READ WRITE and NOT DEFERRABLE when asked for false', async () => {
    await conn.startTransaction({ readOnly: false, deferrable: false });
    try {
      expect(await setting('transaction_read_only')).toStrictEqual('off');
      expect(await setting('transaction_deferrable')).toStrictEqual('off');
    } finally {
      await conn.rollback();
    }
  });

  it('should spend one round trip where SET TRANSACTION spends two', async () => {
    // The reason the option exists, pinned so it cannot quietly go back
    // to two: BEGIN+ROLLBACK against BEGIN+SET+ROLLBACK.
    const locations: string[] = [];
    const onDebug = (e: any) => locations.push(e.location);
    (conn as any)._intlCon.socket.on('debug', onDebug);
    try {
      await conn.startTransaction({ isolationLevel: 'serializable' });
      await conn.rollback();
      const withOption = locations.filter(l =>
        l.startsWith('PgSocket.send'),
      ).length;
      locations.length = 0;
      await conn.startTransaction();
      await conn.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
      await conn.rollback();
      const withStatement = locations.filter(l =>
        l.startsWith('PgSocket.send'),
      ).length;
      expect(withOption).toStrictEqual(withStatement - 1);
    } finally {
      (conn as any)._intlCon.socket.off('debug', onDebug);
    }
  });

  it('should commit and roll back as usual afterwards', async () => {
    await conn.execute(
      'drop table if exists t_txopt; create table t_txopt(i int)',
    );
    await conn.startTransaction({ isolationLevel: 'repeatable read' });
    await conn.query('insert into t_txopt values(1)');
    await conn.commit();
    await conn.startTransaction({ isolationLevel: 'repeatable read' });
    await conn.query('insert into t_txopt values(2)');
    await conn.rollback();
    const r = await conn.query('select i from t_txopt order by i');
    expect(r.rows).toStrictEqual([[1]]);
    await conn.execute('drop table t_txopt');
  });

  it('should work with rollbackOnError on, which is the default', async () => {
    // The savepoint rollbackOnError puts around every statement is what
    // made `SET TRANSACTION` impossible to run at all before a89fcf3;
    // on the BEGIN there is no savepoint yet for it to be inside of.
    await conn.startTransaction({ isolationLevel: 'serializable' });
    try {
      expect(await setting('transaction_isolation')).toStrictEqual(
        'serializable',
      );
      await conn.query('select 1');
      await expect(conn.query('select 1/0')).rejects.toThrow(
        'division by zero',
      );
      // The transaction survived, which is what rollbackOnError is for.
      expect(await setting('transaction_isolation')).toStrictEqual(
        'serializable',
      );
    } finally {
      await conn.rollback();
    }
  });

  describe('a transaction that is already open', () => {
    it('should refuse modes on a nested startTransaction()', async () => {
      // They could only be applied to somebody else's transaction:
      // PostgreSQL takes a nested `BEGIN ISOLATION LEVEL ...` before any
      // query has run and *silently changes the outer level*, and raises
      // 25001 after one. Neither is what a nested scope means.
      await conn.startTransaction();
      try {
        await expect(
          conn.startTransaction({ isolationLevel: 'serializable' }),
        ).rejects.toThrow(/cannot set transaction modes/);
      } finally {
        await conn.rollback();
      }
    });

    it('should refuse them on a nested transaction() too', async () => {
      await conn.startTransaction();
      try {
        await expect(
          conn.transaction(async () => undefined, { readOnly: true }),
        ).rejects.toThrow(/cannot set transaction modes/);
      } finally {
        await conn.rollback();
      }
    });

    it('should still nest without them', async () => {
      await conn.startTransaction({ isolationLevel: 'serializable' });
      await conn.startTransaction();
      await conn.commit();
      expect(conn.inTransaction).toStrictEqual(true);
      await conn.rollback();
      expect(conn.inTransaction).toStrictEqual(false);
    });
  });

  it('should refuse an isolation level it does not know', async () => {
    // The level is concatenated into the statement, so it comes from a
    // table here and never from the caller's own string.
    await expect(
      conn.startTransaction({ isolationLevel: "read committed'; drop" as any }),
    ).rejects.toThrow(/Unknown transaction isolation level/);
    expect(conn.inTransaction).toStrictEqual(false);
    // And it counted nothing: a start that never happened must not
    // leave the depth one higher than the transactions there are - it
    // did, and the next transaction() call was refused as nested.
    await conn.startTransaction({ isolationLevel: 'serializable' });
    await conn.rollback();
    expect(conn.inTransaction).toStrictEqual(false);
  });

  it('should carry them through transaction() and the pool', async () => {
    const level = await conn.transaction(
      async tx =>
        (
          (await tx.query('show transaction_isolation', { objectRows: true }))
            .rows?.[0] as any
        ).transaction_isolation,
      { isolationLevel: 'serializable' },
    );
    expect(level).toStrictEqual('serializable');

    const pool = new Pool({ max: 1 });
    try {
      const fromPool = await pool.transaction(
        async tx =>
          (
            (await tx.query('show transaction_isolation', { objectRows: true }))
              .rows?.[0] as any
          ).transaction_isolation,
        { isolationLevel: 'repeatable read' },
      );
      expect(fromPool).toStrictEqual('repeatable read');
    } finally {
      await pool.close(0);
    }
  });
});
