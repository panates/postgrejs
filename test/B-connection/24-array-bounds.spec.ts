import { expect } from 'expect';
import { BindParam, Connection, DataTypeOIDs } from 'postgrejs';

/**
 * An array written through the binary encoder has to be subscripted from
 * 1 in SQL, which is PostgreSQL's convention for every ordinary array.
 *
 * Every assertion here is made **in SQL**, not against the decoded value.
 * The decoder reads the lower bound and discards it, so a round trip
 * through this client passed while the stored value was subscripted from
 * 0 - `arr[1]` was the second element, `array_lower` said 0, and `::text`
 * rendered the explicit-bounds form `[0:2]={10,20,30}`.
 */
describe('binary array lower bound', () => {
  const conn = new Connection();
  before(() => conn.connect());
  after(() => conn.close(0));

  it('should subscript an ordinary array from 1', async () => {
    const r = await conn.query(
      'select ($1::int4[])[1] as first, array_lower($1::int4[],1) as lo,' +
        ' ($1::int4[])::text as lit',
      { params: [[10, 20, 30]], objectRows: true },
    );
    expect(r.rows?.[0]).toStrictEqual({
      first: 10,
      lo: 1,
      lit: '{10,20,30}',
    });
  });

  it('should do the same for a type of no fixed size', async () => {
    // The type is named because a bare array of strings goes out with no
    // declared type, as an array literal, and would not reach the binary
    // writer at all - which is what this file is about.
    const r = await conn.query(
      'select ($1::text[])[1] as first, array_lower($1::text[],1) as lo,' +
        ' ($1::text[])::text as lit',
      {
        params: [new BindParam(DataTypeOIDs._text, ['a', 'b'])],
        objectRows: true,
      },
    );
    expect(r.rows?.[0]).toStrictEqual({ first: 'a', lo: 1, lit: '{a,b}' });
  });

  it('should subscript an undeclared array of strings from 1 too', async () => {
    // That one goes as `{"a","b"}` for the server to read, which is a
    // different writer with the same rule to obey.
    const r = await conn.query(
      'select ($1::text[])[1] as first, array_lower($1::text[],1) as lo,' +
        ' ($1::text[])::text as lit',
      { params: [['a', 'b']], objectRows: true },
    );
    expect(r.rows?.[0]).toStrictEqual({ first: 'a', lo: 1, lit: '{a,b}' });
  });

  it('should do the same when an element is null', async () => {
    // The null path writes a length of -1 rather than an element, so it
    // is a different branch of the writer.
    const r = await conn.query(
      'select ($1::int4[])[1] as first, array_lower($1::int4[],1) as lo,' +
        ' ($1::int4[])::text as lit',
      { params: [[1, null, 3]], objectRows: true },
    );
    expect(r.rows?.[0]).toStrictEqual({ first: 1, lo: 1, lit: '{1,NULL,3}' });
  });

  it('should do the same when the null is the first element', async () => {
    // A leading null used to leave determine() with nothing to read, so
    // the array fell out of the typed path entirely and could not be
    // sent at all.
    const r = await conn.query(
      'select ($1::int4[])[2] as second, array_lower($1::int4[],1) as lo,' +
        ' ($1::int4[])::text as lit',
      { params: [[null, 2, 3]], objectRows: true },
    );
    expect(r.rows?.[0]).toStrictEqual({
      second: 2,
      lo: 1,
      lit: '{NULL,2,3}',
    });
  });

  it('should write a bound per dimension', async () => {
    // Sent bare: determine() used to answer `_int2vector` for an array of
    // number arrays, so this case could only be written with the type
    // named. It answers `_int4` now, which is the point of leaving the
    // BindParam off here.
    const r = await conn.query(
      'select ($1::int4[])[1][1] as first, array_lower($1::int4[],1) as lo1,' +
        ' array_lower($1::int4[],2) as lo2, ($1::int4[])::text as lit',
      {
        params: [
          [
            [1, 2],
            [3, 4],
          ],
        ],
        objectRows: true,
      },
    );
    expect(r.rows?.[0]).toStrictEqual({
      first: 1,
      lo1: 1,
      lo2: 1,
      lit: '{{1,2},{3,4}}',
    });
  });

  it('should leave a vector 0-based, as the catalog has it', async () => {
    // int2vector and oidvector genuinely are 0-based; a parameter has to
    // agree with what the server stores in its own columns.
    const sent = await conn.query(
      'select array_lower($1::int2vector,1) as lo, ($1::int2vector)::text as lit',
      {
        params: [new BindParam(DataTypeOIDs.int2vector, [1, 2, 3])],
        objectRows: true,
      },
    );
    expect(sent.rows?.[0]).toStrictEqual({ lo: 0, lit: '1 2 3' });

    const stored = await conn.query(
      'select array_lower(indkey,1) as lo from pg_index limit 1',
      { objectRows: true },
    );
    expect((stored.rows?.[0] as any).lo).toStrictEqual(0);

    const oidv = await conn.query('select array_lower($1::oidvector,1) as lo', {
      params: [new BindParam(DataTypeOIDs.oidvector, [23, 25])],
      objectRows: true,
    });
    expect((oidv.rows?.[0] as any).lo).toStrictEqual(0);
  });

  it('should nest the two rules, an array of vectors', async () => {
    // The outer array is ordinary and the inner values are vectors, so
    // the bounds differ by level in the same value.
    const r = await conn.query(
      'select array_lower($1::int2vector[],1) as outer_lo,' +
        ' array_lower(($1::int2vector[])[1],1) as inner_lo',
      {
        params: [
          new BindParam(DataTypeOIDs._int2vector, [
            [1, 2],
            [3, 4],
          ]),
        ],
        objectRows: true,
      },
    );
    expect(r.rows?.[0]).toStrictEqual({ outer_lo: 1, inner_lo: 0 });
  });

  it('should write the bound through a binary COPY too', async () => {
    // copyFromRows() encodes rows straight into binary COPY, a second
    // caller of the same writer.
    await conn.execute(
      'drop table if exists t_arr_bounds; create table t_arr_bounds(v int4[])',
    );
    await conn.copyFromRows('t_arr_bounds', [[[10, 20, 30]]], {
      columns: ['v'],
    });
    const r = await conn.query(
      'select v[1] as first, array_lower(v,1) as lo, v::text as lit' +
        ' from t_arr_bounds',
      { objectRows: true },
    );
    expect(r.rows?.[0]).toStrictEqual({ first: 10, lo: 1, lit: '{10,20,30}' });
    await conn.execute('drop table t_arr_bounds');
  });
});
