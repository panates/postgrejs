/**
 * Quotes a table, column or schema name so it can be written into a
 * statement safely.
 *
 * Identifiers cannot be parameters - `$1` is always a value - so a dynamic
 * name has to go into the SQL text itself, which is exactly where an
 * injection would get in. Quoting is what closes that: the name is wrapped
 * in double quotes and any embedded double quote is doubled, so whatever it
 * contains stays a single identifier.
 *
 * Named after PostgreSQL's own `quote_ident()`. Ported from
 * src/interfaces/libpq/fe-exec.c.
 */
export function escapeIdentifier(str: string): string {
  // A NUL byte would silently truncate the identifier at the protocol level
  // - same reason escapeLiteral() refuses it.
  if (str.indexOf('\0') >= 0) {
    throw new Error('PostgreSQL identifiers cannot contain NUL (\\0) bytes');
  }
  let out = '"';
  const l = str.length;
  let i: number;
  let c: string;
  for (i = 0; i < l; i++) {
    c = str[i];
    if (c === '"') out += c + c;
    else out += c;
  }
  return out + '"';
}
