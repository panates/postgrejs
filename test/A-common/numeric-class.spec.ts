import { expect } from 'expect';
import { DataTypeNames, GlobalTypeMap, Numeric } from 'postgrejs';
import { NumericType } from '../../src/data-types/numeric-type.js';
import { SmartBuffer } from '../../src/protocol/smart-buffer.js';

function decode(v: string): any {
  const buf = new SmartBuffer();
  NumericType.encodeBinary!(buf, v, {});
  return NumericType.decodeBinary!(buf.buffer, 0, buf.size, {});
}

const name = (v: any) => DataTypeNames[GlobalTypeMap.determine(v)];

describe('Numeric', () => {
  describe('what decodes to a number and what does not', () => {
    it('should hand back a number while a double carries the value', () => {
      for (const v of ['0', '-1', '0.1', '19.99', '123456789012345.6']) {
        expect(typeof decode(v)).toStrictEqual('number');
      }
      expect(decode('19.99')).toStrictEqual(19.99);
    });

    it('should widen once the digits stop fitting', () => {
      // Each of these came back wrong before: the digits a double cannot
      // hold were silently rounded away.
      for (const [stored, wasDecodedAs] of [
        ['12345678901234567.89', 12345678901234568],
        ['1234567890.12345678', 1234567890.1234567],
        ['9007199254740993', 9007199254740992],
        ['99999999999999999999.99', 100000000000000000000],
        ['1234567890123456.7', 1234567890123456.8],
      ] as [string, number][]) {
        const v = decode(stored);
        expect(v).toBeInstanceOf(Numeric);
        expect(String(v)).toStrictEqual(stored);
        // The double it used to be is still one call away.
        expect(v.toNumber()).toStrictEqual(wasDecodedAs);
      }
    });

    it('should widen a value JavaScript would print in exponential form', () => {
      // The double is exact here - 1e21 and 1e-17 both are - but
      // `String()` writes them as `1e+21` and `-1e-17`, which PostgreSQL
      // never does, so the value would not read back the way it was
      // stored.
      for (const v of [
        '1000000000000000000000',
        '-0.00000000000000001',
        '0.0000001',
      ]) {
        expect(decode(v)).toBeInstanceOf(Numeric);
        expect(String(decode(v))).toStrictEqual(v);
      }
    });

    it('should not be fooled by the padding a declared scale adds', () => {
      // numeric(40,6) holding 19.99 arrives as 19.990000; the value is
      // exact and a number is the right answer.
      const buf = new SmartBuffer();
      NumericType.encodeBinary!(buf, '19.990000', {});
      expect(
        NumericType.decodeBinary!(buf.buffer, 0, buf.size, {}),
      ).toStrictEqual(19.99);
      expect(decode('100.00')).toStrictEqual(100);
      expect(decode('0.000')).toStrictEqual(0);
    });

    it('should keep NaN and the infinities as numbers', () => {
      expect(decode('NaN')).toBeNaN();
      expect(decode('Infinity')).toStrictEqual(Infinity);
      expect(decode('-Infinity')).toStrictEqual(-Infinity);
      // And a Numeric that merely says "NaN" is a different thing.
      expect(new Numeric('NaN')).not.toStrictEqual(NaN);
    });
  });

  describe('the text decode path applies the same rule', () => {
    it('should widen the same values', () => {
      expect(NumericType.decodeText!('19.99', {})).toStrictEqual(19.99);
      expect(NumericType.decodeText!('19.990000', {})).toStrictEqual(19.99);
      expect(
        NumericType.decodeText!('12345678901234567.89', {}),
      ).toBeInstanceOf(Numeric);
      expect(NumericType.decodeText!('NaN', {})).toBeNaN();
      expect(NumericType.decodeText!('-Infinity', {})).toStrictEqual(-Infinity);
    });

    it('should keep the allocation-free parser for short values', () => {
      const buf = Buffer.from('  19.99  ');
      expect(NumericType.decodeTextBuffer!(buf, 2, 5, {})).toStrictEqual(19.99);
      const long = Buffer.from('12345678901234567.89');
      expect(
        NumericType.decodeTextBuffer!(long, 0, long.length, {}),
      ).toBeInstanceOf(Numeric);
    });

    it('should carry a value it cannot read rather than truncating it', () => {
      // decodeText was `parseFloat` by reference, so trailing rubbish was
      // silently dropped and "1.5abc" became 1.5. Nothing on the wire
      // looks like this, but losing digits quietly is the bug being
      // fixed, so it keeps what it was given.
      expect(String(NumericType.decodeText!('1.5abc', {}))).toStrictEqual(
        '1.5abc',
      );
    });
  });

  describe('the class itself', () => {
    it('should print the exact decimal for every coercion', () => {
      const n = new Numeric('12345678901234567.89');
      expect(String(n)).toStrictEqual('12345678901234567.89');
      expect(`${n}`).toStrictEqual('12345678901234567.89');
      expect(n.toString()).toStrictEqual('12345678901234567.89');
      expect(JSON.stringify({ n })).toStrictEqual(
        '{"n":"12345678901234567.89"}',
      );
    });

    it('should make the lossy reading an explicit call', () => {
      // There is no valueOf(), so nothing silently becomes a double.
      const n = new Numeric('12345678901234567.89');
      expect(n.toNumber()).toStrictEqual(12345678901234568);
      expect((n as any) + 1).toStrictEqual('12345678901234567.891');
    });

    it('should take a number or a bigint too', () => {
      expect(String(new Numeric(19.99))).toStrictEqual('19.99');
      expect(String(new Numeric(10n))).toStrictEqual('10');
    });
  });

  describe('going back the other way', () => {
    it('should be recognised as numeric, not as json', () => {
      // JsonType claims any object, so a class that is not claimed first
      // quietly goes out declared `json` - the trap Range hit. numeric is
      // registered after json, so it is asked first.
      expect(name(new Numeric('123456789012345678901234567890'))).toStrictEqual(
        'numeric',
      );
      expect(NumericType.isType(new Numeric('1'))).toStrictEqual(true);
      expect(NumericType.isType(19.99)).toStrictEqual(true);
      expect(NumericType.isType('19.99')).toStrictEqual(false);
    });

    it('should encode from the exact text, not from a double', () => {
      const v = '123456789012345678901234567890.123456';
      const buf = new SmartBuffer();
      NumericType.encodeBinary!(buf, new Numeric(v), {});
      expect(
        String(NumericType.decodeBinary!(buf.buffer, 0, buf.size, {})),
      ).toStrictEqual(v);
      // encodeText used to run the value through parseFloat first.
      expect(NumericType.encodeText!(new Numeric(v), {})).toStrictEqual(v);
      expect(NumericType.encodeText!('12345678901234567.89', {})).toStrictEqual(
        '12345678901234567.89',
      );
    });
  });
});
