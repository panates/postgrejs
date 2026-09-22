# Migrating: what the value classes serialise to

> File this under whatever version number the release takes; the change
> itself is the one below.

One change, visible only to code that puts a decoded value through
`JSON.stringify` - which includes `res.json(rows)`, a structured log line,
and writing a value into a `json`/`jsonb` column.

## Breaking change

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
