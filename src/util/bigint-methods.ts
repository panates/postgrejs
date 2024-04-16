/* eslint-disable no-bitwise */
const big0 = BigInt(0);
const beAnd = BigInt('0xffffffff');
const big32 = BigInt(32);

// https://github.com/nodejs/node/blob/v13.9.0/lib/internal/buffer.js
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
    (BigInt(val) << big32) + BigInt(buf[++offset] * 2 ** 24 + buf[++offset] * 2 ** 16 + buf[++offset] * 2 ** 8 + last)
  );
}

export function writeBigUInt64BE(buf: Buffer, value: BigInt, offset = 0) {
  // @ts-ignore
  let lo = Number(value & beAnd);
  buf[offset + 7] = lo;
  lo = lo >> 8;
  buf[offset + 6] = lo;
  lo = lo >> 8;
  buf[offset + 5] = lo;
  lo = lo >> 8;
  buf[offset + 4] = lo;
  // @ts-ignore
  let hi = Number((value >> big32) & beAnd);
  buf[offset + 3] = hi;
  hi = hi >> 8;
  buf[offset + 2] = hi;
  hi = hi >> 8;
  buf[offset + 1] = hi;
  hi = hi >> 8;
  buf[offset] = hi;
  return offset + 8;
}
