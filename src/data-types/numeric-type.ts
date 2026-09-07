import { DataTypeOIDs } from '../constants.js';
import type { DataType } from '../interfaces/data-type.js';
import type { SmartBuffer } from '../protocol/smart-buffer.js';

const NUMERIC_NEG = 0x4000;
const NUMERIC_NAN = 0xc000;
const NUMERIC_PINF = 0xd000;
const NUMERIC_NINF = 0xf000;
const DEC_DIGITS = 4;
const ROUND_POWERS = [0, 1000, 100, 10];

export const NumericType: DataType = {
  name: 'numeric',
  oid: DataTypeOIDs.numeric,
  jsType: 'number',

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
    for (let i = 0; i < intPart.length; i += DEC_DIGITS)
      digits.push(+intPart.substring(i, i + DEC_DIGITS));
    for (let i = 0; i < fracPart.length; i += DEC_DIGITS)
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
    for (const d of digits) buf.writeInt16BE(d);
  },

  decodeBinary(v: Buffer, offset: number = 0): number {
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
    return parseFloat(numString);
  },

  encodeText(v: any): string {
    const n = typeof v === 'number' ? v : parseFloat(v);
    return '' + n;
  },

  decodeText: parseFloat,

  // See float4-type.ts's decodeTextBuffer comment - same rationale.
  decodeTextBuffer(buf: Buffer, offset: number, len: number): number {
    return parseFloat(buf.toString('latin1', offset, offset + len));
  },

  isType(v: any): boolean {
    return typeof v === 'number';
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
  let i: number;
  let d: number;

  /*
   * Allocate space for the result.
   *
   * i is set to the # of decimal digits before decimal point.
   * dscale is the # of decimal digits we will print after decimal point.
   * We may generate as many as DEC_DIGITS-1 excess digits at the end, and in addition we
   * need room for sign, decimal point, null terminator.
   */
  i = (weight + 1) * DEC_DIGITS;
  if (i <= 0) i = 1;

  /*
   * Output a dash for negative values
   */
  let out = sign === NUMERIC_NEG ? '-' : '';

  /*
   * Output all digits before the decimal point
   */
  if (weight < 0) {
    d = weight + 1;
    out += '0';
  } else {
    for (d = 0; d <= weight; d++) {
      /* In the first digit, suppress extra leading decimal zeroes */
      out += digitToString(d, digits, d !== 0);
    }
  }

  /*
   * If requested, output a decimal point and all the digits that follow it.
   * We initially put out a multiple of DEC_DIGITS digits, then truncate if
   * needed.
   */
  if (scale > 0) {
    out += '.';
    for (i = 0; i < scale; d++, i += DEC_DIGITS) {
      out += digitToString(d, digits, true);
    }
  }

  const extra = (i - scale) % DEC_DIGITS;
  return out.substr(0, out.length - extra);
}

/* https://github.com/pgjdbc/pgjdbc/blob/3eca3a76aa4a04cb28cb960ed674cb67db30b5e3/pgjdbc/src/main/java/org/postgresql/util/ByteConverter.java */
/**
 * Convert a number from binary representation to text representation.
 * @param idx index of the digit to be converted in the digits array
 * @param digits array of shorts that can be decoded as the number String
 * @param alwaysPutIt a flag that indicate whether or not to put the digit char even if it is zero
 * @return String the number as String
 */
function digitToString(
  idx: number,
  digits: number[],
  alwaysPutIt: boolean,
): string {
  let out = '';
  let dig = idx >= 0 && idx < digits.length ? digits[idx] : 0;
  // Each dig represents 4 decimal digits (e.g. 9999)
  // If we continue the number, then we need to print 0 as 0000 (alwaysPutIt parameter is true)
  const l = ROUND_POWERS.length;
  let p: number;
  for (p = 1; p < l; p++) {
    const pow = ROUND_POWERS[p];
    const d1 = Math.trunc(dig / pow);
    dig -= d1 * pow;
    const putit = d1 > 0;
    if (putit || alwaysPutIt) {
      out += d1;
      // We printed a character, so we need to print the rest of the current digits in dig
      // For instance, we need to keep printing 000 from 1000 even if idx==0 (== it is the very
      // beginning)
      alwaysPutIt = true;
    }
  }
  out += dig;
  return out;
}
