import { expect } from 'expect';
import { Connection } from 'postgrejs';

describe('PreparedStatement', () => {
  let connection: Connection;

  before(async () => {
    connection = new Connection();
    await connection.connect();
  });

  after(() => connection.close(0));

  it('should close() be idempotent', async () => {
    // Regression test: close() and the internal _close() both decremented
    // the ref-count, so a second close() call re-sent CLOSE+SYNC to the
    // server for an already-closed statement instead of being a no-op.
    const stmt = await connection.prepare('select 1 as v');
    await stmt.close();
    await stmt.close();
    await stmt.close();
    // Connection must still be usable afterward.
    const r = await connection.query('select 2 as v');
    expect(r.rows?.[0]).toStrictEqual([2]);
  });
});
