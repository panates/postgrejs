import { expect } from 'expect';
import { Connection } from 'postgrejs';

// Every undecodable column here has to stay undecodable for the test to
// mean anything, and the examples keep being overtaken as decoders land -
// `interval`, then `int4range`, then `inet`. `pg_lsn` and `tsvector` are
// the current pick: the first is a catalog type a string already serves
// (see .claude/missing-builtin-decoders.md), the second has a binary
// layout involved enough that it may never get one.
const SQL =
  "select 'happy'::t_unk_mood as en," +
  " array['happy','sad']::t_unk_mood[] as enarr," +
  " pg_lsn '16/B374D848' as lsn," +
  " tsvector 'a b' as tsv," +
  ' 42::int4 as n,' +
  ' array[1,2]::int4[] as ia';

describe('unknownTypesAsString', () => {
  const conn = new Connection();

  before(async () => {
    await conn.connect();
    await conn.execute(
      'drop type if exists t_unk_mood cascade;' +
        " create type t_unk_mood as enum ('sad','happy')",
    );
  });
  after(async () => {
    await conn
      .execute('drop type if exists t_unk_mood cascade')
      .catch(() => undefined);
    await conn.close(0);
  });

  it('should hand back a Buffer by default', async () => {
    // The behaviour this option exists to opt out of, pinned so a change
    // of default is a deliberate act rather than a side effect.
    const r = await conn.query(SQL, { objectRows: true });
    const row = r.rows?.[0] as any;
    expect(Buffer.isBuffer(row.en)).toStrictEqual(true);
    expect(Buffer.isBuffer(row.lsn)).toStrictEqual(true);
  });

  it('should read every undecodable column as the server printed it', async () => {
    // Run twice in the same connection: the first call has no cached
    // fields, so the option is what forces the statement to be prepared
    // on sight. Both answers being the same is the point - the same query
    // returning a Buffer on run 1 and a string on run 3 would be worse
    // than either.
    for (let i = 0; i < 2; i++) {
      const r = await conn.query(SQL, {
        objectRows: true,
        unknownTypesAsString: true,
      });
      expect(r.rows?.[0]).toStrictEqual({
        en: 'happy',
        // An array whose own OID is unregistered comes back as the
        // literal - there is no telling it is an array without reading
        // the catalog, and `pg` answers the same way.
        enarr: '{happy,sad}',
        lsn: '16/B374D848',
        tsv: "'a' 'b'",
        n: 42,
        ia: [1, 2],
      });
    }
  });

  it('should answer the same with prepare disabled', async () => {
    // Nothing is prepared, so the columns are unknown at Bind time and
    // the whole row is asked for as text instead.
    const r = await conn.query(SQL, {
      objectRows: true,
      unknownTypesAsString: true,
      prepare: false,
    });
    const row = r.rows?.[0] as any;
    expect(row.en).toStrictEqual('happy');
    expect(row.lsn).toStrictEqual('16/B374D848');
    expect(row.n).toStrictEqual(42);
    expect(row.ia).toStrictEqual([1, 2]);
  });

  it('should leave the registered types decoding as they always did', async () => {
    const r = await conn.query(
      "select 42::int4 n, 'txt' t, array[1,2]::int4[] ia," +
        " 1.5::float8 f, true b, '2020-10-22'::date d",
      { objectRows: true, unknownTypesAsString: true },
    );
    const row = r.rows?.[0] as any;
    expect(row.n).toStrictEqual(42);
    expect(row.t).toStrictEqual('txt');
    expect(row.ia).toStrictEqual([1, 2]);
    expect(row.f).toStrictEqual(1.5);
    expect(row.b).toStrictEqual(true);
    expect(row.d).toBeInstanceOf(Date);
  });

  it('should report the rescued columns as string in fields', async () => {
    const r = await conn.query(SQL, { unknownTypesAsString: true });
    const byName: Record<string, string> = {};
    for (const f of r.fields!) byName[f.fieldName] = f.jsType;
    expect(byName.en).toStrictEqual('string');
    expect(byName.lsn).toStrictEqual('string');
    expect(byName.n).toStrictEqual('number');
    // dataTypeName stays empty: there is no OID-to-name mapping here
    // without reading the catalog, which this option deliberately does
    // not do.
    expect(
      r.fields!.find(f => f.fieldName === 'en')!.dataTypeName,
    ).toStrictEqual('');
  });
});
