import { expect } from 'expect';
import { Connection, Pool, RowDecoder } from 'postgrejs';

describe('Cursor support', () => {
  let connection: Connection;

  before(async () => {
    connection = new Connection();
    await connection.connect();
  });

  after(async () => {
    await connection.close(0);
  });

  it('should iterate every row with for await', async () => {
    const result = await connection.query(
      'select i from generate_series(1, 25) i',
      { cursor: true, fetchCount: 10 },
    );
    const seen: number[] = [];
    for await (const row of result.cursor!) seen.push((row as any)[0]);
    expect(seen.length).toStrictEqual(25);
    expect(seen[0]).toStrictEqual(1);
    expect(seen[24]).toStrictEqual(25);
    expect(result.cursor!.isClosed).toStrictEqual(true);
  });

  it('should close the cursor when the loop breaks early', async () => {
    const result = await connection.query(
      'select i from generate_series(1, 25) i',
      { cursor: true, fetchCount: 10 },
    );
    const seen: number[] = [];
    for await (const row of result.cursor!) {
      seen.push((row as any)[0]);
      if (seen.length === 3) break;
    }
    expect(seen).toStrictEqual([1, 2, 3]);
    expect(result.cursor!.isClosed).toStrictEqual(true);
  });

  it('should close the cursor when the loop body throws', async () => {
    const result = await connection.query(
      'select i from generate_series(1, 25) i',
      { cursor: true, fetchCount: 10 },
    );
    await expect(
      (async () => {
        for await (const row of result.cursor!)
          throw new Error('boom at ' + (row as any)[0]);
      })(),
    ).rejects.toThrow('boom at 1');
    expect(result.cursor!.isClosed).toStrictEqual(true);
  });

  it('should next() fetch next row', async () => {
    const result = await connection.query(
      `select * from customers order by id`,
      { objectRows: false, cursor: true },
    );
    const cursor = result.cursor;
    expect(cursor).toBeDefined();
    const row = await cursor?.next();
    expect(row[0]).toStrictEqual(1);
    await cursor?.close();
  });

  it('should next() fetch next row as object', async () => {
    const result = await connection.query(
      `select * from customers order by id`,
      { objectRows: true, cursor: true },
    );
    const cursor = result.cursor;
    expect(cursor).toBeDefined();
    const row = await cursor?.next();
    expect(row).toBeDefined();
    expect(row.id).toStrictEqual(1);
    await cursor?.close();
  });

  it('should fetch() fetch multiple rows', async () => {
    const result = await connection.query(
      `select * from customers order by id`,
      {
        objectRows: false,
        cursor: true,
        fetchCount: 5,
      },
    );
    const cursor = result.cursor;
    expect(cursor).toBeDefined();
    const rows = await cursor?.fetch(10);
    expect(rows?.length).toStrictEqual(10);
    expect(rows?.[0][0]).toStrictEqual(1);
    await cursor?.close();
  });

  it('should fetch() return fewer rows than asked for once the result runs out', async () => {
    const result = await connection.query(
      `select * from customers order by id limit 3`,
      { objectRows: false, cursor: true, fetchCount: 2 },
    );
    const cursor = result.cursor;
    expect(cursor).toBeDefined();
    const rows = await cursor?.fetch(10);
    expect(rows?.length).toStrictEqual(3);
    await cursor?.close();
  });

  it('should report rowType from the query options', async () => {
    const arrayResult = await connection.query(
      `select * from customers limit 1`,
      { objectRows: false, cursor: true },
    );
    expect(arrayResult.cursor?.rowType).toStrictEqual('array');
    await arrayResult.cursor?.close();

    const objectResult = await connection.query(
      `select * from customers limit 1`,
      { objectRows: true, cursor: true },
    );
    expect(objectResult.cursor?.rowType).toStrictEqual('object');
    await objectResult.cursor?.close();
  });

  it('should decode fetched rows with a custom RowDecoder', async () => {
    class FirstColumnOnlyRowDecoder extends RowDecoder {
      decode(parsers: any[], data: Buffer, columnCount: number, options: any) {
        const len = data.readInt32BE(0);
        return len < 0 ? null : parsers[0](data, 4, len, options);
      }
    }
    const result = await connection.query(
      `select * from customers order by id`,
      { rowDecoder: new FirstColumnOnlyRowDecoder(), cursor: true },
    );
    const cursor = result.cursor!;
    expect(cursor.rowType).toStrictEqual('custom');
    const row = await cursor.next();
    expect(row).toStrictEqual(1);
    await cursor.close();
  });

  it('should automatically close cursor after fetching all rows', async () => {
    const result = await connection.query(`select * from customers limit 10`, {
      objectRows: true,
      cursor: true,
    });
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
    const result = await connection.query(
      `select * from customers order by id`,
      { objectRows: true, cursor: true },
    );
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
    const result = await connection.query(`select * from customers limit 10`, {
      objectRows: true,
      cursor: true,
    });
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
      const result = await connection.query(
        `select * from customers order by id`,
        { objectRows: false, cursor: true },
      );
      await using cursor = result.cursor!;
      expect(cursor).toBeDefined();
      cursor.on('close', () => (closed = true));
      const row = await cursor?.next();
      expect(row[0]).toStrictEqual(1);
    }
    expect(closed).toStrictEqual(true);
  });

  it('should stay usable after closing a cursor opened from an externally-prepared statement', async () => {
    const statement = await connection.prepare(
      'select generate_series(1,20) as n',
    );
    try {
      const result = await statement.execute({
        cursor: true,
        fetchCount: 5,
      });
      const cursor = result.cursor!;
      const rows = await cursor.fetch(5);
      expect(rows.length).toStrictEqual(5);
      await cursor.close();
      // The statement's refcount only reaches 0 on statement.close() below,
      // not on cursor.close() - so it must still be usable here.
      const r2 = await statement.execute({});
      expect(r2.rows?.length).toStrictEqual(20);
    } finally {
      await statement.close();
    }
  });

  it('should support two cursors sharing one prepared statement', async () => {
    const statement = await connection.prepare(
      'select generate_series(1,30) as n',
    );
    try {
      const cursorA = (await statement.execute({ cursor: true, fetchCount: 5 }))
        .cursor!;
      const cursorB = (await statement.execute({ cursor: true, fetchCount: 5 }))
        .cursor!;
      const rowsA = await cursorA.fetch(5);
      const rowsB = await cursorB.fetch(5);
      expect(rowsA.length).toStrictEqual(5);
      expect(rowsB.length).toStrictEqual(5);
      await cursorA.close();
      // Statement must still be usable - cursorB still references it.
      const r2 = await statement.execute({});
      expect(r2.rows?.length).toStrictEqual(30);
      await cursorB.close();
    } finally {
      await statement.close();
    }
  });

  it('should not throw when a cursor is closed after its statement was already closed directly', async () => {
    const statement = await connection.prepare(
      'select generate_series(1,10) as n',
    );
    const result = await statement.execute({ cursor: true, fetchCount: 5 });
    const cursor = result.cursor!;
    await cursor.fetch(5);
    await statement.close();
    await expect(cursor.close()).resolves.toBeUndefined();
  });

  it('should open a cursor in 1 round trip and close it in 1 round trip (common path)', async () => {
    const socket = (connection as any)._intlCon.socket;
    const events: string[] = [];
    const onDebug = (e: any) => events.push(e.location);
    socket.on('debug', onDebug);
    try {
      const result = await connection.query(
        `select generate_series(1,20) as n`,
        { cursor: true, fetchCount: 5 },
      );
      const cursor = result.cursor!;
      expect(
        events.filter(e => e === 'PgSocket.sendBindDescribeMessages').length,
      ).toStrictEqual(1);
      expect(
        events.some(
          e =>
            e === 'PgSocket.sendBindMessage' ||
            e === 'PgSocket.sendDescribeMessage',
        ),
      ).toStrictEqual(false);

      await cursor.fetch(5);
      events.length = 0;
      await cursor.close();
      expect(
        events.filter(e => e === 'PgSocket.sendClosePortalAndStatementMessages')
          .length,
      ).toStrictEqual(1);
      expect(
        events.some(
          e =>
            e === 'PgSocket.sendCloseMessage' ||
            e === 'PgSocket.sendSyncMessage',
        ),
      ).toStrictEqual(false);
    } finally {
      socket.off('debug', onDebug);
    }
  });

  it('should surface the real error when a cursor Bind fails, and leave the connection usable', async () => {
    const statement = await connection.prepare('select $1::int4 as v');
    try {
      let error: any;
      try {
        await statement.execute({
          params: ['not-a-number'],
          cursor: true,
          objectRows: true,
        });
      } catch (e: any) {
        error = e;
      }
      // Not the protocol-level confusion ("unexpected response message (Z)")
      // that the two-capture Close+Sync teardown used to produce, and that
      // _execute()'s finally used to let mask the original failure.
      expect(error).toBeDefined();
      expect(error.message).toContain('invalid input syntax');

      // The failed teardown must not leave an orphaned capture behind: an
      // orphan silently eats the first message of whatever comes next, so
      // these follow-ups would drift out of alignment.
      for (const [sql, expected] of [
        ['select 42 as v', 42],
        ['select 7 as v', 7],
        ['select 9 as v', 9],
      ] as const) {
        const r = await connection.query(sql, { objectRows: true });
        expect((r.rows?.[0] as any)?.v).toStrictEqual(expected);
      }

      // ...and a healthy cursor on the same statement still works.
      const ok = await statement.execute({
        params: [5],
        cursor: true,
        objectRows: true,
      });
      const row: any = await ok.cursor!.next();
      expect(row.v).toStrictEqual(5);
      await ok.cursor!.close();
    } finally {
      await statement.close().catch(() => undefined);
    }
  });

  it('should return undefined from next() and [] from fetch() once already closed', async () => {
    const result = await connection.query(`select * from customers limit 1`, {
      objectRows: true,
      cursor: true,
    });
    const cursor = result.cursor!;
    await cursor.close();
    expect(await cursor.next()).toStrictEqual(undefined);
    expect(await cursor.fetch(5)).toStrictEqual([]);
  });

  describe('portal lifetime', () => {
    // A portal lives only as long as the transaction that created it, and
    // outside an explicit one that is the implicit transaction any other
    // statement's Sync ends. These pin both halves of that, and the fact
    // that the resulting error explains itself.

    it('should die when another statement runs on the same connection', async () => {
      const r = await connection.query(
        'select i from generate_series(1, 1000) i',
        { cursor: true, fetchCount: 100 },
      );
      const cursor = r.cursor!;
      expect(await cursor.next()).toStrictEqual([1]);
      await connection.query('select 1');
      let err: any;
      try {
        // The first batch is still buffered; the 101st row is what needs
        // a second Execute against the portal that is now gone.
        for (let i = 0; i < 100; i++) await cursor.next();
      } catch (e) {
        err = e;
      }
      expect(err).toBeDefined();
      expect(err.code).toStrictEqual('34000');
      expect(err.message).toMatch(/destroyed by another statement/);
      // And it closed itself rather than leaving the statement behind.
      expect(cursor.isClosed).toStrictEqual(true);
    });

    it('should survive another statement inside an explicit transaction', async () => {
      await connection.startTransaction();
      try {
        const r = await connection.query(
          'select i from generate_series(1, 1000) i',
          { cursor: true, fetchCount: 100 },
        );
        const cursor = r.cursor!;
        expect(await cursor.next()).toStrictEqual([1]);
        await connection.query('select 1');
        for (let i = 0; i < 100; i++) await cursor.next();
        expect(await cursor.next()).toStrictEqual([102]);
        await cursor.close();
      } finally {
        await connection.rollback();
      }
    });

    it('should keep a pooled cursor safe by holding its connection', async () => {
      // Pool.query() used to release the connection as soon as it
      // returned, so the next caller could get the very connection the
      // cursor was reading from and destroy its portal - and which
      // connection that was depended on the pool's state, so it failed
      // only sometimes.
      const pool = new Pool({ max: 2, min: 0 });
      try {
        const r = await pool.query('select i from generate_series(1, 1000) i', {
          cursor: true,
          fetchCount: 100,
        });
        const cursor = r.cursor!;
        expect(await cursor.next()).toStrictEqual([1]);
        expect(pool.acquiredConnections).toStrictEqual(1);
        expect(pool.idleConnections).toStrictEqual(0);
        await pool.query('select 1');
        for (let i = 0; i < 100; i++) await cursor.next();
        expect(await cursor.next()).toStrictEqual([102]);
        await cursor.close();
        expect(pool.acquiredConnections).toStrictEqual(0);
      } finally {
        await pool.close(0);
      }
    });

    it('should give a pooled cursor connection back when the loop ends', async () => {
      const pool = new Pool({ max: 2, min: 0 });
      try {
        const r = await pool.query('select i from generate_series(1, 25) i', {
          cursor: true,
          fetchCount: 10,
        });
        const seen: number[] = [];
        for await (const row of r.cursor!) seen.push((row as any)[0]);
        expect(seen.length).toStrictEqual(25);
        expect(pool.acquiredConnections).toStrictEqual(0);
        expect(pool.idleConnections).toStrictEqual(1);
      } finally {
        await pool.close(0);
      }
    });
  });
});
