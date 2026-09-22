import type { OID } from '../types.js';
import type { PgDateStyle } from '../util/date-style.js';

/** How a server renders `money` - see `DataMappingOptions.moneyFormat`. */
export interface MoneyFormat {
  /** Fraction digits: 2 for `$1.00`, 0 for `¥1`, 3 for a dinar. */
  scale: number;
  /** The decimal separator the server prints, `.` or `,`. */
  decimalSeparator: string;
}

export interface DataMappingOptions {
  /**
   * How the server renders dates, when it is not rendering them in ISO.
   *
   * Only the text wire format is affected - binary carries no formatting
   * at all - and the connection fills this in from the `DateStyle` the
   * server reports, so a caller normally never sets it. See
   * `util/date-style.ts` for what each setting prints.
   */
  dateStyle?: PgDateStyle;

  /**
   * How the server renders money, which is what `money`'s wire format
   * cannot say on its own: it is an int64 of the smallest currency unit,
   * and how many of those make one is `lc_monetary` - a setting the
   * server does not report. A connection asks it once on its way up (see
   * `IntlConnection.ensureMoneyFormat()`) and fills this in; set it here
   * to skip that question, or to read a value rendered by a different
   * server than the one at hand.
   */
  moneyFormat?: MoneyFormat;

  /**
   * If true UTC time will be used for date decoding, else system time offset will be used
   * @default false
   */
  utcDates?: boolean;

  /**
   * OIDs whose columns are to be handed back exactly as the server renders
   * them, instead of being converted to a JavaScript value.
   *
   * This is a wire-level request, not a formatting choice made here: the
   * listed columns are asked for in PostgreSQL's text format and returned
   * unparsed, so the string is the server's own and nothing can drift
   * between the two. Bind's result format codes are positional, though, so
   * the OIDs can only be mapped onto columns once their types are known -
   * a query whose statement is not prepared asks for the whole row as text
   * instead (see IntlConnection.queryOnce()).
   *
   * An array column is selected by its own array OID (`_timestamptz`),
   * never by its element's, and then the whole array literal is the string
   * that comes back.
   */
  fetchAsString?: OID[];

  /**
   * Ask the server for text on any column this client has no way to
   * decode, instead of taking bytes it cannot read.
   *
   * Result columns are requested in binary, and there is a decoder only
   * for the types registered in the type map - so an enum, a composite,
   * an extension type, and 54 of PostgreSQL's own built-ins (`interval`,
   * `inet`, the range family, `tsvector`, `money`, ...) arrive as a raw
   * `Buffer` that nothing can interpret. With this on they arrive as the
   * string PostgreSQL would have printed, which is what `pg` gives for
   * the same column.
   *
   * Off by default, and it is not free: the column types have to be known
   * before the Bind that asks for them, so a query that has not been
   * prepared yet is prepared on first sight (one extra round trip per
   * distinct statement per connection, measured at 233µs -> 447µs on
   * loopback), and one run with `prepare: false` asks for the whole row
   * as text.
   *
   * A registered type is untouched, so nothing that decodes today starts
   * arriving as a string. An array whose own OID is unregistered comes
   * back as the array literal rather than a JS array - there is no way to
   * know it is an array without reading the catalog, and `pg` answers the
   * same way. `fields[i].dataTypeName` stays empty for the same reason.
   */
  unknownTypesAsString?: boolean;
}
