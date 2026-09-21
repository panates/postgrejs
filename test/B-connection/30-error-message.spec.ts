import { expect } from 'expect';
import { Connection, type DatabaseError } from 'postgrejs';

/**
 * `message` is decorated with the source the server's `position` points
 * at, which is what makes an error readable in a terminal. That leaves
 * `serverMessage` as the only copy of what PostgreSQL actually said, and
 * anything that parses the text needs it: an anchored pattern like
 * `/^column (.+) does not exist$/` - which is how `pg`'s ecosystem reads
 * the column name, since PostgreSQL does not put it in a field - matches
 * nothing once a caret diagram follows.
 */
describe('Error message', () => {
  const conn = new Connection();
  before(() => conn.connect());
  after(() => conn.close(0));

  const failing = async (sql: string): Promise<DatabaseError> => {
    try {
      await conn.query(sql);
    } catch (e: any) {
      return e;
    }
    throw new Error('expected ' + sql + ' to fail');
  };

  it('should keep the undecorated text the server sent', async () => {
    const e = await failing('select nosuchcol from pg_class');
    // Byte-identical to what `pg` reports for the same statement.
    expect(e.serverMessage).toStrictEqual('column "nosuchcol" does not exist');
    expect(
      /^column (.+) does not exist$/.exec(e.serverMessage)?.[1],
    ).toStrictEqual('"nosuchcol"');
  });

  it('should still decorate message with the source', async () => {
    const e = await failing('select nosuchcol from pg_class');
    expect(e.message.split('\n')[0]).toStrictEqual(e.serverMessage);
    expect(e.message).toContain('at line 1 column 8');
    expect(e.message).toContain('1| select nosuchcol from pg_class');
    expect(e.message).toContain('^');
    expect(e.position).toStrictEqual(8);
    expect(e.lineNr).toStrictEqual(1);
    expect(e.colNr).toStrictEqual(8);
  });

  it('should point at the right line of a multi-line statement', async () => {
    const e = await failing(
      'select 1 as a,\n       nosuchcol\n  from pg_class',
    );
    expect(e.serverMessage).toStrictEqual('column "nosuchcol" does not exist');
    expect(e.lineNr).toStrictEqual(2);
    expect(e.message).toContain('2|        nosuchcol');
  });

  it('should leave the two equal when there is nothing to decorate', async () => {
    // A constraint violation carries no position, so `message` is never
    // touched - and `serverMessage` is set either way.
    await conn.execute(
      'drop table if exists t_err; create table t_err(i int primary key)',
    );
    await conn.query('insert into t_err values(1)');
    const e = await failing('insert into t_err values(1)');
    expect(e.position).toStrictEqual(undefined);
    expect(e.serverMessage).toStrictEqual(e.message);
    expect(e.serverMessage).toContain('duplicate key value violates');
    await conn.execute('drop table t_err');
  });

  it('should carry it on an error from a prepared statement too', async () => {
    // It is set in the DatabaseError constructor, so no path can be
    // missed - whether or not _handleError ever runs on it.
    const st = await conn
      .prepare('select nosuchcol from pg_class')
      .catch((e: DatabaseError) => e);
    expect((st as DatabaseError).serverMessage).toStrictEqual(
      'column "nosuchcol" does not exist',
    );
  });
});
