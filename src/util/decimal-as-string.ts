import { DataTypeNames, DataTypeOIDs } from '../constants.js';
import type { DataMappingOptions } from '../interfaces/data-mapping-options.js';
import type { Maybe, OID } from '../types.js';

/**
 * The types that can decode to an exact decimal string: the two that
 * carry a decimal the wire format states exactly, rather than a double's
 * nearest approximation of one.
 */
export const DecimalAsStringOIDs: readonly OID[] = Object.freeze([
  DataTypeOIDs.numeric,
  DataTypeOIDs.money,
]);

/** Whether this type's values are wanted as their exact decimal string. */
export function wantsDecimalString(
  options: Maybe<DataMappingOptions>,
  oid: OID,
): boolean {
  const v = options?.decimalAsString;
  if (v === undefined || v === false) return false;
  return v === true || v.includes(oid);
}

export function validateDecimalAsString(v: Maybe<boolean | OID[]>): void {
  if (v === undefined || typeof v === 'boolean') return;
  if (!Array.isArray(v))
    throw new TypeError(
      '`decimalAsString` is either a boolean or an array of OIDs, not ' +
        typeof v,
    );
  const l = v.length;
  let i: number;
  for (i = 0; i < l; i++)
    if (!DecimalAsStringOIDs.includes(v[i]))
      throw new TypeError(
        '`decimalAsString` accepts only numeric (1700) and money (790). ' +
          `Received ${v[i]}${DataTypeNames[v[i]] ? ' (' + DataTypeNames[v[i]] + ')' : ''}.`,
      );
}
