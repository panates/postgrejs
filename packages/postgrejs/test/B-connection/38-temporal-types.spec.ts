import { expect } from 'expect';
import { BindParam, Connection, DataFormat, DataTypeOIDs } from 'postgrejs';
import { Temporal } from 'temporal-polyfill';

(globalThis as any).Temporal = (globalThis as any).Temporal || Temporal;

/**
 * `temporalTypes` against a live server.
 *
 * The three things it is for, each pinned below: the microseconds
 * PostgreSQL stores and a `Date` drops, a `timestamp` that says it has
 * no zone instead of guessing one, and a `date` that stays a date - the
 * year 44 is the blunt version of that last one, since `new Date(44, ...)`
 * is 1944.
 */
describe('temporalTypes', () => {
  const conn = new Connection({ temporalTypes: true });
  let multirange = false;
  before(async () => {
    await conn.connect();
    multirange = parseInt(conn.sessionParameters.server_version, 10) >= 14;
  });
  after(() => conn.close(0));

  const SQL =
    "select '2024-06-15 10:30:00.123456+03'::timestamptz tstz," +
    " '2024-06-15 10:30:00.123456'::timestamp ts," +
    " '2024-06-15'::date d," +
    " '12:34:56.123456'::time t," +
    " '1 year 2 mons 3 days 04:05:06.7'::interval iv";

  const row = async (sql: string, options?: any) =>
    (await conn.query(sql, { objectRows: true, ...options })).rows?.[0] as any;

  for (const [label, options] of [
    ['binary', {}],
    ['text', { columnFormat: DataFormat.text }],
  ] as [string, any][]) {
    it(`should decode the five into Temporal values (${label})`, async () => {
      const r = await row(SQL, options);
      expect(r.tstz).toBeInstanceOf(Temporal.ZonedDateTime);
      expect(r.ts).toBeInstanceOf(Temporal.PlainDateTime);
      expect(r.d).toBeInstanceOf(Temporal.PlainDate);
      expect(r.t).toBeInstanceOf(Temporal.PlainTime);
      expect(r.iv).toBeInstanceOf(Temporal.Duration);
      // The microseconds a Date cannot hold, in every one of them.
      expect(r.tstz.toInstant().epochNanoseconds).toStrictEqual(
        Temporal.Instant.from('2024-06-15T07:30:00.123456Z').epochNanoseconds,
      );
      expect(r.ts.toString()).toStrictEqual('2024-06-15T10:30:00.123456');
      expect(r.d.toString()).toStrictEqual('2024-06-15');
      expect(r.t.toString()).toStrictEqual('12:34:56.123456');
      expect(r.iv.toString()).toStrictEqual('P14M3DT4H5M6.7S');
    });
  }

  it('should keep a year the Date path used to move by 1900', async () => {
    const r = await row("select '0044-03-15'::date d");
    expect(r.d.toString()).toStrictEqual('0044-03-15');
    // The Date path answers the same year now - it used to come back as
    // 1944, because `new Date(44, ...)` means 1944. See util/local-date.ts.
    const asDate = await row("select '0044-03-15'::date d", {
      temporalTypes: false,
    });
    expect(asDate.d.getFullYear()).toStrictEqual(44);
  });

  it('should still answer Infinity for the sentinels', async () => {
    // Temporal has no value for either end, so these stay the numbers
    // they already were.
    const r = await row(
      "select 'infinity'::timestamptz a, '-infinity'::timestamptz b," +
        " 'infinity'::timestamp c, '-infinity'::timestamp d," +
        " 'infinity'::date e, '-infinity'::date f",
    );
    expect([r.a, r.c, r.e]).toStrictEqual([Infinity, Infinity, Infinity]);
    expect([r.b, r.d, r.f]).toStrictEqual([-Infinity, -Infinity, -Infinity]);
  });

  it('should read an interval that is wholly negative', async () => {
    const r = await row("select '-1 mon -2 days -03:04:05.6'::interval v");
    expect(r.v.toString()).toStrictEqual('-P1M2DT3H4M5.6S');
    expect([r.v.months, r.v.days, r.v.hours]).toStrictEqual([-1, -2, -3]);
  });

  it('should read a BC year as Temporal counts them', async () => {
    // 44 BC is the year -43 astronomically, which is what Temporal uses.
    for (const options of [{}, { columnFormat: DataFormat.text }]) {
      const r = await row(
        "select '0044-03-15 12:00:00 BC'::timestamp v",
        options,
      );
      expect(r.v.year).toStrictEqual(-43);
    }
  });

  describe('the array and range types that follow each scalar', () => {
    it('should decode an array column into Temporal elements', async () => {
      const r = await row(
        "select array['2024-06-15 10:30:00.123456+03'::timestamptz, null] v," +
          " array['2024-06-15'::date] d",
      );
      expect(r.v[0]).toBeInstanceOf(Temporal.ZonedDateTime);
      expect(r.v[1]).toStrictEqual(null);
      expect(r.d[0]).toBeInstanceOf(Temporal.PlainDate);
    });

    it('should decode a range column into Temporal bounds', async () => {
      const r = await row(
        "select tstzrange('2024-01-01 00:00:00+00','2024-06-15 10:30:00.123456+00') v," +
          " daterange('2024-01-01','2024-06-15') d",
      );
      expect(r.v.lower).toBeInstanceOf(Temporal.ZonedDateTime);
      expect(r.v.upper.toInstant().epochNanoseconds).toStrictEqual(
        Temporal.Instant.from('2024-06-15T10:30:00.123456Z').epochNanoseconds,
      );
      expect(r.d.lower).toBeInstanceOf(Temporal.PlainDate);
    });

    it('should decode a multirange column too', async function () {
      if (!multirange) return this.skip();
      const r = await row(
        "select datemultirange(daterange('2024-01-01','2024-02-01')) v",
      );
      expect(r.v[0].lower).toBeInstanceOf(Temporal.PlainDate);
    });
  });

  describe('the selection', () => {
    it('should move only the family it names', async () => {
      const c = new Connection({
        temporalTypes: [DataTypeOIDs.timestamptz],
      });
      await c.connect();
      try {
        const r = (
          await c.query(
            "select now() tstz, array[now()] arr, tstzrange(now(), now()+interval '1 day') rng," +
              ' now()::timestamp ts, current_date d',
            { objectRows: true },
          )
        ).rows?.[0] as any;
        expect(r.tstz).toBeInstanceOf(Temporal.ZonedDateTime);
        expect(r.arr[0]).toBeInstanceOf(Temporal.ZonedDateTime);
        expect(r.rng.lower).toBeInstanceOf(Temporal.ZonedDateTime);
        // Not selected, so untouched.
        expect(r.ts).toBeInstanceOf(Date);
        expect(r.d).toBeInstanceOf(Date);
      } finally {
        await c.close(0);
      }
    });

    it('should be overridable per statement, both ways', async () => {
      const plain = new Connection();
      await plain.connect();
      try {
        expect(
          (
            (await plain.query('select now() v', { objectRows: true }))
              .rows?.[0] as any
          ).v,
        ).toBeInstanceOf(Date);
        expect(
          (
            (
              await plain.query('select now() v', {
                objectRows: true,
                temporalTypes: true,
              })
            ).rows?.[0] as any
          ).v,
        ).toBeInstanceOf(Temporal.ZonedDateTime);
      } finally {
        await plain.close(0);
      }
      const r = await row('select now() v', { temporalTypes: false });
      expect(r.v).toBeInstanceOf(Date);
    });

    it('should refuse an OID outside the five when the connection is built', () => {
      // Before any I/O: the configuration is wrong, and a statement is
      // the wrong place to find that out.
      expect(
        () => new Connection({ temporalTypes: [DataTypeOIDs.timetz] }),
      ).toThrow(/only date \(1082\)/);
    });
  });

  describe('the zone a timestamptz is printed in', () => {
    it('should follow the session TimeZone', async () => {
      const before = conn.sessionParameters.TimeZone;
      await conn.execute("SET TimeZone TO 'Europe/Istanbul'");
      try {
        const r = await row('select now() v');
        expect(r.v.timeZoneId).toStrictEqual('Europe/Istanbul');
        await conn.execute("SET TimeZone TO 'Asia/Tokyo'");
        expect((await row('select now() v')).v.timeZoneId).toStrictEqual(
          'Asia/Tokyo',
        );
      } finally {
        await conn.execute(`SET TimeZone TO '${before}'`);
      }
    });

    it('should let the caller name one instead', async () => {
      const r = await row("select '2024-06-15 10:30:00+00'::timestamptz v", {
        timeZone: 'Asia/Tokyo',
      });
      expect(r.v.timeZoneId).toStrictEqual('Asia/Tokyo');
      // The instant is the same one whatever zone shows it.
      expect(r.v.toInstant().epochNanoseconds).toStrictEqual(
        Temporal.Instant.from('2024-06-15T10:30:00Z').epochNanoseconds,
      );
    });
  });

  describe('parameters', () => {
    const VALUES: [string, any, string][] = [
      [
        'timestamptz',
        Temporal.ZonedDateTime.from(
          '2024-06-15T10:30:00.123456+03:00[Europe/Istanbul]',
        ),
        '2024-06-15 07:30:00.123456+00',
      ],
      [
        'timestamp',
        Temporal.PlainDateTime.from('2024-06-15T10:30:00.123456'),
        '2024-06-15 10:30:00.123456',
      ],
      ['date', Temporal.PlainDate.from('2024-06-15'), '2024-06-15'],
      ['time', Temporal.PlainTime.from('12:34:56.123456'), '12:34:56.123456'],
      [
        'interval',
        Temporal.Duration.from({ months: 14, days: 3, microseconds: 1500000 }),
        '1 year 2 mons 3 days 00:00:01.5',
      ],
    ];

    for (const [name, value, text] of VALUES) {
      it(`should send a Temporal value as ${name} (binary)`, async () => {
        const r = await row(`select ($1::${name})::text v`, {
          params: [value],
        });
        expect(r.v).toStrictEqual(text);
      });

      it(`should send a Temporal value as ${name} and read it back as text`, async () => {
        const r = await row(`select ($1::${name})::text v`, {
          params: [value],
          columnFormat: DataFormat.text,
        });
        expect(r.v).toStrictEqual(text);
      });
    }

    it('should infer the type from the value with no cast', async () => {
      for (const [, value] of VALUES) {
        const r = await row('select $1 v', { params: [value] });
        expect(r.v.constructor).toBe(value.constructor);
      }
    });

    it('should still take the Dates and strings it always took', async () => {
      const r = await row(
        'select ($1::timestamptz)::text a, ($2::date)::text b, ($3::interval)::text c',
        {
          params: [
            new Date(Date.UTC(2024, 5, 15, 7, 30)),
            '2024-06-15',
            '1 mon',
          ],
        },
      );
      expect(r.a).toStrictEqual('2024-06-15 07:30:00+00');
      expect(r.b).toStrictEqual('2024-06-15');
      expect(r.c).toStrictEqual('1 mon');
    });

    it('should encode the Dates and strings it always took, as their own type', async () => {
      // Naming the OID is what sends these through the type's own binary
      // encoder rather than as an untyped parameter - the path that has
      // to keep working for a caller who turns this on and changes
      // nothing else.
      const d = new Date(Date.UTC(2024, 5, 15, 10, 30));
      const r = await row(
        'select ($1)::text a, ($2)::text b, ($3)::text c, ($4)::text e, ($5)::text f',
        {
          utcDates: true,
          params: [
            new BindParam(DataTypeOIDs.timestamptz, d),
            new BindParam(DataTypeOIDs.timestamp, d),
            new BindParam(DataTypeOIDs.date, new Date(Date.UTC(2024, 5, 15))),
            new BindParam(
              DataTypeOIDs.time,
              new Date(Date.UTC(1970, 0, 1, 12, 34, 56)),
            ),
            new BindParam(DataTypeOIDs.interval, '1 mon'),
          ],
        },
      );
      expect(r.a).toStrictEqual('2024-06-15 10:30:00+00');
      expect(r.b).toStrictEqual('2024-06-15 10:30:00');
      expect(r.c).toStrictEqual('2024-06-15');
      expect(r.e).toStrictEqual('12:34:56');
      expect(r.f).toStrictEqual('1 mon');
    });

    it('should send an Instant as well as a ZonedDateTime', async () => {
      const r = await row('select ($1::timestamptz)::text v', {
        params: [Temporal.Instant.from('2024-06-15T07:30:00.123456Z')],
      });
      expect(r.v).toStrictEqual('2024-06-15 07:30:00.123456+00');
    });

    it('should refuse a value carrying nanoseconds', async () => {
      // PostgreSQL stores microseconds; dropping the rest silently is
      // how a value that round-trips stops being the same value.
      await expect(
        row('select $1::timestamptz v', {
          params: [
            Temporal.ZonedDateTime.from(
              '2024-06-15T10:30:00.123456789+03:00[Europe/Istanbul]',
            ),
          ],
        }),
      ).rejects.toThrow(/carries nanoseconds/);
      await expect(
        row('select $1::time v', {
          params: [Temporal.PlainTime.from('12:34:56.1234567')],
        }),
      ).rejects.toThrow(/carries nanoseconds/);
      await expect(
        row('select $1::interval v', {
          params: [Temporal.Duration.from({ nanoseconds: 1500 })],
        }),
      ).rejects.toThrow(/carries nanoseconds/);
    });
  });

  describe('what has no Temporal value at all', () => {
    it('should refuse an interval whose parts disagree in sign', async () => {
      // `interval '1 mon -3 days'` is ordinary PostgreSQL and has no
      // Duration: balancing months against days needs a date to count
      // from, which a bare interval does not carry.
      await expect(row("select '1 mon -3 days'::interval v")).rejects.toThrow(
        /mixes signs/,
      );
    });

    it("should refuse time '24:00:00'", async () => {
      // The end of the day, which a PlainTime stops one nanosecond short
      // of - and adding a day of microseconds to midnight would wrap
      // back to 00:00:00 without saying so.
      await expect(row("select '24:00:00'::time v")).rejects.toThrow(
        /has no Temporal.PlainTime/,
      );
    });

    it('should leave timetz where it was', async () => {
      const r = await row("select '12:34:56+03'::timetz v");
      expect(r.v).not.toBeInstanceOf(Temporal.PlainTime);
    });
  });

  describe('a server that is not rendering in ISO', () => {
    // The styled renderings carry milliseconds at best, so these go
    // through the parser that already reads them and the Date it builds.
    it('should still read a timestamp, a date and a time', async () => {
      const style = conn.sessionParameters.DateStyle;
      await conn.execute("SET DateStyle TO 'German, DMY'");
      try {
        const r = await row(
          "select '2024-06-15 10:30:00.456'::timestamp ts, '2024-06-15'::date d," +
            " '12:34:56.5'::time t, 'infinity'::timestamp i," +
            " '-infinity'::date j",
          { columnFormat: DataFormat.text },
        );
        expect(r.ts.toString()).toStrictEqual('2024-06-15T10:30:00.456');
        expect(r.d.toString()).toStrictEqual('2024-06-15');
        expect(r.t.toString()).toStrictEqual('12:34:56.5');
        // The sentinels are not dates, and no style renders them as one.
        expect(r.i).toStrictEqual(Infinity);
        expect(r.j).toStrictEqual(-Infinity);
      } finally {
        await conn.execute(`SET DateStyle TO '${style}'`);
      }
    });

    it('should read them under utcDates too', async () => {
      const style = conn.sessionParameters.DateStyle;
      await conn.execute("SET DateStyle TO 'SQL, DMY'");
      try {
        const r = await row(
          "select '2024-06-15 10:30:00.456'::timestamp ts, '2024-06-15'::date d",
          { columnFormat: DataFormat.text, utcDates: true },
        );
        expect(r.ts.toString()).toStrictEqual('2024-06-15T10:30:00.456');
        expect(r.d.toString()).toStrictEqual('2024-06-15');
      } finally {
        await conn.execute(`SET DateStyle TO '${style}'`);
      }
    });

    it('should read a timestamptz whose zone does name an offset', async () => {
      const style = conn.sessionParameters.DateStyle;
      const zone = conn.sessionParameters.TimeZone;
      await conn.execute("SET DateStyle TO 'German, DMY'");
      await conn.execute("SET TimeZone TO 'UTC'");
      try {
        const r = await row(
          "select '2024-01-15 10:30:00+00'::timestamptz v, 'infinity'::timestamptz i",
          { columnFormat: DataFormat.text },
        );
        expect(r.v.toInstant().epochNanoseconds).toStrictEqual(
          Temporal.Instant.from('2024-01-15T10:30:00Z').epochNanoseconds,
        );
        expect(r.i).toStrictEqual(Infinity);
      } finally {
        await conn.execute(`SET DateStyle TO '${style}'`);
        await conn.execute(`SET TimeZone TO '${zone}'`);
      }
    });

    it('should say so when the rendering names no offset', async () => {
      // Outside ISO the server writes the zone's abbreviation, and `EST`
      // identifies no offset - there is no instant to build and no
      // ZonedDateTime to answer with.
      const style = conn.sessionParameters.DateStyle;
      const zone = conn.sessionParameters.TimeZone;
      await conn.execute("SET DateStyle TO 'German, DMY'");
      await conn.execute("SET TimeZone TO 'America/New_York'");
      try {
        await expect(
          row("select '2024-01-15 10:30:00+00'::timestamptz v", {
            columnFormat: DataFormat.text,
          }),
        ).rejects.toThrow(/could not be read as a date/);
      } finally {
        await conn.execute(`SET DateStyle TO '${style}'`);
        await conn.execute(`SET TimeZone TO '${zone}'`);
      }
    });
  });

  it('should hand a fetchAsString column over untouched', async () => {
    const r = await row(
      "select '2024-06-15 10:30:00.123456+03'::timestamptz v",
      {
        fetchAsString: [DataTypeOIDs.timestamptz],
      },
    );
    expect(typeof r.v).toStrictEqual('string');
  });
});
