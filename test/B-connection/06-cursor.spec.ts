import { expect } from 'expect';
import { Connection } from 'postgrejs';

describe('Cursor support', () => {
  let connection: Connection;

  before(async () => {
    connection = new Connection();
    await connection.connect();
  });

  after(async () => {
    await connection.close(0);
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
});
