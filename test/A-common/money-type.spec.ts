import { expect } from 'expect';
import {
  moneyToString,
  MoneyType,
  parseMoneyFormat,
} from '../../src/data-types/money-type.js';

/**
 * How the server's own rendering of `1::money` is read back into the
 * scale every other money value is decoded against. The value is 1
 * precisely so that no thousands separator can appear in it: whatever
 * separator comes back is then the decimal one, and the digits after it
 * are the fraction.
 */
describe('parseMoneyFormat()', () => {
  it('should read two fraction digits from a dotted rendering', () => {
    expect(parseMoneyFormat('$1.00')).toStrictEqual({
      scale: 2,
      decimalSeparator: '.',
    });
  });

  it('should read a comma-separated rendering', () => {
    expect(parseMoneyFormat('1,00 €')).toStrictEqual({
      scale: 2,
      decimalSeparator: ',',
    });
  });

  it('should answer no fraction digits when there is no separator', () => {
    // ja_JP and ko_KR: the currency has no minor unit at all, so the
    // int64 on the wire is already the whole amount.
    expect(parseMoneyFormat('￥1')).toStrictEqual({
      scale: 0,
      decimalSeparator: '.',
    });
  });

  it('should read three, which some currencies use', () => {
    expect(parseMoneyFormat('BD1.000')).toStrictEqual({
      scale: 3,
      decimalSeparator: '.',
    });
  });
});

describe('moneyToString()', () => {
  it('should place the point at the scale', () => {
    expect(moneyToString(1234n, 2)).toStrictEqual('12.34');
    expect(moneyToString(1234n, 3)).toStrictEqual('1.234');
    expect(moneyToString(1234n, 0)).toStrictEqual('1234');
  });

  it('should pad a value shorter than the scale', () => {
    expect(moneyToString(5n, 2)).toStrictEqual('0.05');
    expect(moneyToString(-5n, 2)).toStrictEqual('-0.05');
    expect(moneyToString(0n, 2)).toStrictEqual('0.00');
  });

  it('should keep the sign in front of the whole amount', () => {
    expect(moneyToString(-123450n, 2)).toStrictEqual('-1234.50');
  });

  it('should carry a value past what a double holds', () => {
    expect(moneyToString(9223372036854775807n, 2)).toStrictEqual(
      '92233720368547758.07',
    );
  });
});

/**
 * A `money` is an int64 of minor units, and whether the decimal it
 * stands for comes back as a number or a `Numeric` is decided by
 * whether a double prints it back unchanged. Asking that question is
 * the most expensive thing in the decode - `parseFloat` plus the
 * comparison measured 229 ns against 119 ns on a column of 5 000
 * varying values - and below 10^15 minor units it can only ever be
 * answered yes, so it is not asked.
 *
 * What has to hold is that the shortcut and the question agree, at the
 * boundary and past it.
 */
describe('MoneyType.decodeBinary() faithfulness', () => {
  const wire = (minorUnits: bigint): Buffer => {
    const b = Buffer.alloc(8);
    b.writeBigInt64BE(minorUnits);
    return b;
  };
  const decode = (minorUnits: bigint, scale = 2): any =>
    MoneyType.decodeBinary!(wire(minorUnits), 0, 8, {
      moneyFormat: { scale, decimalSeparator: '.' },
    });
  /** What the shortcut replaced, asked directly. */
  const roundTrip = (s: string): boolean => {
    const n = parseFloat(s);
    const dot = s.indexOf('.');
    let end = s.length;
    if (dot >= 0) while (end > dot + 1 && s.charCodeAt(end - 1) === 48) end--;
    return (
      String(n) === s.substring(0, dot >= 0 && end === dot + 1 ? dot : end)
    );
  };

  it('should answer a number on the fast side of the boundary', () => {
    expect(decode(999999999999999n)).toStrictEqual(9999999999999.99);
    expect(decode(-999999999999999n)).toStrictEqual(-9999999999999.99);
    expect(decode(1234n)).toStrictEqual(12.34);
    expect(decode(0n)).toStrictEqual(0);
    expect(decode(-1n)).toStrictEqual(-0.01);
  });

  it('should still ask the question past it', () => {
    // 10^15 minor units is sixteen digits, which is where a double can
    // start rounding - so from here the round trip decides, as it always
    // did, and what it decides is what comes back.
    for (const v of [
      1000000000000000n,
      -1000000000000000n,
      12345678901234567n,
      9223372036854775807n,
      -9223372036854775808n,
    ]) {
      const scale = 2;
      const text = moneyToString(v, scale);
      const decoded = decode(v, scale);
      expect([v, typeof decoded]).toStrictEqual([
        v,
        roundTrip(text) ? 'number' : 'object',
      ]);
      expect(String(decoded)).toStrictEqual(
        roundTrip(text) ? String(parseFloat(text)) : text,
      );
    }
  });

  it('should agree with the question over every scale a server reports', () => {
    // The scale bound is the other half of the rule: the test is about
    // printed digits, and JavaScript writes anything below 1e-6 in
    // exponential notation, which PostgreSQL never does.
    const wrong: string[] = [];
    for (const scale of [0, 2, 3, 4, 6, 7]) {
      for (const v of [
        0n,
        1n,
        -1n,
        5n,
        100n,
        -123450n,
        999999999999999n,
        -999999999999999n,
        1000000000000000n,
        12345678901234567n,
      ]) {
        const text = moneyToString(v, scale);
        const decoded = decode(v, scale);
        const expected = roundTrip(text) ? parseFloat(text) : text;
        if (String(decoded) !== String(expected))
          wrong.push(`scale ${scale} ${v}: ${decoded} vs ${expected}`);
      }
    }
    expect(wrong).toStrictEqual([]);
  });
});
