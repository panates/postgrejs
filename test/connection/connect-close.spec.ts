import assert from 'assert';
import net from "net";
import '../_support/env';
import {Connection, ConnectionState} from '../../src';

describe('Connect & Close', function () {

    after(async () => {
        if (connection)
            await connection.close(true);
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
