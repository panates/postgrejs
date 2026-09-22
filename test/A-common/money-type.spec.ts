import { expect } from 'expect';
import {
  moneyToString,
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
