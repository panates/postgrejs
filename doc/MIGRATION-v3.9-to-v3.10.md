# Migrating from v3.9 to v3.10

Three changes are visible to existing code. Two are about what a decoded
value looks like once it is serialised - `res.json(rows)`, a structured
log line, or writing into a `json`/`jsonb` column - and the third is about
what an array parameter is declared as on the wire.

## Breaking changes

### The value classes serialise as their fields, not as the literal

Every class this client decodes into - `Point`, `Circle`, `Box`,
`LineSegment`, `Line`, `Path`, `Polygon`, `Range` and `Interval` - had a
`toJSON()` that returned its `toString()`. A structure therefore became
text the moment a row was serialised:

```ts
const r = await connection.query("select '(1,2)'::point p, '1 day'::interval i");
JSON.stringify(r.rows[0]);
// before: {"p":"(1,2)","i":"1 day"}
// now:    {"p":{"x":1,"y":2},"i":{"days":1}}
```

`toJSON()` is how an object says what its JSON value is, and a structure's
JSON value is its fields; returning the literal made `JSON.stringify(v)`
and `String(v)` the same thing and left the fields unreachable to anything
downstream. `Numeric` keeps its own `toJSON()` - it wraps a single decimal,
so its JSON value is that string and not `{"value":"19.99"}`.

The literal has not gone anywhere. It is what `String(v)`, `${v}` and
`v.toString()` give, what `v.toPostgres()` gives, and what is sent when the
value is bound as a parameter.

**What to change.** If an API response or a stored document was carrying
these literals, either read them explicitly:

```ts
String(row.p);          // '(1,2)'
row.i.toString();       // '1 day'
```

or ask the server for the text in the first place, which is exact and costs
no conversion here:

```ts
await connection.query(sql, { fetchAsString: [DataTypeOIDs.point] });
```

Note that a value serialised to JSON and parsed back is no longer always
accepted as a parameter: a plain `{x, y}` is still recognised as a point
and a plain `{x, y, radius}` as a circle, but `{days: 1}` is not recognised
as an interval and a plain range object has no type OID. Sending one back
means naming the type - `new BindParam(DataTypeOIDs.interval, value)` - or
keeping the class.

### `Interval` carries only the fields that have a value

It used to fill all seven with `0`:

```ts
const iv = new Interval({ days: 1, hours: 2 });
// before: { years: 0, months: 0, days: 1, hours: 2, minutes: 0, seconds: 0, milliseconds: 0 }
// now:    { days: 1, hours: 2 }
iv.minutes;  // before: 0    now: undefined
```

This is the shape `pg`'s `postgres-interval` has, and the shape the wire
format has - PostgreSQL stores three quantities, and a zero among them is
not a field. The zeroes were this client's own invention and they appeared
in every spread, every `Object.keys()` and every serialised row.

**What to change.** Reading a field now needs to say what an absent one
means. In TypeScript the fields are optional, so the compiler points at
every place:

```ts
const hours = (iv.hours ?? 0) + 1;
```

In JavaScript there is no such warning, and `iv.hours + 1` is `NaN` for an
interval that has no hours - worth a search for arithmetic on these fields
before upgrading.

Everything derived still reads an absent field as the zero it stands for:
`iv.totalMonths`, `iv.totalMicroseconds`, `String(iv)` (a zero interval is
still `00:00:00`), `iv.toISOString()` and the parameter path are unchanged.

### An array of numbers is sent with no declared type

`[1, 2]` used to go out declared `int4[]`, and `[1.5]` declared `float8[]`.
Which it really is depends on the column it lands in, and unlike their
scalars those array types have no operators or implicit casts between
them - so the declaration was not a harmless guess:

```ts
await connection.query('select array[1,2]::int8[] = $1', { params: [[1, 2]] });
// v3.9:  42883 operator does not exist: bigint[] = integer[]
// v3.10: true
```

Four of the six numeric array types could not be compared with a parameter
at all. They all work now, and so does the same thing one layer up: the
`sql` tag writes `'{"1","2"}'` where it used to write
`ARRAY['1','2']::_int4`.

**What to change.** Nothing, unless a statement gave the parameter no
context to be resolved from - the same price a string parameter has paid
since v3.7:

```ts
await connection.query('select $1', { params: [[1, 2]] });
// v3.9:  [1, 2]
// v3.10: '{"1","2"}'   - the server reads an unknown literal as text
```

Name the type where that matters, which is also how a large numeric array
keeps the binary encoding a text literal gives up:

```ts
new BindParam(DataTypeOIDs._int4, [1, 2])
```

Arrays of strings, dates, booleans, Buffers and this client's own classes
are unchanged, as are scalar numbers.

## Also in this release

Nothing below changes existing behaviour.

- `temporalTypes` decodes `date`, `time`, `timestamp`, `timestamptz` and
  `interval` into `Temporal` values instead of `Date`, with the
  microseconds PostgreSQL stores. Off by default; needs a `Temporal`
  polyfill until a runtime ships one.
- `decimalAsString` decodes `money` and `numeric` into the exact decimal
  string they carry - no currency symbol, no grouping, the scale the
  server reported.
- `fetchAsString` entries may be `{ oid, arrays: false }`, to ask for a
  scalar column as text without its array columns following.
- A connection that is lost now reports on `'error'` as well as `'close'`,
  which is where code ported from `pg` listens. A listener that was
  attached and never fired starts firing.
- A `postgresql://` connection string no longer loses the database name.
