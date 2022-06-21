import '../_support/env';
import assert from 'assert';
import {Connection} from '../../src';
import {createTestSchema} from '../_support/create-db';

describe('execute() (Simple Query)', function () {

  let connection: Connection;

  beforeAll(async () => {
    connection = new Connection();
    await connection.connect();
  })

  afterAll(async () => {
    await connection.close(0);
  })

  it('should execute sql script', async function () {
    const result = await connection.execute(`select 1;`);
    assert.ok(result);
    assert.strictEqual(result.totalCommands, 1);
    assert.strictEqual(result.results.length, 1);
    assert.strictEqual(result.results[0].command, 'SELECT');
  });

  it('should execute multiple sql script', async function () {
    const result = await connection.execute(`begin; select 1; select 2; end;`);
    assert.ok(result);
    assert.strictEqual(result.totalCommands, 4);
    assert.strictEqual(result.results.length, 4);
    assert.strictEqual(result.results[0].command, 'BEGIN');
    assert.strictEqual(result.results[1].command, 'SELECT');
    assert.strictEqual(result.results[2].command, 'SELECT');
    assert.strictEqual(result.results[3].command, 'COMMIT');
  });

  it('should return fields info', async function () {
    const result = await connection.execute(`select 1 as one, 'two'::varchar as two `);
    assert.ok(result);
    assert.strictEqual(result.totalCommands, 1);
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
    assert.strictEqual(result.results[0].rowType, 'array');
    assert.ok(Array.isArray(result.results[0].rows[0]));
    assert.deepStrictEqual(result.results[0].rows[0], [1, 'two']);
  });

  it('should return object rows if required', async function () {
    const result = await connection.execute(`select 1 as one, 'two'::varchar as two `,
      {objectRows: true});
    assert.ok(result);
    assert.ok(result.results[0].rows);
    assert.strictEqual(result.results[0].rowType, 'object');
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

  it('create test schema', async function () {
    await createTestSchema(connection);
  });

  it('should select sql return data rows', async function () {
    const result = await connection.execute(`select * from test.data_types`,
      {objectRows: true});
    assert.ok(result);
    assert.ok(result.results[0].rows);
    const row = result.results[0].rows[0];
    assert.ok(row);
    assert.deepStrictEqual(row.id, 1);
    assert.deepStrictEqual(row.f_int2, 1);
    assert.deepStrictEqual(row.f_int4, 12345);
    assert.deepStrictEqual(row.f_int8, BigInt('9007199254740995'));
    assert.deepStrictEqual(row.f_float4, 1.2);
    assert.deepStrictEqual(row.f_float8, 5.12345);
    assert.deepStrictEqual(row.f_char, 'a');
    assert.deepStrictEqual(row.f_varchar, 'abcd');
    assert.deepStrictEqual(row.f_text, 'abcde');
    assert.deepStrictEqual(row.f_bpchar, 'abcdef');
    assert.deepStrictEqual(row.f_json, {"a": 1});
    assert.deepStrictEqual(row.f_jsonb, {"a": 1});
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

  it('should return all rows', async function () {
    const result = await connection.execute(`select * from countries`,
      {objectRows: true});
    assert.ok(result);
    assert.ok(result.results[0].rows);
    assert.strictEqual(result.results[0].rows.length, 4);
  });

});
