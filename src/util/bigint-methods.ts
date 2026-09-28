/* eslint-disable */
const big0 = BigInt(0);
const big32 = BigInt(32);

// https://github.com/nodejs/node/blob/v13.9.0/lib/internal/buffer.js
/**
 * `Buffer.readBigInt64BE` for a runtime that does not have it.
 *
 * @param buf The buffer to read from.
 * @param offset Where the eight bytes start.
 * @returns The signed 64-bit value.
 */
/* Ported from Node's own lib/internal/buffer.js (v13.9.0), so the two
   agree bit for bit where both exist. */
export function readBigInt64BE(buf: Buffer, offset = 0): bigint {
  const first = buf[offset];
  const last = buf[offset + 7];
  if (first === undefined || last === undefined) return big0;

  const val =
    (first << 24) + // Overflow
    buf[++offset] * 2 ** 16 +
    buf[++offset] * 2 ** 8 +
    buf[++offset];
  return (
    (BigInt(val) << big32) +
    BigInt(
      buf[++offset] * 2 ** 24 +
        buf[++offset] * 2 ** 16 +
        buf[++offset] * 2 ** 8 +
        last,
    )
  );
}
