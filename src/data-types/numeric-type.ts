import { DataTypeOIDs } from '../constants.js';
import type { DataMappingOptions } from '../interfaces/data-mapping-options.js';
import type { DataType } from '../interfaces/data-type.js';
import type { SmartBuffer } from '../protocol/smart-buffer.js';
import { assertCoercedNumber } from '../util/assert-integer.js';
import { fastParseFloatBuffer } from '../util/fast-parsefloat.js';
import { Numeric } from './classes/numeric.js';

const NUMERIC_NEG = 0x4000;
const NUMERIC_NAN = 0xc000;
const NUMERIC_PINF = 0xd000;
const NUMERIC_NINF = 0xf000;
const DEC_DIGITS = 4;
/**
 * Every two-digit string, so a base-10000 group is written with two
 * lookups and one join instead of four divisions and four number-to-
 * string conversions. Built once; 100 short strings.
 */
const PAIRS: string[] = new Array(100);
for (let i = 0; i < 100; i++) PAIRS[i] = i < 10 ? '0' + i : '' + i;

/** The decimal without the zeroes a declared scale pads it out to. */
function trimTrailingZeros(s: string): string {
  const dot = s.indexOf('.');
  if (dot < 0) return s;
  let end = s.length;
  while (end > dot + 1 && s.charCodeAt(end - 1) === 48 /* 0 */) end--;
  return s.substring(0, end === dot + 1 ? dot : end);
}

/**
 * A number when a double carries the decimal faithfully, a Numeric when
 * it does not.
 *
 * Faithfully means printing back the same digits, which is the only
 * thing a caller can observe - so the test is the round trip itself
 * rather than a rule about magnitude. It catches both ways of losing a
 * value: digits a double cannot hold (`12345678901234567.89` comes back
 * as `...68`) and a magnitude JavaScript prints in exponential notation
 * (`-0.00000000000000001` as `-1e-17`), which PostgreSQL never writes.
 *
 * The padding a declared scale adds is not a difference - a
 * `numeric(40,6)` holding 19.99 arrives as `19.990000` - so it comes off
 * before the comparison.
 */
function toNumberOrNumeric(s: string): number | Numeric {
  const n = parseFloat(s);
  return String(n) === trimTrailingZeros(s) ? n : new Numeric(s);
}

