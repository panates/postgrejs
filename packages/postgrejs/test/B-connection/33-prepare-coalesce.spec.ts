import { expect } from 'expect';
import { Connection } from 'postgrejs';

/**
 * A burst of the same statement arrives before any of it has been
 * prepared. Each call used to decide on its own that the SQL had earned
 * a name and prepare its own copy: 50 concurrent `select $1::int4` made
 * 25 Parse+Describe round trips and left 25 named statements on the
 * server, of which the cache remembered one - the other 24 could never
 * be closed again, and lived until the connection did.
 */
describe('Concurrent prepare', () => {
  const SQL = 'select $1::int4 as val';
  const N = 20;

  it('should name a statement once, however many callers arrive at once', async () => {
    const conn = new Connection();
    await conn.connect();
    try {
      await Promise.all(
        Array.from({ length: N }, (_, i) =>
          conn.query(SQL, { params: [i], objectRows: true }),
        ),
      );
      // Counted by the statement text, since the counting query earns a
      // name of its own on its second use.
      expect(await statementCount(conn, SQL)).toStrictEqual(1);
    } finally {
      await conn.close(0);
    }
  });

  it('should not make the burst wait for the name it does not need', async () => {
    // The calls that arrive while the Parse is in flight run unprepared
    // rather than queueing behind it - the name is for the calls after
    // this burst. One Parse+Describe, and no query waits on it.
    const conn = new Connection();
    const locations: string[] = [];
    await conn.connect();
    (conn as any)._intlCon.socket.on('debug', (e: any) =>
      locations.push(e.location),
    );
    try {
      const rows = await Promise.all(
        Array.from({ length: N }, (_, i) => conn.query(SQL, { params: [i] })),
      );
      expect(rows.map(r => r.rows?.[0][0])).toStrictEqual(
        Array.from({ length: N }, (_, i) => i),
      );
      expect(
        locations.filter(l => l === 'PgSocket.sendPrepareMessages').length,
      ).toStrictEqual(1);
    } finally {
      await conn.close(0);
    }
  });

  it('should reuse the name for every later call', async () => {
    const conn = new Connection();
    await conn.connect();
    try {
      await Promise.all(
        Array.from({ length: N }, (_, i) => conn.query(SQL, { params: [i] })),
      );
      const locations: string[] = [];
      (conn as any)._intlCon.socket.on('debug', (e: any) =>
        locations.push(e.location),
      );
      await Promise.all(
        Array.from({ length: N }, (_, i) => conn.query(SQL, { params: [i] })),
      );
      // One Bind+Execute each, nothing else.
      expect(locations).toStrictEqual(
        new Array(N).fill('PgSocket.sendBindExecuteMessages'),
      );
    } finally {
      await conn.close(0);
    }
  });
});

async function statementCount(conn: Connection, sql: string): Promise<number> {
  const r = await conn.query(
    'select count(*)::int as n from pg_prepared_statements where statement = $1',
    { params: [sql], objectRows: true },
  );
  return (r.rows?.[0] as any).n;
}
