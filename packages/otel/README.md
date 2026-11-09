# postgrejs-otel

OpenTelemetry instrumentation for [postgrejs](https://www.postgrejs.com/).

postgrejs publishes its queries, pool waits and connection attempts on Node's
`diagnostics_channel`. This package subscribes to those channels and turns
the events into OpenTelemetry spans. It patches nothing, so it works however
postgrejs was loaded (ESM, CommonJS, bundled) and the order of imports does
not matter. It runs on Node.js and Bun.

## Installation

```sh
npm install postgrejs-otel @opentelemetry/api
```

Use the same version of postgrejs-otel as of postgrejs. The two are released
together.

## Usage

With the OpenTelemetry Node SDK:

```ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { PostgrejsInstrumentation } from 'postgrejs-otel';

const sdk = new NodeSDK({
  instrumentations: [new PostgrejsInstrumentation()],
});
sdk.start();
```

`registerInstrumentations()` from `@opentelemetry/instrumentation` takes it the
same way. Without either, constructing it is enough: it subscribes at once and
uses the global tracer provider.

```ts
new PostgrejsInstrumentation();
```

## Spans

| Span                     | Kind     | Covers                                                                      |
|--------------------------|----------|-----------------------------------------------------------------------------|
| the database name        | client   | one `query()` or `execute()`, on a connection or a pool                     |
| `COPY`, or `COPY <table>`| client   | one `copyTo()`, `copyFrom()` or `copyFromRows()`, until the server is done |
| `postgrejs.pool.acquire` | internal | the time a caller waits for a pooled connection, opening a new one included |
| `postgrejs.connect`      | client   | opening a connection: socket, TLS, authentication, startup                  |

A statement span is named after the database, as the OpenTelemetry semantic
conventions ask when the operation and table are not known without parsing the
SQL (`postgresql` when no database is configured). A COPY is known to be one,
so its span is named `COPY`, followed by the table when `copyFromRows()` was
given one.

A COPY span lasts until the server reports the copy finished, not until
`copyTo()` or `copyFrom()` resolves: those resolve once the server accepts the
copy, and the data moves afterwards. A consumer that reads a large export
slowly keeps the server, and the span, busy for as long as it takes. A
`copyTo()` stream destroyed early is not an error: the server still finishes
the copy, its output is discarded, and the span says `postgrejs.copy.aborted`.
A `copyFrom()` whose source fails sends CopyFail, which the server answers
with an error (`57014`), and the span records it. A connection opened while a
caller waits for the pool is a child of that caller's acquire span. The query
that follows is a sibling of the acquire span, so the wait and the query show
up as two separate bars.

Attributes, following the stable database semantic conventions:

| Attribute                   | On                    | Value                                                         |
|-----------------------------|-----------------------|---------------------------------------------------------------|
| `db.system.name`            | all                   | `postgresql`                                                  |
| `db.namespace`              | all                   | the database name                                             |
| `server.address`            | all                   | the configured host                                           |
| `server.port`               | all but unix sockets  | the configured port, 5432 by default                          |
| `db.query.text`             | statements, COPY      | the SQL as the application wrote it, see `captureQueryText`   |
| `db.operation.name`         | COPY                  | `COPY`                                                        |
| `db.collection.name`        | `copyFromRows()`      | the table it was given                                        |
| `db.response.returned_rows` | `query()`, COPY TO    | the number of rows returned                                   |
| `postgrejs.copy.direction`  | COPY                  | `to` or `from`                                                |
| `postgrejs.copy.rows`       | COPY FROM             | the number of rows the server took                            |
| `postgrejs.copy.bytes`      | COPY                  | the bytes of data sent or received, on failure too            |
| `postgrejs.copy.aborted`    | COPY TO               | `true` when the consumer destroyed the stream before the end  |
| `db.response.status_code`   | statements and COPY, on error | the SQLSTATE, e.g. `42P01`                                    |
| `error.type`                | on error              | the SQLSTATE, a Node.js error code such as `ECONNREFUSED`, or the error's class name |
| `postgrejs.backend_pid`     | statements, connect   | the server process id, as in `pg_stat_activity.pid`           |

Parameter values are never recorded.

## Options

```ts
new PostgrejsInstrumentation({
  requireParentSpan: true,
  captureQueryText: true,
  requestHook: (span, { operation, context }) => {},
  responseHook: (span, { operation, context }) => {},
  sqlComment: { tags: { app: 'billing' }, traceparent: false },
});
```

- `requireParentSpan` (default `false`): create spans only when a span is
  already active, so a pool warming up or a background job outside any trace
  does not produce root spans.
- `captureQueryText` (default `true`): record `db.query.text`. A statement
  sent without parameters can carry literal values in its text; turn this off
  if those can be sensitive.
- `requestHook` and `responseHook`: called for each statement and COPY with
  the span, the `operation` (`query`, `execute` or `copy`) and what postgrejs
  published: `context.sql` and `context.connection`, plus `context.result` in
  the response hook of a query or an execute, and `rowCount` and `bytes` in
  that of a COPY. An exception thrown by a hook is logged through `diag` and
  does not reach the query.
- `sqlComment`: put a comment in front of every statement, in the
  [sqlcommenter](https://google.github.io/sqlcommenter/spec/) format. `tags` is
  an object or a function of the connection. `traceparent: true` adds the
  statement span's W3C trace context, which links a row in `pg_stat_activity`
  or a database monitoring sample to its trace.

`traceparent` makes the statement text different on every call. postgrejs
reuses a prepared statement only while the text stays the same, so with it on
every query is parsed by the server again. Tags alone are the same on every
call and cost nothing of the kind.

## Datadog

dd-trace accepts OpenTelemetry spans through its own tracer provider:

```ts
import tracer from 'dd-trace';
import { PostgrejsInstrumentation } from 'postgrejs-otel';

tracer.init();
const provider = new tracer.TracerProvider();
provider.register();

new PostgrejsInstrumentation();
```

dd-trace 6 requires `@opentelemetry/api` below 1.10, and an API of a newer
minor version does not see a provider registered through an older one: the
spans are dropped. postgrejs-otel notices this at its first span and emits a
`POSTGREJS_OTEL_HIDDEN_PROVIDER` process warning. Keep the application's
`@opentelemetry/api` on 1.9.x while it uses dd-trace. For the same reason, don't use
`registerInstrumentations()` here: `@opentelemetry/instrumentation` 0.301 needs
API 1.10.

For Database Monitoring, `datadogDbmTags()` writes the comment dd-trace's own
`pg` integration writes in its `service` mode, which links query samples to the
service:

```ts
import { datadogDbmTags, PostgrejsInstrumentation } from 'postgrejs-otel';

new PostgrejsInstrumentation({
  sqlComment: {
    tags: datadogDbmTags({ service: 'api', env: 'prod', version: '1.4.0' }),
  },
});
```

Adding `traceparent: true` corresponds to dd-trace's `full` mode, with the
cost described above.

## Not covered yet

- Cursor fetches, `prepare()`, the statements of a `pipeline()`, and the
  transaction commands (`startTransaction()`, `commit()`, `rollback()`,
  savepoints) get no span of their own. postgrejs does not publish them yet.
- The column lookup `copyFromRows()` makes before its COPY, when it is not
  given the column types, is not part of the COPY span.
- No metrics are recorded.
- With several hosts configured, `server.address` is the first one, not
  necessarily the one the connection reached.
