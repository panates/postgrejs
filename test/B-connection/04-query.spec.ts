import assert from 'assert';
import { Connection, Cursor } from 'postgresql-client';
import { createTestSchema } from '../_support/create-db.js';

(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

describe('query() (Extended Query)', function () {
  let connection: Connection;

  beforeAll(async () => {
    connection = new Connection();
    await connection.connect();
    await createTestSchema(connection);
  });

  afterAll(async () => {
    await connection.close();
  });

  it('should return QueryResult', async function () {
    const result = await connection.query(`select * from countries order by code`);
    expect(result).toBeDefined();
    expect(result.fields).toBeDefined();
    expect(result.rows).toBeDefined();
    expect(result.executeTime).toBeDefined();
    expect(result.command).toStrictEqual('SELECT');
    assert(result.fields);
    expect(result.fields[0].fieldName).toStrictEqual('code');
    expect(result.fields[1].fieldName).toStrictEqual('name');
    assert(result.rows);
    expect(result.rows[0][0]).toStrictEqual('CA');
    expect(result.rows[0][1]).toStrictEqual('Canada');
  });

  it('should return object rows', async function () {
    const result = await connection.query(`select * from countries order by code`, { objectRows: true });
    expect(result).toBeDefined();
    expect(result.command).toStrictEqual('SELECT');
    assert(result.fields);
    expect(result.fields[0].fieldName).toStrictEqual('code');
    expect(result.fields[1].fieldName).toStrictEqual('name');
    assert(result.rows);
    expect(result.rows[0].code).toStrictEqual('CA');
    expect(result.rows[0].name).toStrictEqual('Canada');
  });

  it('should limit number of returning rows with "fetchCount" property', async function () {
    const result = await connection.query(`select * from customers`, { fetchCount: 10 });
    expect(result).toBeDefined();
    expect(result.command).toStrictEqual('SELECT');
    expect(result.rowType).toStrictEqual('array');
    assert(result.rows);
    expect(result.rows.length).toStrictEqual(10);
  });

  it('should check "fetchCount" value range', async function () {
    await expect(() => connection.query(`select * from customers`, { fetchCount: -1 })).rejects.toThrow(
      'fetchCount can be between',
    );
    await expect(() => connection.query(`select * from customers`, { fetchCount: 4294967296 })).rejects.toThrow(
      'fetchCount can be between',
    );
  });

  it('should use bind parameters', async function () {
    const result = await connection.query(`select * from customers where id=$1`, { params: [1], objectRows: true });
    expect(result).toBeDefined();
    expect(result.command).toStrictEqual('SELECT');
    expect(result.rowType).toStrictEqual('object');
    assert(result.rows);
    expect(result.rows.length).toStrictEqual(1);
    expect(result.rows[0].id).toStrictEqual(1);
    expect(result.rows[0].given_name).toStrictEqual('Wynne');
  });

  it('should pass null value to bind parameters', async function () {
    const result = await connection.query(`select * from customers where id=$1`, { params: [null], objectRows: true });
    expect(result).toBeDefined();
  });

  it('should detect bool value when binding parameters', async function () {
    const result = await connection.query(`select f_bool from data_types where f_bool = $1`, {
      params: [true],
      objectRows: false,
    });
    expect(result).toBeDefined();
    assert(result.rows);
    expect(result.rows.length).toStrictEqual(1);
    expect(result.rows[0][0]).toStrictEqual(true);
  });

  it('should detect uuid value when binding parameters', async function () {
    const result = await connection.query(`select f_uuid from data_types where f_uuid = $1`, {
      params: ['87d48838-02b3-4e26-8fec-bcc8c00e3772'],
      objectRows: false,
    });
    expect(result).toBeDefined();
    assert(result.rows);
    expect(result.rows.length).toStrictEqual(1);
    expect(result.rows[0][0]).toStrictEqual('87d48838-02b3-4e26-8fec-bcc8c00e3772');
  });

  it('should use bind array parameters', async function () {
    let result = await connection.query(`select * from customers where id = ANY($1)`, {
      params: [[1, 2, 3]],
      objectRows: true,
    });
    expect(result).toBeDefined();
    expect(result.command).toStrictEqual('SELECT');
    expect(result.rowType).toStrictEqual('object');
    assert(result.rows);
    expect(result.rows.length).toStrictEqual(3);
    expect(result.rows[0].id).toStrictEqual(1);
    expect(result.rows[1].id).toStrictEqual(2);
    expect(result.rows[2].id).toStrictEqual(3);

    const arr = ['DE', 'US', 'TR'];
    result = await connection.query(`select * from customers where country_code = ANY($1)`, {
      params: [arr],
      objectRows: true,
    });
    expect(result).toBeDefined();
    expect(result.command).toStrictEqual('SELECT');
    expect(result.rowType).toStrictEqual('object');
    assert(result.rows);
    for (const row of result.rows) {
      expect(arr).toContain(row.country_code);
    }
  });

  it('should wrap undefined parameters to null ', async function () {
    const result = await connection.query(`select $1`, { params: [null], objectRows: false });
    expect(result).toBeDefined();
    assert(result.rows);
    expect(result.rows.length).toStrictEqual(1);
    expect(result.rows[0][0]).toStrictEqual(null);
  });

  it('should return cursor', async function () {
    const result = await connection.query(`select * from customers`, { objectRows: true, cursor: true });
    expect(result).toBeDefined();
    expect(result.cursor).toBeDefined();
    expect(result.cursor).toBeInstanceOf(Cursor);
  });

  it('should select sql return data rows', async function () {
    const result = await connection.query(`select * from data_types`, { objectRows: true });
    expect(result).toBeDefined();
    expect(result.rows).toBeDefined();
    assert(result.rows);
    const row = result.rows[0];
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
    expect(row.f_xml).toStrictEqual('<tag1>123</tag1>');
    expect(row.f_date).toStrictEqual(new Date('2010-03-22T00:00:00'));
    expect(row.f_timestamp).toStrictEqual(new Date('2020-01-10T15:45:12.123'));
    expect(row.f_timestamptz).toStrictEqual(new Date('2005-07-01T01:21:11.123+03:00'));
    expect(row.f_bytea).toStrictEqual(Buffer.from([65, 66, 67, 68, 69]));
    expect(row.f_point).toStrictEqual({ x: -1.2, y: 3.5 });
    expect(row.f_circle).toStrictEqual({ x: -1.2, y: 3.5, r: 4.6 });
    expect(row.f_lseg).toStrictEqual({ x1: 1.2, y1: 3.5, x2: 4.6, y2: 5.2 });
    expect(row.f_box).toStrictEqual({ x1: 4.6, y1: 3, x2: -1.6, y2: 0.1 });
  });

  it('should not crash protocol on invalid query ', async function () {
    await expect(() => connection.query(`invalid sql`)).rejects.toThrow('invalid');
    await connection.execute('select 1');
  });
});
