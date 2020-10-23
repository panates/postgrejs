import assert from 'assert';
import '../_support/env';
import {Connection} from '../../src';

describe('Query (Extended Query)', function () {

    let connection: Connection;

    before(async () => {
        connection = new Connection(process.env.DB_URL);
        await connection.connect();
    })

    after(async () => {
        await connection.close(0);
    })

    it('should query return QueryResult', async function () {
        const result = await connection.query(`select 1 as f1`);
        assert.ok(result);
        assert.ok(result.fields);
        assert.ok(result.rows);
        assert.notStrictEqual(result.prepareTime, undefined);
        assert.notStrictEqual(result.executeTime, undefined);
        assert.notStrictEqual(result.totalTime, undefined);
        assert.strictEqual(result.command, 'SELECT');
        assert.strictEqual(result.fields[0].fieldName, 'f1');
        assert.strictEqual(result.rows[0][0], 1);
    });

    it('should query return object rows', async function () {
        const result = await connection.query(`select 1 as f1, 'two'::varchar as f2 `,
            {objectRows: true});
        assert.ok(result);
        assert.strictEqual(result.command, 'SELECT');
        assert.strictEqual(result.fields[0].fieldName, 'f1');
        assert.strictEqual(result.fields[1].fieldName, 'f2');
        assert.strictEqual(result.rows[0].f1, 1);
        assert.strictEqual(result.rows[0].f2, 'two');
    });

    it('should "fetchCount" property limit number of returning rows', async function () {
        const result = await connection.query(`SELECT a.n from generate_series(1, 20) as a(n)`,
            {fetchCount: 10});
        assert.ok(result);
        assert.strictEqual(result.command, 'SELECT');
        assert.strictEqual(result.rows.length, 10);
    });

});
