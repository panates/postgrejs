import { expect } from 'expect';
import { BindParam, Connection, DataTypeOIDs } from 'postgrejs';

/**
 * An array of numbers goes out with no declared type, for the same
 * reason a string and a `Date` do - and here the reason is sharper.
 *
 * `[1, 2]` is `int2[]`, `int4[]`, `int8[]`, `numeric[]`, `float4[]` or
 * `float8[]` depending on where it lands, and unlike their scalars
 * those types have no operators or implicit casts between them:
 * `array[1,2]::int8[] = $1` under a declared `int4[]` is
 * `42883 operator does not exist: bigint[] = integer[]`, while
 * `1::int8 = $1` under a declared `int4` resolves. So the declaration
 * was not a harmless guess; it was a wrong answer for four of the six.
 *
 * Every query below was measured against `pg` too, and the two now
 * agree on all of them.
 */
describe('Array parameters', () => {
  const conn = new Connection();
  before(async () => {
    await conn.connect();
    await conn.execute(`
        drop table if exists t_arrparam;
        create table t_arrparam(
            n numeric[], i8 int8[], i2 int2[], f4 float4[], i4 int4[],
            b bool[], y bytea[], t text[]);`);
  });
  after(async () => {
    await conn.execute('drop table if exists t_arrparam');
    await conn.close(0);
  });

  const one = async (sql: string, params: any[]) =>
    ((await conn.query(sql, { objectRows: true, params })).rows?.[0] as any).v;

  describe('an array large enough to be written as bytes', () => {
    // Past a threshold the literal is written straight into the send
    // buffer rather than built as a string first (writeArrayLiteral).
    // The unit tests pin that the two spell the same literal; these pin
    // that the server reads what comes out of the new one.
    it('should round-trip a thousand int4s, negatives and nulls included', async () => {
      const value = Array.from({ length: 1000 }, (_, i) =>
        i % 97 === 0 ? null : (i % 2 ? -1 : 1) * (2147483647 - i),
      );
      expect(await one('select $1::int4[] v', [value])).toStrictEqual(value);
    });

    it('should round-trip values past int32, which take the other lane', async () => {
      const value = Array.from(
        { length: 100 },
        (_, i) => BigInt('9007199254740993') + BigInt(i),
      );
      expect(await one('select $1::int8[] v', [value])).toStrictEqual(value);
    });

    it('should round-trip floats, which keep the string path', async () => {
      const value = Array.from({ length: 100 }, (_, i) => (i + 1) * 1.5);
      expect(await one('select $1::float8[] v', [value])).toStrictEqual(value);
    });

    it('should round-trip text that needs quoting and escaping', async () => {
      const value = Array.from({ length: 100 }, (_, i) =>
        i % 3 === 0 ? `a"b${i}` : i % 3 === 1 ? `c\\d${i}` : `ölçüm ${i},{}`,
      );
      expect(await one('select $1::text[] v', [value])).toStrictEqual(value);
    });

    it('should round-trip an array that spans several write chunks', async () => {
      // 64KB at a time is flushed into the send buffer; this is ~110KB
      // of literal, so a boundary falls inside it.
      const value = Array.from({ length: 10000 }, (_, i) => 2147383646 - i);
      const back = await one('select $1::int4[] v', [value]);
      expect(back).toHaveLength(value.length);
      expect(back).toStrictEqual(value);
    });

    it('should round-trip a nested array', async () => {
      const value = Array.from({ length: 20 }, (_row, r) =>
        Array.from({ length: 30 }, (_col, c) => r * 30 + c),
      );
      expect(await one('select $1::int4[][] v', [value])).toStrictEqual(value);
    });

    it('should insert one into a column and read it back', async () => {
      const value = Array.from({ length: 500 }, (_, i) => i * 7);
      await conn.execute('delete from t_arrparam');
      await conn.query('insert into t_arrparam (i4) values ($1)', {
        params: [value],
      });
      expect(await one('select i4 v from t_arrparam', [])).toStrictEqual(value);
    });
  });

  describe('a comparison, which is where the declared type decided it', () => {
    const CASES: [string, any[]][] = [
      ['array[1.5,2.5]::numeric[]', [[1.5, 2.5]]],
      ['array[1,2]::int8[]', [[1, 2]]],
      ['array[1,2]::int2[]', [[1, 2]]],
      ['array[1.5]::float4[]', [[1.5]]],
      ['array[1.5]::float8[]', [[1.5]]],
      ['array[1,2]::int4[]', [[1, 2]]],
    ];
    for (const [expr, params] of CASES)
      it(`should match ${expr}`, async () => {
        expect(await one(`select ${expr} = $1 v`, params)).toStrictEqual(true);
      });

    it('should match a bigint array and a nested one too', async () => {
      expect(
        await one('select array[1,2]::int8[] = $1 v', [[1n, 2n]]),
      ).toStrictEqual(true);
      expect(
        await one('select array[array[1.5]]::numeric[] = $1 v', [[[1.5]]]),
      ).toStrictEqual(true);
    });
  });

  it('should insert into every numeric array column', async () => {
    const r = await conn.query(
      'insert into t_arrparam(n, i8, i2, f4, i4) values($1,$2,$3,$4,$5)' +
        ' returning n, i8, i2, i4',
      {
        objectRows: true,
        params: [[1.5, 2.5], [1, 2], [1, 2], [1.5], [1, 2]],
      },
    );
    expect(r.rows?.[0]).toStrictEqual({
      n: [1.5, 2.5],
      i8: [1, 2],
      i2: [1, 2],
      i4: [1, 2],
    });
  });

  describe('what still declares its type', () => {
    it('should leave an array of booleans and of Buffers alone', async () => {
      // One type each, so naming it says nothing the server would have
      // decided differently - and it keeps the binary encoding.
      expect(
        await one('select array[true]::bool[] = $1 v', [[true]]),
      ).toStrictEqual(true);
      expect(
        await one("select array['a'::bytea] = $1 v", [[Buffer.from('a')]]),
      ).toStrictEqual(true);
      const r = await conn.query(
        'insert into t_arrparam(b, y) values($1,$2) returning b, y',
        { objectRows: true, params: [[true, false], [Buffer.from('ab')]] },
      );
      const row = r.rows?.[0] as any;
      expect(row.b).toStrictEqual([true, false]);
      expect(row.y[0].toString()).toStrictEqual('ab');
    });

    it('should leave a scalar number declared', async () => {
      // Those types do have operators between them, so the declaration
      // costs nothing and the binary encoding is kept.
      expect(await one('select 1::int8 = $1 v', [1])).toStrictEqual(true);
      expect(await one('select 1.5::numeric = $1 v', [1.5])).toStrictEqual(
        true,
      );
    });

    it('should leave an array of strings and of dates as they were', async () => {
      expect(
        await one("select array['a','b']::text[] = $1 v", [['a', 'b']]),
      ).toStrictEqual(true);
      const d = new Date(Date.UTC(2024, 5, 15));
      expect(
        await one("select array['2024-06-15'::date] = $1 v", [[d]]),
      ).toStrictEqual(true);
    });
  });

  describe('the cost of saying nothing', () => {
    it('should resolve to text where there is no context at all', async () => {
      // The same price a string parameter pays: with nothing to resolve
      // against, the server reads the literal as text rather than
      // guessing a numeric type - it used to come back as int4[].
      expect(await one('select $1 v', [[1, 2]])).toStrictEqual('{1,2}');
    });

    it('should take the declared type back when the caller names one', async () => {
      // Which is also how a large numeric array keeps the binary
      // encoding the text literal gives up.
      expect(
        await one('select $1 v', [new BindParam(DataTypeOIDs._int4, [1, 2])]),
      ).toStrictEqual([1, 2]);
      expect(
        await one('select array[1,2]::int8[] = $1 v', [
          new BindParam(DataTypeOIDs._int8, [1, 2]),
        ]),
      ).toStrictEqual(true);
    });

    it('should keep an empty array working', async () => {
      // It has no element to look at, so determine() still answers for
      // it - `unknown`, which the server resolves the same way.
      expect(await one('select $1::int[] v', [[]])).toStrictEqual([]);
      const r = await conn.query(
        'insert into t_arrparam(n) values($1) returning n',
        { objectRows: true, params: [[]] },
      );
      expect((r.rows?.[0] as any).n).toStrictEqual([]);
    });
  });
});
