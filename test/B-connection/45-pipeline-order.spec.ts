import { expect } from 'expect';
import { Connection } from 'postgrejs';

/**
 * Reported from joist-orm (joist-orm/joist-orm#2119) against 3.14.0: two
 * concurrent query() calls on one connection ran in the wrong order when the
 * first needed preparing and the second was already in the prepared cache.
 *
 * The first call writes Parse+Describe and waits for the answer; the second
 * is a cache hit and writes Bind+Execute straight away, so it reaches the
 * server first. Both callers get their own correct result - it is the
 * database that ends up in the other order.
 */
describe('Pipelined statements keep their submission order', () => {
  const conn = new Connection();
  before(() => conn.connect());
  after(() => conn.close(0));

  // What makes the preparation boundary reproducible: the columns have to be
  // known before the Bind, so a statement earns a name on first sight.
  const options = { unknownTypesAsString: true, objectRows: true } as const;

  /* A tag per test rather than one pair of statements for the file: the
     prepared cache lives as long as the connection, so a statement the
     previous test left in it would be a cache hit here and the cold half of
     the case under test would silently not be cold. */
  function pair(tag: string): [string, string] {
    return [
      `update pipeline_order_probe set n = 1 returning n /* ${tag} */`,
      `update pipeline_order_probe set n = 2 returning n /* ${tag} */`,
    ];
  }

  beforeEach(async () => {
    await conn.execute(`
      drop table if exists pipeline_order_probe;
      create temporary table pipeline_order_probe (n int);
      insert into pipeline_order_probe values (0);
    `);
  });

  async function finalValue(): Promise<number> {
    const r = await conn.query('select n from pipeline_order_probe', options);
    return r.rows![0].n;
  }

  it('should run a cold statement before a cached one submitted after it', async () => {
    const [first, second] = pair('cold-then-cached');
    // Only the second SQL is prepared. The first has never been submitted.
    await conn.query(second, options);
    await conn.execute('update pipeline_order_probe set n = 0');

    const results = await Promise.all([
      conn.query(first, options),
      conn.query(second, options),
    ]);

    // Each caller's own result was never in doubt - the rows come back on
    // the right promises either way.
    expect(results[0].rows![0].n).toStrictEqual(1);
    expect(results[1].rows![0].n).toStrictEqual(2);
    expect(await finalValue()).toStrictEqual(2);
  });

  it('should hold that order inside an explicit transaction', async () => {
    const [first, second] = pair('in-transaction');
    await conn.query(second, options);
    await conn.execute('update pipeline_order_probe set n = 0');
    await conn.startTransaction();
    try {
      await Promise.all([
        conn.query(first, options),
        conn.query(second, options),
      ]);
      expect(await finalValue()).toStrictEqual(2);
    } finally {
      await conn.rollback();
    }
  });

  it('should keep the order when both statements are already cached', async () => {
    const [first, second] = pair('both-cached');
    await conn.query(first, options);
    await conn.query(second, options);
    await conn.execute('update pipeline_order_probe set n = 0');

    await Promise.all([
      conn.query(first, options),
      conn.query(second, options),
    ]);
    expect(await finalValue()).toStrictEqual(2);
  });

  it('should keep the order when neither statement is cached', async () => {
    const [first, second] = pair('neither-cached');
    await Promise.all([
      conn.query(first, options),
      conn.query(second, options),
    ]);
    expect(await finalValue()).toStrictEqual(2);
  });

  it('should queue nothing when every statement is a cache hit', async () => {
    const [first, second] = pair('fast-path');
    await conn.query(first, options);
    await conn.query(second, options);

    const intl = (conn as any)._intlCon;
    const running = [conn.query(first, options), conn.query(second, options)];
    // Neither had to wait, so neither held a place: the ordering costs a
    // field read on the path that writes straight away.
    expect(intl._wireOrder).toBeUndefined();
    await Promise.all(running);
  });

  it('should release the line when the statement ahead fails to parse', async () => {
    const [, second] = pair('failed-parse');
    await conn.query(second, options);
    await conn.execute('update pipeline_order_probe set n = 0');

    const bad = conn.query('select no_such_column_anywhere', options);
    const good = conn.query(second, options);

    await expect(bad).rejects.toThrow();
    expect((await good).rows![0].n).toStrictEqual(2);
  });
});
