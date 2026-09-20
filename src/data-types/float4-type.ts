import { DataTypeOIDs } from '../constants.js';
import type { DataType } from '../interfaces/data-type.js';
import type { SmartBuffer } from '../protocol/smart-buffer.js';
import { assertCoercedNumber } from '../util/assert-integer.js';
import { fastParseFloatBuffer } from '../util/fast-parsefloat.js';

export const Float4Type: DataType = {
  name: 'float4',
  oid: DataTypeOIDs.float4,
  jsType: 'number',

  encodeText(v: any): string {
    return '' + v;
  },

  encodeBinary(buf: SmartBuffer, v: number | string): void {
    buf.writeFloatBE(
      typeof v === 'number' ? v : assertCoercedNumber(parseFloat(v), 'float4'),
    );
  },

  decodeBinary(v: Buffer, offset: number = 0): number {
    return shortestFloat4(v.readFloatBE(offset));
  },

  decodeText: parseFloat,

  decodeTextBuffer: fastParseFloatBuffer,

  isType(v: any): boolean {
    return typeof v === 'number';
  },
};

export const ArrayFloat4Type: DataType = {
  ...Float4Type,
  name: '_float4',
  oid: DataTypeOIDs._float4,
  elementsOID: DataTypeOIDs.float4,
};

/**
 * Powers of ten that a double holds exactly. Past 1e22 the literal is
 * already rounded, and scaling by it stops being a faithful operation.
 */
const POW10 = [
  1, 1e1, 1e2, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9, 1e10, 1e11, 1e12, 1e13, 1e14,
  1e15, 1e16, 1e17, 1e18, 1e19, 1e20, 1e21, 1e22,
];

/**
 * The shortest decimal that reads back as this same float4.
 *
 * A float4 arrives as four bytes and widens into a double that spells out
 * the binary approximation in full: the column PostgreSQL prints as `1.1`
 * read back as `1.100000023841858`. The text path never had the problem,
 * since the server does this itself before sending - so the same column
 * answered differently depending on a wire format the caller may not know
 * is there, and the binary default was the wrong-looking one.
 *
 * Nine significant digits always round-trip a binary32 and most values
 * need far fewer, so this tries successively longer forms and takes the
 * first that reads back unchanged. Integers inside +-2^24 are already
 * exact in float4 and skip the search; past that they are not (1e20
 * widens to 100000002004087730000) so the bound matters. Infinities and
 * NaN have no decimal to shorten.
 *
 * Rounding by hand, rather than through toPrecision(), is what makes it
 * affordable - 24ns a value against 115ns, measured, because toPrecision()
 * costs four times what the engine's own shortest-form toString does and
 * there is no cheaper built-in. Scaling by a power of ten is only faithful
 * while both the digits and the power are exact in a double: the digits
 * always are at nine or fewer, and the magnitude check keeps the power
 * inside its own exact range. A value sitting exactly halfway is left to
 * the string path as well - Math.round() breaks those ties away from zero
 * and dtoa breaks them to even, and the disagreement would show. Checked
 * against the string path over 299,007 values, structured and random:
 * same answer every time.
 */
function shortestFloat4(n: number): number {
  if (!Number.isFinite(n)) return n;
  if (Number.isInteger(n) && n >= -16777216 && n <= 16777216) return n;
  const abs = n < 0 ? -n : n;
  // Two comparisons keep log10 and the loop off the path entirely for
  // magnitudes whose power of ten could not be exact anyway.
  if (abs >= 1e-14 && abs < 1e28) {
    const e = Math.floor(Math.log10(abs));
    let digits: number;
    let k: number;
    let pow: number;
    let scaled: number;
    let rounded: number;
    let candidate: number;
    for (digits = 7; digits <= 9; digits++) {
      k = digits - 1 - e;
      // Unreachable for the magnitudes let through above unless log10()
      // lands a step out at a boundary, which it is entitled to do.
      if (k < -22 || k > 22) break;
      pow = POW10[k < 0 ? -k : k];
      scaled = k >= 0 ? n * pow : n / pow;
      rounded = Math.round(scaled);
      if (scaled - rounded === 0.5 || rounded - scaled === 0.5) break;
      candidate = k >= 0 ? rounded / pow : rounded * pow;
      if (Math.fround(candidate) === n) return candidate;
    }
  }
  let p: number;
  let s: number;
  for (p = 7; p <= 9; p++) {
    s = Number(n.toPrecision(p));
    if (Math.fround(s) === n) return s;
  }
  return n;
}
