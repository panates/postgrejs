import type { DataTypeMap } from '../data-type-map.js';
import type { OID } from '../types.js';

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
