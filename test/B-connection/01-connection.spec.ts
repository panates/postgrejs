import assert from 'assert';
import net from "net";
import '../_support/env';
import {Connection, ConnectionState, ScriptExecutor} from '../../src';

describe('Connection', function () {

    let connection: Connection;

    after(async () => {
        if (connection)
            await connection.close(0);
    })

    it('should connect', async function () {
        connection = new Connection();
        await connection.connect();
        assert.strictEqual(connection.state, ConnectionState.READY);
    });

    it('should execute simple query', async function () {
        const result = await connection.execute(`select 1`);
        assert.ok(result);
        assert.strictEqual(result.totalCommands, 1);
        assert.strictEqual(result.results.length, 1);
        assert.strictEqual(result.results[0].command, 'SELECT');
    });

    it('should execute extended query', async function () {
        const result = await connection.query(`select $1`, {params: [1234]});
        assert.ok(result);
        assert.ok(result.fields);
        assert.ok(result.rows);
        assert.strictEqual(result.command, 'SELECT');
        assert.strictEqual(result.rows[0][0], 1234);
    });

    it('should close', async function () {
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
        connection = new Connection(process.env.PGHOST);
        await connection.connect();
        let terminated = false;
        const startTime = Date.now();
        connection.on('terminate', () => terminated = true);
        connection['_activeQuery'] = new ScriptExecutor(connection);
        await connection.close(500);
        assert.strictEqual(terminated, true);
        assert.ok(Date.now() - startTime >= 500);
    });

    it('create emit error on early disconnect', function (done) {
        const server = net.createServer((socket) => {
            socket.destroy();
        });
        server.listen(7777, function () {
            connection = new Connection('postgres://localhost:7777')
            assert.rejects(() =>
                connection.connect(), /ECONNRESET/)
                .then(done)
                .catch(done)
                .then(() => {
                    server.close();
                });
        });
    });

});
