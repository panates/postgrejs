// Cheap first pass. Almost no statement contains either word, so almost
// every pooled query is decided by this one scan and never reaches the
// accurate (and more expensive) pass below. It over-matches on purpose -
// comments, string literals and PL/pgSQL blocks all get through here.
const MAYBE_TRANSACTION = /\b(?:begin|start)\b/i;

function isWordChar(code: number): boolean {
  return (
    (code >= 48 && code <= 57) || // 0-9
    (code >= 65 && code <= 90) || // A-Z
    (code >= 97 && code <= 122) || // a-z
    code === 95 || // _
    code === 36 // $
  );
}

/** Case-insensitive whole-word match of `word` at `at`. */
function matchesWord(sql: string, at: number, word: string): boolean {
  if (at + word.length > sql.length) return false;
  for (let i = 0; i < word.length; i++) {
    if ((sql.charCodeAt(at + i) | 32) !== word.charCodeAt(i)) return false;
  }
  if (at > 0 && isWordChar(sql.charCodeAt(at - 1))) return false;
  const after = at + word.length;
  return after >= sql.length || !isWordChar(sql.charCodeAt(after));
}

/** Skips whitespace, then reports whether `word` follows. */
function nextWordIs(sql: string, from: number, word: string): boolean {
  let i = from;
  while (i < sql.length && /\s/.test(sql[i])) i++;
  return matchesWord(sql, i, word);
}

/**
 * Does this SQL open a transaction?
 *
 * Pool.query()/Pool.execute() may share one connection between several
 * in-flight queries, which is only safe while none of them opens a
 * transaction: the others are already dispatched on that connection by the
 * time a BEGIN takes effect, so they would silently join it. Knowing
 * BEFORE dispatch is what makes the difference between routing the
 * statement to a connection of its own - where it simply works - and
 * finding out afterwards, when the damage is done and all that is left is
 * to report it.
 *
 * Two passes: a cheap regex rejects the overwhelming majority, and only a
 * hit pays for the accurate scan below, which skips comments and quoted
 * text so `select 'begin'`, `-- begin`, and a `DO $$ BEGIN ... END $$`
 * block (PL/pgSQL, not a transaction) are not mistaken for one. It looks
 * ANYWHERE rather than only at the start, since execute() runs
 * multi-statement scripts where the BEGIN can be the second statement.
 *
 * What it cannot see is a transaction opened inside a called procedure -
 * no reading of the SQL can reveal that. Pool keeps a second, authoritative
 * check on the server's own transaction status for exactly that case.
 */
export function startsTransaction(sql: string): boolean {
  if (!MAYBE_TRANSACTION.test(sql)) return false;

  const n = sql.length;
  let i = 0;
  while (i < n) {
    const c = sql[i];

    if (c === '-' && sql[i + 1] === '-') {
      const nl = sql.indexOf('\n', i + 2);
      i = nl === -1 ? n : nl + 1;
      continue;
    }

    if (c === '/' && sql[i + 1] === '*') {
      // Block comments nest in PostgreSQL, unlike in most SQL dialects.
      let depth = 1;
      i += 2;
      while (i < n && depth > 0) {
        if (sql[i] === '/' && sql[i + 1] === '*') {
          depth++;
          i += 2;
        } else if (sql[i] === '*' && sql[i + 1] === '/') {
          depth--;
          i += 2;
        } else i++;
      }
      continue;
    }

    // '...' literal or "..." identifier; a doubled quote escapes itself.
    if (c === "'" || c === '"') {
      i++;
      while (i < n) {
        if (sql[i] === c) {
          if (sql[i + 1] === c) i += 2;
          else {
            i++;
            break;
          }
        } else i++;
      }
      continue;
    }

    // $tag$ ... $tag$ - function bodies live in these, and the BEGIN of a
    // PL/pgSQL block is not a transaction.
    if (c === '$') {
      const tag = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i))?.[0];
      if (tag) {
        const end = sql.indexOf(tag, i + tag.length);
        i = end === -1 ? n : end + tag.length;
        continue;
      }
    }

    if (matchesWord(sql, i, 'begin')) return true;
    if (matchesWord(sql, i, 'start') && nextWordIs(sql, i + 5, 'transaction')) {
      return true;
    }

    i++;
  }
  return false;
}
