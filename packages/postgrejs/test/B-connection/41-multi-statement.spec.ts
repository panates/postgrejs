import { expect } from 'expect';
import { Connection, isMultiStatement } from 'postgrejs';

/**
 * The scanner against the only authority on the question.
 *
 * PostgreSQL refuses a multi-command string on the extended protocol
 * with `42601 cannot insert multiple commands into a prepared statement`
 * exactly when it holds more than one, so the server's verdict is the
 * ground truth and the scanner has to match it case for case.
 *
 * Which way a mismatch goes is not symmetric: saying *several* about one
 * statement costs it its prepared plan, while saying *one* about several
 * reaches the caller as that 42601 - so the corpus leans on the places a
 * `;` can hide.
 */
describe('isMultiStatement() against the server', () => {
  // rollbackOnError off, so a refused statement is reported as itself
  // rather than through the savepoint machinery.
  const conn = new Connection({ rollbackOnError: false });
  before(() => conn.connect());
  after(() => conn.close(0));

  /** What the server makes of it: refused for holding several, or not. */
  const serverSaysSeveral = async (sql: string): Promise<boolean> => {
    try {
      await conn.query(sql);
      return false;
    } catch (e: any) {
      if (
        e.code === '42601' &&
        /multiple commands/i.test(e.serverMessage ?? '')
      )
        return true;
      // Every case below is valid SQL, so anything else is a broken test
      // rather than a result - the server has said nothing about how
      // many statements the string holds.
      throw new Error(
        `${JSON.stringify(sql)} did not run: ${e.code} ${e.serverMessage}`,
        { cause: e },
      );
    }
  };

  const CORPUS: string[] = [
    // string literals
    `select ';'`,
    `select 'a;b', 'c;d'`,
    `select 'it''s; fine'`,
    String.raw`select E'a\'; still one'`,
    `select '$$; not a dollar quote'`,
    `select '-- not a comment; really'`,
    `select '/* not a comment; */'`,
    `select '''; '''`,
    // quoted identifiers
    `select 1 as ";"`,
    `select 1 as "he""llo; x"`,
    // dollar quotes and function bodies
    `select $$ a; b $$`,
    `select $tag$ a; b $tag$`,
    `select $$;$$ || $$;$$`,
    `select $$ a '$$ || $$' b $$`,
    `do $$ begin perform 1; perform 2; end $$`,
    `create or replace function pg_temp.s1() returns int as $$ begin return 1; end; $$ language plpgsql`,
    `create or replace function pg_temp.s2() returns text as $body$ begin return 'a; b'; end; $body$ language plpgsql`,
    `create or replace function pg_temp.s3() returns text as $outer$ begin return $inner$ x; y $inner$; end; $outer$ language plpgsql`,
    // comments
    `select 1 -- ; trailing`,
    `select 1 /* ; */`,
    `select 1 /* a /* ; */ b */`,
    `/* lead; */ select 1`,
    // terminators, which are not second statements
    `select 1;`,
    `select 1;;`,
    `select 1; ;  `,
    `select 1; -- done`,
    `select 1; /* done */`,
    // genuinely several
    `select 1; select 2`,
    `select 'a;b'; select 2`,
    `do $$ begin perform 1; end $$; select 2`,
    `create or replace function pg_temp.s4() returns int as $$ begin return 1; end; $$ language plpgsql; select pg_temp.s4()`,
    `select 1; /* c */ select 2`,
    `select 1 -- c\n; select 2`,
    `select 'a' ; select 'b' ;`,
  ];

  for (const sql of CORPUS)
    it(`should agree on ${JSON.stringify(sql).slice(0, 58)}`, async () => {
      expect(isMultiStatement(sql)).toStrictEqual(await serverSaysSeveral(sql));
    });

  it('should agree on every joining of the awkward fragments', async () => {
    // The hand-written cases above are the shapes someone thought of;
    // this is the grid, so a fragment that only misleads in combination
    // is caught too.
    const FRAGMENTS = [
      `select 1`,
      `select ';'`,
      `select $t$ a; b $t$`,
      String.raw`select E'x\';y'`,
      `select '--;'`,
      `select 1 /* ; */`,
      `select 1 as ";"`,
    ];
    const SEPARATORS = ['; ', ';', ';\n', '; -- c\n', '; /* c */ ', ';; '];
    const TAILS = ['', ';', ';;', '; -- done', '; /* done */', ' -- x'];
    const cases: string[] = [];
    for (const a of FRAGMENTS) {
      for (const t of TAILS) cases.push(a + t);
      for (const s of SEPARATORS)
        for (const b of FRAGMENTS) cases.push(a + s + b);
    }
    const wrong: string[] = [];
    for (const sql of cases)
      if (isMultiStatement(sql) !== (await serverSaysSeveral(sql)))
        wrong.push(sql);
    expect([cases.length > 300, wrong]).toStrictEqual([true, []]);
  });
});
