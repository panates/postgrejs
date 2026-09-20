import type { OID } from '../types.js';

export interface DataMappingOptions {
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
