import net from 'node:net';
import { expect } from 'expect';
import { Connection } from 'postgrejs';

describe('SSL negotiation', () => {
  describe('what goes on the wire', () => {
    // Needs no database: a plain TCP listener is enough to see how the
    // client opens the conversation, which is the whole difference between
    // the two modes.
    async function firstBytes(config: Record<string, any>): Promise<string> {
      return new Promise((resolve, reject) => {
        const server = net.createServer(socket => {
          socket.once('data', data => {
            resolve(data.subarray(0, 8).toString('hex'));
            socket.destroy();
            server.close();
          });
        });
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
          const { port } = server.address() as net.AddressInfo;
          const connection = new Connection({
            host: '127.0.0.1',
            port,
            ssl: {},
            ...config,
          });
          // It never becomes a working connection; only the opening bytes
          // are under test.
          connection.connect().catch(() => undefined);
        });
      });
    }

    it('should not ask at all when TLS was not requested', async () => {
      // Startup message, not SSLRequest: a caller who never mentioned TLS
      // should not end up held to certificate verification.
      const hex = await firstBytes({ ssl: undefined });
      expect(hex).not.toStrictEqual('0000000804d2162f');
    });

    it('should ask first by default', async () => {
      // SSLRequest: length 8, then request code 80877103 (0x04d2162f).
      expect(await firstBytes({})).toStrictEqual('0000000804d2162f');
    });

    it('should start the TLS handshake straight away when direct', async () => {
      // 0x16 is a TLS handshake record, 0x0301 its version - no plaintext
      // preamble at all.
      const hex = await firstBytes({ sslNegotiation: 'direct' });
      expect(hex.startsWith('160301')).toStrictEqual(true);
    });
  });

  describe('against the server', () => {
    let sslEnabled = false;
    let directNegotiationSupported = false;

    before(async () => {
      const connection = new Connection();
      await connection.connect();
      try {
        const r = await connection.query('show ssl');
        sslEnabled = r.rows?.[0][0] === 'on';
        // Direct negotiation is a PostgreSQL 17+ feature - an older server
        // has no idea what a raw TLS handshake byte means where it expects
        // a StartupMessage, and just closes the connection.
        const serverVersion = connection.sessionParameters.server_version;
        directNegotiationSupported = parseInt(serverVersion, 10) >= 17;
      } finally {
        await connection.close(0);
      }
    });

    async function connectAndReport(config: Record<string, any>) {
      const connection = new Connection({
        ssl: { rejectUnauthorized: false },
        ...config,
      });
      try {
        await connection.connect();
        const r = await connection.query(
          'select ssl from pg_stat_ssl where pid = pg_backend_pid()',
        );
        return r.rows?.[0][0];
      } finally {
        await connection.close(0);
      }
    }

    it('should connect with the default negotiation', async function () {
      if (!sslEnabled) return this.skip();
      expect(await connectAndReport({})).toStrictEqual(true);
    });

    it('should connect with direct negotiation', async function () {
      // Direct requires PostgreSQL 17+, which answers only if the client
      // announced "postgresql" over ALPN - so connecting at all proves it.
      if (!sslEnabled || !directNegotiationSupported) return this.skip();
      expect(
        await connectAndReport({ sslNegotiation: 'direct' }),
      ).toStrictEqual(true);
    });
  });
});
