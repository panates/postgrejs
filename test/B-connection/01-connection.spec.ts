import assert from 'assert';
import '../_support/env';
import {Connection, ConnectionState} from '../../src';
import {createTestSchema} from '../_support/createdb';

describe('Connection', function () {

    let connection: Connection;

    afterEach(async () => {
        if (connection)
            await connection.close(0);
    })

    it('should connect', async function () {
        connection = new Connection();
        await connection.connect();
        assert.strictEqual(connection.state, ConnectionState.READY);
    });

    it('should execute simple query', async function () {
        connection = new Connection();
        await connection.connect();
        const result = await connection.execute(`select 1`);
        assert.ok(result);
        assert.strictEqual(result.totalCommands, 1);
        assert.strictEqual(result.results.length, 1);
        assert.strictEqual(result.results[0].command, 'SELECT');
    });

    it('should execute extended query', async function () {
        connection = new Connection();
        await connection.connect();
        const result = await connection.query(`select $1`, {params: [1234]});
        assert.ok(result);
        assert.ok(result.fields);
        assert.ok(result.rows);
        assert.strictEqual(result.command, 'SELECT');
        assert.strictEqual(result.rows[0][0], 1234);
    });

    it('should close', async function () {
        connection = new Connection();
        await connection.connect();
        await connection.close(0);
        assert.strictEqual(connection.state, ConnectionState.CLOSED);
    });

    it('should emit "connecting" and "ready" events while connect', async function () {
        connection = new Connection();
        const events = [];
        connection.on('connecting', () => events.push('connecting'));
        connection.on('ready', () => events.push('ready'));
        await connection.connect();
        assert.ok(events.includes('connecting'), 'connecting event is not called');
        assert.ok(events.includes('ready'), 'ready event is not called');
        assert.strictEqual(connection.state, ConnectionState.READY);
        await connection.close(0);
    });

    it('should emit "close" event while close', async function () {
        connection = new Connection();
        await connection.connect();
        const events = [];
        connection.on('close', () => events.push('close'));
        await connection.close();
        assert.ok(events.includes('close'), 'close event is not called');
        assert.strictEqual(connection.state, ConnectionState.CLOSED);
    });

    it('should wait for active query before terminate', async function () {
        connection = new Connection();
        await connection.connect();
        let terminated = false;
        const startTime = Date.now();
        connection.on('terminate', () => terminated = true);
        connection['_intlCon'].ref();
        await connection.close(500);
        assert.strictEqual(terminated, true);
        assert.ok(Date.now() - startTime >= 500);
    });

    it('should start/commit transaction', async function () {
        connection = new Connection();
        await connection.connect();
        assert.deepStrictEqual(connection.inTransaction, false);
        await connection.startTransaction();
        assert.deepStrictEqual(connection.inTransaction, true);
        await connection.commit();
        assert.deepStrictEqual(connection.inTransaction, false);
        await connection.close();
    });

    it('should start/rollback transaction', async function () {
        connection = new Connection();
        await connection.connect();
        assert.deepStrictEqual(connection.inTransaction, false);
        await connection.startTransaction();
        assert.deepStrictEqual(connection.inTransaction, true);
        await connection.rollback();
        assert.deepStrictEqual(connection.inTransaction, false);
        await connection.close();
    });

    it('should create a savepoint and rollback to it', async function () {
        connection = new Connection();
        await connection.connect();
        assert.deepStrictEqual(connection.inTransaction, false);
        await connection.savepoint('sp1');
        assert.deepStrictEqual(connection.inTransaction, true);
        await connection.rollbackToSavepoint('sp1');
        assert.deepStrictEqual(connection.inTransaction, true);
        await connection.rollback();
        assert.deepStrictEqual(connection.inTransaction, false);
        await connection.close();
    });

    it('create test schema', async function () {
        connection = new Connection();
        await connection.connect();
        await createTestSchema(connection);
        await connection.close();
    });

    it('should default transaction mode must be autoCommit', async function () {
        connection = new Connection();
        await connection.connect();
        await connection.execute('DROP TABLE IF EXISTS test.dummy_table1; CREATE TABLE test.dummy_table1 (id int4 NOT NULL);');

        await connection.query('insert into test.dummy_table1 (id) values (2)');
        assert.deepStrictEqual(connection.inTransaction, false);

        let x = await connection.query('select * from test.dummy_table1 where id = 2');
        assert.deepStrictEqual(connection.inTransaction, false);
        assert.strictEqual(x.rows.length, 1);
        assert.deepStrictEqual(x.rows[0][0], 2);

        await connection.query('ROLLBACK');
        assert.deepStrictEqual(connection.inTransaction, false);

        x = await connection.query('select * from test.dummy_table1 where id = 2');
        assert.deepStrictEqual(connection.inTransaction, false);
        assert.strictEqual(x.rows.length, 1);
        assert.deepStrictEqual(x.rows[0][0], 2);

        await connection.close();
    });

    it('should automatically start transaction when autoCommit = false (query)', async function () {
        connection = new Connection({autoCommit: false});
        await connection.connect();
        assert.strictEqual(connection.inTransaction, false);

        await connection.query('insert into test.dummy_table1 (id) values (3)');
        assert.strictEqual(connection.inTransaction, true);

        let x = await connection.query('select * from test.dummy_table1 where id = 3');
        assert.strictEqual(connection.inTransaction, true);
        assert.strictEqual(x.rows.length, 1);
        assert.strictEqual(x.rows[0][0], 3);

        await connection.query('ROLLBACK');
        assert.strictEqual(connection.inTransaction, false);

        x = await connection.query('select * from test.dummy_table1 where id = 3');
        assert.strictEqual(connection.inTransaction, true);
        assert.strictEqual(x.rows.length, 0);

        await connection.close();
    });


});
