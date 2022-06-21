import assert from "assert";
import "../_support/env";
import { Connection } from "../../src";
import { createTestSchema } from "../_support/create-db";

describe("Cursor support", function () {
  let connection: Connection;

  beforeAll(async () => {
    connection = new Connection();
    await connection.connect();
    await createTestSchema(connection);
  });

  afterAll(async () => {
    await connection.close(0);
  });

  it("should next() fetch next row", async function () {
    const result = await connection.query(`select * from customers order by id`, { objectRows: false, cursor: true });
    const cursor = result.cursor;
    assert.ok(cursor);
    const row = await cursor.next();
    assert.deepStrictEqual(row[0], 1);
    await cursor.close();
  });

  it("should next() fetch next row as object", async function () {
    const result = await connection.query(`select * from customers order by id`, { objectRows: true, cursor: true });
    const cursor = result.cursor;
    assert.ok(cursor);
    const row = await cursor.next();
    assert.deepStrictEqual(row && row.id, 1);
    await cursor.close();
  });

  it("should fetch() fetch multiple rows", async function () {
    const result = await connection.query(`select * from customers order by id`, {
      objectRows: false,
      cursor: true,
      fetchCount: 5,
    });
    const cursor = result.cursor;
    assert.ok(cursor);
    const rows = await cursor.fetch(10);
    assert.strictEqual(rows.length, 10);
    assert.deepStrictEqual(rows[0][0], 1);
    await cursor.close();
  });

  it("should automatically close cursor after fetching all rows", async function () {
    const result = await connection.query(`select * from customers limit 10`, { objectRows: true, cursor: true });
    const cursor = result.cursor;
    assert.ok(cursor);
    let closed = false;
    cursor.on("close", () => (closed = true));
    while (await cursor.next()) {}
    assert.strictEqual(closed, true);
    assert.strictEqual(cursor.isClosed, true);
  });

  it('should emit "close" event', async function () {
    const result = await connection.query(`select * from customers order by id`, { objectRows: true, cursor: true });
    const cursor = result.cursor;
    assert.ok(cursor);
    let closed = false;
    cursor.on("close", () => (closed = true));
    await cursor.next();
    await cursor.close();
    assert.strictEqual(closed, true);
    assert.strictEqual(cursor.isClosed, true);
  });

  it('should emit "fetch" event', async function () {
    const result = await connection.query(`select * from customers limit 10`, { objectRows: true, cursor: true });
    const cursor = result.cursor;
    assert.ok(cursor);
    let count = 0;
    cursor.on("fetch", (rows) => (count += rows.length));
    await cursor.next();
    await cursor.close();
    assert.strictEqual(count, 10);
  });
});
