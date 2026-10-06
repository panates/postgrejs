import { expect } from 'expect';
import { BindParam, Connection } from 'postgrejs';

/**
 * A parameter with no declared type is written the way `pg` writes one:
 * a value with a `toPostgres()` writes itself, and a plain object goes
 * out as JSON.
 *
 * It used to go out as `String(value)`, so an object became
 * `[object Object]` - accepted by the server, a row written, no error.
 * Every expectation below was read off `pg` on the same statement.
 */
describe('Unspecified parameter values', () => {
  const conn = new Connection();
  before(() => conn.connect());
  after(() => conn.close(0));

  const sent = async (v: any): Promise<string> => {
    const r = await conn.query('select $1::text as v', {
      params: [new BindParam(0, v)],
      objectRows: true,
    });
    return r.rows![0].v;
  };

  it('should write a plain object as JSON', async () => {
    expect(await sent({ a: 1, b: 'x' })).toStrictEqual('{"a":1,"b":"x"}');
    expect(await sent({ a: { b: [1, 2] } })).toStrictEqual('{"a":{"b":[1,2]}}');
  });

  it('should let a value write itself', async () => {
    class Custom {
      constructor(readonly n: number) {}
      toPostgres() {
        return 'custom:' + this.n;
      }
    }
    expect(await sent(new Custom(5))).toStrictEqual('custom:5');
  });

  it('should follow toPostgres() into whichever branch its answer belongs in', async () => {
    // Not `'' + result`: the answer re-enters the same dispatch, so a
    // Date goes through the date formatter and an array through the
    // literal writer.
    const d = new Date('2026-03-04T05:06:07.008Z');
    expect(await sent({ toPostgres: () => d })).toStrictEqual(await sent(d));
    expect(await sent({ toPostgres: () => [1, 2] })).toStrictEqual('{1,2}');
    expect(await sent({ toPostgres: () => null })).toStrictEqual(null as any);
  });

  it('should write objects inside an array the same way', async () => {
    expect(await sent([{ a: 1 }, { a: 2 }])).toStrictEqual(
      '{"{\\"a\\":1}","{\\"a\\":2}"}',
    );
    expect(await sent([true, { a: 1 }])).toStrictEqual(
      '{"true","{\\"a\\":1}"}',
    );
  });

  it('should write this client s own classes exactly as before', async () => {
    // Their toPostgres() is `return this.toString()`, so rule 2 reaches
    // the text this path already reached - a round trip must not move.
    const r = await conn.query(`select '(1,2)'::point as p`, {
      objectRows: true,
    });
    const back = await conn.query('select ($1::point)::text as v', {
      params: [new BindParam(0, r.rows![0].p)],
      objectRows: true,
    });
    expect(back.rows![0].v).toStrictEqual('(1,2)');
  });

  it('should refuse a cycle rather than hang', async () => {
    const a: any = {};
    a.toPostgres = () => a;
    await expect(sent(a)).rejects.toThrow(/[Cc]ircular/);
  });
});