export const NumericType: DataType = {
  name: 'numeric',
  oid: DataTypeOIDs.numeric,
  // A number while one carries the value, a Numeric after that - the
  // widened type is named here the way int8 names BigInt.
  jsType: 'Numeric',

  /**
   * numeric on the wire is a base-10000 number: a digit count, the weight
   * of the first group (in groups of four decimal digits, not digits), a
   * sign mask, the display scale, then the groups themselves.
   *
   * Encoded from the decimal text rather than from the float, so a value
   * that JavaScript cannot hold exactly - which is most of what numeric
   * exists for - survives when it was given as a string.
   */
  encodeBinary(buf: SmartBuffer, v: any): void {
    const writeHeader = (
      ndigits: number,
      weight: number,
      sign: number,
      dscale: number,
    ) => {
      buf.writeInt16BE(ndigits);
      buf.writeInt16BE(weight);
      buf.writeUInt16BE(sign);
      buf.writeInt16BE(dscale);
    };
    if (typeof v === 'number' && !Number.isFinite(v)) {
      writeHeader(
        0,
        0,
        Number.isNaN(v) ? NUMERIC_NAN : v > 0 ? NUMERIC_PINF : NUMERIC_NINF,
        0,
      );
      return;
    }
    let str = typeof v === 'string' ? v.trim() : String(v);
    if (str === 'NaN') return writeHeader(0, 0, NUMERIC_NAN, 0);
    if (str === 'Infinity') return writeHeader(0, 0, NUMERIC_PINF, 0);
    if (str === '-Infinity') return writeHeader(0, 0, NUMERIC_NINF, 0);
    // Anything with no numeric reading at all - `{}` stringifies to
    // "[object Object]", `true` to "true" - would otherwise be walked
    // digit by digit below and stored as 0.
    // Number('') is 0, not NaN, so an empty string - what `[]` and `null`
    // stringify to - would slip past the NaN check below.
    assertCoercedNumber(str.length ? Number(str) : NaN, 'numeric');
    // Exponent form has no place in the wire format; go through Number to
    // get it back into plain notation. toFixed() cannot do this itself -
    // per spec it falls back to exponential notation once the magnitude
    // reaches 1e21, so this shifts the decimal point manually instead.
    if (/e/i.test(str)) str = expandExponential(Number(str).toString());

    let sign = 0;
    if (str.startsWith('-')) {
      sign = NUMERIC_NEG;
      str = str.substring(1);
    } else if (str.startsWith('+')) str = str.substring(1);

    const dot = str.indexOf('.');
    let intPart = dot < 0 ? str : str.substring(0, dot);
    let fracPart = dot < 0 ? '' : str.substring(dot + 1);
    const dscale = fracPart.length;

    // Group into fours, aligned on the decimal point from both sides.
    const intPad = (DEC_DIGITS - (intPart.length % DEC_DIGITS)) % DEC_DIGITS;
    intPart = '0'.repeat(intPad) + intPart;
    const fracPad = (DEC_DIGITS - (fracPart.length % DEC_DIGITS)) % DEC_DIGITS;
    fracPart = fracPart + '0'.repeat(fracPad);

    const digits: number[] = [];
    let i: number;
    let l = intPart.length;
    for (i = 0; i < l; i += DEC_DIGITS)
      digits.push(+intPart.substring(i, i + DEC_DIGITS));
    l = fracPart.length;
    for (i = 0; i < l; i += DEC_DIGITS)
      digits.push(+fracPart.substring(i, i + DEC_DIGITS));

    // weight counts groups before the point, less one; leading zero groups
    // are dropped and lower it, trailing ones are simply dropped.
    let weight = intPart.length / DEC_DIGITS - 1;
    while (digits.length && digits[0] === 0) {
      digits.shift();
      weight--;
    }
    while (digits.length && digits[digits.length - 1] === 0) digits.pop();
    if (!digits.length) weight = 0;

    writeHeader(digits.length, weight, sign, dscale);
    l = digits.length;
    for (i = 0; i < l; i++) {
      buf.writeInt16BE(digits[i]);
    }
  },

  decodeBinary(v: Buffer, offset: number = 0): number | Numeric {
    const len = v.readInt16BE(offset);
    const weight = v.readInt16BE(offset + 2);
    // sign is a bitmask (0x0000/0x4000/0xC000/0xD000/0xF000), not a two's
    // complement quantity - must be read unsigned or NaN/Infinity sign
    // values (which set the top bit) never compare equal to the constants.
    const sign = v.readUInt16BE(offset + 4);
    const scale = v.readInt16BE(offset + 6);

    if (sign === NUMERIC_NAN) return NaN;
    if (sign === NUMERIC_PINF) return Infinity;
    if (sign === NUMERIC_NINF) return -Infinity;

    const digits: number[] = [];
    for (let i = 0; i < len; i++) {
      digits[i] = v.readInt16BE(offset + 8 + i * 2);
    }

    const numString = numberBytesToString(digits, scale, weight, sign);
    // The header bounds the value before the digits are even looked at,
    // so the ordinary column never pays for the round-trip check below.
    // A double carries about fifteen significant decimal digits and
    // prints in plain notation while its exponent stays inside
    // (-7, 21); `weight` is the first group's position counted in fours
    // and `scale` the digits after the point, which is enough to rule
    // both out. `weight === -1` is a value in [0.0001, 1), far from the
    // exponent that would make JavaScript switch notation.
    if (
      (weight >= 0 && weight <= 4 && (weight + 1) * DEC_DIGITS + scale <= 15) ||
      (weight === -1 && scale <= 15)
    )
      return parseFloat(numString);
    return toNumberOrNumeric(numString);
  },

  encodeText(v: any): string {
    // Handed over as written. Going through a double here would undo
    // exactly what encodeBinary is careful to preserve, and the server
    // accepts every spelling this could normalize to anyway - including
    // the exponent form a JavaScript number stringifies to.
    return typeof v === 'string' ? v.trim() : String(v);
  },

  decodeText(v: string): number | Numeric {
    // NaN and the infinities arrive as those words and stay numbers.
    const n = parseFloat(v);
    if (!Number.isFinite(n)) return n;
    return String(n) === trimTrailingZeros(v) ? n : new Numeric(v);
  },

  decodeTextBuffer(
    buf: Buffer,
    offset: number,
    len: number,
    options: DataMappingOptions,
  ): number | Numeric {
    // Eight characters hold at most eight digits, cannot reach 1e21 -
    // which needs twenty-two - and cannot reach 1e-7, which needs `0.`
    // and seven more. So a value this short is carried faithfully by
    // definition and keeps the parser that never builds a string.
    if (len <= 8) return fastParseFloatBuffer(buf, offset, len);
    return NumericType.decodeText(
      buf.toString('latin1', offset, offset + len),
      options,
    );
  },

  isType(v: any): boolean {
    return typeof v === 'number' || v instanceof Numeric;
  },
};

