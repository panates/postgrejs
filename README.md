<!--suppress HtmlDeprecatedAttribute -->
<p align="center">¨
  <a href="https://postgrejs.panates.com/" target="blank">
    <img src="https://postgrejs.panates.com/img/postgrejs-header-block.png" width="800" alt="PostgreJS Logo" />
  </a>
</p>

[![NPM Version][npm-image]][npm-url]
[![NPM Downloads][downloads-image]][downloads-url]
[![CI Tests][ci-test-image]][ci-test-url]
[![Test Coverage][coveralls-image]][coveralls-url]

PostgreJS is an enterprise-level PostgreSQL client for Node.js. It is designed to provide a robust and efficient
interface to PostgreSQL databases, ensuring high performance and reliability for enterprise applications. Written
entirely in TypeScript, it leverages modern JavaScript features to deliver a seamless development experience.

## Installation

```bash
$ npm install postgrejs --save
```

## Documentation

Please read :small_orange_diamond: [DOCUMENTATION](https://postgrejs.panates.com/) :small_orange_diamond: for detailed
usage.

## Library Overview

PostgreJS is a pure JavaScript library, meticulously crafted with TypeScript to offer a strictly typed, well-structured,
and highly maintainable codebase. Key highlights include:

- **Language:** Pure modern JavaScript library.
- **Strictly Typed:** Completely written in TypeScript, offering strong typing and enhanced development experience.
- **Modern module format:** Ships as ESM; Node 20.19+/22.12+ can `require()` it from CommonJS code as well.
- **Comprehensive Testing:** Rigorously tested to ensure stability and reliability in production environments.
- **Promise-Based API:** Asynchronous operations are handled with a Promise-based API, promoting clean and efficient
  asynchronous code.

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
- **Two-phase commit:** `prepareTransaction()` leaves a transaction waiting under a name for `commitPrepared()`/
  `rollbackPrepared()`, from any connection.
- **Cancellation:** Any call takes an `AbortSignal`, which also gives per-query timeouts via `AbortSignal.timeout()`.
- **Flexible Data Retrieval:**  Can return both array and object rows to suit different data processing needs.
- **Resource Management:** Auto disposal of resources with the "using" syntax
  ([TC39 Explicit Resource Management](https://github.com/tc39/proposal-explicit-resource-management)), ensuring
  efficient resource cleanup.

Whether you're building a simple application or a complex enterprise system, PostgreJS provides the features and
performance you need to succeed. Explore the capabilities of the library and elevate your PostgreSQL integration to the
next level.

## Feature Comparison

How PostgreJS compares to [`pg`](https://github.com/brianc/node-postgres) (node-postgres) and
[`postgres`](https://github.com/porsager/postgres) (postgres.js). Every row was checked against the libraries' own
source rather than their documentation — versions compared: **postgrejs 2.23.1, pg 8.23.0, postgres.js 3.4.9**. ✅ built
in · 🟡 partial or needs a separate package · ❌ not supported.

| Feature                            |   PostgreJS    |          pg          |   postgres.js    |
|:-----------------------------------|:--------------:|:--------------------:|:----------------:|
| ***Packaging***                    |                |                      |                  |
| Packages to install                |       1        |    4 <sup>1</sup>    |        1         |
| Module system                      |      ESM       |       ESM/CJS        |     ESM/CJS      |
| Language                           |       TS       |   JS <sup>2</sup>    | JS <sup>3</sup>  |
| TC39 Explicit Resource Management  |       ✅       |          ❌          |        ❌        |
| ***Wire protocol***                |                |                      |                  |
| Simple Query protocol              |       ✅       |          ✅          |        ✅        |
| Extended Query protocol            |       ✅       |          ✅          |        ✅        |
| Text wire format                   |       ✅       |          ✅          |        ✅        |
| Binary wire format                 |       ✅       |   🟡 <sup>4</sup>    | ❌ <sup>5</sup>  |
| Text encoders                      |       56       | generic <sup>6</sup> |        14        |
| Text decoders                      |       56       |          44          | 12 <sup>7</sup>  |
| Binary encoders                    |       56       |          ❌          |        ❌        |
| Binary decoders                    |       56       |          16          |        ❌        |
| Per-column format selection        |       ✅       |          ❌          |        ❌        |
| Multidimensional arrays            |   ✅ binary    | 🟡 text <sup>8</sup> |     🟡 text      |
| Multi-statement scripts            |       ✅       |          ✅          |        ✅        |
| ***Queries***                      |                |                      |                  |
| Query parameters                   |       ✅       |          ✅          |        ✅        |
| Parameter type casting             |       ✅       |   🟡 <sup>9</sup>    |        ✅        |
| Prepared statements                |  ✅ explicit   |          ✅          |   ✅ automatic   |
| Server-side cursors                |       ✅       |   🟡 <sup>10</sup>   |        ✅        |
| `COPY TO` / `COPY FROM`            |       ✅       |   🟡 <sup>11</sup>   |        ✅        |
| Row count after a COPY             |       ✅       |          ✅          |        ❌        |
| Object and array row modes         |       ✅       |          ✅          |        ✅        |
| Query cancellation                 | ✅ AbortSignal |          ✅          |        ✅        |
| Per-query timeout                  | ✅ AbortSignal |          ✅          | ❌ <sup>12</sup> |
| Per-query type mapping             |       ✅       |   ❌ <sup>13</sup>   | ❌ <sup>13</sup> |
| Dynamic SQL helpers                |  ✅ `sql` tag  |          ❌          |        ✅        |
| ***Connections and transactions*** |                |                      |                  |
| Built-in connection pool           |       ✅       |          ✅          |   ✅ implicit    |
| Pipelining on one connection       | ✅ opt-in/call |   ✅ opt-in/client   |   ✅ automatic   |
| Transaction API                    |       ✅       |          ❌          |        ✅        |
| Two-phase commit API               |       ✅       |          ❌          |        ✅        |
| LISTEN/NOTIFY                      |       ✅       |   🟡 <sup>14</sup>   |        ✅        |
| Multiple hosts                     |       ✅       |          ❌          |        ✅        |
| ***Security***                     |                |                      |                  |
| SSL/TLS                            |       ✅       |          ✅          |        ✅        |
| Direct TLS negotiation (PG17)      |       ✅       |          ✅          |        ✅        |
| Cleartext, MD5, SCRAM-SHA-256      |       ✅       |          ✅          |        ✅        |
| SCRAM channel binding (`-PLUS`)    |       ❌       |      ✅ opt-in       |        ❌        |
| GSSAPI / SSPI                      |       ❌       |          ❌          |        ❌        |
| ***Beyond querying***              |                |                      |                  |
| Logical replication                |       ❌       |   🟡 <sup>15</sup>   |  ✅ `subscribe`  |
| Large object API                   |       ❌       |          ❌          |        ✅        |
| Native libpq bindings              |       ❌       |    ✅ `pg-native`    |        ❌        |

- <sup>1</sup> What it takes to reach the feature set above. postgrejs and postgres.js ship everything in the one
  package you import; `pg` needs `pg-cursor` for cursors, `pg-query-stream`
  for row streams and `pg-copy-streams` for COPY, each installed and versioned separately.
- <sup>2</sup> Types come from the separate `@types/pg`; only the `pg-protocol` and
  `pg-connection-string` sub-packages are written in TypeScript.
- <sup>3</sup> Ships a hand-maintained `.d.ts`.
- <sup>4</sup> Results only - parameters are always stringified. Opt-in per query or per client, and all columns at
  once. No binary parser is registered for `bytea`, and binary arrays decode only `int4`, `int8` and `text` elements.
- <sup>5</sup> Both format-code counts are hardcoded to zero and parameters are stringified, so everything on the wire
  is text.
- <sup>6</sup> pg has no per-OID text encoders: a parameter is converted by its
  JavaScript type rather than by the type it is going into, so there is no
  count to give.
- <sup>7</sup> Plus every array type, whose OIDs are read from the catalog when a
  connection opens rather than registered ahead of time.
- <sup>8</sup> Its binary array decoder covers only `int4`, `int8` and `text` elements, so everything else falls back to
  text anyway.
- <sup>9</sup> A `types` array on the query config does reach the Parse message, but the same field doubles as the
  result parser override, so any row-returning query throws inside pg's own handler. Verified usable only for statements
  that return no rows (pg 8.23.0).
- <sup>10</sup> Core has the row-limit primitive; the cursor and stream APIs are separate packages.
- <sup>11</sup> The core `Query` refuses COPY IN; `pg-copy-streams` is required.
- <sup>12</sup> Connection-level timeouts only.
- <sup>13</sup> Global or per-client (pg) and per-instance (postgres.js), but not per query.
- <sup>14</sup> On the client only - the pool does not forward notifications.
- <sup>15</sup> A connection flag exists, but nothing decodes the stream.


## Benchmarks

postgrejs implements the full PostgreSQL wire protocol from scratch, with no dependency on `pg`/libpq.
[`BENCHMARKS.md`](./BENCHMARKS.md) compares it against `pg` (node-postgres) and `postgres` (postgres.js)
across connection setup, simple/prepared queries, mixed-type decoding, bulk fetches, cursor streaming and pool
concurrency, each library run through its own idiomatic fast path. The numbers there are reproducible on your own
machine via `npm run bench` against the repo's own
`docker-compose.yaml` Postgres instance; see [`benchmark/README.md`](./benchmark/README.md) for details.

## Support

You can report bugs and discuss features on the [GitHub issues](https://github.com/panates/postgrejs/issues) page When
you open an issue please provide version of NodeJS and PostgreSQL server.

## Node Compatibility

- node >= 20.x

## License

PostgreJS is available under [MIT](LICENSE) license.

[npm-image]: https://img.shields.io/npm/v/postgrejs
[npm-url]: https://npmjs.org/package/postgrejs
[downloads-image]: https://img.shields.io/npm/dm/postgrejs.svg
[downloads-url]: https://npmjs.org/package/postgrejs
[ci-test-image]: https://github.com/panates/postgrejs/actions/workflows/test.yml/badge.svg
[ci-test-url]: https://github.com/panates/postgrejs/actions/workflows/test.yml
[coveralls-image]: https://img.shields.io/coveralls/panates/postgrejs/master.svg
[coveralls-url]: https://coveralls.io/r/panates/postgrejs
