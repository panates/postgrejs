// Escape-format decode ported from the `postgres-bytea` npm package
// (MIT License, Copyright (c) Ben Drucker <bvdrucker@gmail.com>) so the
// hex fast path below doesn't need an external dependency for the rare
// legacy fallback. bytea_output has defaulted to "hex" since PostgreSQL
// 9.0 (2010); "escape" format is legacy and unlikely to appear in
// practice, but PostgreSQL still supports emitting it.
function parseByteaEscape(input: string): Buffer {
  let output = '';
  let i = 0;
  const l = input.length;
  while (i < l) {
    if (input[i] !== '\\') {
      output += input[i];
      i++;
    } else if (/[0-7]{3}/.test(input.substring(i + 1, i + 4))) {
      output += String.fromCharCode(parseInt(input.substring(i + 1, i + 4), 8));
      i += 4;
    } else {
      let backslashes = 1;
      while (i + backslashes < l && input[i + backslashes] === '\\') {
        backslashes++;
      }
      const u = Math.floor(backslashes / 2);
      let k: number;
      for (k = 0; k < u; k++) output += '\\';
      // An odd backslash count (a lone unescaped '\' the loop above
      // couldn't pair up) advances 0 via the halving above - without the
      // `|| 1` fallback, `i` never moves and this loops forever on the
      // same position. Malformed/unexpected input for this legacy format,
      // but must still make forward progress rather than hang.
      i += u * 2 || 1;
    }
  }
  return Buffer.from(output, 'binary');
}

export function parseBytea(v: string): Buffer {
  // PostgreSQL's default bytea_output is "hex" (`\x`-prefixed) - check the
  // two marker chars directly rather than a regex test, and hex-decode
  // inline; this is the path almost every real value takes.
  if (v.charCodeAt(0) === 92 /* '\' */ && v.charCodeAt(1) === 120 /* 'x' */)
    return Buffer.from(v.slice(2), 'hex');
  return parseByteaEscape(v);
}

// 256-entry lookup: ASCII byte -> hex nibble value (0-15), -1 if not a hex
// digit. Built once at module load.
const HEX_NIBBLE = (() => {
  const t = new Int8Array(256).fill(-1);
  for (let i = 0; i <= 9; i++) t[48 + i] = i; // '0'-'9'
  for (let i = 0; i <= 5; i++) t[97 + i] = 10 + i; // 'a'-'f'
  for (let i = 0; i <= 5; i++) t[65 + i] = 10 + i; // 'A'-'F'
  return t;
})();

// Parses straight from the raw wire bytes for the `\x`-prefixed hex fast
// path, skipping both the buffer->string conversion AND the intermediate
// hex-string Buffer.from(str,'hex') parse that parseBytea's own hex path
// still needs - bytea values are typically the largest column values in a
// row, so this is the single biggest per-column allocation avoided of any
// type in this fast-path set. Falls back to the (rare, legacy) escape
// format via a single 'latin1' string conversion - its own grammar (\ddd
// octal triplets, ASCII digits, or a literal backslash) is pure ASCII, same
// as the hex path, so 'latin1' is safe there too.
export function parseByteaBuffer(
  buf: Buffer,
  offset: number,
  len: number,
): Buffer {
  if (buf[offset] === 0x5c /* '\' */ && buf[offset + 1] === 0x78 /* 'x' */) {
    // Truncate a trailing odd nibble instead of throwing, matching
    // Buffer.from(hexString, 'hex')'s own silent-truncate behavior today.
    const outLen = (len - 2) >> 1;
    const out = Buffer.allocUnsafe(outLen);
    const start = offset + 2;
    for (let i = 0; i < outLen; i++) {
      out[i] =
        (HEX_NIBBLE[buf[start + i * 2]] << 4) |
        HEX_NIBBLE[buf[start + i * 2 + 1]];
    }
    return out;
  }
  return parseByteaEscape(buf.toString('latin1', offset, offset + len));
}
