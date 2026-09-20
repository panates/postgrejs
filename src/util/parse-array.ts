import type { Maybe } from '../types.js';

export function parsePostgresArray(
  s: string,
  opts?: {
    transform?: (v: string) => any;
    separator?: string;
  },
): Maybe<any[]> {
  if (!s) return;
  const sep = (opts?.separator || ',').substring(0, 1);
  const transform = opts?.transform;
  const len = s.length;
  let idx = 0;
  const out: any[] = [];

  const iterate = (arr: any[]): void => {
    let c: string;
    let exactlyValue = false;
    let token = '';
    let quote = '';
    while (idx < len) {
      c = s.charAt(idx++);

      if (!quote) {
        if (!token && c === '{') {
          const a: any[] = [];
          arr.push(a);
          iterate(a);
          continue;
        }

        if (c === '}' || c === sep) {
          // An element is present when it had content OR when it was
          // quoted: `""` is a real empty string, and testing the token
          // alone dropped it - `{"",b}` came back as one element, with
          // every later index shifted.
          //
          // An unquoted empty token is still skipped. PostgreSQL never
          // emits one (a null prints as the bare word NULL, an empty
          // string always as `""`), so `{a,,b}` is not output this has to
          // read - and skipping it is what keeps the separator that
          // follows a nested array from pushing an element of its own.
          if (token || exactlyValue) {
            if (token === 'NULL' && !exactlyValue) arr.push(null);
            else arr.push(transform ? transform(token) : token);
          }
          // Reset per element rather than only when one was pushed.
          // Leaving it set carried "this one was quoted" into the next
          // element - and that flag is what tells a real NULL apart from
          // the string "NULL", so a null following an empty string
          // decoded as four characters of text.
          exactlyValue = false;
          token = '';
          if (c === '}') return;
          continue;
        }
      }

      if (c === '\\') {
        c = s.charAt(idx++);
        token += c;
        continue;
      }

      if (c === '"') {
        if (quote) {
          quote = '';
        } else {
          exactlyValue = true;
          quote = c;
        }
        continue;
      }

      token += c;
    }
  };
  iterate(out);
  return out.length ? out[0] : undefined;
}
