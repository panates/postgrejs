import { expect } from 'expect';
import { Connection } from 'postgrejs';

/**
 * A statement with nothing in it - empty, blank, or only a comment - is
 * answered by PostgreSQL with `EmptyQueryResponse` *instead of* a
 * `CommandComplete`. The extended-query paths had no case for it and
 * raised `Server returned unexpected response message (I)`; `pg` returns
 * an ordinary empty result, and so does this now.
 *
 * Nothing here needs a comment to be a statement on purpose - a caller
 * builds SQL from a template or strips one down to its comments far more
 * often than they type `query('')`.
 */
describe('Empty statement', () => {
  const conn = new Connection();
  before(() => conn.connect());
  after(() => conn.close(0));

  const empties = ['', '   ', '-- just a comment', '/* block */'];

  it('should answer with an empty result rather than raise', async () => {
    for (const sql of empties) {
      const r = await conn.query(sql);
      expect(r.command).toStrictEqual(undefined);
      expect(r.rows).toStrictEqual(undefined);
      expect(r.fields).toStrictEqual(undefined);
    }
  });

  it('should do the same on the second and third call', async () => {
    // The statement cache prepares SQL on its second sighting, so the
    // third call runs through a different message loop than the first.
    for (let i = 0; i < 3; i++) {
      const r = await conn.query('-- cached');
      expect(r.command).toStrictEqual(undefined);
    }
  });

  it('should not take the command tag of a savepoint riding with it', async () => {
    // Inside a transaction the statement is wrapped in SAVEPOINT/RELEASE,
    // so two real command tags surround it. The empty statement has to
    // take its own slot in that stream or RELEASE is read as the
    // caller's own command.
    await conn.startTransaction();
    const r = await conn.query('');
    expect(r.command).toStrictEqual(undefined);
    // And the connection is still usable afterwards.
    const after = await conn.query('select 1 as v', { objectRows: true });
    expect((after.rows?.[0] as any).v).toStrictEqual(1);
    await conn.commit();
  });

  it('should prepare and execute one', async () => {
    const st = await conn.prepare('');
    try {
      const r = await st.execute();
      expect(r.command).toStrictEqual(undefined);
      expect(r.rows).toStrictEqual(undefined);
    } finally {
      await st.close();
    }
  });

  it('should return no cursor when one was asked for', async () => {
    // There are no columns to read, so there is nothing to iterate -
    // but asking must not raise either.
    const r = await conn.query('', { cursor: true });
    expect(r.cursor).toStrictEqual(undefined);
  });

  it('should keep answering the simple-query path as it did', async () => {
    const r = await conn.execute('');
    expect(r.totalCommands).toStrictEqual(0);
    expect(r.results).toStrictEqual([]);
  });
});
