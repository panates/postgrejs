import { expect } from 'expect';
import { isMultiStatement } from 'postgrejs';

/**
 * What the scanner answers. `test/B-connection` pins that the answer is
 * *right*, by asking PostgreSQL; this one covers the shapes that cannot
 * be asked - a `$1` placeholder needs a parameter, and unterminated SQL
 * has no verdict to compare against.
 */
describe('isMultiStatement()', () => {
  const one = (sql: string) =>
    expect([sql, isMultiStatement(sql)]).toStrictEqual([sql, false]);
  const several = (sql: string) =>
    expect([sql, isMultiStatement(sql)]).toStrictEqual([sql, true]);

  it('should answer no for a single statement', () => {
    one('select 1');
    one('');
    one('   ');
    one('select 1 from t where a = 1 and b = 2');
  });

  it('should not read a `;` inside a string literal', () => {
    one(`select ';'`);
    one(`select 'a;b', 'c;d'`);
    one(`select 'it''s; fine'`);
    one(String.raw`select E'a\'; still one'`);
    one(String.raw`select e'a\'; still one'`);
    // The letter has to stand alone: the `e` of `value` is not a prefix,
    // so the backslash here escapes nothing and the literal ends at the
    // quote before the `;`.
    several(String.raw`select value'a\'; select 2`);
    // At the very start there is nothing in front of the `E` to
    // disqualify it.
    one(String.raw`E'a\'; still one'`);
  });

  it('should not read one inside a quoted identifier', () => {
    one('select 1 as ";"');
    one('select 1 as "he""llo; x"');
  });

  it('should not read one inside a dollar-quoted body', () => {
    one('select $$ a; b $$');
    one('select $tag$ a; b $tag$');
    one('select $$;$$ || $$;$$');
    one('do $$ begin perform 1; perform 2; end $$');
    one(
      'create function f() returns text as $outer$ begin return $inner$ x; y $inner$; end; $outer$ language plpgsql',
    );
  });

  it('should step over a parameter placeholder, which is not a dollar quote', () => {
    // `$1` cannot be asked of the server without a parameter to bind, so
    // it is pinned here: read as a quote it would swallow the rest of
    // the string and hide a separator.
    one('select $1');
    one('select $1, $2');
    several('select $1; select $2');
    several('select $1 ; select 2');
    one('select 1 as "a$1b"');
    one('select $ 1');
    // A tag may carry digits after its first character, and one that
    // runs off the end of the string opens nothing.
    one('select $t1$ a; b $t1$');
    one('select $tag');
    one('select $');
  });

  it('should not read one inside a comment', () => {
    one('select 1 -- ; trailing');
    one('select 1 /* ; */');
    one('select 1 /* a /* ; */ b */');
    one('/* lead; */ select 1');
    several('select 1 -- c\n; select 2');
  });

  it('should treat a terminator, however repeated, as one statement', () => {
    one('select 1;');
    one('select 1;;');
    one('select 1; ;  ');
    one('select 1; -- done');
    one('select 1; /* done */');
    one(';');
    one(';;');
  });

  it('should answer yes when there really are several', () => {
    several('select 1; select 2');
    several(`select 'a;b'; select 2`);
    several('do $$ begin perform 1; end $$; select 2');
    several('select 1; /* c */ select 2');
    several(`select 'a' ; select 'b' ;`);
    several('select 1;select 2');
    // A `-` or `/` that opens no comment is content like any other.
    several('select 1; -x');
    several('select 1; /x');
  });

  it('should end on unterminated input rather than run past it', () => {
    // Nothing here is valid SQL, so there is no right answer to give -
    // only a wrong way to arrive at one, which is not to return.
    one(`select 'a`);
    one('select "a');
    one('select $$ a');
    one('select $tag$ a');
    one('select 1 /* a');
    several(`select 1; select 'a`);
  });
});
