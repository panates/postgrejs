import { DataTypeOIDs } from '../constants.js';
import type { Maybe, OID } from '../types.js';
import { arrayLeaf } from './array-leaf.js';

/**
 * The types a `Date` is allowed to be encoded into binary against, by
 * whether the value is an array.
 */
/* Deliberately short. `time` and `timetz` are left out because
   TimeType.encodeBinary() multiplies the whole epoch by 1000 and
   overflows for any ordinary Date - measured, every one of four test
   instants answered 22008 "time out of range", where the text path
   stores the wall clock correctly. Nothing else here may be reached
   until it has been checked the same way. */
const DATE_SCALARS: ReadonlySet<OID> = new Set([
  DataTypeOIDs.timestamptz,
  DataTypeOIDs.timestamp,
  DataTypeOIDs.date,
]);
const DATE_ARRAYS: ReadonlySet<OID> = new Set([
  DataTypeOIDs._timestamptz,
  DataTypeOIDs._timestamp,
  DataTypeOIDs._date,
]);

/**
 * The types to encode a Bind's parameters against, given what the caller
 * declared and what the server resolved.
 *
 * Returns `declared` unchanged unless some parameter can be improved, so
 * the common call allocates nothing.
 *
 * @param declared What went into Parse - `0`/undefined where this client
 * declared nothing and left the type to the server.
 * @param params The values about to be written.
 * @param resolved What the server answered for this statement, in order.
 * @returns The types to hand `getBindMessage`.
 */
/* A Date goes out as text because nothing but the server knows whether
   the column is an instant or a wall clock - see `isUnspecifiedParam()`.
   Once the statement has a name, the server has already said which, and
   saying it does not have to be repeated: a prepared statement's
   parameter types are fixed at Parse, so a later Bind may send binary
   against them with no re-Parse. Checked on the wire: Parse with no
   declared types resolves `$1` to 1184, and a Bind of eight binary bytes
   against that statement reads back correctly.

   Worth it only because the text is wide and the binary is not. Measured
   over a loopback connection, 20 000 elements:

       timestamptz[]   text 625 KB / 11.61ms    binary 234 KB / 3.79ms

   The same measurement is why this is not done for numbers: an int4[] of
   ordinary values is 380 KB of text against 781 KB of binary, because
   the binary array format carries a 4-byte length per element whatever
   its magnitude - there, text is both smaller and twice as fast.

   Binary and text store the same value, which is the thing that had to
   be true before any of this: checked for timestamptz, timestamp and
   date, over four instants spanning a DST boundary and including
   milliseconds, and for the array forms of two of them. */
export function resolvedBindTypes(
  declared: Maybe<Maybe<OID>[]>,
  params: Maybe<Maybe<any>[]>,
  resolved: Maybe<OID[]>,
): Maybe<Maybe<OID>[]> {
  if (!resolved || !params) return declared;
  const l = params.length;
  let out: Maybe<OID>[] | undefined;
  let i: number;
  for (i = 0; i < l; i++) {
    // A type the caller named is an answer, not a guess - left alone.
    if (declared?.[i]) continue;
    const oid = resolved[i];
    if (!oid) continue;
    const v = params[i];
    if (!(arrayLeaf(v) instanceof Date)) continue;
    // An array value needs an array type and a scalar needs a scalar
    // one: getBindMessage() picks its encoder from the type alone and
    // would hand an array to a scalar encoder.
    if (!(Array.isArray(v) ? DATE_ARRAYS : DATE_SCALARS).has(oid)) continue;
    if (!out) out = declared ? declared.slice() : new Array(l).fill(0);
    out[i] = oid;
  }
  return out || declared;
}
