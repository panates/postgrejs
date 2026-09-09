import { expect } from 'expect';
import { Connection } from 'postgrejs';

describe('longCancelKey (protocol 3.2)', () => {
  let connection: Connection;

  afterEach(async () => {
    if (connection) await connection.close(0);
  });

  it('should hand back a longer secret key than the 4-byte default', async function () {
    connection = new Connection({ longCancelKey: true });
    await connection.connect();
    // Protocol 3.2 (and its longer cancel key) only exists on PostgreSQL
    // 18+; older servers gracefully negotiate back down to 3.0 and hand
    // back the legacy 4-byte key instead - by design, not a bug.
    const serverVersion = parseInt(
      connection.sessionParameters.server_version,
      10,
    );
    if (serverVersion < 18) return this.skip();
    // PostgreSQL sends up to 32 bytes today; the wire format itself
    // allows up to 256 - either way, strictly more than the legacy 4.
    expect(connection.secretKey?.length).toBeGreaterThan(4);
    // Our own test server (PostgreSQL 18) fully supports 3.2, so nothing
    // here should have needed negotiating down.
    expect(connection.protocolNegotiation).toBeUndefined();
  });

  it('should still cancel a running query with the longer key', async () => {
    connection = new Connection({ longCancelKey: true });
    await connection.connect();
    const ac = new AbortController();
    const started = Date.now();
    setTimeout(() => ac.abort(), 200);
    let error: any;
    try {
      await connection.query('select pg_sleep(10)', { signal: ac.signal });
    } catch (e) {
      error = e;
    }
    expect(error).toBeDefined();
    expect(error.name).toStrictEqual('AbortError');
    expect(Date.now() - started).toBeLessThan(5000);
    expect(error.cause?.code).toStrictEqual('57014');
  });

  it('should default to the legacy 4-byte key when not set', async () => {
    connection = new Connection();
    await connection.connect();
    expect(connection.secretKey?.length).toStrictEqual(4);
  });
});
