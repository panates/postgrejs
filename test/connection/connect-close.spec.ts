import assert from 'assert';
import net from "net";
import '../_support/env';
import {Connection, ConnectionState, ScriptExecutor} from '../../src';

describe('Connect & Close', function () {

    after(async () => {
        if (connection)
            await connection.close(0);
    })
    let connection: Connection;

    it('should emit "connecting" and "ready" events while connect', async function () {
        connection = new Connection(process.env.DB_URL);
        const events = [];
        connection.on('connecting', () => events.push('connecting'));
        connection.on('ready', () => events.push('ready'));
        await connection.connect();
        assert.ok(events.includes('connecting'), 'connecting event is not called');
        assert.ok(events.includes('ready'), 'ready event is not called');
        assert.strictEqual(connection.state, ConnectionState.READY);
    });

    it('should emit "close" event while close', async function () {
        const events = [];
        connection.on('close', () => events.push('close'));
        await connection.close();
        assert.ok(events.includes('close'), 'close event is not called');
        assert.strictEqual(connection.state, ConnectionState.CLOSED);
    });

    it('should wait for active query before terminate', async function () {
        const connection1 = new Connection(process.env.DB_URL);
        await connection1.connect();
        let terminated = false;
        const startTime = Date.now();
        connection1.on('terminate', () => terminated = true);
        connection1['_activeQuery'] = new ScriptExecutor(connection1);
        await connection1.close(500);
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