export const ArrayNumericType: DataType = {
  ...NumericType,
  name: '_numeric',
  oid: DataTypeOIDs._numeric,
  elementsOID: DataTypeOIDs.numeric,
};

/**
 * Turns a JS exponential-notation number string (e.g. "1e+21", "-1.5e-7")
 * into plain decimal notation by shifting the decimal point across the
 * mantissa's own digits - no floating-point math involved, so it stays
 * exact for magnitudes past what toFixed() can express (it reverts to
 * exponential notation itself once |x| reaches 1e21).
 */
export function expandExponential(str: string): string {
  const m = str.match(/^(-)?(\d+)(?:\.(\d+))?e([+-]?\d+)$/i);
  if (!m) return str;
  const sign = m[1] || '';
  const digits = m[2] + (m[3] || '');
  const pointPos = m[2].length + parseInt(m[4], 10);
  if (pointPos <= 0) return sign + '0.' + '0'.repeat(-pointPos) + digits;
  if (pointPos >= digits.length)
    return sign + digits + '0'.repeat(pointPos - digits.length);
  return sign + digits.slice(0, pointPos) + '.' + digits.slice(pointPos);
}

/* https://github.com/pgjdbc/pgjdbc/blob/3eca3a76aa4a04cb28cb960ed674cb67db30b5e3/pgjdbc/src/main/java/org/postgresql/util/ByteConverter.java */
/**
 * Convert a number from binary representation to text representation.
 * @param digits array of shorts that can be decoded as the number String
 * @param scale the scale of the number binary representation
 * @param weight the weight of the number binary representation
 * @param sign the sign of the number
 * @return String the number as String
 */
export function numberBytesToString(
  digits: number[],
  scale: number,
  weight: number,
  sign: number,
): string {
  const l = digits.length;
  let out = sign === NUMERIC_NEG ? '-' : '';
  let d: number;
  let g: number;
  if (weight < 0) {
    // The value is below 1, so the integer part is a bare zero and the
    // first digit group belongs after the point.
    d = weight + 1;
    out += '0';
  } else {
    // Leading zeroes are suppressed in the first group only - it is the
    // most significant one - and every group after it is four digits.
    out += l > 0 ? '' + digits[0] : '0';
    for (d = 1; d <= weight; d++) {
      g = d < l ? digits[d] : 0;
      out += PAIRS[(g / 100) | 0] + PAIRS[g % 100];
    }
  }
  if (scale > 0) {
    let frac = '';
    let i: number;
    for (i = 0; i < scale; d++, i += DEC_DIGITS) {
      g = d >= 0 && d < l ? digits[d] : 0;
      frac += PAIRS[(g / 100) | 0] + PAIRS[g % 100];
    }
    // Whole groups are written, so the last one can overshoot the
    // display scale by up to three digits. Trimmed from the fraction
    // rather than from the whole string: the two are the same thing
    // whenever there is a fraction, and when there is not - a value
    // below 1 with a scale of 0 - trimming the whole string took the
    // bare `0` with it.
    out +=
      '.' + (i > scale ? frac.substring(0, frac.length - (i - scale)) : frac);
  }
  return out;
}
