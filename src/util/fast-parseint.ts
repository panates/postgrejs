export function fastParseInt(str: string | number): number {
  /* c8 ignore next */
  if (typeof str === 'number') return Math.floor(str);
  // noinspection SuspiciousTypeOfGuard
  if (typeof str !== 'string') return NaN;
  return parseInt(str, 10);
}

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
