import { expect } from 'expect';
import type { Change } from 'postgrejs';
import { Connection, LogicalReplication } from 'postgrejs';

describe('Logical replication', () => {
  let connection: Connection;
  let enabled = false;
  let seq = 0;

  /**
   * Runs `work` while a subscription is open and returns the first `count`
   * changes it yields. The subscription is always closed, which is what
   * drops its temporary slot - a leaked slot makes the server hoard WAL.
   */
  async function capture(
    options: Record<string, any>,
    count: number,
    work: () => Promise<any>,
  ): Promise<Change[]> {
    const sub = new LogicalReplication({
      publication: 'lr_pub',
      ...options,
    } as any);
    const changes: Change[] = [];
    try {
      await sub.start();
      // Only after the slot exists, or the changes would happen before the
      // stream has a position to start from.
      setTimeout(() => void work().catch(() => undefined), 100);
      for await (const change of sub) {
        changes.push(change);
        if (changes.length >= count) break;
      }
    } finally {
      await sub.close();
    }
    return changes;
  }

  before(async () => {
    connection = new Connection();
    await connection.connect();
    const r = await connection.query('show wal_level');
    enabled = r.rows?.[0][0] === 'logical';
    if (!enabled) return;
    await connection.execute(`
      drop publication if exists lr_pub;
      drop table if exists lr_test, lr_other;
      create table lr_test (id int4 primary key, name varchar(32));
      create table lr_other (id int4 primary key);
      create publication lr_pub for table lr_test, lr_other;`);
  });

  after(async () => {
    if (enabled) {
      await connection.execute(`
        drop publication if exists lr_pub;
        drop table if exists lr_test, lr_other;`);
    }
    await connection.close(0);
  });

  it('should stream inserts, updates and deletes', async function () {
    if (!enabled) return this.skip();
    const id = ++seq;
    const changes = await capture({}, 3, () =>
      connection.execute(`
        insert into lr_test values (${id}, 'ada');
        update lr_test set name = 'grace' where id = ${id};
        delete from lr_test where id = ${id};`),
    );
    expect(changes.map(c => c.command)).toStrictEqual([
      'insert',
      'update',
      'delete',
    ]);
    expect(changes[0].relation.name).toStrictEqual('lr_test');
    expect(changes[0].table).toStrictEqual(`${changes[0].schema}.lr_test`);
    expect(changes[0].row).toStrictEqual({ id: String(id), name: 'ada' });
    expect(changes[1].row?.name).toStrictEqual('grace');
    // A delete carries the old row, as far as the replica identity allows -
    // by default that is the primary key.
    expect(changes[2].oldRow?.id).toStrictEqual(String(id));
  });

  it('should stream a truncate', async function () {
    if (!enabled) return this.skip();
    const changes = await capture({}, 1, () =>
      connection.execute('truncate lr_test'),
    );
    expect(changes[0].command).toStrictEqual('truncate');
    expect(changes[0].relation.name).toStrictEqual('lr_test');
  });

  it('should filter by command', async function () {
    if (!enabled) return this.skip();
    const id = ++seq;
    const changes = await capture({ commands: ['update'] }, 1, () =>
      connection.execute(`
        insert into lr_test values (${id}, 'a');
        update lr_test set name = 'b' where id = ${id};`),
    );
    expect(changes.map(c => c.command)).toStrictEqual(['update']);
  });

  it('should filter by table', async function () {
    if (!enabled) return this.skip();
    const id = ++seq;
    const changes = await capture({ tables: ['lr_other'] }, 1, () =>
      connection.execute(`
        insert into lr_test values (${id}, 'a');
        insert into lr_other values (${id});`),
    );
    expect(changes[0].relation.name).toStrictEqual('lr_other');
  });

  it('should filter with a predicate', async function () {
    if (!enabled) return this.skip();
    const id = ++seq;
    const changes = await capture(
      { filter: (c: Change) => c.row?.name === 'wanted' },
      1,
      () =>
        connection.execute(`
          insert into lr_test values (${id}, 'skipped');
          insert into lr_test values (${id + 100}, 'wanted');`),
    );
    expect(changes[0].row?.name).toStrictEqual('wanted');
  });

  it('should confirm its position to the server', async function () {
    if (!enabled) return this.skip();
    const id = ++seq;
    const sub = new LogicalReplication({ publication: 'lr_pub' } as any);
    try {
      await sub.start();
      expect(sub.confirmedLsn).toStrictEqual('0/0');
      setTimeout(
        () =>
          void connection
            .execute(`insert into lr_test values (${id}, 'x')`)
            .catch(() => undefined),
        100,
      );
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const change of sub) break;
      await sub.ack();
      expect(sub.confirmedLsn).not.toStrictEqual('0/0');
    } finally {
      await sub.close();
    }
  });

  it('should accept multiple publications as an array', async function () {
    if (!enabled) return this.skip();
    const sub = new LogicalReplication({
      publication: ['lr_pub'],
    } as any);
    try {
      await sub.start();
      expect(sub.slot).toBeDefined();
    } finally {
      await sub.close();
    }
  });

  it('should drop a permanent slot it created itself when closed', async function () {
    if (!enabled) return this.skip();
    // No explicit slot name: start() then creates one (permanent: true only
    // skips creation when a slot name is *also* given, on the assumption an
    // existing permanent slot is being reused) - so this is the one
    // combination where _slotCreated and permanent are both true, which is
    // what makes close() DROP_REPLICATION_SLOT instead of leaving it.
    const sub = new LogicalReplication({
      publication: 'lr_pub',
      permanent: true,
    } as any);
    await sub.start();
    const slot = sub.slot;
    await sub.close();
    const r = await connection.query(
      'select count(*)::int4 as c from pg_replication_slots where slot_name = $1',
      { params: [slot] },
    );
    expect(r.rows?.[0][0]).toStrictEqual(0);
  });

  it('should drop its temporary slot when closed', async function () {
    if (!enabled) return this.skip();
    // A slot left behind keeps WAL on the server until someone notices.
    const before = await connection.query(
      'select count(*)::int4 as c from pg_replication_slots',
    );
    const sub = new LogicalReplication({ publication: 'lr_pub' } as any);
    await sub.start();
    await sub.close();
    // The server releases a temporary slot as its backend shuts down, which
    // trails the client's disconnect by a little.
    let count = -1;
    for (let i = 0; i < 40; i++) {
      const r = await connection.query(
        'select count(*)::int4 as c from pg_replication_slots',
      );
      count = r.rows?.[0][0];
      if (count === before.rows?.[0][0]) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    expect(count).toStrictEqual(before.rows?.[0][0]);
  });

  it('should require a publication', () => {
    expect(() => new LogicalReplication({} as any)).toThrow(/publication/);
  });

  it('should throw from the async iterator once an error has been recorded', async function () {
    if (!enabled) return this.skip();
    // An unknown publication name isn't actually rejected by
    // START_REPLICATION - pgoutput just never matches anything through it,
    // streaming forever with nothing to show - so this forces the state a
    // real socket-level failure (_fail()) would leave instead of relying on
    // a specific rejection this server version may or may not send.
    const sub = new LogicalReplication({ publication: 'lr_pub' } as any);
    await sub.start();
    (sub as any)._error = new Error('boom');
    let error: any;
    try {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const change of sub) break;
    } catch (e) {
      error = e;
    } finally {
      await sub.close();
    }
    expect(error).toBeDefined();
  });

  it('should stop right away once finished, with nothing queued', async function () {
    if (!enabled) return this.skip();
    const sub = new LogicalReplication({ publication: 'lr_pub' } as any);
    try {
      await sub.start();
      // Simulates the state right after the server ends the stream (e.g.
      // ReadyForQuery) with nothing left in the queue - the iterator has
      // to return cleanly rather than wait forever.
      (sub as any)._finished = true;
      const changes: Change[] = [];
      for await (const change of sub) changes.push(change);
      expect(changes).toStrictEqual([]);
    } finally {
      await sub.close();
    }
  });

  it('should accept an explicit permanent: false alongside a given slot name', async function () {
    if (!enabled) return this.skip();
    const slot = 'lr_explicit_' + Math.random().toString(36).substring(2, 8);
    const sub = new LogicalReplication({
      publication: 'lr_pub',
      slot,
      permanent: false,
    } as any);
    try {
      await sub.start();
      expect(sub.slot).toStrictEqual(slot);
    } finally {
      await sub.close();
    }
  });
});
