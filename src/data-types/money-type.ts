import { DataTypeOIDs } from '../constants.js';
import type {
  DataMappingOptions,
  MoneyFormat,
} from '../interfaces/data-mapping-options.js';
import type { DataType } from '../interfaces/data-type.js';
import type { SmartBuffer } from '../protocol/smart-buffer.js';
import { readBigInt64BE } from '../util/bigint-methods.js';
import { Numeric } from './classes/numeric.js';
import { trimTrailingZeros } from './numeric-type.js';

/**
 * What the server's own `lc_monetary` does to a money value, when
 * nothing has asked it. Two fraction digits and a dot is what the great
 * majority of locales use, and it is only ever reached when the probe
 * itself failed - see IntlConnection.ensureMoneyFormat().
 */
const DEFAULT_SCALE = 2;
const DEFAULT_SEPARATOR = '.';

/**
 * Reads the server's own rendering of `1::money` - see
 * `IntlConnection.ensureMoneyFormat()` for why it is that value: with no
 * thousands separator in it, any separator present can only be the
 * decimal one, and the digits after it can only be the fraction.
 */
export function parseMoneyFormat(text: string): MoneyFormat {
  let lastSep = -1;
  let i: number;
  const l = text.length;
  let c: number;
  for (i = 0; i < l; i++) {
    c = text.charCodeAt(i);
    if (c >= 48 && c <= 57) continue;
    if (c === 46 /* . */ || c === 44 /* , */) lastSep = i;
  }
  if (lastSep < 0) return { scale: 0, decimalSeparator: DEFAULT_SEPARATOR };
  let scale = 0;
  for (i = lastSep + 1; i < l; i++) {
    c = text.charCodeAt(i);
    if (c >= 48 && c <= 57) scale++;
  }
  return { scale, decimalSeparator: text[lastSep] };
}

const FALLBACK_FORMAT: MoneyFormat = {
  scale: DEFAULT_SCALE,
  decimalSeparator: DEFAULT_SEPARATOR,
};

function formatOf(options?: DataMappingOptions): MoneyFormat {
  return options?.moneyFormat || FALLBACK_FORMAT;
}

/** The exact decimal `minorUnits` stands for at `scale` fraction digits. */
export function moneyToString(minorUnits: bigint, scale: number): string {
  if (!scale) return minorUnits.toString();
  const neg = minorUnits < 0n;
  let digits = (neg ? -minorUnits : minorUnits).toString();
  if (digits.length <= scale) digits = digits.padStart(scale + 1, '0');
  return (
    (neg ? '-' : '') +
    digits.slice(0, digits.length - scale) +
    '.' +
    digits.slice(digits.length - scale)
  );
}

/**
 * A number while a double carries the value exactly, a Numeric after
 * that - the same rule `numeric` decodes by, and for the same reason.
 * money is an int64 of minor units, so it reaches past 2^53 long before
 * it runs out of range.
 */
function toNumberOrNumeric(s: string): number | Numeric {
  const n = parseFloat(s);
  // The fraction is always written out to the full scale - `1` at scale
  // 2 is `1.00` - and those zeroes are padding, not a difference.
  return String(n) === trimTrailingZeros(s) ? n : new Numeric(s);
}

/**
 * Every digit in `s`, read as minor units at `scale` - which is how a
 * rendered money value is read back without knowing the locale that
 * rendered it. `-$1,234.50` is `-123450` at scale 2, whatever the symbol
 * and the separators were.
 */
function parseMoneyText(s: string): bigint {
  let digits = '';
  let neg = false;
  let i: number;
  const l = s.length;
  let c: number;
  for (i = 0; i < l; i++) {
    c = s.charCodeAt(i);
    if (c >= 48 && c <= 57) digits += s[i];
    else if (c === 45 /* - */ || c === 40 /* ( */) neg = true;
  }
  if (!digits) digits = '0';
  const v = BigInt(digits);
  return neg ? -v : v;
}

