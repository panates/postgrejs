import { expect } from 'expect';
import { Connection, DataFormat, DataTypeOIDs } from 'postgrejs';

const SQL =
  "select '2020-10-22T23:45:12.123Z'::timestamptz as ts, " +
  "'2020-10-22'::date as d, " +
  '\'{"a": 1}\'::jsonb as j, ' +
  '42::int4 as n, ' +
  '1.5::float8 as f';

const AS_STRING = [
  DataTypeOIDs.timestamptz,
  DataTypeOIDs.date,
  DataTypeOIDs.jsonb,
];

const EXPECTED = {
  ts: '2020-10-22 23:45:12.123+00',
  d: '2020-10-22',
  j: '{"a": 1}',
  n: 42,
  f: 1.5,
};

describe('fetchAsString', () => {
  const conn = new Connection();
  before(async () => {
    await conn.connect();
    // timestamptz renders against the session zone, and the string handed
    // back is the server's own - so pin it rather than inherit it.
    await conn.execute("SET SESSION timezone TO 'UTC'");
  });
  after(() => conn.close(0));

  it("should hand back the server's own rendering, not a re-rendered value", async () => {
    const r = await conn.query(SQL, {
      objectRows: true,
      fetchAsString: AS_STRING,
    });
    expect(r.rows?.[0]).toStrictEqual(EXPECTED);
  });

  it('should answer the same before and after the statement is prepared', async () => {
    // The first call of a fetchAsString query prepares the statement so
    // its columns are known before the Bind that asks for them as text;
    // later calls reuse it. Neither may change what comes back.
    const opts = { objectRows: true, fetchAsString: AS_STRING };
    const first = await conn.query(SQL, opts);
    const second = await conn.query(SQL, opts);
    const third = await conn.query(SQL, opts);
    expect(first.rows?.[0]).toStrictEqual(EXPECTED);
    expect(second.rows?.[0]).toStrictEqual(EXPECTED);
    expect(third.rows?.[0]).toStrictEqual(EXPECTED);
  });

  it('should answer the same with prepare disabled', async () => {
    // Nothing is prepared here, so the columns are unknown at Bind time
    // and the whole row is asked for as text instead - the listed columns
    // must still read exactly the same.
    const r = await conn.query(SQL, {
      objectRows: true,
      fetchAsString: AS_STRING,
      prepare: false,
    });
    expect(r.rows?.[0]).toStrictEqual(EXPECTED);
  });

  it('should override an explicit binary columnFormat for its own columns only', async () => {
    const r = await conn.query(SQL, {
      objectRows: true,
      fetchAsString: AS_STRING,
      columnFormat: DataFormat.binary,
    });
    expect(r.rows?.[0]).toStrictEqual(EXPECTED);
  });

  it('should report the listed columns as string in fields', async () => {
    const r = await conn.query(SQL, { fetchAsString: AS_STRING });
    expect(r.fields?.map(x => x.jsType)).toStrictEqual([
      'string',
      'string',
      'string',
      'number',
      'number',
    ]);
  });

  it('should give an array column its elements when the element oid is listed', async () => {
    // This used to leave the column alone: an element OID selected
    // nothing and an array could only be asked for by its own OID, as
    // the whole literal. Naming the element now means for a column of
    // them what it means for one - the value as the server wrote it -
    // and 37-fetch-as-string-element.spec.ts is where that lives.
    const sql =
      "select array['2020-10-22T23:45:12.123Z'::timestamptz, null] as a";
    const r = await conn.query(sql, {
      objectRows: true,
      fetchAsString: [DataTypeOIDs.timestamptz],
    });
    expect(r.rows?.[0]).toStrictEqual({
      a: ['2020-10-22 23:45:12.123+00', null],
    });
  });

  it('should hand back the whole literal when the array oid is listed', async () => {
    const sql =
      "select array['2020-10-22T23:45:12.123Z'::timestamptz, null] as a";
    const r = await conn.query(sql, {
      objectRows: true,
      fetchAsString: [DataTypeOIDs._timestamptz],
    });
    expect(r.rows?.[0]).toStrictEqual({
      a: '{"2020-10-22 23:45:12.123+00",NULL}',
    });
  });

  it('should apply to a prepared statement', async () => {
    await using st = await conn.prepare(SQL);
    const r = await st.execute({ objectRows: true, fetchAsString: AS_STRING });
    expect(r.rows?.[0]).toStrictEqual(EXPECTED);
  });

  it('should apply to a cursor', async () => {
    await using st = await conn.prepare(SQL);
    const r = await st.execute({
      objectRows: true,
      cursor: true,
      fetchAsString: AS_STRING,
    });
    const cursor = r.cursor!;
    try {
      expect(await cursor.next()).toStrictEqual(EXPECTED);
    } finally {
      await cursor.close();
    }
  });

  it('should apply to every statement of a pipeline', async () => {
    const results = await conn.pipeline([SQL, SQL], {
      objectRows: true,
      fetchAsString: AS_STRING,
    });
    expect(results[0].rows?.[0]).toStrictEqual(EXPECTED);
    expect(results[1].rows?.[0]).toStrictEqual(EXPECTED);
  });

  it('should apply to execute(), which has no Bind of its own', async () => {
    // Simple Query sends every column as text already, so a listed column
    // simply comes back unparsed.
    const r = await conn.execute(SQL, {
      objectRows: true,
      fetchAsString: AS_STRING,
    });
    expect(r.results?.[0].rows?.[0]).toStrictEqual(EXPECTED);
  });

  it('should decode an array column correctly on the all-text fallback', async () => {
    // `prepare: false` with a fetchAsString list is the one combination
    // that asks for the whole row as text, so every array column takes
    // the text parser - which used to drop quoted empty elements and turn
    // the NULL after one into the string "NULL". Asserted against the
    // same query on the default path rather than against a literal.
    const sql = "select array['','b',null,'NULL']::text[] as a";
    const asText = await conn.query(sql, {
      objectRows: true,
      prepare: false,
      fetchAsString: AS_STRING,
    });
    const asBinary = await conn.query(sql, { objectRows: true });
    expect(asText.rows?.[0]).toStrictEqual({ a: ['', 'b', null, 'NULL'] });
    expect(asText.rows?.[0]).toStrictEqual(asBinary.rows?.[0]);
  });

  it('should not prepare a statement whose row is already all text', async () => {
    // Preparing on first sight buys the RowDescription that per-column
    // format codes need. With `columnFormat: text` every column is text
    // already, so there is nothing to ask for and the Parse+Describe
    // would be a round trip spent on nothing.
    const fresh = new Connection();
    await fresh.connect();
    // The session zone the file's own expectations are written against,
    // set before the counting starts so it costs nothing here.
    await fresh.execute(`set time zone 'UTC'`);
    const locations: string[] = [];
    (fresh as any)._intlCon.socket.on('debug', (e: any) =>
      locations.push(e.location),
    );
    try {
      const r = await fresh.query(SQL, {
        objectRows: true,
        columnFormat: DataFormat.text,
        fetchAsString: AS_STRING,
      });
      expect(r.rows?.[0]).toStrictEqual(EXPECTED);
      expect(
        locations.filter(l => l.startsWith('PgSocket.send')).length,
      ).toStrictEqual(1);
    } finally {
      await fresh.close(0);
    }
  });

  it('should not change anything for a query that lists nothing', async () => {
    const r = await conn.query(SQL, { objectRows: true });
    expect(r.rows?.[0]).toStrictEqual({
      ts: new Date('2020-10-22T23:45:12.123Z'),
      d: new Date(2020, 9, 22),
      j: { a: 1 },
      n: 42,
      f: 1.5,
    });
  });
});
