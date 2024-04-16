// Ported from PostgreSQL 9.2.4 source code in src/interfaces/libpq/fe-exec.c
export function escapeLiteral(str: string): string {
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
