import type { OID } from '../types.js';

/**
 * A parameter with its type named, for the cases where the value cannot
 * say what it is.
 *
 * An ordinary parameter is sent untyped and the server resolves it from
 * where it lands, which is what makes a string work as a `json`, a
 * `uuid` or an enum without being told. This is for when that is not
 * enough: a value with no context to be resolved from (`$1 is null`),
 * or a large numeric array, which keeps the binary encoding only when
 * its type is declared.
 *
 * ```ts
 * await connection.query('insert into t (v) values ($1)', {
 *   params: [new BindParam(DataTypeOIDs._float8, bigArray)],
 * });
 * ```
 */
export class BindParam {
  /**
   * @param oid The type to declare for this parameter.
   * @param value The value itself.
   */
  constructor(
    public oid: OID,
    public value: any,
  ) {}
}
