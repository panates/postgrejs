import assert from 'assert';
import '../_support/env';
import {Connection, Cursor} from '../../src';
import {createTestSchema} from '../_support/createdb';

describe('query() (Extended Query)', function () {

    let connection: Connection;

    before(async () => {
        connection = new Connection();
        await connection.connect();
        await createTestSchema(connection);
    })

    after(async () => {
        await connection.close();
    })

    it('should return QueryResult', async function () {
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

    it('should return object rows', async function () {
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
        assert.strictEqual(result.rowType, 'array');
        assert.strictEqual(result.rows.length, 10);
    });

    it('should use bind parameters', async function () {
        const result = await connection.query(`select * from test.airports where id=$1`,
            {params: ['ARGNT'], objectRows: true});
        assert.ok(result);
        assert.strictEqual(result.command, 'SELECT');
        assert.strictEqual(result.rowType, 'object');
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

    it('should select sql return data rows', async function () {
        const result = await connection.query(`select * from test.data_types`,
            {objectRows: true});
        assert.ok(result);
        assert.ok(result.rows);
        const row = result.rows[0];
        assert.ok(row);
        assert.deepStrictEqual(row.id, 1);
        assert.deepStrictEqual(row.f_int2, 1);
        assert.deepStrictEqual(row.f_int4, 12345);
        assert.deepStrictEqual(row.f_int8, BigInt('1234567890123'));
        assert.deepStrictEqual(row.f_float4, 1.2);
        assert.deepStrictEqual(row.f_float8, 5.12345);
        assert.deepStrictEqual(row.f_char, 'a');
        assert.deepStrictEqual(row.f_varchar, 'abcd');
        assert.deepStrictEqual(row.f_text, 'abcde');
        assert.deepStrictEqual(row.f_bpchar, 'abcdef');
        assert.deepStrictEqual(row.f_json, '{"a": 1}');
        assert.deepStrictEqual(row.f_xml, '<tag1>123</tag1>');
        assert.deepStrictEqual(row.f_date, new Date('2010-03-22T00:00:00'));
        assert.deepStrictEqual(row.f_timestamp, new Date('2020-01-10T15:45:12.123'));
        assert.deepStrictEqual(row.f_timestamptz, new Date('2005-07-01T01:21:11.123+03:00'));
        assert.deepStrictEqual(row.f_bytea, Buffer.from([65, 66, 67, 68, 69]));
        assert.deepStrictEqual(row.f_point, {x: -1.2, y: 3.5});
        assert.deepStrictEqual(row.f_circle, {x: -1.2, y: 3.5, r: 4.6});
        assert.deepStrictEqual(row.f_lseg, {x1: 1.2, y1: 3.5, x2: 4.6, y2: 5.2});
        assert.deepStrictEqual(row.f_box, {x1: 4.6, y1: 3, x2: -1.6, y2: 0.1});
    });

    it('should not crash protocol on invalid query ', async function () {
        await assert.rejects(() => connection.query(`invalid sql`));
        await connection.execute('select 1');
    });

});
