import { expect } from 'expect';
import { Connection } from 'postgrejs';

const THOUSAND = 'select i from generate_series(1, 1000) i';

describe('fetchCount', () => {
  const conn = new Connection();
  before(() => conn.connect());
  after(() => conn.close(0));

  it('should fetch every row when no limit is given', async () => {
    // The regression this pins: the default used to be 100, so this
    // answered a 100-row prefix that looked exactly like a complete
    // result - same keys, no error, nothing to check.
    const r = await conn.query(THOUSAND);
    expect(r.rows?.length).toStrictEqual(1000);
    expect(r.suspended).toBeUndefined();
  });

  it('should treat 0 as unlimited, as the protocol does', async () => {
    const r = await conn.query(THOUSAND, { fetchCount: 0 });
    expect(r.rows?.length).toStrictEqual(1000);
    expect(r.suspended).toBeUndefined();
  });

  it('should stop at an explicit limit and say the result is a prefix', async () => {
    const r = await conn.query(THOUSAND, { fetchCount: 100 });
    expect(r.rows?.length).toStrictEqual(100);
    expect(r.suspended).toStrictEqual(true);
  });

  it('should suspend on a result that is exactly the limit', async () => {
    // The server does not look ahead - it reports that the limit was
    // reached, not that more rows exist. `suspended` means the former,
    // which is why it is not called hasMore.
    const r = await conn.query('select i from generate_series(1, 100) i', {
      fetchCount: 100,
    });
    expect(r.rows?.length).toStrictEqual(100);
    expect(r.suspended).toStrictEqual(true);
  });

  it('should not suspend on a result one row short of the limit', async () => {
    const r = await conn.query('select i from generate_series(1, 99) i', {
      fetchCount: 100,
    });
    expect(r.rows?.length).toStrictEqual(99);
    expect(r.suspended).toBeUndefined();
  });

  it('should report the same once the statement is prepared', async () => {
    // The third call binds the cached statement instead of going through
    // the one-shot path; both carry their own copy of this.
    const sql = THOUSAND + ' where $1::int4 = 1';
    for (let i = 0; i < 3; i++) {
      const r = await conn.query(sql, { fetchCount: 100, params: [1] });
      expect(r.rows?.length).toStrictEqual(100);
      expect(r.suspended).toStrictEqual(true);
    }
    const all = await conn.query(sql, { params: [1] });
    expect(all.rows?.length).toStrictEqual(1000);
    expect(all.suspended).toBeUndefined();
  });

  it('should leave nothing suspended when the statement returns no rows', async () => {
    const r = await conn.query('select 1 where false', { fetchCount: 10 });
    expect(r.rows?.length).toStrictEqual(0);
    expect(r.suspended).toBeUndefined();
  });

  it('should still reject a limit outside the protocol range', async () => {
    await expect(conn.query(THOUSAND, { fetchCount: -1 })).rejects.toThrow(
      'fetchCount',
    );
    await expect(
      conn.query(THOUSAND, { fetchCount: 4294967296 }),
    ).rejects.toThrow('fetchCount');
  });

  describe('Cursor', () => {
    it('should walk the whole result on the default batch size', async () => {
      const r = await conn.query(THOUSAND, { cursor: true });
      expect(r.suspended).toBeUndefined();
      const seen: number[] = [];
      for await (const row of r.cursor!) seen.push((row as any)[0]);
      expect(seen.length).toStrictEqual(1000);
      expect(seen[999]).toStrictEqual(1000);
    });

    it('should treat fetchCount as a batch size, not a limit', async () => {
      const r = await conn.query(THOUSAND, { cursor: true, fetchCount: 250 });
      const seen: number[] = [];
      for await (const row of r.cursor!) seen.push((row as any)[0]);
      expect(seen.length).toStrictEqual(1000);
      expect(seen[999]).toStrictEqual(1000);
    });

    it('should honour an explicit 0 as one unlimited fetch', async () => {
      const r = await conn.query(THOUSAND, { cursor: true, fetchCount: 0 });
      const seen: number[] = [];
      for await (const row of r.cursor!) seen.push((row as any)[0]);
      expect(seen.length).toStrictEqual(1000);
      expect(seen[999]).toStrictEqual(1000);
    });
  });
});
