import { expect } from 'expect';
import { Connection } from 'postgrejs';

const UPSERT = (rows: string) =>
  `merge into t_merge t using (values ${rows}) as s(id, v) on t.id = s.id
   when matched then update set v = s.v
   when not matched then insert (id, v) values (s.id, s.v)`;

const PARAM_UPSERT = `merge into t_merge t
   using (values ($1::int4, $2::int4)) as s(id, v) on t.id = s.id
   when matched then update set v = s.v
   when not matched then insert (id, v) values (s.id, s.v)`;

describe('rowsAffected', () => {
  const conn = new Connection();
  let supportsMerge = false;

  before(async () => {
    await conn.connect();
    // MERGE arrived in PostgreSQL 15 and the CI matrix still covers 12.
    supportsMerge = parseInt(conn.sessionParameters.server_version, 10) >= 15;
    await conn.execute(
      'create temp table t_merge (id int4 primary key, v int4)',
    );
  });
  after(() => conn.close(0));

  beforeEach(() =>
    conn.execute(
      'truncate t_merge; insert into t_merge values (1, 10), (2, 20)',
    ),
  );

  it('should count the rows a MERGE inserts', async function () {
    if (!supportsMerge) return this.skip();
    const r = await conn.query(UPSERT('(3, 30), (4, 40)'));
    expect(r.command).toStrictEqual('MERGE');
    expect(r.rowsAffected).toStrictEqual(2);
  });

  it('should count the rows a MERGE updates', async function () {
    if (!supportsMerge) return this.skip();
    const r = await conn.query(UPSERT('(1, 11), (2, 22)'));
    expect(r.rowsAffected).toStrictEqual(2);
  });

  it('should count the rows a MERGE deletes', async function () {
    if (!supportsMerge) return this.skip();
    const r = await conn.query(
      `merge into t_merge t using (values (1)) as s(id) on t.id = s.id
       when matched then delete`,
    );
    expect(r.rowsAffected).toStrictEqual(1);
  });

  it('should count every action of a MERGE together', async function () {
    if (!supportsMerge) return this.skip();
    // The tag carries one total, not a breakdown: one delete plus one
    // insert reads as 2.
    const r = await conn.query(
      `merge into t_merge t using (values (1, 0), (5, 50)) as s(id, v)
         on t.id = s.id
       when matched then delete
       when not matched then insert (id, v) values (s.id, s.v)`,
    );
    expect(r.rowsAffected).toStrictEqual(2);
    const left = await conn.query('select id from t_merge order by id');
    expect(left.rows).toStrictEqual([[2], [5]]);
  });

  it('should count a MERGE that matches nothing as zero', async function () {
    if (!supportsMerge) return this.skip();
    const r = await conn.query(
      `merge into t_merge t using (values (99)) as s(id) on t.id = s.id
       when matched then delete`,
    );
    expect(r.rowsAffected).toStrictEqual(0);
  });

  it('should keep counting once the statement is prepared', async function () {
    if (!supportsMerge) return this.skip();
    // The third call binds the cached prepared statement instead of going
    // through the one-shot path, and that path assigns rowsAffected from
    // its own copy of the condition.
    for (let i = 0; i < 3; i++) {
      const r = await conn.query(PARAM_UPSERT, { params: [1, 100 + i] });
      expect(r.command).toStrictEqual('MERGE');
      expect(r.rowsAffected).toStrictEqual(1);
    }
  });

  it('should count a MERGE run through the simple query protocol', async function () {
    if (!supportsMerge) return this.skip();
    const r = await conn.execute(UPSERT('(3, 30)'));
    expect(r.results[0].command).toStrictEqual('MERGE');
    expect(r.results[0].rowsAffected).toStrictEqual(1);
  });

  it('should count each MERGE of a pipeline separately', async function () {
    if (!supportsMerge) return this.skip();
    const [a, b] = await conn.pipeline([
      UPSERT('(3, 30)'),
      UPSERT('(1, 99), (4, 40)'),
    ]);
    expect(a.rowsAffected).toStrictEqual(1);
    expect(b.rowsAffected).toStrictEqual(2);
  });

  it('should count each parameter set of a MERGE batch', async function () {
    if (!supportsMerge) return this.skip();
    await using st = await conn.prepare(PARAM_UPSERT);
    const batch = await st.executeBatch([
      [3, 30],
      [1, 99],
    ]);
    expect(batch.results.map(x => x.rowsAffected)).toStrictEqual([1, 1]);
    expect(batch.totalRowsAffected).toStrictEqual(2);
  });

  it('should still count the other write commands', async () => {
    const ins = await conn.query('insert into t_merge values (7, 70), (8, 80)');
    expect(ins.rowsAffected).toStrictEqual(2);
    const upd = await conn.query('update t_merge set v = 0 where id < 3');
    expect(upd.rowsAffected).toStrictEqual(2);
    const del = await conn.query('delete from t_merge where id = 1');
    expect(del.rowsAffected).toStrictEqual(1);
  });

  it('should leave rowsAffected undefined for a command that changes nothing', async () => {
    // SELECT reports a count of its own, and it describes rows returned -
    // reporting it as rowsAffected would be wrong, not merely unhelpful.
    const sel = await conn.query('select * from t_merge');
    expect(sel.rows?.length).toStrictEqual(2);
    expect(sel.rowsAffected).toBeUndefined();
  });
});
