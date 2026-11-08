import { expect } from 'expect';
import { Connection, DataTypeOIDs } from 'postgrejs';

/**
 * Once a statement has been seen often enough to earn a name, the server
 * has already said what its parameters are - and a prepared statement's
 * parameter types are fixed at Parse, so a later Bind may send binary
 * against them without re-Parsing anything.
 *
 * Only a `Date` takes that route. It is the one value whose text is much
 * wider than its binary: 20 000 of them are 625 KB of array literal
 * against 234 KB binary, and 11.6ms against 3.8. A number array is the
 * other way round - an int4[] of ordinary values is 380 KB of text
 * against 781 KB of binary, because the binary array format carries a
 * 4-byte length per element whatever its magnitude.
 *
 * What must not change is the value that lands in the column, so every
 * test here runs the same statement either side of the switch and
 * compares.
 */
describe('Date parameters on a reused statement', () => {
  const conn = new Connection();
  /** PREPARE_AFTER_USES is 2, so the third execution is the first named one. */
  const RUNS = 5;

  before(async () => {
    await conn.connect();
    await conn.execute(`
        drop table if exists t_dtreuse;
        create table t_dtreuse(
            tz timestamptz, ts timestamp, d date,
            tza timestamptz[], da date[], ia int4[]);`);
  });
  after(async () => {
    await conn.execute('drop table if exists t_dtreuse');
    return conn.close(0);
  });

  /** Runs one statement RUNS times, returning what each run stored. */
  const storedEachRun = async (col: string, value: any): Promise<string[]> => {
    const out: string[] = [];
    for (let i = 0; i < RUNS; i++) {
      await conn.execute('delete from t_dtreuse');
      await conn.query(`insert into t_dtreuse(${col}) values ($1)`, {
        params: [value],
      });
      const r = await conn.query(`select ${col}::text as v from t_dtreuse`, {
        objectRows: true,
      });
      out.push(r.rows![0].v);
    }
    return out;
  };

  /** The types the last Bind actually encoded against. */
  const bindTypes = async (sql: string, params: any[]): Promise<number[]> => {
    const socket = (conn as any)._intlCon.socket;
    let types: number[] = [];
    const onDebug = (e: any) => {
      if (e.args?.bind) types = e.args.bind.paramTypes ?? [];
    };
    socket.on('debug', onDebug);
    try {
      await conn.query(sql, { params });
    } finally {
      socket.off('debug', onDebug);
    }
    return types;
  };

  const DATE = new Date('2026-07-15T23:59:59.999Z');
  const DATES = [DATE, new Date('1999-12-31T22:00:00.000Z')];

  for (const [col, value, label] of [
    ['tz', DATE, 'timestamptz'],
    ['ts', DATE, 'timestamp'],
    ['d', DATE, 'date'],
    ['tza', DATES, 'timestamptz[]'],
    ['da', DATES, 'date[]'],
  ] as [string, any, string][]) {
    it(`should store the same ${label} before and after the switch`, async () => {
      const runs = await storedEachRun(col, value);
      // All five identical: the text path and the binary one agree, and
      // the switch between them is invisible to the column.
      expect(new Set(runs).size).toStrictEqual(1);
      expect(runs[0]).toBeTruthy();
    });
  }

  it('should bind a reused Date against the type the server resolved', async () => {
    const sql = 'insert into t_dtreuse(tz) values ($1)';
    for (let i = 0; i < RUNS; i++) await conn.query(sql, { params: [DATE] });
    expect(await bindTypes(sql, [DATE])).toStrictEqual([
      DataTypeOIDs.timestamptz,
    ]);
  });

  it('should leave a number array on the text path, where it is cheaper', async () => {
    const sql = 'insert into t_dtreuse(ia) values ($1)';
    for (let i = 0; i < RUNS; i++) await conn.query(sql, { params: [[1, 2]] });
    expect(await bindTypes(sql, [[1, 2]])).toStrictEqual([0]);
    const r = await conn.query(
      'select ia::text as v from t_dtreuse where ia is not null limit 1',
      {
        objectRows: true,
      },
    );
    expect(r.rows![0].v).toStrictEqual('{1,2}');
  });
});
