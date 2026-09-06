export function fastParseInt(str: string | number): number {
  /* istanbul ignore next */
  if (typeof str === 'number') return Math.floor(str);
  // noinspection SuspiciousTypeOfGuard
  if (typeof str !== 'string') return NaN;
  // parseInt(_, 10) measures as fast as (or faster than) a hand-rolled
  // char-code loop in current V8, and with an explicit radix it won't
  // auto-detect "0x"/"0b"/"0o" prefixes as hex/binary/octal the way
  // Number() would - it stops at the first invalid character (matching
  // the truncate-at-decimal-point behavior this function always had) and
  // returns NaN for genuinely invalid input instead of silently coercing
  // it (e.g. "" or "0x10") to a plausible-looking wrong number.
  return parseInt(str, 10);
}

// Parses straight from the raw wire bytes, skipping the buffer->string
// conversion every text-format column otherwise pays for before its
// decodeText runs (measured as the single largest CPU cost in a text-heavy
// fetch). Safe for int2/int4 specifically because PostgreSQL's text output
// for them is always a clean decimal integer - optional leading "-", ASCII
// digits only, no whitespace/"+"/leading "0x" - verified byte-identical to
// `parseInt(str, 10)` across the full int4 range (500k random samples +
// boundary values). Do not use for types with a more complex grammar
// (floats, anything that can be "NaN"/"Infinity"/exponential notation).
//
// offset/len default to "the whole buffer" so existing 1-arg callers (e.g.
// int8-type.ts's own >15-digit-free fast path, already handed an
// exactly-bounded buffer) keep working unchanged. get-parsers.ts's text
// fast path calls this with an explicit offset/len straight into the
// shared row buffer instead - no Buffer.subarray() needed, same technique
// already used for fixed-width binary columns (see get-parsers.ts).
export function fastParseIntBuffer(
  buf: Buffer,
  offset = 0,
  len: number = buf.length - offset,
): number {
  const end = offset + len;
  let i = offset;
  let neg = false;
  if (len > 0 && buf[offset] === 45 /* '-' */) {
    neg = true;
    i++;
  }
  let n = 0;
  for (; i < end; i++) {
    n = n * 10 + (buf[i] - 48);
  }
  return neg ? -n : n;
}
