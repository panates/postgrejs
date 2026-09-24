/** `0`-`f` as bytes, so a nibble indexes straight into it. */
const HEX = Buffer.from('0123456789abcdef', 'latin1');

/**
 * Writes `count` bytes of `src` into `scratch` as lowercase hex, each
 * byte's two characters starting at `positions[i]` - so the separators
 * a type writes between its bytes are put in once, when the scratch is
 * built, and never again.
 *
 * The scratch is then read back with `latin1`, which is what the text
 * paths of these types already use: the output is fixed-format ASCII,
 * so it decodes identically to `utf8` and skips V8's multi-byte-sequence
 * detection.
 *
 * Why not `Buffer.toString('hex')`: a type whose text has separators in
 * it has to call that once per group and join the pieces. For `uuid`
 * that was five calls and four concatenations per value - 25 000 strings
 * and 20 000 concatenations for a 5 000-row column, which is more work
 * than `pg` does for the same column despite this client reading half
 * the bytes. Measured over 5 000 values, medians of nine runs:
 *
 * ```
 * five toString + concat        1.86 ms
 * one toString, then slice      0.81 ms
 * a byte -> two-char table      0.64 ms
 * this                          0.33 ms
 * ```
 */
export function writeHexBytes(
  scratch: Buffer,
  positions: number[],
  src: Buffer,
  offset: number,
  count: number,
): void {
  let i: number;
  let p: number;
  let b: number;
  for (i = 0; i < count; i++) {
    p = positions[i];
    b = src[offset + i];
    scratch[p] = HEX[b >> 4];
    scratch[p + 1] = HEX[b & 15];
  }
}
