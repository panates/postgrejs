import { expect } from 'expect';
import { Connection } from 'postgrejs';

/**
 * `SET TRANSACTION` configures the transaction it runs in. PostgreSQL
 * refuses two of its forms inside a subtransaction - ISOLATION LEVEL and
 * [NOT] DEFERRABLE, both 25001 - and `rollbackOnError`, which defaults
 * to on, puts every statement in a transaction inside a savepoint. So
 * with the defaults these could not be run at all, and every ORM that
 * sets an isolation level does it exactly this way: `BEGIN`, then
 * `SET TRANSACTION ISOLATION LEVEL ...` as its own statement.
 *
 * It is deliberately not treated as a transaction *command*: it neither
 * opens nor closes one, so it must still get the implicit BEGIN that
 * `autoCommit: false` adds - suppressing both would trade one failure
 * for another.
 */
describe('SET TRANSACTION', () => {
  const conn = new Connection();
  const isolation = async () =>
    (
      (await conn.query('show transaction_isolation', { objectRows: true }))
        .rows?.[0] as any
    ).transaction_isolation;

  before(() => conn.connect());
  after(() => conn.close(0));

  it('should run inside a transaction with rollbackOnError at its default', async () => {
    await conn.startTransaction();
    try {
      await conn.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
      expect(await isolation()).toStrictEqual('serializable');
    } finally {
      await conn.rollback();
    }
  });

  it('should do the same through execute()', async () => {
    // A different path with its own copy of the savepoint decision.
    await conn.startTransaction();
    try {
      await conn.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      expect(await isolation()).toStrictEqual('repeatable read');
    } finally {
      await conn.rollback();
    }
  });

  it('should run the DEFERRABLE form, the other one 25001 refuses', async () => {
    await conn.startTransaction();
    try {
      await conn.query('SET TRANSACTION DEFERRABLE');
      const r = await conn.query('show transaction_deferrable', {
        objectRows: true,
      });
      expect((r.rows?.[0] as any).transaction_deferrable).toStrictEqual('on');
    } finally {
      await conn.rollback();
    }
  });

  it('should still get the implicit BEGIN autoCommit:false asks for', async () => {
    // Outside a transaction the server only warns and the setting is
    // lost, so the BEGIN is the whole point here.
    expect(conn.inTransaction).toStrictEqual(false);
    try {
      await conn.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE', {
        autoCommit: false,
      });
      expect(conn.inTransaction).toStrictEqual(true);
      expect(await isolation()).toStrictEqual('serializable');
    } finally {
      await conn.rollback();
    }
  });

  it('should keep working with rollbackOnError off', async () => {
    await conn.startTransaction();
    try {
      await conn.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE', {
        rollbackOnError: false,
      });
      expect(await isolation()).toStrictEqual('serializable');
    } finally {
      await conn.rollback();
    }
  });

  it('should leave the savepoint in place for an ordinary statement', async () => {
    // What rollbackOnError exists for, in the same transaction: a failed
    // statement rolls back to its own savepoint and the rest survives.
    await conn.execute(
      'drop table if exists t_settx; create table t_settx(i int)',
    );
    await conn.startTransaction();
    await conn.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
    await conn.query('insert into t_settx values(1)');
    await expect(conn.query('insert into t_settx values(1/0)')).rejects.toThrow(
      'division by zero',
    );
    await conn.query('insert into t_settx values(2)');
    await conn.commit();
    const r = await conn.query('select i from t_settx order by i');
    expect(r.rows).toStrictEqual([[1], [2]]);
    await conn.execute('drop table t_settx');
  });
});
