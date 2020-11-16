import assert from 'assert';
import '../_support/env';
import {DataTypeOIDs, Pool} from '../../src';

describe('Pool', function () {

    let pool: Pool;

    before(async () => {
        pool = new Pool();
    })

    after(async () => {
        await pool.close(0);
    })

    it('should acquire connection', async function () {
        assert.strictEqual(pool.totalConnections, 0);
        const connection = await pool.acquire();
        assert.strictEqual(pool.totalConnections, 1);
        assert.strictEqual(pool.acquiredConnections, 1);
        assert.ok(connection);
        await connection.close();
        assert.strictEqual(pool.acquiredConnections, 0);
    });

    it('should execute simple query', async function () {
        const result = await pool.execute(`select 1`);
        assert.strictEqual(pool.acquiredConnections, 0);
        assert.ok(result);
        assert.strictEqual(result.totalCommands, 1);
        assert.strictEqual(result.results.length, 1);
        assert.strictEqual(result.results[0].command, 'SELECT');
    });

    it('should create a prepared statement, execute and release connection', async function () {
        const statement = await pool.prepare(`select $1`, {paramTypes: [DataTypeOIDs.int4]});
        assert.strictEqual(pool.acquiredConnections, 1);
        assert.ok(statement);
        const result = await statement.execute({params: [1234]});
        assert.strictEqual(pool.acquiredConnections, 1);
        assert.ok(result);
        assert.strictEqual(result.rows[0][0], 1234);
        await new Promise((resolve, reject) => {
            pool.once('release', resolve);
            statement.close().catch(reject);
        });
        assert.strictEqual(pool.acquiredConnections, 0);
    });

    it('should execute extended query', async function () {
        const result = await pool.query(`select $1`, {params: [1234]});
        assert.strictEqual(pool.acquiredConnections, 0);
        assert.ok(result);
        assert.ok(result.fields);
        assert.ok(result.rows);
        assert.strictEqual(result.command, 'SELECT');
        assert.strictEqual(result.rows[0][0], 1234);
    });

    it('should close all connections and shutdown pool', async function () {
        assert.strictEqual(pool.totalConnections, 1);
        assert.strictEqual(pool.acquiredConnections, 0);
        await pool.close();
        assert.strictEqual(pool.totalConnections, 0);
    });

});
