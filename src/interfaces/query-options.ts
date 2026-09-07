import type { BindParam } from '../connection/bind-param.js';
import type { DataFormat } from '../constants.js';
import type { DataTypeMap } from '../data-type-map.js';
import type { DataMappingOptions } from './data-mapping-options.js';

export interface QueryOptions extends DataMappingOptions {
  /**
   * Specifies weather execute query in auto-commit mode
   * @default true
   */
  autoCommit?: boolean;
  /**
   * Specifies if rows will be fetched as <FieldName, Value> pair objects or array of values
   * @default false
   */
  objectRows?: boolean;
  /**
   * Data type map instance
   * @default GlobalTypeMap
   */
  typeMap?: DataTypeMap;
  /**
   * If true, returns Cursor instance instead of rows
   */
  cursor?: boolean;
  /**
   * Query execution parameters
   */
  params?: (BindParam | any)[];
  /**
   * Specifies transfer format (binary or text) for each column
   * @default DataFormat.binary
   */
  columnFormat?: DataFormat | DataFormat[];
  /**
   * Specifies how many rows will be fetched. For Cursor, this value specifies how many rows will be fetched in a batch
   * @default 100
   */
  fetchCount?: number;
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
