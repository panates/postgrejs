# Migrating from v2 to v3

v3 is almost entirely additive - existing code that only uses the built-in
data types keeps working unchanged. There is exactly one breaking API
change, and it only affects you if you registered a **custom** data type.

## Breaking changes

### Custom data type methods renamed

`DataType`'s decode-side members were renamed to pair with their
`encode*` counterparts:

| v2               | v3                 |
| ----------------- | ------------------ |
| `parseBinary`      | `decodeBinary`      |
| `parseText`        | `decodeText`        |
| `parseTextBuffer`  | `decodeTextBuffer`  |

This only matters if you registered a custom `DataType` through
`GlobalTypeMap` (or a `DataTypeMap` of your own) - the built-in types
handle the rename for you. Update the method names:

```ts
// v2
const MyType: DataType = {
  name: 'my_type',
  oid: 90000,
  jsType: 'string',
  parseBinary(v: Buffer): string {
    /* ... */
  },
  parseText(v: string): string {
    /* ... */
  },
  isType: v => typeof v === 'string',
};

// v3
const MyType: DataType = {
  name: 'my_type',
  oid: 90000,
  jsType: 'string',
  decodeBinary(v: Buffer): string {
    /* ... */
  },
  decodeText(v: string): string {
    /* ... */
  },
  isType: v => typeof v === 'string',
};
```

The corresponding type aliases were also renamed, if you referenced them
directly: `ParseTextFunction` → `DecodeTextFunction`,
`ParseTextBufferFunction` → `DecodeTextBufferFunction`.

### License change

v3 relicenses the project from MIT to [BSD 3-Clause](../LICENSE). Both are
permissive licenses; the practical difference is that BSD 3-Clause
requires the copyright notice to be preserved in redistributions.

## What's new in v3

None of the following requires any change to existing code - they're new,
opt-in capabilities:

- **`COPY TO STDOUT` / `COPY FROM STDIN`** - bulk import and export via
  `connection.copyTo()` / `connection.copyFrom()`, as Node streams.
- **Logical replication** - stream row-level changes as they commit with
  `LogicalReplication`.
- **The `sql` tag** - build statements from a template literal
  (`` sql`select * from t where id = ${id}` ``) without hand-rolled string
  concatenation.
- **Query pipelining** - `Pool.query()` / `Pool.execute()` can pipeline
  requests onto a connection, opt-in per call.
- **Cancellation and timeouts** - pass an `AbortSignal` to cancel a
  running query.
- **Large objects** - stream data through PostgreSQL's large object API
  for values too big for a `bytea` column.
- **Multi-host connections** - a `hosts` list with automatic failover and
  `targetSessionAttrs` (`read-write`, `read-only`, `primary`, `standby`,
  `prefer-standby`) to pick the right server in a cluster.
- **SCRAM channel binding** - `channelBinding` option, defaulting to
  `prefer`.
- **Direct TLS negotiation** - `sslNegotiation: 'direct'` skips the
  `SSLRequest` round trip against PostgreSQL 17+.
- **Two-phase commit** - `prepareTransaction()` / `commitPrepared()`.

See the [Feature Comparison](../README.md#feature-comparison) table and
[`CHANGELOG.md`](../CHANGELOG.md) for the full list of fixes and
improvements.
