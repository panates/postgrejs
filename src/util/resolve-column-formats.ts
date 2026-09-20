import { DEFAULT_COLUMN_FORMAT } from '../constants.js';
import type { DataMappingOptions } from '../interfaces/data-mapping-options.js';
import { Protocol } from '../protocol/protocol.js';
import type { Maybe, OID } from '../types.js';

const DataFormat = Protocol.DataFormat;

export interface ColumnFormatOptions extends DataMappingOptions {
  columnFormat?: Protocol.DataFormat | Protocol.DataFormat[];
}

/**
 * Turns `fetchAsString`'s OID list into the positional result format codes
 * a Bind message actually carries.
 *
 * The protocol has no way to say "send this OID as text" - Bind's result
 * format codes are per column, by position, and nothing in Parse/Bind is
 * keyed on a type. So the OID list can only be honored once the column
 * types are known, which means after a Describe and before the Bind that
 * asks for them. Callers that already hold a RowDescription (a prepared
 * statement's, or a cached one's) pay nothing for this; callers that do
 * not have to ask for the whole row as text instead - see queryOnce().
 *
 * A column matches on its own `dataTypeId`, so an array column is only
 * ever selected by its own array OID (`_timestamptz`), never by its
 * element's. Listing the element OID leaves array columns alone.
 *
 * Returns `columnFormat` untouched when there is nothing to do, so the
 * common case allocates nothing and keeps sending a single format code.
 */
export function resolveColumnFormats(
  fields: Maybe<Protocol.RowDescription[]>,
  options: ColumnFormatOptions,
): Protocol.DataFormat | Protocol.DataFormat[] {
  const base =
    options.columnFormat != null ? options.columnFormat : DEFAULT_COLUMN_FORMAT;
  const asString = options.fetchAsString;
  if (!fields || !asString || !asString.length) return base;
  const l = fields.length;
  const baseIsArray = Array.isArray(base);
  const out: Protocol.DataFormat[] = new Array(l);
  let hit = false;
  let i: number;
  for (i = 0; i < l; i++) {
    if (asString.includes(fields[i].dataTypeId)) {
      // fetchAsString names the value the caller wants verbatim, so it
      // overrides an explicit columnFormat for its own columns - the two
      // cannot both be honored and the OID list is the more specific ask.
      out[i] = DataFormat.text;
      hit = true;
    } else
      out[i] = baseIsArray
        ? ((base as Protocol.DataFormat[])[i] ?? DEFAULT_COLUMN_FORMAT)
        : (base as Protocol.DataFormat);
  }
  return hit ? out : base;
}

/**
 * Whether two `fetchAsString` lists select the same columns. Used to tell
 * a cached set of parsers apart from one built for a different list, which
 * `columnFormat` alone cannot do: an explicitly text column and one turned
 * text by fetchAsString carry the same format code but decode differently.
 */
export function fetchAsStringEqual(a: Maybe<OID[]>, b: Maybe<OID[]>): boolean {
  if (a === b) return true;
  if (!a || !b) return !a?.length && !b?.length;
  const l = a.length;
  if (l !== b.length) return false;
  let i: number;
  for (i = 0; i < l; i++) if (a[i] !== b[i]) return false;
  return true;
}
