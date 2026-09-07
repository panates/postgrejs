import { expect } from 'expect';
import {
  expandExponential,
  NumericType,
} from '../../src/data-types/numeric-type.js';
import { SmartBuffer } from '../../src/protocol/smart-buffer.js';

function roundTrip(v: any): number {
  const buf = new SmartBuffer();
  NumericType.encodeBinary!(buf, v, {});
  return NumericType.decodeBinary!(buf.buffer, 0, {});
}

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
      expect(roundTrip('1e21')).toStrictEqual(1e21);
    });

    it('should round-trip a magnitude beyond what toFixed() can express (>= 1e21)', () => {
      // Regression test: Number.prototype.toFixed() reverts to exponential
      // notation once |x| reaches 1e21 (per spec), which used to leave
      // the 'e' in place and silently corrupt the encoded value (1e21
      // round-tripped back as 10000 before this was fixed).
      expect(roundTrip('2.5e30')).toStrictEqual(2.5e30);
      expect(roundTrip('-1e25')).toStrictEqual(-1e25);
    });

    it('should round-trip a small-magnitude exponential value (negative exponent)', () => {
      expect(roundTrip('1.5e-7')).toStrictEqual(1.5e-7);
      expect(roundTrip('-1.5e-7')).toStrictEqual(-1.5e-7);
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
