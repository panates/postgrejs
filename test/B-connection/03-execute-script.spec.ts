import { Connection } from 'postgresql-client';
import { createTestSchema } from '../_support/create-db.js';

describe('execute() (Simple Query)', function () {
  let connection: Connection;

  beforeAll(async () => {
    connection = new Connection();
    await connection.connect();
  });

  afterAll(async () => {
    await connection.close(0);
  });

  it('should execute sql script', async function () {
    const result = await connection.execute(`select 1;`);
    expect(result).toBeDefined();
    expect(result.totalCommands).toStrictEqual(1);
    expect(result.results.length).toStrictEqual(1);
    expect(result.results[0].command).toStrictEqual('SELECT');
  });

  it('should execute multiple sql script', async function () {
    const result = await connection.execute(`begin; select 1; select 2; end;`);
    expect(result).toBeDefined();
    expect(result.totalCommands).toStrictEqual(4);
    expect(result.results.length).toStrictEqual(4);
    expect(result.results[0].command).toStrictEqual('BEGIN');
    expect(result.results[1].command).toStrictEqual('SELECT');
    expect(result.results[2].command).toStrictEqual('SELECT');
    expect(result.results[3].command).toStrictEqual('COMMIT');
  });

  it('should return fields info', async function () {
    const result = await connection.execute(`select 1 as one, 'two'::varchar as two `);
    expect(result).toBeDefined();
    expect(result.totalCommands).toStrictEqual(1);
    expect(result.results[0].fields).toBeDefined();
    expect(result.results[0].fields?.length).toStrictEqual(2);
    expect(result.results[0].fields?.[0].fieldName).toStrictEqual('one');
    expect(result.results[0].fields?.[0].fixedSize).toStrictEqual(4);
    expect(result.results[0].fields?.[1].fieldName).toStrictEqual('two');
    expect(result.results[0].fields?.[1].fixedSize).not.toBeDefined();
  });

  it('should return rows', async function () {
    const result = await connection.execute(`select 1 as one, 'two'::varchar as two `);
    expect(result).toBeDefined();
    expect(result.results[0].rows).toBeDefined();
    expect(result.results[0].rowType).toStrictEqual('array');
    expect(Array.isArray(result.results[0].rows?.[0])).toStrictEqual(true);
    expect(result.results[0].rows?.[0]).toStrictEqual([1, 'two']);
  });

  it('should return object rows if required', async function () {
    const result = await connection.execute(`select 1 as one, 'two'::varchar as two `, { objectRows: true });
    expect(result).toBeDefined();
    expect(result.results[0].rows).toBeDefined();
    expect(result.results[0].rowType).toStrictEqual('object');
    expect(Array.isArray(result.results[0].rows?.[0])).toStrictEqual(false);
    expect(result.results[0].rows?.[0]).toStrictEqual({ one: 1, two: 'two' });
  });

  it('should use a queue and execute one by one', async function () {
    const promises: Promise<any>[] = [];
    promises.push(connection.execute(`select 1`));
    promises.push(connection.execute(`select 2`));
    promises.push(connection.execute(`select 3`));
    const x = await Promise.all(promises);
    expect(x).toBeDefined();
    expect(x.length).toStrictEqual(3);
    expect(x[0].results[0].rows[0][0]).toStrictEqual(1);
    expect(x[1].results[0].rows[0][0]).toStrictEqual(2);
    expect(x[2].results[0].rows[0][0]).toStrictEqual(3);
  });

  it('create test schema', async function () {
    await createTestSchema(connection);
  });

  it('should select sql return data rows', async function () {
    const result = await connection.execute(`select * from test.data_types`, { objectRows: true });
    expect(result).toBeDefined();
    expect(result.results[0].rows).toBeDefined();
    const row = result.results[0].rows?.[0];
    expect(row).toBeDefined();
    expect(row.id).toStrictEqual(1);
    expect(row.f_int2).toStrictEqual(1);
    expect(row.f_int4).toStrictEqual(12345);
    expect(row.f_int8).toStrictEqual(BigInt('9007199254740995'));
    expect(row.f_float4).toStrictEqual(1.2);
    expect(row.f_float8).toStrictEqual(5.12345);
    expect(row.f_char).toStrictEqual('a');
    expect(row.f_varchar).toStrictEqual('abcd');
    expect(row.f_text).toStrictEqual('abcde');
    expect(row.f_bpchar).toStrictEqual('abcdef');
    expect(row.f_json).toStrictEqual({ a: 1 });
    expect(row.f_jsonb).toStrictEqual({ a: 1 });
    expect(row.f_xml).toStrictEqual('<tag1>123</tag1>');
    expect(row.f_date).toStrictEqual(new Date('2010-03-22T00:00:00'));
    expect(row.f_timestamp).toStrictEqual(new Date('2020-01-10T15:45:12.123'));
    expect(row.f_timestamptz).toStrictEqual(new Date('2005-07-01T01:21:11.123+03:00'));
    expect(row.f_bytea).toStrictEqual(Buffer.from([65, 66, 67, 68, 69]));
    expect(row.f_point).toStrictEqual({ x: -1.2, y: 3.5 });
    expect(row.f_circle).toStrictEqual({ x: -1.2, y: 3.5, r: 4.6 });
    expect(row.f_lseg).toStrictEqual({ x1: 1.2, y1: 3.5, x2: 4.6, y2: 5.2 });
    expect(row.f_box).toStrictEqual({ x1: 4.6, y1: 3, x2: -1.6, y2: 0.1 });
    expect(row.f_int2_vector).toStrictEqual([1, 3, 5]);
  });

  it('should return all rows', async function () {
    const result = await connection.execute(`select * from countries`, { objectRows: true });
    expect(result).toBeDefined();
    expect(result.results[0].rows).toBeDefined();
    expect(result.results[0].rows?.length).toStrictEqual(4);
  });
});
