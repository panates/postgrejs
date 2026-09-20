import { expect } from 'expect';
import {
  BindParam,
  Connection,
  DataFormat,
  DataTypeOIDs,
  Range,
} from 'postgrejs';
import { testParse } from './_testers.js';

describe('DataType: range', () => {
  const conn = new Connection();
  before(async () => {
    await conn.connect();
    // A tstzrange is printed against the session's zone, and date.spec.ts
    // sets PGTZ process-wide, so every Connection built after it inherits
    // that. Pinned rather than inherited.
    await conn.execute("SET SESSION timezone TO 'UTC'");
  });
  after(() => conn.close(0));

  const INPUT = ['[1,10)', '[1,11)', 'empty', '(,10)', '[1,)', '(,)'];
  const OUTPUT = [
    new Range(1, 10),
    new Range(1, 11),
    Range.empty(),
    new Range(null, 10),
    new Range(1, null),
    new Range(null, null),
  ];

  it('should parse "int4range" field (text)', async () => {
    await testParse(conn, DataTypeOIDs.int4range, INPUT, OUTPUT, {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "int4range" field (binary)', async () => {
    await testParse(conn, DataTypeOIDs.int4range, INPUT, OUTPUT, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should parse "int4range" array field (binary)', async () => {
    const input = [
      ['[1,10)', null],
      ['empty', '(,)'],
    ];
    const output = [
      [new Range(1, 10), null],
      [Range.empty(), new Range(null, null)],
    ];
    await testParse(conn, DataTypeOIDs._int4range, input, output, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should decode every built-in range with its element type', async () => {
    // The bounds are the element's own JS values, which is the whole
    // point of decoding a range rather than handing back its literal.
    const r = await conn.query(
      'select int8range(1,9007199254740993) a, numrange(1.5,2.5) b,' +
        " daterange('2020-01-01','2020-02-01') c," +
        " tstzrange('2020-01-01T00:00:00Z','2020-02-01T00:00:00Z') d",
      { objectRows: true },
    );
    const row = r.rows?.[0] as any;
    expect(row.a.upper).toStrictEqual(9007199254740993n);
    expect(row.b.lower).toStrictEqual(1.5);
    expect(row.c.lower).toBeInstanceOf(Date);
    expect(row.d.lower).toStrictEqual(new Date('2020-01-01T00:00:00Z'));
  });

  it('should normalize a discrete range the way the server does', async () => {
    // `int4range(1,10,'[]')` is stored as `[1,11)` - the same set of
    // integers - so upperInclusive comes back false. Pinned so it is not
    // mistaken for the decoder losing the bound.
    const r = await conn.query("select int4range(1,10,'[]') as v", {
      objectRows: true,
    });
    const v = (r.rows?.[0] as any).v as Range<number>;
    expect(v.upper).toStrictEqual(11);
    expect(v.upperInclusive).toStrictEqual(false);
  });

  it("should round-trip a range parameter in the server's own form", async () => {
    // Through the element's renderer rather than Range.toString(), which
    // is what makes a Date bound exact.
    const cases: [number, any, string][] = [
      [DataTypeOIDs.int4range, new Range(1, 10), '[1,10)'],
      [DataTypeOIDs.int4range, Range.empty(), 'empty'],
      [DataTypeOIDs.int4range, new Range(null, 10), '(,10)'],
      [DataTypeOIDs.numrange, new Range(1.5, 2.5), '[1.5,2.5)'],
      [
        DataTypeOIDs.daterange,
        new Range(new Date(2020, 0, 1), new Date(2020, 1, 1)),
        '[2020-01-01,2020-02-01)',
      ],
      [
        DataTypeOIDs.tstzrange,
        new Range(
          new Date('2020-01-01T00:00:00Z'),
          new Date('2020-02-01T00:00:00Z'),
        ),
        '["2020-01-01 00:00:00+00","2020-02-01 00:00:00+00")',
      ],
    ];
    for (const [oid, value, expected] of cases) {
      const r = await conn.query('select $1::text as t', {
        params: [new BindParam(oid, value)],
        objectRows: true,
      });
      expect((r.rows?.[0] as any).t).toStrictEqual(expected);
    }
  });

  it('should not infer which range type a Range is', async () => {
    // All six answer `instanceof Range` and nothing about the value says
    // which: numbers fit int4range, int8range and numrange alike. Left to
    // inference, `new Range(1, 10)` went out as a tstzrange and came back
    // as `[1970-01-01T00:00:00.001Z,...)`; once the range types stopped
    // being inferrable it went out as `json` instead, which comes back
    // looking right. Now it says so.
    await expect(
      conn.query('select $1 as v', { params: [new Range(1, 10)] }),
    ).rejects.toThrow(/carries no type OID/);
  });

  it('should send a Range that knows its own type without being told', async () => {
    // Either given at construction, or carried back from a query - a
    // decoded Range is stamped with the type it came from, so reading one
    // and writing it back needs no BindParam.
    const built = await conn.query('select $1::text as t', {
      params: [new Range(1, 10, '[)', DataTypeOIDs.int4range)],
      objectRows: true,
    });
    expect((built.rows?.[0] as any).t).toStrictEqual('[1,10)');

    const read = await conn.query(
      "select tstzrange('2020-01-01T00:00:00Z','2020-02-01T00:00:00Z') as v," +
        ' int4multirange(int4range(1,5)) as m',
      { objectRows: true },
    );
    const row = read.rows?.[0] as any;
    const back = await conn.query('select $1::text as t, $2::text as u', {
      params: [row.v, row.m],
      objectRows: true,
    });
    expect(back.rows?.[0]).toStrictEqual({
      t: '["2020-01-01 00:00:00+00","2020-02-01 00:00:00+00")',
      u: '{[1,5)}',
    });
  });

  describe('multirange', () => {
    it('should decode as an array of ranges', async () => {
      for (const format of [DataFormat.binary, DataFormat.text]) {
        const r = await conn.query(
          'select int4multirange(int4range(1,5), int4range(10,20)) as v,' +
            " '{}'::int4multirange as e",
          { objectRows: true, columnFormat: format },
        );
        const row = r.rows?.[0] as any;
        expect(row.v.map(String)).toStrictEqual(['[1,5)', '[10,20)']);
        expect(row.v[0]).toBeInstanceOf(Range);
        expect(row.e).toStrictEqual([]);
      }
    });

    it('should keep a comma inside a range from splitting it', async () => {
      // The text form is `{[1,5),[10,20)}` - the separator between
      // ranges looks exactly like the one between a range's own bounds.
      const r = await conn.query(
        "select '{[1,5),[10,20),[30,40)}'::int4multirange as v",
        { objectRows: true, columnFormat: DataFormat.text },
      );
      expect((r.rows?.[0] as any).v.map(String)).toStrictEqual([
        '[1,5)',
        '[10,20)',
        '[30,40)',
      ]);
    });

    it('should round-trip a multirange parameter', async () => {
      const r = await conn.query('select $1::text as t', {
        params: [
          new BindParam(DataTypeOIDs.int4multirange, [
            new Range(1, 5),
            new Range(10, 20),
          ]),
        ],
        objectRows: true,
      });
      expect((r.rows?.[0] as any).t).toStrictEqual('{[1,5),[10,20)}');
    });
  });
});