/**
 * PostgreSQL's fixed-point currency type.
 *
 * On the wire it is an int64 of the smallest currency unit - `$12.34`
 * arrives as `1234` - and how many of those make a unit is `lc_monetary`,
 * which the server does not report in its startup parameters. So the
 * connection asks it once, on its way up, and every money value is read
 * against that answer. See `IntlConnection.ensureMoneyFormat()`.
 *
 * The value decodes to a plain number, or a `Numeric` when a double
 * cannot carry it. The currency symbol is *not* part of it: it is the
 * server's rendering of the value, not the value, and
 * `fetchAsString: [DataTypeOIDs.money]` asks for that rendering when it
 * is what the caller wants - which is also what `pg` always returns.
 *
 * The question is asked the first time a money column is on its way
 * back through `query()` or a prepared statement, while the rows are
 * still raw bytes. Two paths decode inside the message loop and cannot
 * ask from there - `execute()`'s Simple Query, and an uncached
 * statement inside `pipeline()` - so a money value that is the *first*
 * one a connection has ever seen arrives through one of those, it is
 * read at two fraction digits. That is right everywhere except a
 * currency with none (yen, won) or three (dinars); pass `moneyFormat`
 * in the options there, or read one money value through `query()`
 * first.
 */
export const MoneyType: DataType = {
  name: 'money',
  oid: DataTypeOIDs.money,
  jsType: 'number',

  /**
   * Written in the server's own decimal separator, so that the value the
   * server parses is the value that was meant - money input is read in
   * `lc_monetary` too, and `12.34` is not `12,34` to a locale that
   * separates with a comma.
   */
  encodeText(v: any, options?: DataMappingOptions): string {
    const { scale, decimalSeparator } = formatOf(options);
    const s = moneyToString(toExactMinor(v, scale), scale);
    return decimalSeparator === '.' ? s : s.replace('.', decimalSeparator);
  },

  encodeBinary(buf: SmartBuffer, v: any, options?: DataMappingOptions): void {
    const { scale } = formatOf(options);
    buf.writeBigInt64BE(toExactMinor(v, scale));
  },

  decodeBinary(
    buf: Buffer,
    offset: number = 0,
    _len?: number,
    options?: DataMappingOptions,
  ): number | Numeric {
    const v =
      typeof buf.readBigInt64BE === 'function'
        ? buf.readBigInt64BE(offset)
        : readBigInt64BE(buf, offset);
    return toNumberOrNumeric(moneyToString(v, formatOf(options).scale));
  },

  decodeText(s: string, options?: DataMappingOptions): number | Numeric {
    const { scale } = formatOf(options);
    return toNumberOrNumeric(moneyToString(parseMoneyText(s), scale));
  },

  /**
   * Never inferred: a JavaScript number is `int4`, `float8` or `numeric`
   * long before anyone means money by it, and nothing about the value
   * says which. `new BindParam(DataTypeOIDs.money, 12.34)` asks for it.
   */
  inferrable: false,

  isType(v: any): boolean {
    return typeof v === 'number' || v instanceof Numeric;
  },
};

/** The int64 of minor units `v` stands for, without going through a double. */
function toExactMinor(v: any, scale: number): bigint {
  if (typeof v === 'bigint') return v;
  const s = v instanceof Numeric ? v.value : String(v ?? 0);
  const neg = s.trimStart().startsWith('-');
  let digits = '';
  let frac = -1;
  let i: number;
  const l = s.length;
  let c: number;
  for (i = 0; i < l; i++) {
    c = s.charCodeAt(i);
    if (c >= 48 && c <= 57) {
      digits += s[i];
      if (frac >= 0) frac++;
    } else if (c === 46 /* . */ || c === 44 /* , */) frac = 0;
  }
  if (!digits) return 0n;
  if (frac < 0) frac = 0;
  // Pad or round to exactly `scale` fraction digits.
  if (frac < scale) digits = digits.padEnd(digits.length + scale - frac, '0');
  else if (frac > scale) {
    const cut = frac - scale;
    const keep = digits.slice(0, digits.length - cut);
    const next = digits.charCodeAt(digits.length - cut) - 48;
    digits = (BigInt(keep || '0') + (next >= 5 ? 1n : 0n)).toString();
  }
  const out = BigInt(digits || '0');
  return neg ? -out : out;
}

export const ArrayMoneyType: DataType = {
  ...MoneyType,
  name: '_money',
  oid: DataTypeOIDs._money,
  elementsOID: DataTypeOIDs.money,
};
