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
}
