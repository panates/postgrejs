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
  type Row = { oid: number; typname: string; typarray: number };
  const byOid = new Map<number, Row>();
  const byName = new Map<string, Row>();
  // `rstzrange` is a deliberate misspelled alias of `tstzrange`, kept so
  // it keeps resolving - it is the one key that does not name itself.
  const entries = Object.entries(DataTypeOIDs).filter(
    ([k]) => k !== 'rstzrange',
  );

  before(async () => {
    await conn.connect();
    // Indexed both ways. The OID index is what checks a name; the name
    // index is what still catches a mistyped OID on a server too old to
    // have the type at all - CI runs PostgreSQL 12, where `xid8`,
    // `pg_snapshot`, `regcollation` and the multiranges do not exist.
    const r = await conn.query('select oid, typname, typarray from pg_type', {
      objectRows: true,
    });
    for (const row of r.rows as any[]) {
      byOid.set(row.oid, row);
      byName.set(row.typname, row);
    }
  });
  after(() => conn.close(0));

  it('should have read the catalog at all', () => {
    // So that a query returning nothing cannot make every check below
    // pass by having nothing to check.
    expect(byOid.size).toBeGreaterThan(100);
  });

  it('should name every OID the way the catalog names it', () => {
    const wrong: string[] = [];
    for (const [key, oid] of entries) {
      const t = byOid.get(oid);
      if (t) {
        if (t.typname !== key)
          wrong.push(`${key} = ${oid} is really "${t.typname}"`);
        continue;
      }
      const named = byName.get(key);
      if (named)
        wrong.push(`${key} is ${named.oid} on this server, not ${oid}`);
      // Neither the OID nor the name is here, so this server predates
      // the type. Nothing to check, and nothing wrong.
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
      const t = byOid.get(scalar);
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
      const t = byOid.get(oid);
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
