import type { DataMappingOptions } from '../interfaces/data-mapping-options.js';
import type { EncodeTextFunction } from '../types.js';
import { arrayCalculateDim } from './array-calculatedim.js';
import { arrayLeaf } from './array-leaf.js';

/**
 * What a number's own text looks like: digits, one optional dot, an
 * optional exponent, an optional leading minus. An element that matches
 * goes out bare - `{1,2}` rather than `{"1","2"}`, which is what the
 * server itself prints and what every other client writes.
 */
/* Deliberately narrower than "has no special characters": it is applied
   only to what a JS number or bigint encoded to, and matching it is the
   evidence that the encoder really did produce a number's text. NaN and
   Infinity fail it and stay quoted - both forms parse the same, so that
   costs nothing - and so does anything an unexpected encoder made of a
   number, a date type handed a timestamp say. */
const BARE_NUMBER = /^-?\d+(\.\d+)?([eE][-+]?\d+)?$/;

export function stringifyArrayLiteral(
  value: any[],
  options?: DataMappingOptions,
  encode?: EncodeTextFunction,
): string {
  const dim = arrayCalculateDim(value);
  // `dim` is built once above and never mutated, so its last index is
  // invariant across the whole recursion - not just this loop. Reading
  // dim.length (a property load) and subtracting on every element of every
  // level was the only per-element work here that didn't depend on the
  // element.
  const lastLevel = dim.length - 1;
  const writeDim = (arr: any[], level: number): string => {
    const elemCount = dim[level];
    const isLeafLevel = level >= lastLevel;
    // Concatenated rather than collected and joined: V8 builds a rope
    // and flattens it once, where an array of one string per element is
    // a second allocation per element before the join sees any of them.
    let out = '{';
    for (let i = 0; i < elemCount; i++) {
      if (i) out += ',';
      let x = arr && arr[i];
      if (!isLeafLevel) {
        if (x != null && !Array.isArray(x)) x = [x];
        out += writeDim(x, level + 1);
        continue;
      }
      // if value is null
      if (x == null) {
        out += 'NULL';
        continue;
      }
      /* c8 ignore start - dim is (re)computed above from a DFS that visits
         every array node in `value` and deepens dim to match, so a value
         can never actually be an array once `level` reaches the leaf -
         if it were, dim would already have gone one level deeper there. */
      if (Array.isArray(x)) {
        out += stringifyArrayLiteral(x, options, encode);
        continue;
      }
      /* c8 ignore stop */
      // Asked before the encoder runs, so the test below is only ever
      // applied to a value that really was a number.
      const isNumber = typeof x === 'number' || typeof x === 'bigint';
      if (encode) x = encode(x, options || {});
      const s = '' + x;
      out += isNumber && BARE_NUMBER.test(s) ? s : escapeArrayItem(s);
    }
    return out + '}';
  };
  return writeDim(value, 0);
}

/** Quotes one element, escaping the two characters that need it. */
/* Backslash and double quote are the only two the literal grammar gives
   meaning to inside a quoted element, and neither is in most values - so
   they are looked for before anything is rewritten. The two replace()
   calls each walk the string and build another one even when they change
   nothing, which for a column of ordinary text was half the cost of
   writing the literal. */
