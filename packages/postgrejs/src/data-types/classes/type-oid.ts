import type { Maybe, OID } from '../../types.js';

/**
 * The OID a decoded value came from, carried on the value itself.
 *
 * A symbol rather than a property named `oid`, and non-enumerable on top
 * of that: `{ oid: 3904 }` is an ordinary object somebody might store in
 * a json column, and reading a plain key would mistake it for a typed
 * value. A symbol cannot collide, and being non-enumerable keeps it out
 * of `JSON.stringify`, object spread, `Object.keys` and expect's
 * `toStrictEqual` - so a stamped value compares equal to an unstamped one
 * with the same fields.
 */
export const TYPE_OID: unique symbol = Symbol('postgrejs.typeOid');

/**
 * Marks a class whose instances cannot be typed by inspection, so passing
 * one as an untyped parameter is an error rather than a guess.
 *
 * Range is the case: all six range types answer `instanceof Range` and
 * nothing about a Range says which it is. Without this, such a value
 * falls through to JsonType - whose isType() takes any object - and goes
 * out declared `json`, which comes back looking right.
 */
export const REQUIRES_TYPE_OID: unique symbol = Symbol(
  'postgrejs.requiresTypeOid',
);

/**
 * Records which type a value was decoded from, so it can go back as that
 * type without the caller naming it again.
 *
 * Only worth doing for a value whose class cannot say what it is on its
 * own - it costs a defineProperty per value (~160ns), which is not free
 * on a column of them.
 */
export function setTypeOid<T extends object>(value: T, oid: OID): T {
  Object.defineProperty(value, TYPE_OID, {
    value: oid,
    enumerable: false,
    writable: true,
    configurable: true,
  });
  return value;
}

/** The OID a value was decoded from, if it carries one. */
export function getTypeOid(value: unknown): Maybe<OID> {
  return value != null
    ? (value as Record<symbol, OID | undefined>)[TYPE_OID]
    : undefined;
}
