import type { DataTypeMap } from '../data-type-map.js';
import type { DataMappingOptions } from './data-mapping-options.js';

export interface ScriptExecuteOptions extends DataMappingOptions {
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
   * When on, if a statement in a transaction block generates an error,
   * the error is ignored and the transaction continues.
   * When off (the default), a statement in a transaction block that generates an error aborts the entire transaction
   * @default true
   */
  rollbackOnError?: boolean;
}
