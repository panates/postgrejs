// Ported from PostgreSQL 9.2.4 source code in src/interfaces/libpq/fe-exec.c
/**
 * Quotes a string as an SQL literal, escaping what has to be escaped.
 *
 * For the `sql` tag and anything else that has to put a value into the
 * statement text; a parameter never needs this.
 *
 * @param str The value to quote.
 * @returns The quoted literal, `E`-prefixed when it carries a backslash.
 * @throws Error When the string holds a NUL byte, which PostgreSQL text
 * cannot.
 */
/* Ported from PostgreSQL's own src/interfaces/libpq/fe-exec.c (9.2.4),
   so it quotes what libpq quotes, the way libpq quotes it. */
export function escapeLiteral(str: string): string {
  if (str.indexOf('\0') >= 0) {
    throw new Error('PostgreSQL text values cannot contain NUL (\\0) bytes');
  }

  let backSlash = false;
  let out = "'";
  let i;
  let c;
  const l = str.length;

  for (i = 0; i < l; i++) {
    c = str[i];
    if (c === "'") out += c + c;
    else if (c === '\\') {
      out += c + c;
      backSlash = true;
    } else out += c;
  }
  out += "'";

  if (backSlash) out = ' E' + out;

  return out;
}
