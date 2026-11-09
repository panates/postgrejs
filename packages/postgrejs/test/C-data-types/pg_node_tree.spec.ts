import { expect } from 'expect';
import { Connection, DataFormat, DataTypeOIDs, GlobalTypeMap } from 'postgrejs';

/**
 * `pg_node_tree` is a catalog column - a column default in
 * `pg_attrdef.adbin`, an index expression in `pg_index.indexprs` - and
 * it is text on the wire, so it decodes to the string the server prints
 * rather than to the Buffer it used to be. It has no array type of its
 * own, which is why this spec does not use the shared testers.
 */
describe('DataType: pg_node_tree', () => {
  const conn = new Connection();
  before(async () => {
    await conn.connect();
    await conn.execute(
      'drop table if exists t_node_tree;' +
        " create table t_node_tree(a int default 42, b text default 'x')",
    );
  });
  after(async () => {
    await conn.execute('drop table if exists t_node_tree');
    await conn.close(0);
  });

  it('should read a column default the same way in both formats', async () => {
    const sql =
      'select adbin from pg_attrdef d' +
      " join pg_class c on c.oid = d.adrelid and c.relname = 't_node_tree'" +
      ' order by d.adnum';
    const bin = await conn.query(sql, { columnFormat: DataFormat.binary });
    const txt = await conn.query(sql, { columnFormat: DataFormat.text });
    expect(bin.rows?.length).toBeGreaterThan(0);
    expect(bin.rows).toStrictEqual(txt.rows);
    expect(typeof bin.rows?.[0][0]).toStrictEqual('string');
    expect(String(bin.rows?.[0][0])).toContain('CONST');
  });

  it('should report its own type name', async () => {
    const r = await conn.query('select adbin from pg_attrdef limit 1');
    expect(r.fields?.[0].dataTypeId).toStrictEqual(DataTypeOIDs.pg_node_tree);
    expect(r.fields?.[0].dataTypeName).toStrictEqual('pg_node_tree');
    expect(r.fields?.[0].jsType).toStrictEqual('string');
  });

  it('should stay out of inference, like the other string-shaped types', () => {
    expect(
      GlobalTypeMap.get(DataTypeOIDs.pg_node_tree)?.inferrable,
    ).toStrictEqual(false);
    expect(GlobalTypeMap.get(DataTypeOIDs.refcursor)?.inferrable).toStrictEqual(
      false,
    );
  });
});
