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

## What does not yet: TLS

**A connection asking for TLS is refused with an error rather than attempted.** Upgrading a
connection on workerd goes through the runtime's own `socket.startTls()`; this client uses Node's
`tls.connect({ socket })`, which workerd cannot do. Attempting it does not fail in any way a
caller can read - measured, the three shapes answer `Network connection lost.` after the server
has already agreed to TLS, `rejectUnauthorized` reports itself *not implemented*, and
`sslnegotiation=direct` hangs until the connect timeout. So `ssl`, `requireSSL` and
`sslNegotiation` all raise:

> TLS is not supported on Cloudflare Workers by this client yet: upgrading a connection there
> needs the runtime's own socket.startTls(), where this client uses Node's tls.connect(). Connect
> without TLS - through Hyperdrive, which terminates TLS itself - or run on Node.js or Bun.

This is a gap here rather than a limit of the platform: `pg` reaches `startTls()` through
`pg-cloudflare`, and postgres.js through the `cf/` build its `exports` selects, and TLS works for
both.

### The one limit that is the platform's

Workerd's entire TLS surface is

```ts
type TlsOptions = { expectedServerHostname?: string }
```

so nothing on this runtime can say which certificate to trust - not this client, and not the two
above, which drop `ca`, `cert` and `rejectUnauthorized` on the floor. A server whose certificate
does not chain to a public CA is therefore out of reach for every one of them, and a local
PostgreSQL with a self-signed certificate - the usual development setup - cannot be reached over
TLS at all. Checked by hand against workerd's own `startTls()`: the server agrees to TLS and the
handshake still dies.

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
