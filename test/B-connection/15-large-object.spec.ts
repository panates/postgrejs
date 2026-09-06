import crypto from 'node:crypto';
import { Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { expect } from 'expect';
import { Connection, LargeObjectMode } from 'postgrejs';

describe('Large objects', () => {
  let connection: Connection;
  const created: number[] = [];

  async function drain(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    await pipeline(
      stream,
      new Writable({
        write(chunk, _encoding, cb) {
          chunks.push(chunk);
          cb();
        },
      }),
    );
    return Buffer.concat(chunks);
  }

  before(async () => {
    connection = new Connection();
    await connection.connect();
  });

  after(async () => {
    // A large object belongs to no row, so nothing cleans these up for us.
    for (const oid of created)
      await connection.unlinkLargeObject(oid).catch(() => undefined);
    await connection.close(0);
  });

  it('should round-trip data larger than one chunk', async () => {
    const data = crypto.randomBytes(200 * 1024);
    const lo = await connection.createLargeObject();
    created.push(lo.oid);
    await pipeline(
      Readable.from([data]),
      lo.writable({ chunkSize: 64 * 1024 }),
    );
    expect(await lo.size()).toStrictEqual(BigInt(data.length));
    await lo.close();

    const reader = await connection.openLargeObject(lo.oid);
    try {
      expect(
        await drain(reader.readable({ chunkSize: 64 * 1024 })),
      ).toStrictEqual(data);
    } finally {
      await reader.close();
    }
  });

  it('should read a slice without reading the whole object', async () => {
    // The reason large objects exist rather than a bytea column.
    const data = crypto.randomBytes(4096);
    const lo = await connection.createLargeObject();
    created.push(lo.oid);
    await lo.write(data);
    await lo.seek(1000);
    expect(await lo.read(16)).toStrictEqual(data.subarray(1000, 1016));
    expect(await lo.tell()).toStrictEqual(1016n);
    await lo.close();
  });

  it('should truncate', async () => {
    const lo = await connection.createLargeObject();
    created.push(lo.oid);
    await lo.write(crypto.randomBytes(2048));
    await lo.truncate(100);
    expect(await lo.size()).toStrictEqual(100n);
    await lo.close();
  });

  it('should leave the position where it found it after size()', async () => {
    const lo = await connection.createLargeObject();
    created.push(lo.oid);
    await lo.write(crypto.randomBytes(500));
    await lo.seek(120);
    await lo.size();
    expect(await lo.tell()).toStrictEqual(120n);
    await lo.close();
  });

  it('should unlink', async () => {
    const lo = await connection.createLargeObject();
    await lo.write(Buffer.from('gone'));
    await lo.close();
    await connection.unlinkLargeObject(lo.oid);
    const r = await connection.query(
      'select count(*)::int4 as c from pg_largeobject_metadata where oid = $1',
      { params: [lo.oid] },
    );
    expect(r.rows?.[0][0]).toStrictEqual(0);
  });

  it('should commit only the transaction it opened itself', async () => {
    // close() commits when it had to start a transaction, but a caller's
    // own transaction stays theirs to finish - committing it here would
    // commit whatever else they had in flight.
    await connection.startTransaction();
    const lo = await connection.createLargeObject();
    created.push(lo.oid);
    await lo.write(Buffer.from('x'));
    await lo.close();
    expect(connection.inTransaction).toStrictEqual(true);
    await connection.rollback();
    // Rolled back, so the object never existed.
    const r = await connection.query(
      'select count(*)::int4 as c from pg_largeobject_metadata where oid = $1',
      { params: [lo.oid] },
    );
    expect(r.rows?.[0][0]).toStrictEqual(0);
    created.pop();
  });

  it('should refuse to work after close()', async () => {
    const lo = await connection.createLargeObject();
    created.push(lo.oid);
    await lo.close();
    await expect(lo.read(1)).rejects.toThrow(/already closed/);
  });

  it('should open read-only when asked', async () => {
    const lo = await connection.createLargeObject();
    created.push(lo.oid);
    await lo.write(Buffer.from('data'));
    await lo.close();
    const reader = await connection.openLargeObject(
      lo.oid,
      LargeObjectMode.read,
    );
    try {
      await expect(reader.write(Buffer.from('nope'))).rejects.toThrow();
    } finally {
      await reader.close().catch(() => undefined);
    }
  });
});
