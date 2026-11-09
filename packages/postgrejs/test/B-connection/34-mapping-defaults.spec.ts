import { expect } from 'expect';
import {
  Connection,
  DataTypeMap,
  DataTypeOIDs,
  GlobalTypeMap,
} from 'postgrejs';

/**
 * The data-mapping options can be answered once by the connection
 * instead of on every call. A value on the call always wins, and a
 * connection configured with none of them pays nothing.
 */
describe('Connection mapping defaults', () => {
  it('should apply to every path a row comes back through', async () => {
    const conn = new Connection({ objectRows: true });
    await conn.connect();
    try {
      const shapes = await allShapes(conn);
      expect(shapes).toStrictEqual([
        { v: 1 },
        { v: 1 },
        { v: 1 },
        { v: 1 },
        { v: 1 },
      ]);
    } finally {
      await conn.close(0);
    }
  });

  it('should lose to the value on the call', async () => {
    const conn = new Connection({ objectRows: true });
    await conn.connect();
    try {
      const shapes = await allShapes(conn, { objectRows: false });
      expect(shapes).toStrictEqual([[1], [1], [1], [1], [1]]);
    } finally {
      await conn.close(0);
    }
  });

  it('should hand back the caller’s own options when it has nothing to add', async () => {
    // What makes this free for everyone who configures nothing: no
    // copy, no walk - the same object goes back.
    const conn = new Connection();
    await conn.connect();
    try {
      const options = { objectRows: true };
      expect((conn as any)._intlCon.withDefaults(options)).toBe(options);
    } finally {
      await conn.close(0);
    }
  });

  describe('typeMap', () => {
    class Tag {
      constructor(readonly text: string) {}
    }

    function mapWithTag(): DataTypeMap {
      const map = new DataTypeMap(GlobalTypeMap);
      const base = GlobalTypeMap.get(DataTypeOIDs.varchar);
      map.register({
        ...base,
        oid: DataTypeOIDs.name,
        name: 'name',
        isType: (v: any) => v instanceof Tag,
        encodeText: (v: any) => (v instanceof Tag ? v.text : String(v)),
        encodeBinary: (buf: any, v: any, options: any) =>
          base.encodeBinary!(buf, v instanceof Tag ? v.text : v, options),
      });
      return map;
    }

    it('should type a parameter, not only decode a column', async () => {
      // The parameter types are decided in Connection._query(), which
      // used to read the call's type map and nothing else - so a map set
      // once on the connection decoded every row and then had no say in
      // what went out, and a value only it knew about was inferred by
      // the global map as something else entirely.
      const conn = new Connection({ typeMap: mapWithTag() });
      await conn.connect();
      try {
        const r = await conn.query('select pg_typeof($1)::text as t', {
          objectRows: true,
          params: [new Tag('hello')],
        });
        expect((r.rows?.[0] as any).t).toStrictEqual('name');
      } finally {
        await conn.close(0);
      }
    });

    it('should still lose to a map named on the call', async () => {
      const conn = new Connection({ typeMap: mapWithTag() });
      await conn.connect();
      try {
        const r = await conn.query('select pg_typeof($1)::text as t', {
          objectRows: true,
          typeMap: GlobalTypeMap,
          params: [new Tag('hello')],
        });
        // Nothing in the global map knows a Tag, so it lands where an
        // unknown object lands.
        expect((r.rows?.[0] as any).t).not.toStrictEqual('name');
      } finally {
        await conn.close(0);
      }
    });
  });

  describe('fetchAsString', () => {
    const SQLS = [1, 2, 3, 4, 5].map(i => `select ${i}::int8 as a${i}`);

    /** Round trips and server-side statements for five one-shot queries. */
    async function cost(conn: Connection, options?: any) {
      const locations: string[] = [];
      (conn as any)._intlCon.socket.on('debug', (e: any) =>
        locations.push(e.location),
      );
      let last: any;
      for (const sql of SQLS) last = await conn.query(sql, options);
      // Counted before the counting query, which sends one of its own.
      const sends = locations.filter(l => l.startsWith('PgSocket.send')).length;
      const r = await conn.query(
        'select count(*)::int as n from pg_prepared_statements',
        { objectRows: true },
      );
      return {
        sends,
        statements: (r.rows?.[0] as any).n,
        value: last.rows?.[0][0],
      };
    }

    it('should work from the connection without naming every statement', async () => {
      // A list set once applies to every statement, so giving each one a
      // name on first sight would double the round trips of a workload
      // full of one-shot SQL and leave a server-side statement behind
      // for each. It takes the whole-row-text fallback instead.
      const conn = new Connection({ fetchAsString: [DataTypeOIDs.int8] });
      await conn.connect();
      try {
        const c = await cost(conn);
        expect(c.value).toStrictEqual('5');
        expect(c.sends).toStrictEqual(5);
        expect(c.statements).toStrictEqual(0);
      } finally {
        await conn.close(0);
      }
    });

    it('should still name them when the call carries the list', async () => {
      // The caller asked for this statement in particular, so it pays
      // for the Describe that lets the Bind name its columns.
      const conn = new Connection();
      await conn.connect();
      try {
        const c = await cost(conn, { fetchAsString: [DataTypeOIDs.int8] });
        expect(c.value).toStrictEqual('5');
        expect(c.sends).toStrictEqual(10);
        expect(c.statements).toStrictEqual(5);
      } finally {
        await conn.close(0);
      }
    });
  });
});

/** One row through query(), execute(), pipeline(), a cursor and a statement. */
async function allShapes(conn: Connection, options: any = {}) {
  const out: any[] = [];
  out.push((await conn.query('select 1 as v', options)).rows?.[0]);
  out.push((await conn.execute('select 1 as v', options)).results[0].rows?.[0]);
  out.push((await conn.pipeline(['select 1 as v'], options))[0].rows?.[0]);
  const cursored = await conn.query('select 1 as v', {
    ...options,
    cursor: true,
  });
  out.push(await cursored.cursor!.next());
  await cursored.cursor!.close();
  const st = await conn.prepare('select 1 as v');
  out.push((await st.execute(options)).rows?.[0]);
  await st.close();
  return out;
}
