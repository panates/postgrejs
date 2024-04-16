import { DataTypeOIDs, Pool } from 'postgresql-client';

describe('Pool', function () {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool();
  });

  afterAll(async () => {
    await pool.close(0);
  });

  it('should acquire connection', async function () {
    expect(pool.totalConnections).toStrictEqual(0);
    const connection = await pool.acquire();
    expect(pool.totalConnections).toStrictEqual(1);
    expect(pool.acquiredConnections).toStrictEqual(1);
    expect(connection).toBeDefined();
    await connection.close();
    expect(pool.acquiredConnections).toStrictEqual(0);
  });

  it('should execute simple query', async function () {
    const result = await pool.execute(`select 1`);
    expect(pool.acquiredConnections).toStrictEqual(0);
    expect(result).toBeDefined();
    expect(result.totalCommands).toStrictEqual(1);
    expect(result.results.length).toStrictEqual(1);
    expect(result.results[0].command).toStrictEqual('SELECT');
  });

  it('should create a prepared statement, execute and release connection', async function () {
    const statement = await pool.prepare(`select $1`, { paramTypes: [DataTypeOIDs.int4] });
    expect(pool.acquiredConnections).toStrictEqual(1);
    expect(statement).toBeDefined();
    const result = await statement.execute({ params: [1234] });
    expect(pool.acquiredConnections).toStrictEqual(1);
    expect(result).toBeDefined();
    expect(result.rows?.[0][0]).toStrictEqual(1234);
    await new Promise((resolve, reject) => {
      pool.once('release', resolve);
      statement.close().catch(reject);
    });
    expect(pool.acquiredConnections).toStrictEqual(0);
  });

  it('should execute extended query', async function () {
    const result = await pool.query(`select $1`, { params: [1234] });
    expect(pool.acquiredConnections).toStrictEqual(0);
    expect(result).toBeDefined();
    expect(result.fields).toBeDefined();
    expect(result.rows).toBeDefined();
    expect(result.command).toStrictEqual('SELECT');
    expect(result.rows?.[0][0]).toStrictEqual(1234);
  });

  it('should close all connections and shutdown pool', async function () {
    expect(pool.totalConnections).toStrictEqual(1);
    expect(pool.acquiredConnections).toStrictEqual(0);
    await pool.close();
    expect(pool.totalConnections).toStrictEqual(0);
  });
});
