/**
 * Whether `sql` holds more than one statement.
 *
 * This client has two ways to send SQL and they are not interchangeable:
 * `query()` speaks the extended protocol, which PostgreSQL will not let
 * carry more than one command, and `execute()` sends a simple `Query`,
 * which may hold a whole script but gives up the prepared plan. A caller
 * that knows which it has picks the right one and needs nothing from
 * here. A caller with a single SQL-taking API above it - an ORM adapter,
 * a migration runner, a REPL, anything taking SQL from a user - has to
 * choose before it can send, and both shapes arrive at the same method.
 *
 * Nobody can answer that from the wire: the server does the parsing, and
 * its count arrives with the results, long after the choice was made.
 * `pg` picks from whether the call happened to carry parameters, which
 * is a guess about intent rather than an answer. So the question belongs
 * here, beside the two functions whose difference raises it.
 *
 * It is a scanner and not a parser - one pass, one boolean - and what it
 * skips is everything a `;` can hide inside:
 *
 * | construct | skipped to |
 * | --- | --- |
 * | `'...'` | the closing quote, `''` being an escaped one |
 * | `E'...'` | the same, and `\'` too |
 * | `"..."` | the closing quote of an identifier, `""` escaped |
 * | `$tag$...$tag$` | the matching tag - a function body |
 * | `-- ...` | end of line |
 * | `/* ... *\/` | the matching close, which PostgreSQL nests |
 *
 * A trailing `;`, or a run of them with only whitespace and comments
 * after, is not a second statement: the server takes `select 1;;` on the
 * extended protocol without complaint.
 *
 * Which way a wrong answer goes is not symmetric, and the tests are built
 * on that: saying *several* about one statement costs it its prepared
 * plan and nothing else, while saying *one* about several reaches the
 * caller as `42601 cannot insert multiple commands into a prepared
 * statement`.
 *
 * One boundary, left as it is: under `standard_conforming_strings = off`
 * a backslash escapes inside a plain `'...'` too, so `select 'a\'; select
 * 2` is one malformed statement to the server and two to this. Both roads
 * end in an error, nothing is decoded wrongly, and that setting has
 * defaulted to `on` since PostgreSQL 9.1.
 */
export function isMultiStatement(sql: string): boolean {
  const len = sql.length;
  let i = 0;
  let separator = false;
  let c: number;
  while (i < len) {
    c = sql.charCodeAt(i);
    // Whatever follows a `;` decides what that `;` was: more whitespace,
    // comments or semicolons leave it a terminator, and anything else
    // makes it the seam between two statements.
    if (separator && !isSpace(c) && c !== SEMI && c !== DASH && c !== SLASH)
      return true;
    if (c === SEMI) {
      separator = true;
      i++;
    } else if (c === QUOTE) {
      i = skipQuoted(sql, len, i, QUOTE, escapesBackslash(sql, i));
    } else if (c === DQUOTE) {
      i = skipQuoted(sql, len, i, DQUOTE, false);
    } else if (c === DOLLAR) {
      const end = skipDollarQuoted(sql, len, i);
      // Not a dollar quote - a `$1` placeholder, or a bare `$`.
      i = end < 0 ? i + 1 : end;
    } else if (c === DASH && sql.charCodeAt(i + 1) === DASH) {
      const nl = sql.indexOf('\n', i + 2);
      i = nl < 0 ? len : nl + 1;
    } else if (c === SLASH && sql.charCodeAt(i + 1) === STAR) {
      i = skipBlockComment(sql, len, i);
    } else {
      // A `-` or `/` that began no comment is content like any other.
      if (separator && !isSpace(c)) return true;
      i++;
    }
  }
  return false;
}

const SEMI = 59; // ;
const QUOTE = 39; // '
const DQUOTE = 34; // "
const DOLLAR = 36; // $
const DASH = 45; // -
const SLASH = 47; // /
const STAR = 42; // *
const BACKSLASH = 92; // \
const UNDERSCORE = 95; // _

function isSpace(c: number): boolean {
  return c === 32 || c === 10 || c === 9 || c === 13 || c === 12;
}

function isDigit(c: number): boolean {
  return c >= 48 && c <= 57;
}

/** A letter or `_`, which is what a dollar-quote tag may start with. */
function isIdentStart(c: number): boolean {
  return (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === UNDERSCORE;
}

/**
 * Whether the quote at `at` opens an `E'...'` literal, where a backslash
 * escapes. The letter has to stand alone: the `e` of `value` is not a
 * prefix.
 */
function escapesBackslash(sql: string, at: number): boolean {
  const prev = sql.charCodeAt(at - 1);
  if (prev !== 69 /* E */ && prev !== 101 /* e */) return false;
  if (at < 2) return true;
  const before = sql.charCodeAt(at - 2);
  return !(
    isIdentStart(before) ||
    isDigit(before) ||
    before === DOLLAR ||
    before === UNDERSCORE
  );
}

/** Past the closing quote, or the end of the string if it never closes. */
function skipQuoted(
  sql: string,
  len: number,
  start: number,
  quote: number,
  backslash: boolean,
): number {
  let i = start + 1;
  let c: number;
  while (i < len) {
    c = sql.charCodeAt(i);
    if (backslash && c === BACKSLASH) i += 2;
    else if (c !== quote) i++;
    // A doubled quote is an escaped one and the literal carries on.
    else if (sql.charCodeAt(i + 1) === quote) i += 2;
    else return i + 1;
  }
  return len;
}

/**
 * Past `$tag$ ... $tag$`, or -1 when the `$` opens none - which is the
 * common case, since `$1` is a parameter placeholder. The tag is read
 * character by character so that a placeholder costs no allocation.
 */
function skipDollarQuoted(sql: string, len: number, start: number): number {
  let i = start + 1;
  let c: number;
  while (i < len) {
    c = sql.charCodeAt(i);
    if (c === DOLLAR) break;
    if (!(isIdentStart(c) || (i > start + 1 && isDigit(c)))) return -1;
    i++;
  }
  if (i >= len) return -1;
  const tag = sql.substring(start, i + 1);
  const close = sql.indexOf(tag, i + 1);
  return close < 0 ? len : close + tag.length;
}

/** Past the matching `*\/`. PostgreSQL nests block comments. */
function skipBlockComment(sql: string, len: number, start: number): number {
  let depth = 0;
  let i = start;
  while (i < len) {
    if (sql.charCodeAt(i) === SLASH && sql.charCodeAt(i + 1) === STAR) {
      depth++;
      i += 2;
    } else if (sql.charCodeAt(i) === STAR && sql.charCodeAt(i + 1) === SLASH) {
      i += 2;
      if (--depth === 0) return i;
    } else i++;
  }
  return len;
}
