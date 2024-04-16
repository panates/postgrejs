import { DataTypeOIDs } from '../constants.js';
import type { DataType } from '../interfaces/data-type.js';

const NUMERIC_NEG = 0x4000;
const NUMERIC_NAN = 0xc000;
const DEC_DIGITS = 4;
const ROUND_POWERS = [0, 1000, 100, 10];

export const NumericType: DataType = {
  name: 'numeric',
  oid: DataTypeOIDs.numeric,
  jsType: 'number',

  parseBinary(v: Buffer): number {
    const len = v.readInt16BE();
    const weight = v.readInt16BE(2);
    const sign = v.readInt16BE(4);
    const scale = v.readInt16BE(6);

    if (sign === NUMERIC_NAN) return NaN;

    const digits: number[] = [];
    for (let i = 0; i < len; i++) {
      digits[i] = v.readInt16BE(8 + i * 2);
    }

    const numString = numberBytesToString(digits, scale, weight, sign);
    return parseFloat(numString);
  },

  encodeText(v: any): string {
    const n = typeof v === 'number' ? v : parseFloat(v);
    return '' + n;
  },

  parseText: parseFloat,

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

/* https://github.com/pgjdbc/pgjdbc/blob/3eca3a76aa4a04cb28cb960ed674cb67db30b5e3/pgjdbc/src/main/java/org/postgresql/util/ByteConverter.java */
/**
 * Convert a number from binary representation to text representation.
 * @param digits array of shorts that can be decoded as the number String
 * @param scale the scale of the number binary representation
 * @param weight the weight of the number binary representation
 * @param sign the sign of the number
 * @return String the number as String
 */
export function numberBytesToString(digits: number[], scale: number, weight: number, sign: number): string {
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
function digitToString(idx: number, digits: number[], alwaysPutIt: boolean): string {
  let out = '';
  let dig = idx >= 0 && idx < digits.length ? digits[idx] : 0;
  // Each dig represents 4 decimal digits (e.g. 9999)
  // If we continue the number, then we need to print 0 as 0000 (alwaysPutIt parameter is true)
  for (let p = 1; p < ROUND_POWERS.length; p++) {
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
