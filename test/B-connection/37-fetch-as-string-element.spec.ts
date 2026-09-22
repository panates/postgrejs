import { expect } from 'expect';
import { Connection, DataTypeOIDs } from 'postgrejs';

/**
 * `fetchAsString` names the types a caller wants exactly as the server
 * rendered them. Naming an *array* type asks for the whole literal, and
 * that is what it has always meant; naming the *element* type asks for
 * the elements - the same ask as for a scalar column, held for a column
 * of them.
 *
 * The two are told apart by which OID was named, which is why both are
 * asserted here side by side.
 */
describe('fetchAsString by element OID', () => {
  const conn = new Connection();
  before(() => conn.connect());
  after(() => conn.close(0));

  const SQL =
    "select array['12.34'::money, null, '-5'::money] as m," +
    " array['(1,2),(3,4)'::box, null] as b," +
    " array[array['1'::money,'2'::money], array['3'::money,'4'::money]] as nested";

  it('should give the elements as the server wrote them', async () => {
    const r = await conn.query(SQL, {
      objectRows: true,
      fetchAsString: [DataTypeOIDs.money],
    });
    const row = r.rows?.[0] as any;
    expect(row.m).toStrictEqual(['$12.34', null, '-$5.00']);
    // A null inside stays a null rather than becoming the string 'NULL'.
    expect(row.m[1]).toStrictEqual(null);
  });

  it('should still give the whole literal for the array OID', async () => {
    const r = await conn.query(SQL, {
      objectRows: true,
      fetchAsString: [DataTypeOIDs._money],
    });
    expect((r.rows?.[0] as any).m).toStrictEqual('{$12.34,NULL,-$5.00}');
  });

  it('should leave a column the list does not name alone', async () => {
    const r = await conn.query(SQL, {
      objectRows: true,
      fetchAsString: [DataTypeOIDs.money],
    });
    // box was not named either way, so it decodes as it always does.
    const decoded = await conn.query(SQL, { objectRows: true });
    expect((r.rows?.[0] as any).b).toStrictEqual((decoded.rows?.[0] as any).b);
  });

  it('should honour a separator that is not a comma', async () => {
    // box[] is written `{(3,4),(1,2);NULL}` - splitting it on commas
    // would give four pieces instead of two.
    const r = await conn.query(SQL, {
      objectRows: true,
      fetchAsString: [DataTypeOIDs.box],
    });
    const b = (r.rows?.[0] as any).b;
    expect(b).toHaveLength(2);
    expect(b[0]).toStrictEqual('(3,4),(1,2)');
    expect(b[1]).toStrictEqual(null);
  });

  it('should keep the shape of a multidimensional column', async () => {
    const r = await conn.query(SQL, {
      objectRows: true,
      fetchAsString: [DataTypeOIDs.money],
    });
    expect((r.rows?.[0] as any).nested).toStrictEqual([
      ['$1.00', '$2.00'],
      ['$3.00', '$4.00'],
    ]);
  });

  it('should not reuse one query’s parsers for the other ask', async () => {
    // Both prepare the same SQL on first sight, and the only thing
    // telling the two apart is the list - fetchAsStringEqual is what
    // keeps the cached parsers from being handed to the wrong one.
    const asElements = await conn.query(SQL, {
      objectRows: true,
      fetchAsString: [DataTypeOIDs.money],
    });
    const asLiteral = await conn.query(SQL, {
      objectRows: true,
      fetchAsString: [DataTypeOIDs._money],
    });
    const decoded = await conn.query(SQL, { objectRows: true });
    expect((asElements.rows?.[0] as any).m).toStrictEqual([
      '$12.34',
      null,
      '-$5.00',
    ]);
    expect((asLiteral.rows?.[0] as any).m).toStrictEqual(
      '{$12.34,NULL,-$5.00}',
    );
    expect((decoded.rows?.[0] as any).m).toStrictEqual([12.34, null, -5]);
  });

  it('should work the same on the whole-row-text fallback', async () => {
    // `prepare: false` asks for every column as text instead of naming
    // them positionally, which is a different route to the same parsers.
    const r = await conn.query(SQL, {
      objectRows: true,
      prepare: false,
      fetchAsString: [DataTypeOIDs.money],
    });
    expect((r.rows?.[0] as any).m).toStrictEqual(['$12.34', null, '-$5.00']);
  });
});
