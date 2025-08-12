import * as process from 'node:process';
import { expect } from 'expect';
import { Connection, ConnectionState } from 'postgrejs';

describe('Connection', () => {
  let connection: Connection;

  afterEach(async () => {
    if (connection) await connection.close(0);
  });

  it('should connect', async () => {
    connection = new Connection();
    await connection.connect();
    expect(connection.state).toStrictEqual(ConnectionState.READY);
  });

  it('should connect with ssl option', async () => {
    connection = new Connection('postgres://localhost?sslmode=prefer');
    await connection.connect();
    expect(connection.state).toStrictEqual(ConnectionState.READY);
  });

  if (process.env.PGSOCKET) {
    it('should connect with unix socket', async () => {
      connection = new Connection(process.env.PGSOCKET);
      await connection.connect();
      expect(connection.state).toStrictEqual(ConnectionState.READY);
    });
  }

  if (process.env.LOGIN_MD5) {
    it('should login using MD5', async () => {
      connection = new Connection({
        user: process.env.LOGIN_MD5,
        password: process.env.LOGIN_MD5,
      });
      await connection.connect();
      expect(connection.state).toStrictEqual(ConnectionState.READY);
    });
  }

  if (process.env.LOGIN_SCRAM) {
    it('should login using scram-sha-25', async () => {
      connection = new Connection({
        user: process.env.LOGIN_SCRAM,
        password: process.env.LOGIN_SCRAM,
      });
      await connection.connect();
      expect(connection.state).toStrictEqual(ConnectionState.READY);
    });
  }

  it('should get process id', async () => {
    connection = new Connection();
    await connection.connect();
    expect(connection.processID).toBeGreaterThan(0);
  });

  it('should get secret key', async () => {
    connection = new Connection();
    await connection.connect();
    expect(connection.secretKey).toBeGreaterThan(0);
  });

  it('should set application_name', async () => {
    connection = new Connection({
      applicationName: 'test',
    });
    await connection.connect();
    const r = await connection.execute(
      "SELECT current_setting('application_name');",
    );
    expect(r.results.length).toStrictEqual(1);
    expect(r.results[0].rows).toBeDefined();
    expect(r.results[0].rows![0]).toEqual(['test']);
  });

  it('should execute simple query', async () => {
    connection = new Connection();
    await connection.connect();
    const result = await connection.execute(`select 1`);
    expect(result).toBeDefined();
    expect(result.totalCommands).toStrictEqual(1);
    expect(result.results.length).toStrictEqual(1);
    expect(result.results[0].command).toStrictEqual('SELECT');
  });

  it('should execute extended query', async () => {
    connection = new Connection();
    await connection.connect();
    const result = await connection.query(`select $1`, { params: [1234] });
    expect(result).toBeDefined();
    expect(result.fields).toBeDefined();
    expect(result.rows).toBeDefined();
    expect(result.command).toStrictEqual('SELECT');
    expect(result.rows?.[0][0]).toStrictEqual(1234);
  });

  it('should close', async () => {
    connection = new Connection();
    await connection.connect();
    await connection.close(0);
    expect(connection.state).toStrictEqual(ConnectionState.CLOSED);
  });

  it('should emit "connecting" and "ready" events while connect', async () => {
    connection = new Connection();
    const events: string[] = [];
    connection.on('connecting', () => events.push('connecting'));
    connection.on('ready', () => events.push('ready'));
    await connection.connect();
    expect(events).toContain('connecting');
    expect(events).toContain('ready');
    expect(connection.state).toStrictEqual(ConnectionState.READY);
    await connection.close(0);
  });

  it('should emit "close" event while close', async () => {
    connection = new Connection();
    await connection.connect();
    const events: string[] = [];
    connection.on('close', () => events.push('close'));
    await connection.close();
    expect(events).toContain('close');
    expect(connection.state).toStrictEqual(ConnectionState.CLOSED);
  });

  it('should wait for active query before terminate', async () => {
    connection = new Connection();
    await connection.connect();
    let terminated = false;
    const startTime = Date.now();
    connection.on('terminate', () => (terminated = true));
    (connection as any)._intlCon.ref();
    await connection.close(500);
    expect(terminated).toStrictEqual(true);
    expect(Date.now() - startTime).toBeGreaterThanOrEqual(500);
  });

  it('should start/commit transaction', async () => {
    connection = new Connection();
    await connection.connect();
    expect(connection.inTransaction).toStrictEqual(false);
    await connection.startTransaction();
    expect(connection.inTransaction).toStrictEqual(true);
    await connection.commit();
    expect(connection.inTransaction).toStrictEqual(false);
    await connection.close();
  });

  it('should start/rollback transaction', async () => {
    connection = new Connection();
    await connection.connect();
    expect(connection.inTransaction).toStrictEqual(false);
    await connection.startTransaction();
    expect(connection.inTransaction).toStrictEqual(true);
    await connection.rollback();
    expect(connection.inTransaction).toStrictEqual(false);
    await connection.close();
  });

  it('should create a savepoint and rollback to it', async () => {
    connection = new Connection();
    await connection.connect();
    expect(connection.inTransaction).toStrictEqual(false);
    await connection.savepoint('sp1');
    expect(connection.inTransaction).toStrictEqual(true);
    await connection.rollbackToSavepoint('sp1');
    expect(connection.inTransaction).toStrictEqual(true);
    await connection.rollback();
    expect(connection.inTransaction).toStrictEqual(false);
    await connection.close();
  });

  it('should default transaction mode must be autoCommit', async () => {
    connection = new Connection();
    await connection.connect();
    await connection.execute(
      'DROP TABLE IF EXISTS test.dummy_table1; CREATE TABLE test.dummy_table1 (id int4 NOT NULL);',
    );

    await connection.query('insert into test.dummy_table1 (id) values (2)');
    expect(connection.inTransaction).toStrictEqual(false);

    let x = await connection.query(
      'select * from test.dummy_table1 where id = 2',
    );
    expect(connection.inTransaction).toStrictEqual(false);
    expect(x.rows?.length).toStrictEqual(1);
    expect(x.rows?.[0][0]).toStrictEqual(2);

    await connection.query('ROLLBACK');
    expect(connection.inTransaction).toStrictEqual(false);

    x = await connection.query('select * from test.dummy_table1 where id = 2');
    expect(connection.inTransaction).toStrictEqual(false);
    expect(x.rows?.length).toStrictEqual(1);
    expect(x.rows?.[0][0]).toStrictEqual(2);

    await connection.close();
  });

  it('should automatically start transaction when connection.options.autoCommit = false', async () => {
    connection = new Connection({ autoCommit: false });
    await connection.connect();
    await connection.execute('delete from test.dummy_table1', {
      autoCommit: true,
    });

    expect(connection.inTransaction).toStrictEqual(false);

    await connection.query('insert into test.dummy_table1 (id) values (3)');
    expect(connection.inTransaction).toStrictEqual(true);

    let x = await connection.query(
      'select * from test.dummy_table1 where id = 3',
    );
    expect(connection.inTransaction).toStrictEqual(true);
    expect(x.rows?.length).toStrictEqual(1);
    expect(x.rows?.[0][0]).toStrictEqual(3);

    await connection.query('ROLLBACK');
    expect(connection.inTransaction).toStrictEqual(false);

    x = await connection.query('select * from test.dummy_table1 where id = 3');
    expect(connection.inTransaction).toStrictEqual(true);
    expect(x.rows?.length).toStrictEqual(0);

    await connection.close();
  });

  it('should automatically start transaction when connection.execute() options.autoCommit = false', async () => {
    connection = new Connection();
    await connection.connect();
    expect(connection.inTransaction).toStrictEqual(false);

    await connection.execute('insert into test.dummy_table1 (id) values (3)', {
      autoCommit: false,
    });
    expect(connection.inTransaction).toStrictEqual(true);

    let x = await connection.execute(
      'select * from test.dummy_table1 where id = 3',
      { autoCommit: false },
    );
    expect(connection.inTransaction).toStrictEqual(true);
    expect(x.results[0].rows?.length).toStrictEqual(1);
    expect(x.results[0].rows?.[0][0]).toStrictEqual(3);

    await connection.query('ROLLBACK');
    expect(connection.inTransaction).toStrictEqual(false);

    x = await connection.execute(
      'select * from test.dummy_table1 where id = 3',
    );
    expect(connection.inTransaction).toStrictEqual(false);
    expect(x.results[0].rows?.length).toStrictEqual(0);

    await connection.close();
  });

  it('should automatically start transaction when connection.query() options.autoCommit = false', async () => {
    connection = new Connection();
    await connection.connect();
    expect(connection.inTransaction).toStrictEqual(false);

    await connection.query('insert into test.dummy_table1 (id) values (3)', {
      autoCommit: false,
    });
    expect(connection.inTransaction).toStrictEqual(true);

    let x = await connection.query(
      'select * from test.dummy_table1 where id = 3',
      { autoCommit: false },
    );
    expect(connection.inTransaction).toStrictEqual(true);
    expect(x.rows?.length).toStrictEqual(1);
    expect(x.rows?.[0][0]).toStrictEqual(3);

    await connection.query('ROLLBACK');
    expect(connection.inTransaction).toStrictEqual(false);

    x = await connection.query('select * from test.dummy_table1 where id = 3');
    expect(connection.inTransaction).toStrictEqual(false);
    expect(x.rows?.length).toStrictEqual(0);

    await connection.close();
  });

  it('should continue transaction on error', async () => {
    connection = new Connection();
    await connection.connect();
    expect(connection.inTransaction).toStrictEqual(false);

    await connection.execute('delete from test.dummy_table1');

    await connection.startTransaction();
    try {
      await connection.execute('invalid sql');
    } catch {
      // ignore
    }

    await connection.execute('insert into test.dummy_table1 (id) values (5)');

    const x = await connection.query('select count(*) from test.dummy_table1', {
      autoCommit: false,
    });
    expect(x.rows?.length).toStrictEqual(1);
    expect(x.rows?.[0][0]).toStrictEqual(1);

    await connection.close();
  });

  it('should automatically close with "using" syntax', async () => {
    let closed = false;

    {
      await using conn = new Connection();
      await conn.connect();
      conn.on('close', () => (closed = true));
      expect(conn.state).toStrictEqual(ConnectionState.READY);
    }
    expect(closed).toStrictEqual(true);
  });
});
