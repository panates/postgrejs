<!--suppress HtmlDeprecatedAttribute -->
<p align="center">
  <a href="https://www.postgrejs.com/" target="_blank" rel="noopener noreferrer">
    <img src="https://www.postgrejs.com/img/postgrejs-header-block.webp" width="1280" alt="PostgreJS Logo" />
  </a>
</p>

[![NPM Version][npm-image]][npm-url]
[![NPM Downloads][downloads-image]][downloads-url]
[![CI Tests][ci-test-image]][ci-test-url]
[![Test Coverage][coveralls-image]][coveralls-url]

## Why PostgreJS?

**PostgreJS** is a PostgreSQL driver for Node.js built from the wire protocol up - no `libpq`, no native bindings,
just TypeScript talking directly to PostgreSQL. That from-scratch design is also what makes it fast and light: every
byte on the wire is handled by code written for exactly that purpose, with a binary-first protocol, shared buffers,
and row/column decoding pipelines built to avoid unnecessary allocation, instead of generic string plumbing bolted
onto a client meant for text.

### ⚡ Blazing Fast

The numbers back it up. In PostgreJS's own benchmark suite - run head-to-head against
[`pg`](https://github.com/brianc/node-postgres) (node-postgres) and [`postgres`](https://github.com/porsager/postgres)
(postgres.js) on identical workloads - PostgreJS opens a connection up to **3x faster** than postgres.js and
**2x faster** than pg, pushes pooled queries through up to **6.6x faster** than postgres.js, and fetches large
result sets nearly **5x faster** than pg. It's also the only one of the three with a complete binary wire protocol
across every data type, rather than falling back to text for most of them. See
[`doc/BENCHMARKS.md`](doc/BENCHMARKS.md) for the full methodology and every scenario.

### 🪶 Small Footprint

The same benchmarks show it using a fraction of the memory: peak heap usage typically runs **3-7x lower** than both
pg and postgres.js - as much as **7x lower** when streaming cursors or fetching large arrays - and it spends a
fraction of the time either of them does in garbage collection. Shared buffers and decode paths that read values
straight out of the wire buffer leave far less garbage behind per row, so there's less for the GC to clean up in
the first place.

### 🔋 Batteries Included

Speed and memory aside, PostgreJS is also the most complete driver of the three: a dynamic `sql` tag for
composable, parameterized SQL, per-query type mapping, and TC39 Explicit Resource Management (`using`) support are
unique to it, alongside a feature set most drivers spread across several add-on packages - connection pooling,
prepared statements, server-side cursors, LISTEN/NOTIFY, bulk `COPY` streams, logical replication, large objects,
two-phase commit, multi-host failover, and SCRAM channel binding - all in the one package, written in
strictly-typed TypeScript from the ground up.

## Installation

```bash
$ npm install postgrejs --save
```

## Documentation

Please read :small_orange_diamond: [DOCUMENTATION](https://www.postgrejs.com/) :small_orange_diamond: for detailed
usage.

## Library Overview

- **Language:** Pure JavaScript, with no native/binary dependencies to compile or ship.
- **Strictly typed:** Written entirely in TypeScript, with types shipped alongside the package.
- **Modern module format:** Ships as ESM; Node 20.19+/22.12+ can `require()` it from CommonJS code as well.
- **Promise-based API:** Every asynchronous operation returns a promise - no callbacks to wrangle.
- **Rigorously tested:** A test suite covering the wire protocol, every data type, and connection-handling edge case,
  run on every push against PostgreSQL 12 through 18.

## Features

- **Connection Management:** Supports both single connection and advanced pooling, providing scalability and efficient
  resource management.
- **Binary Wire Protocol:** Implements the full binary wire protocol for all PostgreSQL data types, ensuring robust and
  efficient data handling.
- **Prepared Statements:** Named prepared statements for optimized query execution.
- **Cursors:** Features fast double-link cache cursors for efficient data retrieval.
- **Notifications:**  High-level implementation for PostgreSQL notifications (LISTEN/NOTIFY), enabling real-time data
  updates.
- **Extensibility:** Extensible data-types and type mapping to accommodate custom requirements.
- **Parameter Binding:**  Bind parameters with OID mappings for precise and efficient query execution.
- **Array Handling:** Supports multidimensional arrays with fast binary encoding/decoding.
- **Performance Optimization:**  Low memory utilization and boosted performance through the use of shared buffers.
- **Authorization:** Supports various password algorithms including Clear text, MD5, and SASL, ensuring secure
  authentication.
- **Bulk Import/Export:** `COPY TO STDOUT` and `COPY FROM STDIN` as Node streams, with backpressure in both directions.
- **Query Pipelining:** Pooled queries can share connections so a burst is not capped by pool size - opt-in per call.
- **Dynamic SQL:** A `sql` tag builds statements from composable fragments - values become parameters, names are quoted,
  and `sql.values()`/`sql.set()` write INSERT and UPDATE clauses from objects.
- **Multiple Hosts:** A connection can list several servers and pick one by role
  (`target_session_attrs`), so a cluster that has failed over is found on the next connect.
- **Large Objects:** File-like access to binary data stored outside the row - seek, partial reads, streams - for
  values past what a `bytea` column can hold.
- **Logical Replication:** `LogicalReplication` streams committed row changes as an async iterable, decoding
  `pgoutput` itself, with client-side filtering and positions confirmed as you consume.
- **Channel Binding:** SCRAM authentication binds itself to the TLS channel when the server offers it, the way libpq
  does by default, so a relayed login is detected even where the certificate is not verified.
- **Two-phase commit:** `prepareTransaction()` leaves a transaction waiting under a name for `commitPrepared()`/
  `rollbackPrepared()`, from any connection.
- **Cancellation:** Any call takes an `AbortSignal`, which also gives per-query timeouts via `AbortSignal.timeout()`.
- **Flexible Data Retrieval:**  Can return both array and object rows to suit different data processing needs.
- **Resource Management:** Auto disposal of resources with the "using" syntax
  ([TC39 Explicit Resource Management](https://github.com/tc39/proposal-explicit-resource-management)), ensuring
  efficient resource cleanup.
- **Long Cancel Key:** Opt in to protocol 3.2 (PostgreSQL 18+) with `longCancelKey`, so a `cancel()` in progress can't
  be forged by an attacker guessing a short secret key.
- **Legacy Function Call Protocol:** `callFunction()` calls a function by OID directly over the wire, bypassing SQL
  entirely - kept for protocol completeness even though `SELECT func(...)` covers the same ground.
- **Graceful Protocol Renegotiation:** A server that doesn't recognize a requested protocol version or startup option
  reports back instead of erroring out, surfaced on `Connection.protocolNegotiation`.

## Feature Comparison

How PostgreJS compares to [`pg`](https://github.com/brianc/node-postgres) (node-postgres) and
[`postgres`](https://github.com/porsager/postgres) (postgres.js). Every row was checked against the libraries' own
source rather than their documentation — versions compared: **PostgreJS 3.1.0, pg 8.23.0, postgres.js 3.4.9**. ✅ built
in · 🟡 partial or needs a separate package · ❌ not supported.

| Feature                           |       PostgreJS        |          pg           |   postgres.js    |
|:---------------------------------|:----------------------:|:-------------------:|:----------------:|
| ***Packaging***                   |                        |                       |                  |
| Packages to install               |           1            |    4 <sup>1</sup>     |        1         |
| Module system                     |          ESM           |        ESM/CJS        |     ESM/CJS      |
| Language                          |           TS           |    JS <sup>2</sup>    | JS <sup>3</sup>  |
| ***Wire protocol***               |                        |                       |                  |
| Protocol version                  |          3.2           |          3.0          |       3.0        |
| Simple Query protocol             |           ✅           |          ✅           |        ✅        |
| Extended Query protocol           |           ✅           |          ✅           |        ✅        |
| Text wire format                  |           ✅           |          ✅           |        ✅        |
| Binary wire format                |           ✅           |    🟡 <sup>4</sup>    | ❌ <sup>5</sup>  |
| Per-column format selection       |           ✅           |          ❌           |        ❌        |
| Long cancel key (opt-in)          |           ✅           |          ❌           |        ❌        |
| Legacy Function Call protocol     |           ✅           |          ❌           |        ❌        |
| Graceful protocol renegotiation   |           ✅           |          ❌           |        ❌        |
| ***High-level API***              |                        |                       |                  |
| Object and array row modes        |           ✅           |          ✅           |        ✅        |
| Dynamic SQL helpers               |      ✅ `sql` tag      |          ❌           |        ✅        |
| Per-query type mapping            |           ✅           |    ❌ <sup>6</sup>    | ❌ <sup>6</sup>  |
| Query cancellation                |     ✅ AbortSignal     |          ✅           |        ✅        |
| Per-query timeout                 |     ✅ AbortSignal     |          ✅           | ❌ <sup>7</sup>  |
| Reference counters                | Connection / Statement |          ❌           |        ❌        |
| Caller kept in async error stacks |           ✅           |    🟡 <sup>8</sup>    | 🟡 <sup>9</sup>  |
| Error located in the SQL text     |    ✅ line and mark    |       🟡 offset       |    🟡 offset     |
| TC39 Explicit Resource Management |           ✅           |          ❌           |        ❌        |
| ***Querying***                    |                        |                       |                  |
| Query parameters                  |           ✅           |          ✅           |        ✅        |
| Parameter type casting            |           ✅           |   🟡 <sup>10</sup>    |        ✅        |
| Prepared statements               |      ✅ explicit       |          ✅           |   ✅ automatic   |
| Multi-statement scripts           |           ✅           |          ✅           |        ✅        |
| Server-side cursors               |           ✅           |   🟡 <sup>11</sup>    |        ✅        |
| `COPY TO` / `COPY FROM`           |           ✅           |   🟡 <sup>12</sup>    |        ✅        |
| Row count after a COPY            |           ✅           |          ✅           |        ❌        |
| ***Transaction management***      |                        |                       |                  |
| Transaction API                   |           ✅           |          ❌           |        ✅        |
| Savepoints                        |           ✅           |          ❌           |        ✅        |
| Two-phase commit API              |           ✅           |          ❌           | 🟡 <sup>13</sup> |
| ***Session management***          |                        |                       |                  |
| Built-in connection pool          |           ✅           |          ✅           |   ✅ implicit    |
| Pipelining on one connection      |     ✅ opt-in/call     |   ✅ opt-in/client    |   ✅ automatic   |
| Graceful shutdown                 |           ✅           |   ❌ <sup>14</sup>    |        ✅        |
| Multiple hosts                    |           ✅           |          ❌           |        ✅        |
| LISTEN/NOTIFY                     |           ✅           |   🟡 <sup>15</sup>    |        ✅        |
| ***Data types***                  |                        |                       |                  |
| Text encoders                     |           56           | generic <sup>16</sup> |        14        |
| Text decoders                     |           56           |          44           | 12 <sup>17</sup> |
| Binary encoders                   |           56           |          ❌           |        ❌        |
| Binary decoders                   |           56           |          16           |        ❌        |
| Multidimensional arrays           |       ✅ binary        | 🟡 text <sup>18</sup> |     🟡 text      |
| ***Security***                    |                        |                       |                  |
| SSL/TLS                           |           ✅           |          ✅           |        ✅        |
| Direct TLS negotiation (PG17)     |           ✅           |          ✅           |        ✅        |
| Cleartext, MD5, SCRAM-SHA-256     |           ✅           |          ✅           |        ✅        |
| SCRAM channel binding (`-PLUS`)   |       ✅ default       |       ✅ opt-in       |        ❌        |
| ***Beyond querying***             |                        |                       |                  |
| Logical replication               |           ✅           |   🟡 <sup>19</sup>    |        ✅        |
| Large object API                  |           ✅           |          ❌           |        ✅        |
| Native libpq bindings             |           ❌           |   🟡 <sup>20</sup>    |        ❌        |

- <sup>1</sup> What it takes to reach the feature set above. PostgreJS and postgres.js ship everything in the one
  package you import; `pg` needs `pg-cursor` for cursors, `pg-query-stream`
  for row streams and `pg-copy-streams` for COPY, each installed and versioned separately.
- <sup>2</sup> Types come from the separate `@types/pg`; only the `pg-protocol` and
  `pg-connection-string` sub-packages are written in TypeScript.
- <sup>3</sup> Ships a hand-maintained `.d.ts`.
- <sup>4</sup> Results only - parameters are always stringified. Opt-in per query or per client, and all columns at
  once. No binary parser is registered for `bytea`, and binary arrays decode only `int4`, `int8` and `text` elements.
- <sup>5</sup> Both format-code counts are hardcoded to zero and parameters are stringified, so everything on the wire
  is text.
- <sup>6</sup> Global or per-client (pg) and per-instance (postgres.js), but not per query.
- <sup>7</sup> Connection-level timeouts only.
- <sup>8</sup> Restored by calling `Error.captureStackTrace` from the promise's own rejection handler, where the
  synchronous stack is already gone - the caller's frames come from Node's async stack traces, so they survive an
  awaited chain but not a `.then()`/`.catch()` one, and the callback API gets none at all.
- <sup>9</sup> Captured at the tagged template, four frames deep; `sql.unsafe()` gets none.
- <sup>10</sup> A `types` array on the query config does reach the Parse message, but the same field doubles as the
  result parser override, so any row-returning query throws inside pg's own handler. Verified usable only for statements
  that return no rows (pg 8.23.0).
- <sup>11</sup> Core has the row-limit primitive; the cursor and stream APIs are separate packages.
- <sup>12</sup> The core `Query` refuses COPY IN; `pg-copy-streams` is required.
- <sup>13</sup> `sql.prepare(name)` runs `PREPARE TRANSACTION` inside `begin`, but there is no helper for the other
  half - `COMMIT PREPARED` / `ROLLBACK PREPARED` have to be written as raw SQL.
- <sup>14</sup> `end()` destroys the socket when a query is still in flight, so the query is aborted rather than
  awaited; only a client in pipeline mode waits for drain first.
- <sup>15</sup> On the client only - the pool does not forward notifications.
- <sup>16</sup> pg has no per-OID text encoders: a parameter is converted by its
  JavaScript type rather than by the type it is going into, so there is no
  count to give.
- <sup>17</sup> Plus every array type, whose OIDs are read from the catalog when a
  connection opens rather than registered ahead of time.
- <sup>18</sup> Its binary array decoder covers only `int4`, `int8` and `text` elements, so everything else falls back to
  text anyway.
- <sup>19</sup> A connection flag exists, but nothing decodes the stream.
- <sup>20</sup> `pg-native` swaps the pure JavaScript protocol for libpq, and its own
  documentation lists what stops working with it: `pg-cursor`, `pg-query-stream` and
  `pg-copy-streams` all "operate directly on the binary stream and therefore are
  incompatible" - so server-side cursors, row streaming and COPY are what it costs.


## Benchmarks

PostgreJS implements the full PostgreSQL wire protocol from scratch, with no dependency on `pg`/libpq.
[`doc/BENCHMARKS.md`](doc/BENCHMARKS.md) compares it against `pg` (node-postgres) and `postgres` (postgres.js)
across connection setup, simple/prepared queries, mixed-type decoding, bulk fetches, cursor streaming and pool
concurrency, each library run through its own idiomatic fast path. The numbers there are reproducible on your own
machine via `npm run bench` against the repo's own
`docker/docker-compose.yml` Postgres instance; see [`benchmark/README.md`](./benchmark/README.md) for details.

## Support

You can report bugs and discuss features on the [GitHub issues](https://github.com/panates/postgrejs/issues) page When
you open an issue please provide version of NodeJS and PostgreSQL server.

## Node Compatibility

- node >= 20.x

## License

PostgreJS is available under the [BSD 3-Clause](LICENSE) license.

[npm-image]: https://img.shields.io/npm/v/postgrejs
[npm-url]: https://npmjs.org/package/postgrejs
[downloads-image]: https://img.shields.io/npm/dm/postgrejs.svg
[downloads-url]: https://npmjs.org/package/postgrejs
[ci-test-image]: https://github.com/panates/postgrejs/actions/workflows/test.yml/badge.svg
[ci-test-url]: https://github.com/panates/postgrejs/actions/workflows/test.yml
[coveralls-image]: https://img.shields.io/coveralls/panates/postgrejs/dev.svg
[coveralls-url]: https://coveralls.io/r/panates/postgrejs
