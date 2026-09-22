import { expect } from 'expect';
import { Connection, DataFormat } from 'postgrejs';

/**
 * A session whose `DateStyle` is not ISO renders dates in a convention
 * the string itself cannot carry: `05/03/2024` is the fifth of March
 * under `SQL, DMY` and the third of May under `SQL, MDY`. The text path
 * used to hand those to `new Date()`, which always guesses the American
 * one - so the day and the month swapped, silently, for every day of
 * the month up to twelve, and only a day past twelve produced anything
 * a caller would notice.
 *
 * The server reports `DateStyle` among its startup parameters and again
 * on every `SET`, so the convention is read rather than guessed. The
 * binary path never had this problem - it carries no formatting - and
 * is the control every assertion here is made against.
 */
describe('DateStyle', () => {
  const conn = new Connection();
  const SQL =
    "select '2024-03-05'::date as d, '2024-11-25'::date as d25," +
    " '2024-03-05 01:02:03.456'::timestamp as ts," +
    " '2024-03-05 01:02:03.456+00'::timestamptz as tstz," +
    " array['2024-03-05'::date,'2024-11-25'::date] as darr";

  before(async () => {
    await conn.connect();
    await conn.execute(`set time zone 'UTC'`);
  });
  after(async () => {
    await conn.execute(`set datestyle to 'ISO, MDY'`);
    return conn.close(0);
  });

  /** A `date` decodes to a local midnight, so it is read as a calendar day. */
  const ymd = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const both = async (options: any = {}) => {
    const binary = await conn.query(SQL, {
      objectRows: true,
      columnFormat: DataFormat.binary,
      ...options,
    });
    const text = await conn.query(SQL, {
      objectRows: true,
      columnFormat: DataFormat.text,
      ...options,
    });
    return { binary: binary.rows?.[0] as any, text: text.rows?.[0] as any };
  };

  for (const style of ['ISO', 'SQL', 'Postgres', 'German']) {
    for (const order of ['MDY', 'DMY', 'YMD']) {
      it(`should read text the same as binary under ${style}, ${order}`, async () => {
        await conn.execute(`set datestyle to '${style}, ${order}'`);
        const { binary, text } = await both();
        expect(text).toStrictEqual(binary);
        // And the value is the stored one, not merely a matching pair.
        expect(ymd(text.d as Date)).toStrictEqual('2024-03-05');
      });
    }
  }

  it('should keep the day past twelve, the only one anyone would notice', async () => {
    // A day of 25 cannot be a month, so a swap shows up as an Invalid
    // Date rather than as a plausible wrong one. Both are in the query
    // above precisely so the silent case cannot pass alone.
    await conn.execute(`set datestyle to 'German, DMY'`);
    const { binary, text } = await both();
    expect(ymd(text.d25 as Date)).toStrictEqual('2024-11-25');
    expect(text.d25).toStrictEqual(binary.d25);
  });

  it('should read an array of them too', async () => {
    await conn.execute(`set datestyle to 'SQL, DMY'`);
    const { binary, text } = await both();
    expect(text.darr).toStrictEqual(binary.darr);
    expect(ymd(text.darr[0] as Date)).toStrictEqual('2024-03-05');
  });

  it('should hold through prepare:false with unknownTypesAsString', async () => {
    // The realistic way in: `prepare: false` is the documented answer
    // for PgBouncer in transaction pooling, `unknownTypesAsString` is
    // how an enum column comes back as a string, and together they ask
    // for the whole row as text.
    await conn.execute(`set datestyle to 'German, DMY'`);
    const r = await conn.query("select '2024-03-05'::date as d", {
      objectRows: true,
      prepare: false,
      unknownTypesAsString: true,
    });
    expect(ymd((r.rows?.[0] as any).d as Date)).toStrictEqual('2024-03-05');
  });

  it('should follow a SET in the middle of a session', async () => {
    // The setting arrives as a fresh ParameterStatus, so a connection
    // that changes it must not go on decoding by the old one.
    await conn.execute(`set datestyle to 'ISO, MDY'`);
    const iso = await both();
    await conn.execute(`set datestyle to 'German, DMY'`);
    const german = await both();
    expect(german.text).toStrictEqual(iso.text);
  });

  it('should decline a zone abbreviation rather than answer wrongly', async () => {
    // Outside ISO the server writes the zone's abbreviation where it has
    // one, and EST/IST name no offset anybody can resolve. An Invalid
    // Date is the honest answer; the binary path, which is the default,
    // is unaffected and still returns the instant.
    await conn.execute(`set time zone 'America/New_York'`);
    try {
      await conn.execute(`set datestyle to 'German, DMY'`);
      const { binary, text } = await both();
      expect((binary.tstz as Date).toISOString()).toStrictEqual(
        '2024-03-05T01:02:03.456Z',
      );
      expect(isNaN((text.tstz as Date).getTime())).toStrictEqual(true);
      // The rest of the row is still read correctly.
      expect(text.d).toStrictEqual(binary.d);
    } finally {
      await conn.execute(`set time zone 'UTC'`);
    }
  });

  it('should take a numeric offset, which does name one', async () => {
    await conn.execute(`set time zone 'Europe/Istanbul'`);
    try {
      await conn.execute(`set datestyle to 'German, DMY'`);
      const { binary, text } = await both();
      expect(text.tstz).toStrictEqual(binary.tstz);
      expect((text.tstz as Date).toISOString()).toStrictEqual(
        '2024-03-05T01:02:03.456Z',
      );
    } finally {
      await conn.execute(`set time zone 'UTC'`);
    }
  });
});
