// 10^0 .. 10^22 - every one of these is exactly representable as a double,
// which is what makes the single multiply/divide below correctly rounded.
// 10^23 is the first that isn't, so the table stops here deliberately.
const POW10 = [
  1, 1e1, 1e2, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9, 1e10, 1e11, 1e12, 1e13, 1e14,
  1e15, 1e16, 1e17, 1e18, 1e19, 1e20, 1e21, 1e22,
];
const MAX_EXACT_EXPONENT = 22;
// 10^15 - 1 still fits well inside 2^53, so a mantissa of at most this many
// digits is carried exactly.
const MAX_EXACT_DIGITS = 15;

/**
 * Decodes a decimal number straight out of `buf`, without materialising the
 * intermediate string `parseFloat(buf.toString(...))` needs - measured at
 * over half the cost of decoding a float column.
 *
 * Only takes that shortcut when the result is provably identical to what
 * parseFloat() would return: when the mantissa's digits fit exactly in a
 * double and the decimal exponent is small enough that its power of ten
 * does too, a single multiply (or divide) of two exact values is by
 * definition correctly rounded. Everything else - more digits than that,
 * a large exponent, `NaN`/`Infinity`, a leading `+`, whitespace, anything
 * malformed - falls through to parseFloat() itself, so those values are
 * decoded exactly as before.
 */
export function fastParseFloatBuffer(
  buf: Buffer,
  offset = 0,
  len: number = buf.length - offset,
): number {
  const end = offset + len;
  // The longest value the exact path can possibly take is a sign, 15
  // mantissa digits, a decimal point and a two-digit exponent with its own
  // sign. Anything longer is going to parseFloat() regardless, so check
  // that up front rather than after scanning digits that get discarded.
  if (len > 21) return parseFloat(buf.toString('latin1', offset, end));
  let i = offset;
  let negative = false;
  if (i < end && buf[i] === 45 /* - */) {
    negative = true;
    i++;
  }

  let mantissa = 0;
  let digits = 0;
  let fractionDigits = 0;
  let seenDot = false;
  let c: number;
  while (i < end) {
    c = buf[i];
    if (c >= 48 && c <= 57) {
      // Bailing out the moment the mantissa outgrows what a double holds
      // exactly, rather than after the loop: a long numeric's digits would
      // otherwise all be scanned before being thrown away.
      if (++digits > MAX_EXACT_DIGITS)
        return parseFloat(buf.toString('latin1', offset, end));
      mantissa = mantissa * 10 + (c - 48);
      if (seenDot) fractionDigits++;
    } else if (c === 46 /* . */ && !seenDot) {
      seenDot = true;
    } else break;
    i++;
  }
  if (!digits) return parseFloat(buf.toString('latin1', offset, end));

  let exponent = 0;
  if (i < end && ((c = buf[i]) === 101 /* e */ || c === 69) /* E */) {
    i++;
    let expNegative = false;
    if (i < end) {
      c = buf[i];
      if (c === 45 /* - */) {
        expNegative = true;
        i++;
      } else if (c === 43 /* + */) i++;
    }
    let expDigits = 0;
    let value = 0;
    while (i < end) {
      c = buf[i];
      if (c < 48 || c > 57) break;
      value = value * 10 + (c - 48);
      // Pinned at a value far outside the exact range instead of being
      // allowed to grow without bound. It must never be *truncated* toward
      // a plausible one: an exponent quietly cut from 234 to 23 would be
      // taken as exact and decode to a wrong number rather than falling
      // back. Since the fractional digits that offset it number at most
      // MAX_EXACT_DIGITS, nothing this large can come back into range.
      if (value > 1000) value = 1000;
      expDigits++;
      i++;
    }
    if (!expDigits) return parseFloat(buf.toString('latin1', offset, end));
    exponent = expNegative ? -value : value;
  }
  // The `| 0` is not redundant: without it this is -0 whenever there is
  // nothing to subtract (any value with no fractional digits, e.g. "42").
  // A -0 index can't be a small integer, so POW10[exponent] below misses
  // V8's fast element access and takes a generic property lookup instead -
  // and the site stays generic afterwards, slowing down every later value
  // too, not just the one that poisoned it.
  exponent = (exponent - fractionDigits) | 0;

  // Trailing characters mean this wasn't a plain decimal number after all.
  if (i !== end) return parseFloat(buf.toString('latin1', offset, end));

  let n: number;
  if (exponent >= 0) {
    if (exponent > MAX_EXACT_EXPONENT) {
      // Too large a power of ten to be exact on its own, but the surplus
      // can often be folded into the mantissa instead: if the mantissa is
      // small enough that scaling it up stays a whole number a double
      // holds exactly, both operands of the multiply below are still
      // exact, so its single rounding is still the correct one. This is
      // what keeps values like 1.2345678e+30 (a mantissa of only eight
      // digits) on the exact path.
      const shift = exponent - MAX_EXACT_EXPONENT;
      if (shift > MAX_EXACT_EXPONENT)
        return parseFloat(buf.toString('latin1', offset, end));
      const scaled = mantissa * POW10[shift];
      if (scaled > Number.MAX_SAFE_INTEGER)
        return parseFloat(buf.toString('latin1', offset, end));
      mantissa = scaled;
      exponent = MAX_EXACT_EXPONENT;
    }
    n = mantissa * POW10[exponent];
  } else {
    if (exponent < -MAX_EXACT_EXPONENT)
      return parseFloat(buf.toString('latin1', offset, end));
    n = mantissa / POW10[-exponent];
  }
  // `0 * -1` is -0, which is the value PostgreSQL's own "-0" has to decode
  // to - so the sign is applied by multiplication rather than negation of
  // a separately built positive result.
  return negative ? n * -1 : n;
}
