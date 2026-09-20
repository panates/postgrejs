import { expect } from 'expect';
import { Connection, DataTypeNames, DataTypeOIDs } from 'postgrejs';

/**
 * The OID table checked against the catalog it describes.
 *
 * It is hand-maintained and every entry is a number with no meaning to
 * read, so nothing but the server can say whether it is right. This is
 * what found `_refcursor` and the five `reg*` array OIDs missing while
 * their scalars were named, and `_xid8` named while `xid8` was not.
 */
describe('DataTypeOIDs', () => {
  const conn = new Connection();
  const catalog = new Map<number, { typname: string; typarray: number }>();
  // `rstzrange` is a deliberate misspelled alias of `tstzrange`, kept so
  // it keeps resolving - it is the one key that does not name itself.
  const entries = Object.entries(DataTypeOIDs).filter(
    ([k]) => k !== 'rstzrange',
  );

  before(async () => {
    await conn.connect();
    const r = await conn.query(
      'select oid, typname, typarray from pg_type where oid = any($1::oid[])',
      { params: [entries.map(([, v]) => v)], objectRows: true },
    );
    for (const row of r.rows as any[])
      catalog.set(row.oid, { typname: row.typname, typarray: row.typarray });
  });
  after(() => conn.close(0));

  it('should name every OID the way the catalog names it', () => {
    const wrong: string[] = [];
    for (const [key, oid] of entries) {
      const t = catalog.get(oid);
      if (!t) wrong.push(`${key} = ${oid} is not a type at all`);
      else if (t.typname !== key)
        wrong.push(`${key} = ${oid} is really "${t.typname}"`);
    }
    expect(wrong).toStrictEqual([]);
  });

  it('should give every array OID as the catalog gives it', () => {
    const wrong: string[] = [];
    for (const [key, oid] of entries) {
      if (!key.startsWith('_')) continue;
      const scalar = (DataTypeOIDs as any)[key.slice(1)];
      if (scalar === undefined) {
        wrong.push(`${key} has no scalar key`);
        continue;
      }
      const t = catalog.get(scalar);
      if (t && t.typarray !== oid)
        wrong.push(
          `${key} = ${oid} but ${key.slice(1)}'s array is ${t.typarray}`,
        );
    }
    expect(wrong).toStrictEqual([]);
  });

  it('should carry the array key of every scalar that has one', () => {
    // A registered scalar whose `_` key is missing is the failure this
    // catches: the array OID then stays unknown while the scalar works.
    // The pseudo-types - `any`, `void`, `anyelement` and the rest - have
    // no array type at all, and the catalog is what says so.
    const missing: string[] = [];
    for (const [key, oid] of entries) {
      if (key.startsWith('_')) continue;
      const t = catalog.get(oid);
      if (
        t &&
        t.typarray !== 0 &&
        (DataTypeOIDs as any)['_' + key] === undefined
      )
        missing.push(`_${key} = ${t.typarray}`);
    }
    expect(missing).toStrictEqual([]);
  });

  it('should keep DataTypeNames and DataTypeOIDs saying the same thing', () => {
    // wrap-row-description.ts reads a field's dataTypeName out of this
    // one, so a name missing here is a column reporting no type name.
    const wrong: string[] = [];
    for (const [key, oid] of entries)
      if (DataTypeNames[oid] !== key)
        wrong.push(
          `${oid}: OIDs says "${key}", Names says "${DataTypeNames[oid]}"`,
        );
    expect(wrong).toStrictEqual([]);
    expect(Object.keys(DataTypeNames).length).toStrictEqual(entries.length);
  });
});
