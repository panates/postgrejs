import { DataTypeNames } from '../constants.js';
import type { DataTypeMap } from '../data-type-map.js';
import type {
  FetchAsStringItem,
  FetchAsStringSelector,
} from '../interfaces/data-mapping-options.js';
import type { Maybe, OID } from '../types.js';

/**
 * What `fetchAsString`'s entries mean, in one place - three call sites
 * read the list and they have to agree: the Bind's result format codes
 * (resolve-column-formats.ts), the parser chosen for each column
 * (get-parsers.ts), and whether a cached set of parsers was built for
 * the same ask (fetchAsStringEqual, below).
 */

/** Whether the list names this OID itself, in either form. */
export function fetchAsStringNamesOid(
  list: Maybe<FetchAsStringItem[]>,
  oid: OID,
): boolean {
  if (!list) return false;
  const l = list.length;
  let i: number;
  let item: FetchAsStringItem;
  for (i = 0; i < l; i++) {
    item = list[i];
    if (typeof item === 'number' ? item === oid : item.oid === oid) return true;
  }
  return false;
}

/**
 * Whether the list names the element type of an array column, and lets
 * that reach the array - `{ oid, arrays: false }` is how a caller asks
 * for a scalar column as text and leaves its array columns decoding.
 *
 * `numeric` is why: `pg` hands back a scalar `numeric` as a string and a
 * `numeric[]` as numbers, so reproducing it needs the two said
 * separately.
 */
export function fetchAsStringNamesElement(
  list: Maybe<FetchAsStringItem[]>,
  elementsOID: OID,
): boolean {
  if (!list) return false;
  const l = list.length;
  let i: number;
  let item: FetchAsStringItem;
  for (i = 0; i < l; i++) {
    item = list[i];
    if (typeof item === 'number') {
      if (item === elementsOID) return true;
    } else if (item.oid === elementsOID && item.arrays !== false) return true;
  }
  return false;
}

/** Whether two lists select the same columns the same way. */
export function fetchAsStringEqual(
  a: Maybe<FetchAsStringItem[]>,
  b: Maybe<FetchAsStringItem[]>,
): boolean {
  if (a === b) return true;
  if (!a || !b) return !a?.length && !b?.length;
  const l = a.length;
  if (l !== b.length) return false;
  let i: number;
  let x: FetchAsStringItem;
  let y: FetchAsStringItem;
  for (i = 0; i < l; i++) {
    x = a[i];
    y = b[i];
    if (x === y) continue;
    // A bare OID and a selector for the same OID are only the same ask
    // while the selector says nothing; anything else decodes differently
    // and must not be handed the other one's cached parsers.
    if (typeof x === 'number' || typeof y === 'number') {
      const num = typeof x === 'number' ? x : (y as OID);
      const sel = (typeof x === 'number' ? y : x) as FetchAsStringSelector;
      if (sel.oid !== num || sel.arrays === false || sel.ranges) return false;
      continue;
    }
    if (x.oid !== y.oid || (x.arrays === false) !== (y.arrays === false))
      return false;
    if (!!x.ranges !== !!y.ranges) return false;
  }
  return true;
}

const _checked = new WeakSet<object>();

/**
 * Refuses a selector that asks for something this does not do, rather
 * than quietly not doing it.
 *
 * Checked once per list object, which is what a connection-level default
 * or a module-level constant is; an inline list is a walk of a handful
 * of entries.
 */
export function validateFetchAsString(
  list: Maybe<FetchAsStringItem[]>,
  typeMap?: Maybe<DataTypeMap>,
): void {
  if (!list || _checked.has(list)) return;
  const l = list.length;
  let i: number;
  let item: FetchAsStringItem;
  for (i = 0; i < l; i++) {
    item = list[i];
    if (typeof item === 'number') continue;
    if (!item || typeof item.oid !== 'number')
      throw new TypeError(
        '`fetchAsString` takes an OID or `{ oid, arrays }`; received ' +
          JSON.stringify(item),
      );
    if (item.ranges)
      throw new TypeError(
        '`fetchAsString` does not reach range columns through their ' +
          "element's OID yet, so `ranges: true` would ask for something " +
          'that will not happen. Name the range type itself instead - ' +
          '`numrange` rather than `numeric`.',
      );
    // The flags say what happens to the *arrays of* the named type, so
    // naming an array type and then talking about its arrays is not an
    // ask anything can honour.
    if (typeMap?.get(item.oid)?.elementsOID)
      throw new TypeError(
        `\`fetchAsString\` selector ${name(item.oid)} is an array type, and ` +
          'the flags describe what happens to a type’s array columns. ' +
          'Name the element type instead, or list the array OID on its own.',
      );
  }
  _checked.add(list);
}

function name(oid: OID): string {
  return DataTypeNames[oid] ? `${oid} (${DataTypeNames[oid]})` : String(oid);
}
