import type { DataTypeMap } from '../data-type-map.js';
import type { OID } from '../types.js';

/** What `prepare()` takes: the parameter types to declare, and which type map to read them with. */
export interface StatementPrepareOptions {
  /**
   * Specifies data type for each parameter
   */
  paramTypes?: OID[];
  /**
   * Data type map instance
   * @default GlobalTypeMap
   */
  typeMap?: DataTypeMap;
}
