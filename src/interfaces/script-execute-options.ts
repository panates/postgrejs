import type { DataTypeMap } from '../data-type-map.js';
import type { RowDecoder } from '../util/row-decoder.js';
import type { DataMappingOptions } from './data-mapping-options.js';

export interface ScriptExecuteOptions extends DataMappingOptions {
  /**
   * Specifies weather execute query in auto-commit mode
   * @default true
   */
  autoCommit?: boolean;
  /**
   * Specifies if rows will be fetched as <FieldName, Value> pair objects or array of values
   * @deprecated Use `rowDecoder: 'object'` instead - `objectRows: true` still works exactly
   * as before, it's just the same thing `rowDecoder` now also expresses.
   * @default false
   */
  objectRows?: boolean;
  /**
   * Controls how each row's raw column data is turned into the value handed back to the
   * caller. `'array'` and `'object'` select the built-in decoders (the same output
   * `objectRows` has always produced); pass an instance of your own `RowDecoder` subclass
   * to take over decoding entirely instead - e.g. for lazy per-cell decoding. Takes
   * precedence over `objectRows` when both are set.
   * @default 'array'
   */
  rowDecoder?: 'array' | 'object' | RowDecoder;
  /**
   * Data type map instance
   * @default GlobalTypeMap
   */
  typeMap?: DataTypeMap;
  /**
   * When on, if a statement in a transaction block generates an error,
   * the error is ignored and the transaction continues.
   * When off (the default), a statement in a transaction block that generates an error aborts the entire transaction
   * @default true
   */
  rollbackOnError?: boolean;

  /**
   * Aborts the call when the signal fires: the running statement is
   * cancelled on the server and the promise rejects with the signal's own
   * reason, with the database error attached as `cause`.
   *
   * Cancelling is a request rather than a guarantee - it travels on its own
   * connection and the statement may finish first - so the call settles when
   * the server has actually finished with it, not the moment abort() is
   * called. `AbortSignal.timeout(ms)` gives a per-call timeout.
   */
  signal?: AbortSignal;
  /**
   * Overrides the connection's own `asyncErrorHandling` for this call only -
   * see `DatabaseConnectionParams.asyncErrorHandling`.
   * @default the connection's own setting
   */
  asyncErrorHandling?: boolean;
  /**
   * Overrides the connection's own `timing` for this call only - see
   * `DatabaseConnectionParams.timing`.
   * @default the connection's own setting
   */
  timing?: boolean;
}
