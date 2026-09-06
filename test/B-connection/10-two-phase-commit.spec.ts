import { expect } from 'expect';
import { Connection } from 'postgrejs';

describe('Two-phase commit', () => {
  let connection: Connection;
  let enabled = false;

  before(async () => {
    connection = new Connection();
    await connection.connect();
    // PostgreSQL ships with max_prepared_transactions at zero, so the
    // round-trip below can only run where the server was configured for it.
    const r = await connection.query('show max_prepared_transactions');
    enabled = Number(r.rows?.[0][0]) > 0;
    await connection.execute(`
      drop table if exists tpc_test;
      create table tpc_test (v int4)`);
  });

  after(async () => {
    await connection.execute('drop table if exists tpc_test');
    await connection.close(0);
  });

  it('should report the server error when the feature is disabled', async function () {
    if (enabled) return this.skip();
    await connection.startTransaction();
    await expect(connection.prepareTransaction('tpc_1')).rejects.toThrow(
      /prepared transactions are disabled/,
    );
    await connection.rollback();
  });

  it('should commit a prepared transaction from another connection', async function () {
    if (!enabled) return this.skip();
    await connection.startTransaction();
    await connection.execute('insert into tpc_test values (1)');
    await connection.prepareTransaction('tpc_commit');
    // Prepared, so no longer this session's - and not yet visible.
    expect(connection.inTransaction).toStrictEqual(false);
    let r = await connection.query('select count(*)::int4 as c from tpc_test');
    expect(r.rows?.[0][0]).toStrictEqual(0);

    const other = new Connection();
    await other.connect();
    try {
      await other.commitPrepared('tpc_commit');
    } finally {
      await other.close(0);
    }
    r = await connection.query('select count(*)::int4 as c from tpc_test');
    expect(r.rows?.[0][0]).toStrictEqual(1);
  });

  it('should roll back a prepared transaction from another connection', async function () {
    if (!enabled) return this.skip();
    await connection.execute('truncate table tpc_test');
    await connection.startTransaction();
    await connection.execute('insert into tpc_test values (2)');
    await connection.prepareTransaction('tpc_rollback');

    const other = new Connection();
    await other.connect();
    try {
      await other.rollbackPrepared('tpc_rollback');
    } finally {
      await other.close(0);
    }
    const r = await connection.query(
      'select count(*)::int4 as c from tpc_test',
    );
    expect(r.rows?.[0][0]).toStrictEqual(0);
  });

  it('should escape the transaction name', async function () {
    if (!enabled) return this.skip();
    // The name is a string literal, so a quote in it must not end it.
    const name = `tpc'; select 1; --`;
    await connection.startTransaction();
    await connection.execute('insert into tpc_test values (3)');
    await connection.prepareTransaction(name);
    await connection.rollbackPrepared(name);
  });
});
