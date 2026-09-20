# Migrating from v3.5 to v3.6

Two changes are visible to existing code. Both are in the same place -
what a query hands back - and both replace a quiet wrong answer with the
right one, so the upgrade is worth reading even though most code needs no
edit at all.

## Breaking changes

### `query()` no longer stops at 100 rows

`query()` used to send a row limit of 100 on every call. A statement that
produced more was answered with the first 100 and nothing said so: no
error, no flag, and a result object indistinguishable from a complete
one.

```ts
const r = await connection.query('select i from generate_series(1, 1000) i');
r.rows.length; // v3.5: 100    v3.6: 1000
```

It now asks for every row, which is what `pg` and `postgres.js` both do.

**What to change.** Nothing, unless you were relying on the cap - a query
against a large table that used to return a page now materialises the
whole result, with the memory and latency that implies. If that is your
case, pass the limit explicitly:

```ts
const r = await connection.query(sql, { fetchCount: 100 });
r.suspended; // true when the server stopped at the limit
```

`suspended` is new, and it is how a truncated result announces itself.
Note that the server does not look ahead: a result exactly `fetchCount`
rows long suspends too, so the flag means "the limit was reached", not
"there are definitely more rows".

`fetchCount: 0` now means unlimited, as it does in the protocol. It used
to be silently turned into 100.

If what you actually want is to read a large result a piece at a time,
that is what a cursor is for - `fetchCount` there is the batch size, and
still defaults to 100:

```ts
const r = await connection.query(sql, { cursor: true, fetchCount: 500 });
for await (const row of r.cursor) {
  /* every row, 500 at a time */
}
```

### `fetchAsString` returns the server's own text

`fetchAsString` used to be honoured by six data types, each rendering a
string from the binary value it had just decoded. It now asks the server
for those columns in its text format and hands the bytes back unparsed,
which is what the option was always meant to do - and the only thing that
agrees with PostgreSQL in every case.

Two consequences:

- **It takes any OID.** It used to quietly do nothing for anything
  outside those six types. `fetchAsString: [DataTypeOIDs.int8]` now gives
  `count(*)` as `'3'` - one consistent type, where a decoded `int8` is a
  `number` or a `BigInt` depending on magnitude, and what code ported
  from `pg` (which returns `int8` as a string) expects.
- **`timestamptz` comes back in a different shape.** The old rendering
  was an ISO string, which is not a form PostgreSQL ever prints:

  ```
  v3.5: '2020-10-22 23:45:12.123Z'
  v3.6: '2020-10-22 23:45:12.123+00'
  ```

  It now follows the session's `TimeZone`, as the server's own output
  does. `date`, `time`, `timestamp`, `json` and `jsonb` are unchanged -
  their old output already matched what the server prints.

An array column is selected by its own array OID (`_timestamptz`), never
by its element's, and comes back as the whole array literal.

## Also new

- `DataType.inferrable` - set it to `false` on a custom type and
  `determine()` will pass over it when inferring a parameter's type,
  while the type still decodes its own columns as before.
- `rowsAffected` is now filled in for `MERGE` (PostgreSQL 15+). It
  carries one total across the statement's actions, not a breakdown.
- `listen()` accepts any channel name PostgreSQL accepts, including
  one-character and underscore-leading names. Names are quoted, and a
  name that could have been written unquoted is folded to lower case the
  way `LISTEN` itself folds it - so a mixed-case name now delivers, where
  before it was accepted and silently never fired.
