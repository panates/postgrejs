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
}
