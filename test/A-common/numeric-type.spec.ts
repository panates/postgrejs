import { expect } from 'expect';
import {
  expandExponential,
  numberBytesToString,
  NumericType,
} from '../../src/data-types/numeric-type.js';
import { SmartBuffer } from '../../src/protocol/smart-buffer.js';

function roundTrip(v: any): any {
  const buf = new SmartBuffer();
  NumericType.encodeBinary!(buf, v, {});
  return NumericType.decodeBinary!(buf.buffer, 0, buf.buffer.length, {});
}

/**
 * The round trip as text. An exponential value comes back as a Numeric
 * holding the plain decimal - the double is exact, but JavaScript prints
 * it in a form PostgreSQL never writes, so the digits are what these
 * encoder tests compare.
 */
const roundTripText = (v: any) => String(roundTrip(v));

describe('NumericType', () => {
  it('should encode as its string form for the text/literal path', () => {
    expect(NumericType.encodeText!(1.5)).toStrictEqual('1.5');
    expect(NumericType.encodeText!('2.75')).toStrictEqual('2.75');
  });

  describe('encodeBinary()', () => {
    it('should round-trip a "NaN" string', () => {
      expect(roundTrip('NaN')).toBeNaN();
    });

    it('should round-trip an "Infinity" string', () => {
      expect(roundTrip('Infinity')).toStrictEqual(Infinity);
    });

    it('should round-trip a "-Infinity" string', () => {
      expect(roundTrip('-Infinity')).toStrictEqual(-Infinity);
    });

    it('should round-trip a number given in exponential notation', () => {
      expect(roundTripText('1e21')).toStrictEqual('1000000000000000000000');
      expect(roundTrip('1e21').toNumber()).toStrictEqual(1e21);
    });

    it('should round-trip a magnitude beyond what toFixed() can express (>= 1e21)', () => {
      // Regression test: Number.prototype.toFixed() reverts to exponential
      // notation once |x| reaches 1e21 (per spec), which used to leave
      // the 'e' in place and silently corrupt the encoded value (1e21
      // round-tripped back as 10000 before this was fixed).
      expect(roundTripText('2.5e30')).toStrictEqual(
        '2500000000000000000000000000000',
      );
      expect(roundTripText('-1e25')).toStrictEqual(
        '-10000000000000000000000000',
      );
      expect(roundTrip('2.5e30').toNumber()).toStrictEqual(2.5e30);
      expect(roundTrip('-1e25').toNumber()).toStrictEqual(-1e25);
    });

    it('should round-trip a small-magnitude exponential value (negative exponent)', () => {
      expect(roundTripText('1.5e-7')).toStrictEqual('0.00000015');
      expect(roundTripText('-1.5e-7')).toStrictEqual('-0.00000015');
      expect(roundTrip('1.5e-7').toNumber()).toStrictEqual(1.5e-7);
      expect(roundTrip('-1.5e-7').toNumber()).toStrictEqual(-1.5e-7);
    });

    it('should accept a leading "+" sign', () => {
      expect(roundTrip('+42.5')).toStrictEqual(42.5);
    });

    it('should round-trip an actual (non-string) NaN/Infinity number', () => {
      expect(roundTrip(NaN)).toBeNaN();
      expect(roundTrip(Infinity)).toStrictEqual(Infinity);
      expect(roundTrip(-Infinity)).toStrictEqual(-Infinity);
    });

    it('should round-trip an ordinary negative decimal', () => {
      expect(roundTrip('-123.456')).toStrictEqual(-123.456);
    });

    it('should round-trip a plain (non-string) number', () => {
      expect(roundTrip(7)).toStrictEqual(7);
    });
  });

  describe('numberBytesToString()', () => {
    // The digits are base-10000 groups, the weight is the first group's
    // position, and the scale is how many decimals to print. Every
    // expectation here was produced by the live server for the same
    // value - numeric.spec.ts checks four thousand more of them against
    // it character for character.
    const build = (digits: number[], scale: number, weight: number, sign = 0) =>
      numberBytesToString(digits, scale, weight, sign);

    it('should suppress leading zeroes in the first group only', () => {
      // 19.99 is [19, 9900] - the first group prints as `19`, the second
      // must keep its trailing zeroes until the scale trims them.
      expect(build([19, 9900], 2, 0)).toStrictEqual('19.99');
      // 1_0000 is [1] at weight 1: `1` then a full `0000`.
      expect(build([1], 0, 1)).toStrictEqual('10000');
      expect(build([1, 2], 0, 1)).toStrictEqual('10002');
    });

    it('should write a bare zero for a value below one', () => {
      expect(build([1000], 1, -1)).toStrictEqual('0.1');
      expect(build([5000], 4, -1)).toStrictEqual('0.5000');
      // Reachable only by calling this directly - the old arithmetic
      // trimmed its overshoot from the whole string rather than from the
      // fraction, and with no fraction it took the `0` with it.
      expect(build([], 0, -1)).toStrictEqual('0');
      expect(build([5000], 0, -1)).toStrictEqual('0');
    });

    it('should trim the last group down to the display scale', () => {
      // The fraction is written in whole groups of four, so a scale of
      // 1, 2 or 3 overshoots and the extra digits come off.
      expect(build([1234], 1, -1)).toStrictEqual('0.1');
      expect(build([1234], 2, -1)).toStrictEqual('0.12');
      expect(build([1234], 3, -1)).toStrictEqual('0.123');
      expect(build([1234], 4, -1)).toStrictEqual('0.1234');
    });

    it('should pad a group the digit array does not reach', () => {
      // A trailing all-zero group is not sent; the scale still asks for it.
      expect(build([1], 8, 0)).toStrictEqual('1.00000000');
      expect(build([], 0, 0)).toStrictEqual('0');
    });

    it('should write the sign', () => {
      expect(build([19, 9900], 2, 0, 0x4000)).toStrictEqual('-19.99');
    });
  });

  describe('expandExponential()', () => {
    it('should shift the decimal point into the middle of the mantissa', () => {
      // Number(str).toString() (the only real caller) never produces this
      // shape itself - it only switches to exponential notation once the
      // exponent is already large enough to push the point to one end -
      // so this is only reachable via a direct call.
      expect(expandExponential('1.2345e1')).toStrictEqual('12.345');
      expect(expandExponential('-1.23456e3')).toStrictEqual('-1234.56');
    });

    it('should pad with trailing zeros when the point lands past the digits', () => {
      expect(expandExponential('1e21')).toStrictEqual('1' + '0'.repeat(21));
    });

    it('should pad with leading zeros when the point lands before the digits', () => {
      expect(expandExponential('1.5e-7')).toStrictEqual('0.00000015');
    });

    it('should return a non-exponential string unchanged', () => {
      expect(expandExponential('123.45')).toStrictEqual('123.45');
    });
  });
});
