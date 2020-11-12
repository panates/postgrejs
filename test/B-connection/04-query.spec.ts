import assert from 'assert';
import '../_support/env';
import {Connection} from '../../src';
import {createTestSchema} from '../_support/createdb';
import {Cursor} from '../../src/Cursor';

describe('Query (Extended Query)', function () {

    let connection: Connection;

    before(async () => {
        connection = new Connection();
        await connection.connect();
        await createTestSchema(connection);
    })

    after(async () => {
        await connection.close(0);
    })

    it('should query return QueryResult', async function () {
        const result = await connection.query(`select * from test.regions`);
        assert.ok(result);
        assert.ok(result.fields);
        assert.ok(result.rows);
        assert.notStrictEqual(result.executeTime, undefined);
        assert.strictEqual(result.command, 'SELECT');
        assert.strictEqual(result.fields[0].fieldName, 'id');
        assert.strictEqual(result.fields[1].fieldName, 'name');
        assert.strictEqual(result.rows[0][0], 'US');
        assert.strictEqual(result.rows[0][1], 'US Region');
    });

    it('should query return object rows', async function () {
        const result = await connection.query(`select * from test.regions order by ID desc`,
            {objectRows: true});
        assert.ok(result);
        assert.strictEqual(result.command, 'SELECT');
        assert.strictEqual(result.fields[0].fieldName, 'id');
        assert.strictEqual(result.fields[1].fieldName, 'name');
        assert.strictEqual(result.rows[0].id, 'US');
        assert.strictEqual(result.rows[0].name, 'US Region');
    });

    it('should limit number of returning rows with "fetchCount" property', async function () {
        const result = await connection.query(`select * from test.airports`,
            {fetchCount: 10});
        assert.ok(result);
        assert.strictEqual(result.command, 'SELECT');
        assert.strictEqual(result.rows.length, 10);
    });

    it('should use bind parameters', async function () {
        const result = await connection.query(`select * from test.airports where id=$1`,
            {params: ['ARGNT'], objectRows: true});
        assert.ok(result);
        assert.strictEqual(result.command, 'SELECT');
        assert.strictEqual(result.rows.length, 1);
        assert.strictEqual(result.rows[0].id, 'ARGNT');
    });

    it('should return cursor', async function () {
        const result = await connection.query(`select * from test.airports`,
            {objectRows: true, cursor: true});
        assert.ok(result);
        assert.ok(result.cursor);
        assert.ok(result.cursor instanceof Cursor);
    });

});
