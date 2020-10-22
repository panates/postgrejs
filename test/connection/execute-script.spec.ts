import assert from 'assert';
import '../_support/env';
import {Connection} from '../../src';

describe('Execute script (Simple Query)', function () {

    let connection: Connection;

    before(async () => {
        connection = new Connection(process.env.DB_URL);
        await connection.connect();
    })

    after(async () => {
        await connection.close(true);
    })

    it('should execute sql script', async function () {
        const result = await connection.execute(`select 1`);
        assert.ok(result);
        assert.strictEqual(result.results.length, 1);
        assert.strictEqual(result.results[0].command, 'SELECT');
    });

    it('should execute multiple sql script', async function () {
        const result = await connection.execute(`begin; select 1; end;`);
        assert.ok(result);
        assert.strictEqual(result.results.length, 3);
        assert.strictEqual(result.results[0].command, 'BEGIN');
        assert.strictEqual(result.results[1].command, 'SELECT');
        assert.strictEqual(result.results[2].command, 'COMMIT');
    });

    it('should return fields info', async function () {
        const result = await connection.execute(`select 1 as one, 'two'::varchar as two `);
        assert.ok(result);
        assert.ok(result.results[0].fields);
        assert.strictEqual(result.results[0].fields.length, 2);
        assert.strictEqual(result.results[0].fields[0].fieldName, 'one');
        assert.strictEqual(result.results[0].fields[0].fixedSize, 4);
        assert.strictEqual(result.results[0].fields[1].fieldName, 'two');
        assert.strictEqual(result.results[0].fields[1].fixedSize, undefined);
    });

    it('should return rows', async function () {
        const result = await connection.execute(`select 1 as one, 'two'::varchar as two `);
        assert.ok(result);
        assert.ok(result.results[0].rows);
        assert.ok(Array.isArray(result.results[0].rows[0]));
        assert.deepStrictEqual(result.results[0].rows[0], [1, 'two']);
    });

    it('should return object rows if required', async function () {
        const result = await connection.execute(`select 1 as one, 'two'::varchar as two `,
            {objectRows: true});
        assert.ok(result);
        assert.ok(result.results[0].rows);
        assert.ok(!Array.isArray(result.results[0].rows[0]));
        assert.deepStrictEqual(result.results[0].rows[0], {one: 1, two: 'two'});
    });

    it('should use a queue and execute one by one', async function () {
        const promises = [];
        promises.push(connection.execute(`select 1`));
        promises.push(connection.execute(`select 2`));
        promises.push(connection.execute(`select 3`));
        const x = await Promise.all(promises);
        assert.ok(x);
        assert.strictEqual(x.length, 3);
        assert.strictEqual(x[0].results[0].rows[0][0], 1);
        assert.strictEqual(x[1].results[0].rows[0][0], 2);
        assert.strictEqual(x[2].results[0].rows[0][0], 3);
    });

});