function escapeArrayItem(str: string): string {
  return str.indexOf('\\') < 0 && str.indexOf('"') < 0
    ? '"' + str + '"'
    : '"' + str.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

/** How many bytes writeArrayLiteral() writes into `io` at a time. */
/* Bounded rather than grown to fit: a 100 000-element array is 1.1MB of
   literal, and a scratch sized to the largest one ever written would
   hold that for the life of the process. Flushing every 64KB keeps this
   constant, and what it flushes into is the connection's own buffer,
   which already knows how to grow and to hand its pages back when
   idle. */
const CHUNK = 64 * 1024;
/** The scratch itself, reused by every call. */
const chunk = Buffer.allocUnsafe(CHUNK);
/**
 * Whether the digit lane applies to this value - see writeArrayLiteral().
 * Asked of the array's first leaf to choose a path, and of every element
 * on the way past.
 */
function isInt32(v: any): boolean {
  return (
    typeof v === 'number' &&
    v >= -2147483648 &&
    v <= 2147483647 &&
    Number.isInteger(v)
  );
}

/** Digits, written backwards, before they are copied out forwards. */
const DIGITS = new Uint8Array(24);

/** Below this many elements the literal is built as a string instead. */
/* Writing bytes wins from about a hundred elements up and loses below
   it: Buffer.write() has a per-call cost that `+=` does not, and for a
   handful of short elements that cost is the whole of the work. The
   number is where the two met when measured, so it is a floor against a
   small regression rather than a tuned parameter. */
const WRITE_BYTES_FROM = 16;

/**
 * Writes an array as a length-prefixed literal, straight into `io`,
 * without building the literal as a string first.
 *
 * The text is the one `stringifyArrayLiteral()` returns, so what reaches
 * the server is the same either way. Only an array of numbers with no
 * element encoder takes this path - the untyped-parameter case, and the
 * only one where a numeric array becomes a literal at all, since a
 * declared one keeps the binary encoding. Anything else, and anything
 * under `WRITE_BYTES_FROM` elements, is handed to the string path.
 *
 * @param io The buffer to write into - the connection's own.
 * @param value The array to write.
 * @param options Passed to the element encoder, when there is one.
 * @param encode The element type's own text encoder, if the type was
 * declared.
 */
/* The string was never wanted: writeLString() encoded it to UTF-8 and
   threw it away. For a 100 000-element int4[] it is 1.1MB, built out of
   ~200 000 rope nodes, flattened once and encoded once - counted with
   --trace-gc over 100 calls, that step collects 10.1 MB a call.

   The saving is not in avoiding the string, though. Writing bytes
   through Buffer.write() per element is *slower* than letting V8 build a
   rope and flatten it once - 1.1x to 1.35x slower across every size and
   type, which is why this is not simply the byte-writing version of
   stringifyArrayLiteral(). What pays is never producing the element's
   text at all: an integer's digits go into the buffer from the number
   itself, with no string and no per-element call. Against the string
   path on an int4[], medians of alternating runs:

     elements      64      1 000    100 000
     string      2.38 us   22.2 us   3180 us
     digits      0.88 us    4.8 us    917 us
                 2.7x       4.6x      3.5x

   What a caller waits for moves less, and the difference is worth
   knowing before quoting one: inserting the same array over a loopback
   connection is 14.21ms against 12.51ms, 1.14x, because the server's own
   parse of a 1.1MB literal is most of it. The allocation is gone either
   way - 10.10 MB a call to 0.00.

   So the fast lane is integers, and everything else on this path - a
   float, a bigint too large to be exact, anything a reader of the array
   did not expect - falls back to its own text and is written as such. */
export function writeArrayLiteral(
  io: {
    buffer: Buffer;
    size: number;
    writeInt32BE(v: number): number;
    writeBytes(b: Buffer): number;
    writeLString(s?: string, encoding?: BufferEncoding): number;
  },
  value: any[],
  options?: DataMappingOptions,
  encode?: EncodeTextFunction,
): void {
  if (
    encode ||
    !Array.isArray(value) ||
    value.length < WRITE_BYTES_FROM ||
    !isInt32(arrayLeaf(value))
  ) {
    io.writeLString(stringifyArrayLiteral(value, options, encode), 'utf8');
    return;
  }
  const dim = arrayCalculateDim(value);
  const lastLevel = dim.length - 1;
  // The length is only known once everything is written, so the field is
  // reserved now and filled in at the end - the same shape the binary
  // encoders use for their own payloads.
  io.writeInt32BE(0);
  const lengthAt = io.size - 4;
  const start = io.size;
  let p = 0;

  const writeDim = (arr: any[], level: number): void => {
    const elemCount = dim[level];
    const isLeafLevel = level >= lastLevel;
    // No room check here: this is entered either at the top level, with
    // an empty scratch, or from inside the loop below, which has just
    // made room for the separator, the longest number, and both braces.
    chunk[p++] = 123; /* { */
    let x: any;
    let s: string;
    let v: number;
    let q: number;
    let i: number;
    for (i = 0; i < elemCount; i++) {
      // Every element writes at most a separator, a sign and 24 digits,
      // plus the two braces a nested dimension would open and close
      // around them; the text branch reserves its own room below. That
      // headroom is what lets the braces be written unchecked.
      if (p > CHUNK - 32) {
        io.writeBytes(chunk.subarray(0, p));
        p = 0;
      }
      if (i) chunk[p++] = 44; /* , */
      x = arr && arr[i];
      if (!isLeafLevel) {
        if (x != null && !Array.isArray(x)) x = [x];
        writeDim(x, level + 1);
        continue;
      }
      if (x == null) {
        chunk[p++] = 78; /* N */
        chunk[p++] = 85; /* U */
        chunk[p++] = 76; /* L */
        chunk[p++] = 76; /* L */
        continue;
      }
      // int32 rather than any safe integer: the digits come out of a
      // repeated `(v / 10) | 0`, which is exact and fast only within
      // that range. Above it, dividing a double sixteen times per
      // element is slower than letting V8 print the number - measured at
      // 11x slower on values near 9e15 - so those go the same way as a
      // float does, through their own text.
      if (x >= -2147483648 && x <= 2147483647 && Number.isInteger(x)) {
        v = x;
        if (v < 0) {
          chunk[p++] = 45; /* - */
          v = -v;
        }
        q = 24;
        do {
          DIGITS[--q] = 48 + (v % 10);
          v = (v / 10) | 0;
        } while (v);
        while (q < 24) chunk[p++] = DIGITS[q++];
        continue;
      }
      // Anything else: its own text, quoted exactly as the string path
      // would quote it.
      // Asked before the text is produced, and of the value rather than
      // of its spelling - the same rule the string path states: a
      // string's own text is quoted whatever it looks like.
      const isNumber = typeof x === 'number' || typeof x === 'bigint';
      s = '' + x;
      const bare = isNumber && BARE_NUMBER.test(s);
      if (!bare)
        s =
          s.indexOf('\\') < 0 && s.indexOf('"') < 0
            ? s
            : s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      // A UTF-16 code unit is at most three UTF-8 bytes, which is the
      // room to have without measuring the string first. The two quotes
      // are in it, and one byte more for the `}` that may follow this
      // element without a check of its own.
      const bound = s.length * 3 + 3;
      if (p + bound > CHUNK) {
        io.writeBytes(chunk.subarray(0, p));
        p = 0;
      }
      if (bound > CHUNK) {
        // One element larger than the whole scratch - a long text value.
        // It goes out on its own rather than growing anything, and
        // `Buffer.write` would otherwise have truncated it in silence.
        io.writeBytes(Buffer.from(bare ? s : '"' + s + '"', 'utf8'));
        continue;
      }
      if (bare) p += chunk.write(s, p, 'utf8');
      else {
        chunk[p++] = 34; /* " */
        p += chunk.write(s, p, 'utf8');
        chunk[p++] = 34;
      }
    }
    chunk[p++] = 125; /* } */
  };

  writeDim(value, 0);
  if (p) io.writeBytes(chunk.subarray(0, p));
  io.buffer.writeInt32BE(io.size - start, lengthAt);
}
