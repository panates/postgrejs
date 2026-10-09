# Cloudflare Workers

PostgreJS runs on Cloudflare Workers with no code of its own for the runtime: `nodejs_compat`
supplies `node:net`, `node:crypto` and the rest, and the client uses them as it does on Node.

Everything below was measured on **workerd via `wrangler dev`**, against PostgreSQL 18, with
postgrejs 3.13.0 installed from npm.

## Setup

```jsonc
// wrangler.jsonc
{
  "name": "my-worker",
  "main": "src/index.ts",
  "compatibility_date": "2026-09-01",
  "compatibility_flags": ["nodejs_compat"]
}
```

```ts
import { Connection } from 'postgrejs';

export default {
  async fetch(): Promise<Response> {
    const db = new Connection({
      host: '…', port: 5432, user: '…', password: '…', database: '…',
    });
    await db.connect();
    try {
      const r = await db.query('select now() as t', { objectRows: true });
      return Response.json(r.rows![0]);
    } finally {
      await db.close();
    }
  },
};
```

The `nodejs_compat` flag is required. Without it the bundle fails on the first `node:` import.

## What works

- Connecting, querying, and every decode path - the wire protocol needs nothing the runtime
  does not have.
- SCRAM and MD5 authentication. The primitives are all present and synchronous under
  `nodejs_compat`: `randomBytes`, `createHash`, `createHmac`, `pbkdf2Sync`.
- Prepared statements, cursors, `COPY`, large objects - none of them touch the runtime
  differently from a query.

## TLS

A connection asking for TLS opens a socket of the runtime's own and upgrades it with
`startTls()`, because `tls.connect({ socket })` is not something workerd can carry out. The
exchange either side of the upgrade is the same one as everywhere else: `SSLRequest`, the server's
`S`, then the handshake.

Two limits come with it, and neither is this client's to lift.

**The certificate has to chain to a public CA.** Workerd's entire TLS surface is

```ts
type TlsOptions = { expectedServerHostname?: string }
```

so nothing on this runtime can say which certificate to trust - not this client, and not `pg` or
postgres.js, which drop `ca`, `cert` and `rejectUnauthorized` on the floor for the same reason.
A `ca` of your own, a client certificate, and `rejectUnauthorized: false` are all accepted by the
API here and ignored there. In particular **a local PostgreSQL with a self-signed certificate
cannot be reached over TLS at all**, which is most development setups.

**`sslNegotiation: 'direct'` is refused by name.** TLS from the first byte needs the `postgresql`
ALPN protocol announced in the handshake, and the runtime's socket options are
`{ secureTransport, allowHalfOpen }` - there is nowhere to say it. Left to try, the server answers
by closing and workerd reports an internal error with a reference number, so the client raises
this instead:

> sslNegotiation "direct" is not available on Cloudflare Workers: it needs the "postgresql" ALPN
> protocol, which the runtime offers no way to announce. Leave sslNegotiation unset to negotiate
> with SSLRequest instead.

### What has and has not been checked

Measured here: the plain path end to end, and the TLS path as far as the certificate - the server
agrees to TLS, `startTls()` runs, and the handshake then fails against the self-signed certificate
the local server presents, which is the only answer possible for it.

**Not measured: a successful TLS connection.** That needs a database whose certificate chains to a
public CA, and there was none to hand. The upgrade itself is the same call `pg` and postgres.js
make, and the leg before it is checked, but the handshake completing is a claim this page does not
make.

### Reaching a database that requires TLS

Use [Hyperdrive](https://developers.cloudflare.com/hyperdrive/). It connects to the database from
Cloudflare's own network and terminates TLS there, then hands the Worker a plain connection to
speak to - which is the half this client already does. Connection pooling comes with it, which a
Worker cannot do for itself; see below.

Bind it and pass its connection string straight to the client:

```jsonc
// wrangler.jsonc
"hyperdrive": [{ "binding": "HYPERDRIVE", "id": "<your-config-id>" }]
```

```ts
interface Env {
  HYPERDRIVE: { connectionString: string };
}

export default {
  async fetch(_req: Request, env: Env): Promise<Response> {
    const db = new Connection(env.HYPERDRIVE.connectionString);
    await db.connect();
    try {
      const r = await db.query('select current_database() as db', { objectRows: true });
      return Response.json(r.rows![0]);
    } finally {
      await db.close();
    }
  },
};
```

The string it hands over carries `sslmode=disable`, and that is the point rather than a weakening:
the TLS that protects the database is the leg Hyperdrive holds, and the Worker's leg does not
leave Cloudflare.

`wrangler dev` serves the binding locally without an account - point it at any database with

```sh
export WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE="postgres://user:pass@127.0.0.1:5432/db"
```

That is how the example above was checked here, end to end, against PostgreSQL 18. What it does
not exercise is the deployed path - a Worker on Cloudflare reaching a real Hyperdrive config -
since the local binding proxies straight to the string you give it. That leg is Hyperdrive's own
protocol handling and is not specific to this client, but it is not something this document has
measured.

## Other differences worth knowing

**Unix domain sockets** are not reachable: there is no filesystem to put one on.

**A `Pool` does not outlive a request** in the way it does on a server. A Worker isolate may be
reused between requests and may not, so a pool created at module scope is a cache that may be
cold at any time rather than a pool with a known size. Hyperdrive is where connection reuse
actually lives on this platform.

**`LISTEN`/`NOTIFY` and logical replication** need a connection that stays open and a process that
stays alive to hear it. Neither is a thing a request-scoped Worker has.

**`os.totalmem()` answers 0** on workerd rather than throwing, so the buffer ceiling this client
derives from it falls back to its own 2 GB cap. Nothing to configure; noted because the number
differs from what the same code reports on Node.
