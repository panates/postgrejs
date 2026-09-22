import { DEFAULT_COLUMN_FORMAT } from '../constants.js';
import type { DataTypeMap } from '../data-type-map.js';
import type { DataMappingOptions } from '../interfaces/data-mapping-options.js';
import { Protocol } from '../protocol/protocol.js';
import type { Maybe, OID } from '../types.js';

const DataFormat = Protocol.DataFormat;

export interface ColumnFormatOptions extends DataMappingOptions {
  columnFormat?: Protocol.DataFormat | Protocol.DataFormat[];
}

/**
 * Whether this client could read the column if it arrived in `format`.
 * Only ever answers no for binary: a column with no registered type at
 * all still decodes as text, into the string the server printed, which is
 * the whole point of asking for it that way.
 */
function canDecode(
  typeMap: DataTypeMap,
  oid: OID,
  format: Protocol.DataFormat,
): boolean {
  if (format !== DataFormat.binary) return true;
  const reg = typeMap.get(oid);
  return !!reg && typeof reg.decodeBinary === 'function';
}

/**
 * Whether `asString` names the element type of the array type `oid` -
 * "give me this type verbatim", asked of a column of them.
 *
 * Needs the type map to find the element OID, which the caller already
 * hands over for `unknownTypesAsString`; without one this answers no and
 * only an array's own OID selects it, as it always did.
 */
function namesElementOf(
  typeMap: Maybe<DataTypeMap>,
  asString: OID[],
  oid: OID,
): boolean {
  const elementsOID = typeMap?.get(oid)?.elementsOID;
  return !!elementsOID && asString.includes(elementsOID);
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
 * An array column is selected by its own array OID (`_timestamptz`) and
 * by its element's (`timestamptz`) - both need the column as text, and
 * which of the two was named is what get-parsers.ts reads to decide
 * between the whole literal and the elements.
 *
 * Returns `columnFormat` untouched when there is nothing to do, so the
 * common case allocates nothing and keeps sending a single format code.
 */
export function resolveColumnFormats(
  fields: Maybe<Protocol.RowDescription[]>,
  options: ColumnFormatOptions,
  typeMap?: DataTypeMap,
): Protocol.DataFormat | Protocol.DataFormat[] {
  const base =
    options.columnFormat != null ? options.columnFormat : DEFAULT_COLUMN_FORMAT;
  const asString = options.fetchAsString;
  // unknownTypesAsString needs the type map to answer "could this be
  // decoded", so it is inert without one - the call sites that have no
  // map in hand are the ones that have no fields either.
  const unknownAsString = !!options.unknownTypesAsString && !!typeMap;
  const named = !!asString && asString.length > 0;
  if (!fields || (!named && !unknownAsString)) return base;
  // Both options do one thing: ask for a column as text. A row that is
  // already all text has nothing left for them to ask.
  if (base === DataFormat.text) return base;
  const l = fields.length;
  const baseIsArray = Array.isArray(base);
  const out: Protocol.DataFormat[] = new Array(l);
  let hit = false;
  let i: number;
  let oid: OID;
  let format: Protocol.DataFormat;
  for (i = 0; i < l; i++) {
    oid = fields[i].dataTypeId;
    format = baseIsArray
      ? ((base as Protocol.DataFormat[])[i] ?? DEFAULT_COLUMN_FORMAT)
      : (base as Protocol.DataFormat);
    if (
      named &&
      (asString!.includes(oid) || namesElementOf(typeMap, asString!, oid))
    ) {
      // fetchAsString names the value the caller wants verbatim, so it
      // overrides an explicit columnFormat for its own columns - the two
      // cannot both be honored and the OID list is the more specific ask.
      // An array column is selected either way: by its own OID, which
      // asks for the whole literal, or by its element's, which asks for
      // the elements - both need the column as text, and get-parsers.ts
      // is where the two part company.
      format = DataFormat.text;
      hit = true;
    } else if (unknownAsString && !canDecode(typeMap!, oid, format)) {
      // Nothing here could read the binary, so the bytes would reach the
      // caller as a Buffer. Text at least arrives as what the server
      // printed.
      format = DataFormat.text;
      hit = true;
    }
    out[i] = format;
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
