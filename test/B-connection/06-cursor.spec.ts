import { Connection } from 'postgresql-client';
import { createTestSchema } from '../_support/create-db.js';

describe('Cursor support', () => {
  let connection: Connection;

  beforeAll(async () => {
    connection = new Connection();
    await connection.connect();
    await createTestSchema(connection);
  });

  afterAll(async () => {
    await connection.close(0);
  });

  it('should next() fetch next row', async () => {
    const result = await connection.query(`select * from customers order by id`, { objectRows: false, cursor: true });
    const cursor = result.cursor;
    expect(cursor).toBeDefined();
    const row = await cursor?.next();
    expect(row[0]).toStrictEqual(1);
    await cursor?.close();
  });

  it('should next() fetch next row as object', async () => {
    const result = await connection.query(`select * from customers order by id`, { objectRows: true, cursor: true });
    const cursor = result.cursor;
    expect(cursor).toBeDefined();
    const row = await cursor?.next();
    expect(row).toBeDefined();
    expect(row.id).toStrictEqual(1);
    await cursor?.close();
  });

  it('should fetch() fetch multiple rows', async () => {
    const result = await connection.query(`select * from customers order by id`, {
      objectRows: false,
      cursor: true,
      fetchCount: 5,
    });
    const cursor = result.cursor;
    expect(cursor).toBeDefined();
    const rows = await cursor?.fetch(10);
    expect(rows?.length).toStrictEqual(10);
    expect(rows?.[0][0]).toStrictEqual(1);
    await cursor?.close();
  });

  it('should automatically close cursor after fetching all rows', async () => {
    const result = await connection.query(`select * from customers limit 10`, { objectRows: true, cursor: true });
    const cursor = result.cursor;
    expect(cursor).toBeDefined();
    let closed = false;
    cursor?.on('close', () => (closed = true));
    // eslint-disable-next-line no-empty
    while (await cursor?.next()) {}
    expect(closed).toStrictEqual(true);
    expect(cursor?.isClosed).toStrictEqual(true);
  });

  it('should emit "close" event', async () => {
    const result = await connection.query(`select * from customers order by id`, { objectRows: true, cursor: true });
    const cursor = result.cursor;
    expect(cursor).toBeDefined();
    let closed = false;
    cursor?.on('close', () => (closed = true));
    await cursor?.next();
    await cursor?.close();
    expect(closed).toStrictEqual(true);
    expect(cursor?.isClosed).toStrictEqual(true);
  });

  it('should emit "fetch" event', async () => {
    const result = await connection.query(`select * from customers limit 10`, { objectRows: true, cursor: true });
    const cursor = result.cursor;
    expect(cursor).toBeDefined();
    let count = 0;
    cursor?.on('fetch', rows => (count += rows.length));
    await cursor?.next();
    await cursor?.close();
    expect(count).toStrictEqual(10);
  });

  it('should automatically close with "using" syntax', async () => {
    let closed = false;
    {
      const result = await connection.query(`select * from customers order by id`, { objectRows: false, cursor: true });
      await using cursor = result.cursor!;
      expect(cursor).toBeDefined();
      cursor.on('close', () => (closed = true));
      const row = await cursor?.next();
      expect(row[0]).toStrictEqual(1);
    }
    expect(closed).toStrictEqual(true);
  });
});
