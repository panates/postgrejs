import { expect } from 'expect';
import { DataTypeOIDs } from 'postgrejs';
import { MoneyType } from '../../src/data-types/money-type.js';
import { NumericType } from '../../src/data-types/numeric-type.js';
import {
  DecimalAsStringOIDs,
  validateDecimalAsString,
  wantsDecimalString,
} from '../../src/util/decimal-as-string.js';

const D = DataTypeOIDs;

/** An int64 of minor units, as `money` arrives on the wire. */
function moneyBuffer(minorUnits: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigInt64BE(minorUnits);
  return b;
}

/**
 * `decimalAsString` hands back the exact decimal both types already
 * build while decoding, instead of the number they would decide on. The
 * difference from `fetchAsString` is where the string comes from: that
 * one asks the server, which writes `-$1,234.50` because `lc_monetary`
 * says so, and this one is the value with nothing added.
 */
describe('decimalAsString', () => {
  describe('the selection', () => {
    it('should name the two types that carry an exact decimal', () => {
      expect([...DecimalAsStringOIDs]).toStrictEqual([D.numeric, D.money]);
    });

    it('should answer for both under true and for neither under false', () => {
      for (const oid of DecimalAsStringOIDs) {
        expect(
          wantsDecimalString({ decimalAsString: true }, oid),
        ).toStrictEqual(true);
        expect(
          wantsDecimalString({ decimalAsString: false }, oid),
        ).toStrictEqual(false);
        expect(wantsDecimalString({}, oid)).toStrictEqual(false);
        expect(wantsDecimalString(undefined, oid)).toStrictEqual(false);
      }
    });

    it('should answer only for the OIDs an array names', () => {
      const only: any = { decimalAsString: [D.money] };
      expect(wantsDecimalString(only, D.money)).toStrictEqual(true);
      expect(wantsDecimalString(only, D.numeric)).toStrictEqual(false);
    });

    it('should refuse a type that carries no exact decimal', () => {
      expect(() => validateDecimalAsString([D.float8])).toThrow(
        /only numeric \(1700\) and money \(790\)/,
      );
      expect(() => validateDecimalAsString([D.float8])).toThrow(
        /701 \(float8\)/,
      );
      // An OID with no name of its own is still named, by its number.
      expect(() => validateDecimalAsString([999999])).toThrow(
        /Received 999999\./,
      );
      expect(() => validateDecimalAsString('money' as any)).toThrow(
        /either a boolean or an array of OIDs/,
      );
      expect(() => validateDecimalAsString([D.numeric, D.money])).not.toThrow();
      expect(() => validateDecimalAsString(undefined)).not.toThrow();
      expect(() => validateDecimalAsString(true)).not.toThrow();
    });
  });

  describe('money', () => {
    const opts: any = {
      decimalAsString: true,
      moneyFormat: { scale: 2, decimalSeparator: '.' },
    };

    it('should write the scale the server reported, and nothing else', () => {
      expect(
        MoneyType.decodeBinary!(moneyBuffer(-123450n), 0, 8, opts),
      ).toStrictEqual('-1234.50');
      expect(
        MoneyType.decodeBinary!(moneyBuffer(1234n), 0, 8, opts),
      ).toStrictEqual('12.34');
      // No symbol, no grouping, and the fraction padded to the scale -
      // `1` at scale 2 is `1.00`, which a decimal library reads and
      // `$1.00` does not.
      expect(
        MoneyType.decodeBinary!(moneyBuffer(100n), 0, 8, opts),
      ).toStrictEqual('1.00');
      expect(
        MoneyType.decodeBinary!(moneyBuffer(0n), 0, 8, opts),
      ).toStrictEqual('0.00');
      expect(
        MoneyType.decodeBinary!(moneyBuffer(-1n), 0, 8, opts),
      ).toStrictEqual('-0.01');
    });

    it('should follow a scale that is not two', () => {
      const yen: any = {
        decimalAsString: true,
        moneyFormat: { scale: 0, decimalSeparator: '.' },
      };
      const dinar: any = {
        decimalAsString: true,
        moneyFormat: { scale: 3, decimalSeparator: '.' },
      };
      expect(
        MoneyType.decodeBinary!(moneyBuffer(1234n), 0, 8, yen),
      ).toStrictEqual('1234');
      expect(
        MoneyType.decodeBinary!(moneyBuffer(1234n), 0, 8, dinar),
      ).toStrictEqual('1.234');
    });

    it('should keep every digit of an int64 extreme', () => {
      // Past what a double can carry, which is where the caller doing
      // this themselves loses digits.
      expect(
        MoneyType.decodeBinary!(moneyBuffer(9223372036854775807n), 0, 8, opts),
      ).toStrictEqual('92233720368547758.07');
      expect(
        MoneyType.decodeBinary!(moneyBuffer(-9223372036854775808n), 0, 8, opts),
      ).toStrictEqual('-92233720368547758.08');
    });

    it('should read the same value out of the server’s own rendering', () => {
      // The text path takes the digits and the sign and nothing else,
      // so the symbol and the separators cannot reach the answer.
      expect(MoneyType.decodeText!('-$1,234.50', opts)).toStrictEqual(
        '-1234.50',
      );
      expect(MoneyType.decodeText!('($1,234.50)', opts)).toStrictEqual(
        '-1234.50',
      );
    });

    it('should still decode to a number when nothing asked', () => {
      const off: any = { moneyFormat: { scale: 2, decimalSeparator: '.' } };
      expect(
        MoneyType.decodeBinary!(moneyBuffer(-123450n), 0, 8, off),
      ).toStrictEqual(-1234.5);
    });
  });

  describe('numeric', () => {
    const on: any = { decimalAsString: true };

    it('should keep the scale the value was stored with', () => {
      // `1.50` is not `1.5` to a decimal type, and it is the first
      // thing a double loses.
      expect(NumericType.decodeText!('1.50', on)).toStrictEqual('1.50');
      expect(NumericType.decodeText!('19.99', on)).toStrictEqual('19.99');
    });

    it('should spell the non-finite values the way PostgreSQL does', () => {
      const nan = Buffer.from([0, 0, 0, 0, 0xc0, 0x00, 0, 0]);
      const pinf = Buffer.from([0, 0, 0, 0, 0xd0, 0x00, 0, 0]);
      const ninf = Buffer.from([0, 0, 0, 0, 0xf0, 0x00, 0, 0]);
      expect(NumericType.decodeBinary!(nan, 0, 8, on)).toStrictEqual('NaN');
      expect(NumericType.decodeBinary!(pinf, 0, 8, on)).toStrictEqual(
        'Infinity',
      );
      expect(NumericType.decodeBinary!(ninf, 0, 8, on)).toStrictEqual(
        '-Infinity',
      );
      // And stay numbers when nothing asked.
      expect(NumericType.decodeBinary!(nan, 0, 8, {})).toStrictEqual(NaN);
      expect(NumericType.decodeBinary!(pinf, 0, 8, {})).toStrictEqual(Infinity);
    });

    it('should not take the short-value fast path, which answers a number', () => {
      const buf = Buffer.from('1.50', 'latin1');
      expect(NumericType.decodeTextBuffer!(buf, 0, 4, on)).toStrictEqual(
        '1.50',
      );
      expect(NumericType.decodeTextBuffer!(buf, 0, 4, {})).toStrictEqual(1.5);
    });
  });
});
